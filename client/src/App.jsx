import React, { useState, useEffect, useCallback } from 'react';
import SearchBar from './components/SearchBar.jsx';
import ResultsGrid from './components/ResultsGrid.jsx';
import DocumentViewer from './components/DocumentViewer.jsx';
import LLMChat from './components/LLMChat.jsx';
import StatsBar from './components/StatsBar.jsx';
import { search as apiSearch, getDocument } from './api.js';

export default function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [filters, setFilters] = useState({});
  const [offset, setOffset] = useState(0);
  const [indexReady, setIndexReady] = useState(false);

  const doSearch = useCallback(async (q, newOffset = 0, append = false) => {
    setLoading(true);
    try {
      const data = await apiSearch(q, {
        limit: 60,
        offset: newOffset,
        type: filters.type || undefined,
      });

      if (append) {
        setResults(prev => [...prev, ...data.results]);
      } else {
        setResults(data.results);
      }
      setTotal(data.total);
      setOffset(newOffset);
      setIndexReady(true);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Live search on query change
  useEffect(() => {
    const timer = setTimeout(() => doSearch(query, 0), query ? 150 : 0);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  const loadMore = () => {
    doSearch(query, offset + 60, true);
  };

  const openDocument = async (docId) => {
    setLoading(true);
    try {
      const doc = await getDocument(docId);
      setExpandedDoc(doc);
    } catch (err) {
      console.error('Failed to load document:', err);
    } finally {
      setLoading(false);
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

        {indexReady && (
          <div className="actions-bar">
            <button
              className={`chat-toggle ${showChat ? 'active' : ''}`}
              onClick={() => setShowChat(!showChat)}
            >
              {showChat ? 'Hide AI Assistant' : 'Ask AI About Files'}
            </button>
          </div>
        )}

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
