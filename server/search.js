import { searchDocuments, getDocument, getDocumentTypes, getPeople, getStats } from './database.js';

export function setupSearchRoutes(app) {
  // Live search endpoint
  app.get('/api/search', (req, res) => {
    try {
      const { q, limit = 50, offset = 0, type, dateFrom, dateTo } = req.query;
      const results = searchDocuments(q, {
        limit: Math.min(parseInt(limit) || 50, 200),
        offset: parseInt(offset) || 0,
        type: type || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });

      // Parse people/orgs/locations from pipe-delimited strings
      results.results = results.results.map(doc => ({
        ...doc,
        people: doc.people ? doc.people.split('|').filter(Boolean) : [],
        organizations: doc.organizations ? doc.organizations.split('|').filter(Boolean) : [],
        locations: doc.locations ? doc.locations.split('|').filter(Boolean) : [],
      }));

      res.json(results);
    } catch (err) {
      console.error('Search error:', err);
      res.status(500).json({ error: 'Search failed', message: err.message });
    }
  });

  // Get single document with all pages
  app.get('/api/documents/:docId', (req, res) => {
    try {
      const doc = getDocument(req.params.docId);
      if (!doc) return res.status(404).json({ error: 'Document not found' });

      doc.people = doc.people ? doc.people.split('|').filter(Boolean) : [];
      doc.organizations = doc.organizations ? doc.organizations.split('|').filter(Boolean) : [];
      doc.locations = doc.locations ? doc.locations.split('|').filter(Boolean) : [];

      res.json(doc);
    } catch (err) {
      console.error('Document fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch document' });
    }
  });

  // Document types for filters
  app.get('/api/types', (_req, res) => {
    try {
      res.json(getDocumentTypes());
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch types' });
    }
  });

  // People mentioned across documents
  app.get('/api/people', (_req, res) => {
    try {
      res.json(getPeople());
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch people' });
    }
  });

  // Database stats
  app.get('/api/stats', (_req, res) => {
    try {
      res.json(getStats());
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });
}
