import React, { useState, useEffect, useRef } from 'react';

export default function DocumentViewer({ document: doc, onClose }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const contentRef = useRef(null);

  const pages = doc.pages || [];
  const totalPages = pages.length || 1;

  // Close on escape key
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        setCurrentPage(p => Math.min(p + 1, totalPages));
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setCurrentPage(p => Math.max(p - 1, 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, totalPages]);

  // Prevent body scroll when viewer is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const currentPageData = pages[currentPage - 1];
  const pageText = currentPageData?.full_text || doc.full_text || 'No text content available';

  // Highlight search text in page content
  const highlightedText = searchText
    ? pageText.replace(
        new RegExp(`(${searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
        '<mark>$1</mark>'
      )
    : pageText;

  return (
    <div className="viewer-overlay" onClick={onClose}>
      <div className="viewer-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="viewer-header">
          <div className="viewer-title-section">
            <h2 className="viewer-title">{doc.doc_id}</h2>
            <div className="viewer-meta">
              {doc.document_type && <span className="viewer-badge">{doc.document_type}</span>}
              {doc.date && <span className="viewer-date">{doc.date}</span>}
              <span className="viewer-page-info">{totalPages} page{totalPages !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <button className="viewer-close" onClick={onClose}>✕</button>
        </div>

        {/* Entities bar */}
        {(doc.people?.length > 0 || doc.organizations?.length > 0 || doc.locations?.length > 0) && (
          <div className="viewer-entities">
            {doc.people?.length > 0 && (
              <div className="viewer-entity-group">
                <strong>People:</strong>
                {doc.people.map((p, i) => (
                  <span key={i} className="entity-tag person-tag">{p}</span>
                ))}
              </div>
            )}
            {doc.organizations?.length > 0 && (
              <div className="viewer-entity-group">
                <strong>Orgs:</strong>
                {doc.organizations.map((o, i) => (
                  <span key={i} className="entity-tag org-tag">{o}</span>
                ))}
              </div>
            )}
            {doc.locations?.length > 0 && (
              <div className="viewer-entity-group">
                <strong>Locations:</strong>
                {doc.locations.map((l, i) => (
                  <span key={i} className="entity-tag location-tag">{l}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Search within document */}
        <div className="viewer-search">
          <input
            type="text"
            placeholder="Search within this document..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="viewer-search-input"
          />
        </div>

        {/* Page navigation */}
        {totalPages > 1 && (
          <div className="viewer-nav">
            <button
              className="nav-btn"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(1)}
            >
              ⟨⟨ First
            </button>
            <button
              className="nav-btn"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => p - 1)}
            >
              ← Prev
            </button>
            <span className="nav-page">
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="nav-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
            >
              Next →
            </button>
            <button
              className="nav-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(totalPages)}
            >
              Last ⟩⟩
            </button>
          </div>
        )}

        {/* Page content */}
        <div className="viewer-content" ref={contentRef}>
          <div
            className="viewer-text"
            dangerouslySetInnerHTML={{ __html: highlightedText.replace(/\n/g, '<br/>') }}
          />
        </div>

        {/* Page thumbnails for quick nav */}
        {totalPages > 1 && (
          <div className="viewer-thumbnails">
            {pages.map((_, i) => (
              <button
                key={i}
                className={`thumbnail-btn ${currentPage === i + 1 ? 'active' : ''}`}
                onClick={() => setCurrentPage(i + 1)}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
