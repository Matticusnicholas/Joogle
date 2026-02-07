import React, { useState, useEffect } from 'react';

export default function StatsBar() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  if (!stats) return null;

  return (
    <div className="stats-bar">
      <div className="stat">
        <span className="stat-number">{stats.documents.toLocaleString()}</span>
        <span className="stat-label">Documents</span>
      </div>
      <div className="stat">
        <span className="stat-number">{stats.pages.toLocaleString()}</span>
        <span className="stat-label">Pages</span>
      </div>
      <div className="stat">
        <span className="stat-number">{stats.documentTypes}</span>
        <span className="stat-label">Document Types</span>
      </div>
    </div>
  );
}
