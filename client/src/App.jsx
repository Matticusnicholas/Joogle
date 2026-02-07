import React, { useState, useEffect, useCallback, useRef } from 'react';
import SearchBar from './components/SearchBar.jsx';
import ResultsGrid from './components/ResultsGrid.jsx';
import DocumentViewer from './components/DocumentViewer.jsx';
import LLMChat from './components/LLMChat.jsx';
import StatsBar from './components/StatsBar.jsx';

export default function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [filters, setFilters] = useState({});
  const [offset, setOffset] = useState(0);
  const abortRef = useRef(null);

  const search = useCallback(async (q, newOffset = 0, append = false) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: q || '',
        limit: '60',
        offset: String(newOffset),
      });
      if (filters.type) params.set('type', filters.type);

      const res = await fetch(`/api/search?${params}`, { signal: controller.signal });
      const data = await res.json();

      if (append) {
        setResults(prev => [...prev, ...data.results]);
      } else {
        setResults(data.results);
      }
      setTotal(data.total);
      setOffset(newOffset);
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Live search on query change
  useEffect(() => {
    const timer = setTimeout(() => search(query, 0), query ? 200 : 0);
    return () => clearTimeout(timer);
  }, [query, search]);

  const loadMore = () => {
    const newOffset = offset + 60;
    search(query, newOffset, true);
  };

  const openDocument = async (docId) => {
    try {
      const res = await fetch(`/api/documents/${docId}`);
      const doc = await res.json();
      setExpandedDoc(doc);
    } catch (err) {
      console.error('Failed to load document:', err);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <h1 className="logo" onClick={() => { setQuery(''); setExpandedDoc(null); }}>
            <span className="logo-j">J</span>oogle
          </h1>
          <p className="tagline">Epstein Files Search Engine</p>
        </div>
      </header>

      <main className="main">
        <SearchBar
          query={query}
          onQueryChange={setQuery}
          filters={filters}
          onFiltersChange={setFilters}
          total={total}
          loading={loading}
        />

        <StatsBar />

        <div className="actions-bar">
          <button
            className={`chat-toggle ${showChat ? 'active' : ''}`}
            onClick={() => setShowChat(!showChat)}
          >
            {showChat ? 'Hide AI Assistant' : 'Ask AI About Files'}
          </button>
        </div>

        {showChat && <LLMChat />}

        <ResultsGrid
          results={results}
          total={total}
          loading={loading}
          onDocumentClick={openDocument}
          onLoadMore={loadMore}
          hasMore={results.length < total}
          onSuggestionClick={setQuery}
        />
      </main>

      {expandedDoc && (
        <DocumentViewer
          document={expandedDoc}
          onClose={() => setExpandedDoc(null)}
        />
      )}
    </div>
  );
}
