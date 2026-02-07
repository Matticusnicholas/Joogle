let searchIndex = null;
let loadingPromise = null;

const BASE = import.meta.env.BASE_URL || '/';

async function loadIndex() {
  if (searchIndex) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const res = await fetch(`${BASE}data/search-index.json`);
    searchIndex = await res.json();
  })();

  return loadingPromise;
}

/**
 * Build a snippet around the first match of any search term in the text,
 * with <mark> highlighting on all matching terms.
 */
function buildSnippet(text, terms, contextChars = 120) {
  if (!text || terms.length === 0) return text?.substring(0, 200) || '';

  const lowerText = text.toLowerCase();

  // Find the earliest match position
  let earliestPos = -1;
  for (const term of terms) {
    const pos = lowerText.indexOf(term.toLowerCase());
    if (pos !== -1 && (earliestPos === -1 || pos < earliestPos)) {
      earliestPos = pos;
    }
  }

  if (earliestPos === -1) return text.substring(0, 200);

  // Extract a window around the match
  const start = Math.max(0, earliestPos - contextChars);
  const end = Math.min(text.length, earliestPos + contextChars + 50);
  let snippet = text.substring(start, end).replace(/\s+/g, ' ');

  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';

  // Highlight all matching terms
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    snippet = snippet.replace(regex, '<mark>$1</mark>');
  }

  return snippet;
}

/**
 * Check if a document matches ALL search terms (case-insensitive).
 * Searches across text, people, orgs, locations, doc type, and doc id.
 * Returns a score (higher = more matches/relevance) or 0 if no match.
 */
function scoreDocument(item, terms) {
  // Build a combined searchable string for this document
  const fields = [
    item.s || '',                              // document text
    (item.p || []).join(' '),                   // people
    (item.o || []).join(' '),                   // organizations
    (item.l || []).join(' '),                   // locations
    item.t || '',                               // document type
    item.id || '',                              // doc id
    item.n || '',                               // document number
  ];
  const combined = fields.join(' ').toLowerCase();

  let totalScore = 0;
  for (const term of terms) {
    const lowerTerm = term.toLowerCase();
    const idx = combined.indexOf(lowerTerm);
    if (idx === -1) return 0; // ALL terms must match

    // Count occurrences for ranking
    let count = 0;
    let searchFrom = 0;
    while (true) {
      const pos = combined.indexOf(lowerTerm, searchFrom);
      if (pos === -1) break;
      count++;
      searchFrom = pos + 1;
    }

    // Bonus for matches in people/entities (more relevant)
    const peopleStr = (item.p || []).join(' ').toLowerCase();
    if (peopleStr.includes(lowerTerm)) count += 5;

    totalScore += count;
  }

  return totalScore;
}

function formatDoc(item, terms) {
  const snippet = terms.length > 0
    ? buildSnippet(item.s || '', terms)
    : (item.s || '').substring(0, 200);

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
    snippet,
  };
}

/**
 * Parse query into individual search terms.
 * Supports "quoted phrases" as single terms.
 */
function parseQuery(query) {
  const terms = [];
  const regex = /"([^"]+)"|(\S+)/g;
  let match;
  while ((match = regex.exec(query)) !== null) {
    terms.push(match[1] || match[2]);
  }
  return terms.filter(t => t.length > 0);
}

export async function search(query, { limit = 60, offset = 0, type } = {}) {
  await loadIndex();

  let results;

  if (!query || !query.trim()) {
    results = searchIndex
      .filter(item => !type || item.t === type)
      .map(item => formatDoc(item, []));
  } else {
    const terms = parseQuery(query.trim());

    // Score and filter documents - only exact word/phrase matches
    const scored = [];
    for (const item of searchIndex) {
      if (type && item.t !== type) continue;
      const score = scoreDocument(item, terms);
      if (score > 0) {
        scored.push({ item, score });
      }
    }

    // Sort by relevance score (highest first)
    scored.sort((a, b) => b.score - a.score);

    results = scored.map(({ item }) => formatDoc(item, terms));
  }

  const total = results.length;
  const paged = results.slice(offset, offset + limit);

  return { results: paged, total };
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
