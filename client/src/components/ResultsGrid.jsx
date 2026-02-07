import React from 'react';

function highlightSnippet(html) {
  if (!html) return null;
  return { __html: html };
}

function DocumentCard({ doc, onClick }) {
  const people = doc.people || [];
  const orgs = doc.organizations || [];
  const typeColor = getTypeColor(doc.document_type);

  return (
    <div className="doc-card" onClick={() => onClick(doc.doc_id)}>
      <div className="doc-card-header">
        <span className="doc-type-badge" style={{ backgroundColor: typeColor }}>
          {doc.document_type || 'Unknown'}
        </span>
        {doc.page_count > 1 && (
          <span className="doc-pages">{doc.page_count} pages</span>
        )}
      </div>

      <h3 className="doc-card-title">{doc.doc_id}</h3>

      {doc.date && <p className="doc-date">{doc.date}</p>}

      {doc.snippet ? (
        <p className="doc-snippet" dangerouslySetInnerHTML={highlightSnippet(doc.snippet)} />
      ) : (
        <p className="doc-snippet doc-snippet-faded">
          {doc.document_type || 'Document'} #{doc.document_number}
        </p>
      )}

      {people.length > 0 && (
        <div className="doc-entities">
          <span className="entity-label">People:</span>
          <div className="entity-tags">
            {people.slice(0, 5).map((p, i) => (
              <span key={i} className="entity-tag person-tag">{p}</span>
            ))}
            {people.length > 5 && <span className="entity-more">+{people.length - 5}</span>}
          </div>
        </div>
      )}

      {orgs.length > 0 && (
        <div className="doc-entities">
          <span className="entity-label">Orgs:</span>
          <div className="entity-tags">
            {orgs.slice(0, 3).map((o, i) => (
              <span key={i} className="entity-tag org-tag">{o}</span>
            ))}
            {orgs.length > 3 && <span className="entity-more">+{orgs.length - 3}</span>}
          </div>
        </div>
      )}

      <div className="doc-card-footer">
        <span className="doc-view-btn">View Document →</span>
      </div>
    </div>
  );
}

function getTypeColor(type) {
  const colors = {
    'Court Document': '#4a90d9',
    'Deposition': '#e67e22',
    'Letter': '#27ae60',
    'Legal Filing': '#8e44ad',
    'Financial Record': '#c0392b',
    'Email': '#16a085',
    'Flight Log': '#2c3e50',
    'Police Report': '#d35400',
    'Subpoena': '#7f8c8d',
  };
  return colors[type] || '#555';
}

export default function ResultsGrid({ results, total, loading, onDocumentClick, onLoadMore, hasMore, onSuggestionClick }) {
  if (loading && results.length === 0) {
    return (
      <div className="loading-container">
        <div className="loading-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="doc-card skeleton" />
          ))}
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📁</div>
        <h2>Search the Epstein Files</h2>
        <p>Enter a name, location, date, or keyword to search through thousands of court documents, depositions, flight logs, and more.</p>
        <div className="search-suggestions">
          <span className="suggestion">Try: </span>
          {['Ghislaine Maxwell', 'flight log', 'Palm Beach', 'Bill Clinton', 'Virginia Giuffre', 'deposition'].map(s => (
            <button key={s} className="suggestion-btn" onClick={() => onSuggestionClick?.(s)}>{s}</button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="results-section">
      <div className="results-grid">
        {results.map(doc => (
          <DocumentCard
            key={doc.doc_id}
            doc={doc}
            onClick={onDocumentClick}
          />
        ))}
      </div>

      {hasMore && (
        <div className="load-more">
          <button className="load-more-btn" onClick={onLoadMore} disabled={loading}>
            {loading ? 'Loading...' : `Load More (${results.length} of ${total.toLocaleString()})`}
          </button>
        </div>
      )}
    </div>
  );
}
