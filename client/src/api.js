let searchIndex = null;  // metadata for all docs
let invertedIndex = null; // word -> [docIdx, ...]
let loadingPromise = null;

const BASE = import.meta.env.BASE_URL || '/';

async function loadIndex() {
  if (searchIndex && invertedIndex) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const [metaRes, invertedRes] = await Promise.all([
      fetch(`${BASE}data/search-index.json`),
      fetch(`${BASE}data/inverted.json`),
    ]);
    searchIndex = await metaRes.json();
    invertedIndex = await invertedRes.json();
  })();

  return loadingPromise;
}

/**
 * Tokenize a query the same way we tokenize during indexing.
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3);
}

/**
 * Parse query: supports "quoted phrases" as single units.
 * Each phrase is split into tokens for inverted index lookup,
 * but we keep the original phrases for snippet highlighting.
 */
function parseQuery(query) {
  const phrases = [];
  const regex = /"([^"]+)"|(\S+)/g;
  let match;
  while ((match = regex.exec(query)) !== null) {
    phrases.push(match[1] || match[2]);
  }
  return phrases.filter(t => t.length > 0);
}

/**
 * Find all documents matching ALL query terms using the inverted index.
 * Returns doc indices sorted by relevance.
 */
function findMatches(queryPhrases) {
  // Get tokens from all phrases
  const allTokens = [];
  for (const phrase of queryPhrases) {
    const tokens = tokenize(phrase);
    allTokens.push(...tokens);
  }

  if (allTokens.length === 0) return [];

  // For each token, get matching doc indices from inverted index
  // Also include partial/prefix matches for better results
  const tokenDocSets = allTokens.map(token => {
    const exactMatch = invertedIndex[token];
    if (exactMatch) return new Set(exactMatch);

    // Try prefix matching for partial words (e.g., "pizz" matches "pizza")
    const prefixMatches = new Set();
    for (const word of Object.keys(invertedIndex)) {
      if (word.startsWith(token)) {
        for (const idx of invertedIndex[word]) {
          prefixMatches.add(idx);
        }
      }
    }
    return prefixMatches;
  });

  // Intersect all sets — ALL tokens must match
  let resultSet = tokenDocSets[0];
  for (let i = 1; i < tokenDocSets.length; i++) {
    const next = tokenDocSets[i];
    const intersection = new Set();
    for (const idx of resultSet) {
      if (next.has(idx)) intersection.add(idx);
    }
    resultSet = intersection;
  }

  // Score results: more token hits in the inverted index = higher score
  const scored = [];
  for (const docIdx of resultSet) {
    let score = 0;
    for (const token of allTokens) {
      const posting = invertedIndex[token];
      if (posting && posting.includes(docIdx)) {
        score += 2;
      }
      // Bonus for entity matches
      const doc = searchIndex[docIdx];
      const entityText = [
        ...(doc.p || []),
        ...(doc.o || []),
        ...(doc.l || []),
      ].join(' ').toLowerCase();
      if (entityText.includes(token)) score += 3;
    }
    scored.push({ docIdx, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Build a highlighted snippet by fetching the actual document.
 * Falls back to the short preview if fetch fails.
 */
async function buildSnippetFromDoc(docId, terms) {
  try {
    const res = await fetch(`${BASE}data/docs/${docId}.json`);
    if (!res.ok) return null;
    const doc = await res.json();

    // Search through all pages to find the best match
    const allText = doc.pages.map(p => p.full_text || '').join(' ');
    const lowerText = allText.toLowerCase();

    // Find the best position — where the most search terms cluster together
    let bestPos = -1;
    let bestScore = -1;
    for (const term of terms) {
      const lowerTerm = term.toLowerCase();
      let searchFrom = 0;
      while (true) {
        const pos = lowerText.indexOf(lowerTerm, searchFrom);
        if (pos === -1) break;

        // Score this position by how many other terms are nearby
        let posScore = 1;
        for (const otherTerm of terms) {
          if (otherTerm === term) continue;
          const nearby = lowerText.indexOf(otherTerm.toLowerCase(), Math.max(0, pos - 200));
          if (nearby !== -1 && nearby < pos + 200) posScore += 2;
        }
        if (posScore > bestScore) {
          bestScore = posScore;
          bestPos = pos;
        }
        searchFrom = pos + 1;
        if (searchFrom > lowerText.length) break;
      }
    }

    if (bestPos === -1) return null;

    // Extract snippet window around best match
    const contextChars = 150;
    const start = Math.max(0, bestPos - contextChars);
    const end = Math.min(allText.length, bestPos + contextChars + 50);
    let snippet = allText.substring(start, end).replace(/\s+/g, ' ');

    if (start > 0) snippet = '...' + snippet;
    if (end < allText.length) snippet = snippet + '...';

    // Highlight all matching terms
    for (const term of terms) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      snippet = snippet.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
    }

    return snippet;
  } catch {
    return null;
  }
}

function formatDoc(docIdx) {
  const item = searchIndex[docIdx];
  return {
    doc_id: item.id,
    document_number: item.n,
    title: `${item.t || 'Document'} - ${item.n}`,
    document_type: item.t,
    date: item.d,
    page_count: item.c,
    people: item.p || [],
    organizations: item.o || [],
    locations: item.l || [],
    snippet: item.v || '', // default preview, will be replaced
  };
}

export async function search(query, { limit = 60, offset = 0, type } = {}) {
  await loadIndex();

  if (!query || !query.trim()) {
    let results = searchIndex
      .map((_, idx) => idx)
      .filter(idx => !type || searchIndex[idx].t === type)
      .map(idx => formatDoc(idx));

    const total = results.length;
    return { results: results.slice(offset, offset + limit), total };
  }

  const phrases = parseQuery(query.trim());
  const matches = findMatches(phrases);

  // Apply type filter
  const filtered = type
    ? matches.filter(m => searchIndex[m.docIdx].t === type)
    : matches;

  const total = filtered.length;
  const paged = filtered.slice(offset, offset + limit);
  let results = paged.map(m => formatDoc(m.docIdx));

  // Fetch real highlighted snippets for visible results (in parallel)
  const snippetPromises = results.map(doc =>
    buildSnippetFromDoc(doc.doc_id, phrases)
  );
  const snippets = await Promise.all(snippetPromises);
  for (let i = 0; i < results.length; i++) {
    if (snippets[i]) {
      results[i].snippet = snippets[i];
    }
  }

  return { results, total };
}

export async function getDocument(docId) {
  const res = await fetch(`${BASE}data/docs/${docId}.json`);
  if (!res.ok) throw new Error('Document not found');
  return res.json();
}

export async function getStats() {
  const res = await fetch(`${BASE}data/stats.json`);
  return res.json();
}

export async function getTypes() {
  const res = await fetch(`${BASE}data/types.json`);
  return res.json();
}
