import Fuse from 'fuse.js';

let searchIndex = null;
let fuseInstance = null;
let loadingPromise = null;

const BASE = import.meta.env.BASE_URL || '/';

async function loadIndex() {
  if (searchIndex) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const res = await fetch(`${BASE}data/search-index.json`);
    searchIndex = await res.json();

    fuseInstance = new Fuse(searchIndex, {
      keys: [
        { name: 'id', weight: 0.3 },
        { name: 's', weight: 0.4 },   // snippet
        { name: 'p', weight: 0.5 },   // people
        { name: 'o', weight: 0.3 },   // organizations
        { name: 'l', weight: 0.3 },   // locations
        { name: 't', weight: 0.2 },   // document type
        { name: 'n', weight: 0.2 },   // document number
      ],
      threshold: 0.3,
      ignoreLocation: true,
      includeScore: true,
      includeMatches: true,
      minMatchCharLength: 2,
      useExtendedSearch: true,
    });
  })();

  return loadingPromise;
}

function formatDoc(item, matches) {
  // Build a snippet with match highlights
  let snippet = item.s || '';
  if (matches) {
    for (const match of matches) {
      if (match.key === 's' && match.indices?.length > 0) {
        let highlighted = '';
        let lastEnd = 0;
        const text = match.value || '';
        for (const [start, end] of match.indices) {
          highlighted += text.slice(lastEnd, start);
          highlighted += `<mark>${text.slice(start, end + 1)}</mark>`;
          lastEnd = end + 1;
        }
        highlighted += text.slice(lastEnd);
        snippet = highlighted;
        break;
      }
    }
  }

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

export async function search(query, { limit = 60, offset = 0, type } = {}) {
  await loadIndex();

  let results;

  if (!query || !query.trim()) {
    // No query - return all docs (filtered if needed)
    results = searchIndex
      .filter(item => !type || item.t === type)
      .map(item => formatDoc(item, null));
  } else {
    // Fuse.js search
    const fuseResults = fuseInstance.search(query, { limit: 500 });
    results = fuseResults
      .filter(r => !type || r.item.t === type)
      .map(r => formatDoc(r.item, r.matches));
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
