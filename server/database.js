import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'joogle.db');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000'); // 64MB cache
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id TEXT UNIQUE NOT NULL,
      document_number TEXT,
      title TEXT,
      document_type TEXT,
      date TEXT,
      full_text TEXT,
      page_count INTEGER DEFAULT 1,
      people TEXT,
      organizations TEXT,
      locations TEXT,
      source_files TEXT
    );

    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      full_text TEXT,
      file_name TEXT,
      has_handwriting INTEGER DEFAULT 0,
      has_stamps INTEGER DEFAULT 0,
      FOREIGN KEY (doc_id) REFERENCES documents(doc_id)
    );

    CREATE INDEX IF NOT EXISTS idx_pages_doc_id ON pages(doc_id);
    CREATE INDEX IF NOT EXISTS idx_pages_page ON pages(doc_id, page_number);
    CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(document_type);
    CREATE INDEX IF NOT EXISTS idx_documents_date ON documents(date);

    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
      doc_id,
      title,
      full_text,
      people,
      organizations,
      locations,
      document_type,
      content=documents,
      content_rowid=id,
      tokenize='porter unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
      INSERT INTO documents_fts(rowid, doc_id, title, full_text, people, organizations, locations, document_type)
      VALUES (new.id, new.doc_id, new.title, new.full_text, new.people, new.organizations, new.locations, new.document_type);
    END;

    CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, doc_id, title, full_text, people, organizations, locations, document_type)
      VALUES ('delete', old.id, old.doc_id, old.title, old.full_text, old.people, old.organizations, old.locations, old.document_type);
    END;

    CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, doc_id, title, full_text, people, organizations, locations, document_type)
      VALUES ('delete', old.id, old.doc_id, old.title, old.full_text, old.people, old.organizations, old.locations, old.document_type);
      INSERT INTO documents_fts(rowid, doc_id, title, full_text, people, organizations, locations, document_type)
      VALUES (new.id, new.doc_id, new.title, new.full_text, new.people, new.organizations, new.locations, new.document_type);
    END;
  `);
}

export function searchDocuments(query, { limit = 50, offset = 0, type, dateFrom, dateTo } = {}) {
  const db = getDb();

  if (!query || !query.trim()) {
    let sql = `SELECT id, doc_id, document_number, title, document_type, date, page_count, people, organizations, locations
               FROM documents WHERE 1=1`;
    const params = [];

    if (type) {
      sql += ` AND document_type = ?`;
      params.push(type);
    }
    if (dateFrom) {
      sql += ` AND date >= ?`;
      params.push(dateFrom);
    }
    if (dateTo) {
      sql += ` AND date <= ?`;
      params.push(dateTo);
    }

    sql += ` ORDER BY doc_id LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = db.prepare(sql).all(...params);
    const total = db.prepare(`SELECT COUNT(*) as count FROM documents`).get();
    return { results: rows, total: total.count };
  }

  // Build FTS5 query - handle user input gracefully
  const ftsQuery = query
    .replace(/[^\w\s"]/g, '') // remove special chars except quotes
    .split(/\s+/)
    .filter(Boolean)
    .map(term => term.includes('"') ? term : `"${term}"`)
    .join(' OR ');

  let sql = `
    SELECT d.id, d.doc_id, d.document_number, d.title, d.document_type, d.date,
           d.page_count, d.people, d.organizations, d.locations,
           snippet(documents_fts, 2, '<mark>', '</mark>', '...', 64) as snippet,
           rank
    FROM documents_fts
    JOIN documents d ON d.id = documents_fts.rowid
    WHERE documents_fts MATCH ?
  `;
  const params = [ftsQuery];

  if (type) {
    sql += ` AND d.document_type = ?`;
    params.push(type);
  }
  if (dateFrom) {
    sql += ` AND d.date >= ?`;
    params.push(dateFrom);
  }
  if (dateTo) {
    sql += ` AND d.date <= ?`;
    params.push(dateTo);
  }

  sql += ` ORDER BY rank LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const rows = db.prepare(sql).all(...params);

  // Get total count
  let countSql = `SELECT COUNT(*) as count FROM documents_fts WHERE documents_fts MATCH ?`;
  const countParams = [ftsQuery];
  const total = db.prepare(countSql).get(...countParams);

  return { results: rows, total: total.count };
}

export function getDocument(docId) {
  const db = getDb();
  const doc = db.prepare(`SELECT * FROM documents WHERE doc_id = ?`).get(docId);
  if (!doc) return null;

  const pages = db.prepare(`SELECT * FROM pages WHERE doc_id = ? ORDER BY page_number`).all(docId);
  return { ...doc, pages };
}

export function getDocumentTypes() {
  const db = getDb();
  return db.prepare(`SELECT document_type, COUNT(*) as count FROM documents WHERE document_type IS NOT NULL GROUP BY document_type ORDER BY count DESC`).all();
}

export function getPeople() {
  const db = getDb();
  const rows = db.prepare(`SELECT people FROM documents WHERE people IS NOT NULL AND people != ''`).all();
  const counts = {};
  for (const row of rows) {
    const people = row.people.split('|').map(p => p.trim()).filter(Boolean);
    for (const person of people) {
      counts[person] = (counts[person] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function getStats() {
  const db = getDb();
  const docs = db.prepare(`SELECT COUNT(*) as count FROM documents`).get();
  const pages = db.prepare(`SELECT COUNT(*) as count FROM pages`).get();
  const types = db.prepare(`SELECT COUNT(DISTINCT document_type) as count FROM documents`).get();
  return {
    documents: docs.count,
    pages: pages.count,
    documentTypes: types.count,
  };
}
