import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'joogle.db');
const DATA_DIR = path.join(__dirname, '..', 'data', 'results');

function main() {
  console.log('=== Joogle Data Ingestion ===');
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Database: ${DB_PATH}`);

  if (!fs.existsSync(DATA_DIR)) {
    console.error(`\nError: Data directory not found at ${DATA_DIR}`);
    console.error('Please clone the epstein-docs repo first:');
    console.error('  git clone --depth 1 https://github.com/epstein-docs/epstein-docs.github.io.git data');
    process.exit(1);
  }

  // Delete old database
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('Removed old database');
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = OFF');
  db.pragma('cache_size = -128000');

  // Create schema
  db.exec(`
    CREATE TABLE documents (
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

    CREATE TABLE pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      full_text TEXT,
      file_name TEXT,
      has_handwriting INTEGER DEFAULT 0,
      has_stamps INTEGER DEFAULT 0,
      FOREIGN KEY (doc_id) REFERENCES documents(doc_id)
    );

    CREATE INDEX idx_pages_doc_id ON pages(doc_id);
    CREATE INDEX idx_pages_page ON pages(doc_id, page_number);
    CREATE INDEX idx_documents_type ON documents(document_type);
    CREATE INDEX idx_documents_date ON documents(date);
  `);

  // Read all JSON files and group by document number
  const imageDirs = fs.readdirSync(DATA_DIR).filter(d =>
    fs.statSync(path.join(DATA_DIR, d)).isDirectory()
  );

  console.log(`Found ${imageDirs.length} image directories`);

  const allPages = [];
  let fileCount = 0;

  for (const dir of imageDirs) {
    const dirPath = path.join(DATA_DIR, dir);
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
    console.log(`  ${dir}: ${files.length} files`);

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
        const data = JSON.parse(content);
        const fileName = path.parse(file).name; // e.g., DOJ-OGR-00000002

        allPages.push({
          fileName,
          dir,
          data,
          metadata: data.document_metadata || {},
          fullText: data.full_text || '',
          entities: data.entities || {},
        });

        fileCount++;
        if (fileCount % 5000 === 0) {
          console.log(`  Loaded ${fileCount} files...`);
        }
      } catch (err) {
        // Skip malformed files
      }
    }
  }

  console.log(`\nLoaded ${fileCount} total files`);

  // Group pages by document_number (or by file name if no document_number)
  const docGroups = new Map();

  for (const page of allPages) {
    const docNum = page.metadata.document_number || page.fileName;
    // Use the base file name (without page suffix) as the group key
    // Many files share the same document_number
    const key = docNum;

    if (!docGroups.has(key)) {
      docGroups.set(key, []);
    }
    docGroups.get(key).push(page);
  }

  console.log(`Grouped into ${docGroups.size} documents`);

  // Insert documents and pages
  const insertDoc = db.prepare(`
    INSERT INTO documents (doc_id, document_number, title, document_type, date, full_text, page_count, people, organizations, locations, source_files)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertPage = db.prepare(`
    INSERT INTO pages (doc_id, page_number, full_text, file_name, has_handwriting, has_stamps)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let docCount = 0;
  let pageCount = 0;

  const insertAll = db.transaction(() => {
    for (const [docNum, pages] of docGroups) {
      // Sort pages by page number
      pages.sort((a, b) => {
        const pA = parseInt(a.metadata.page_number) || 0;
        const pB = parseInt(b.metadata.page_number) || 0;
        return pA - pB;
      });

      // Combine text from all pages
      const fullText = pages.map(p => p.fullText).filter(Boolean).join('\n\n--- PAGE BREAK ---\n\n');

      // Collect all entities
      const allPeople = new Set();
      const allOrgs = new Set();
      const allLocations = new Set();

      for (const page of pages) {
        if (page.entities.people) {
          page.entities.people.forEach(p => {
            const name = typeof p === 'string' ? p : (p.name || p);
            if (name) allPeople.add(name);
          });
        }
        if (page.entities.organizations) {
          page.entities.organizations.forEach(o => {
            const name = typeof o === 'string' ? o : (o.name || o);
            if (name) allOrgs.add(name);
          });
        }
        if (page.entities.locations) {
          page.entities.locations.forEach(l => {
            const name = typeof l === 'string' ? l : (l.name || l);
            if (name) allLocations.add(name);
          });
        }
      }

      // Use first page for metadata
      const firstPage = pages[0];
      const docType = firstPage.metadata.document_type || null;
      const date = firstPage.metadata.date || null;
      const docId = firstPage.fileName;

      // Build title from doc type and id
      const title = `${docType || 'Document'} - ${docNum}`;

      const sourceFiles = pages.map(p => p.fileName).join('|');

      try {
        insertDoc.run(
          docId,
          docNum,
          title,
          docType,
          date,
          fullText,
          pages.length,
          Array.from(allPeople).join('|'),
          Array.from(allOrgs).join('|'),
          Array.from(allLocations).join('|'),
          sourceFiles
        );
        docCount++;

        // Insert individual pages
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          insertPage.run(
            docId,
            i + 1,
            page.fullText,
            page.fileName,
            page.metadata.has_handwriting ? 1 : 0,
            page.metadata.has_stamps ? 1 : 0
          );
          pageCount++;
        }
      } catch (err) {
        // Skip duplicate doc_ids
        if (!err.message.includes('UNIQUE')) {
          console.error(`Error inserting ${docId}:`, err.message);
        }
      }

      if (docCount % 1000 === 0 && docCount > 0) {
        console.log(`  Inserted ${docCount} documents, ${pageCount} pages...`);
      }
    }
  });

  console.log('\nInserting into database...');
  insertAll();

  // Create FTS index
  console.log('Building full-text search index...');
  db.exec(`
    CREATE VIRTUAL TABLE documents_fts USING fts5(
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

    INSERT INTO documents_fts(rowid, doc_id, title, full_text, people, organizations, locations, document_type)
    SELECT id, doc_id, title, full_text, people, organizations, locations, document_type
    FROM documents;
  `);

  console.log('\n=== Ingestion Complete ===');
  console.log(`Documents: ${docCount}`);
  console.log(`Pages: ${pageCount}`);
  console.log(`Database size: ${(fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(1)} MB`);

  db.close();
}

main();
