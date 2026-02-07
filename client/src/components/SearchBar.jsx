import React, { useState, useEffect } from 'react';

export default function SearchBar({ query, onQueryChange, filters, onFiltersChange, total, loading }) {
  const [types, setTypes] = useState([]);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetch('/api/types')
      .then(r => r.json())
      .then(setTypes)
      .catch(() => {});
  }, []);

  return (
    <div className="search-section">
      <div className="search-container">
        <div className="search-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        <input
          type="text"
          className="search-input"
          placeholder="Search the Epstein files... names, locations, dates, anything"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          autoFocus
        />
        {loading && <div className="search-spinner" />}
        {query && (
          <button className="search-clear" onClick={() => onQueryChange('')}>
            &times;
          </button>
        )}
      </div>

      <div className="search-meta">
        <span className="result-count">
          {total > 0 ? `${total.toLocaleString()} documents found` : query ? 'No results' : ''}
        </span>
        <button className="filter-toggle" onClick={() => setShowFilters(!showFilters)}>
          Filters {showFilters ? '▲' : '▼'}
        </button>
      </div>

      {showFilters && (
        <div className="filters-panel">
          <select
            value={filters.type || ''}
            onChange={e => onFiltersChange({ ...filters, type: e.target.value || undefined })}
          >
            <option value="">All Document Types</option>
            {types.map(t => (
              <option key={t.document_type} value={t.document_type}>
                {t.document_type} ({t.count})
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
