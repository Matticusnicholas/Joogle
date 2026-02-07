/**
 * Build static data files from the epstein-docs JSON documents.
 * Generates:
 *   - public/data/search-index.json  (compact metadata for all docs, used by Fuse.js)
 *   - public/data/docs/{id}.json     (individual documents with full page text)
 *   - public/data/stats.json         (database statistics)
 *   - public/data/types.json         (document type counts)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'results');
const OUT_DIR = path.join(__dirname, '..', 'client', 'public', 'data');

function main() {
  console.log('=== Building Static Data Files ===');

  if (!fs.existsSync(DATA_DIR)) {
    console.error(`Data directory not found: ${DATA_DIR}`);
    console.error('Clone the data first: git clone --depth 1 https://github.com/epstein-docs/epstein-docs.github.io.git data');
    process.exit(1);
  }

  // Create output directories
  fs.mkdirSync(path.join(OUT_DIR, 'docs'), { recursive: true });

  // Read all JSON files
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
        const fileName = path.parse(file).name;

        allPages.push({
          fileName,
          dir,
          data,
          metadata: data.document_metadata || {},
          fullText: data.full_text || '',
          entities: data.entities || {},
        });

        fileCount++;
        if (fileCount % 5000 === 0) console.log(`  Loaded ${fileCount} files...`);
      } catch { /* skip */ }
    }
  }

  console.log(`Loaded ${fileCount} total files`);

  // Group pages by document_number
  const docGroups = new Map();
  for (const page of allPages) {
    const docNum = page.metadata.document_number || page.fileName;
    if (!docGroups.has(docNum)) docGroups.set(docNum, []);
    docGroups.get(docNum).push(page);
  }

  console.log(`Grouped into ${docGroups.size} documents`);

  const searchIndex = [];
  const typeCounts = {};
  let totalPages = 0;
  let docCount = 0;
  const seenIds = new Set();

  for (const [docNum, pages] of docGroups) {
    pages.sort((a, b) => {
      const pA = parseInt(a.metadata.page_number) || 0;
      const pB = parseInt(b.metadata.page_number) || 0;
      return pA - pB;
    });

    const firstPage = pages[0];
    const docId = firstPage.fileName;

    if (seenIds.has(docId)) continue;
    seenIds.add(docId);

    // Collect entities
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

    const docType = firstPage.metadata.document_type || null;
    const date = firstPage.metadata.date || null;
    const people = Array.from(allPeople);
    const orgs = Array.from(allOrgs);
    const locations = Array.from(allLocations);

    // Build searchable text from all pages (keep enough for good search + snippets)
    const combinedText = pages.map(p => p.fullText).filter(Boolean).join(' ');
    const snippet = combinedText.substring(0, 2000).replace(/\s+/g, ' ').trim();

    // Add to search index (compact)
    searchIndex.push({
      id: docId,
      n: docNum,
      t: docType,
      d: date,
      p: people,
      o: orgs,
      l: locations,
      s: snippet,
      c: pages.length,
    });

    // Track types
    if (docType) {
      typeCounts[docType] = (typeCounts[docType] || 0) + 1;
    }

    // Write individual document file with full text
    const docFile = {
      doc_id: docId,
      document_number: docNum,
      document_type: docType,
      date,
      people,
      organizations: orgs,
      locations,
      page_count: pages.length,
      pages: pages.map((page, i) => ({
        page_number: i + 1,
        full_text: page.fullText,
        file_name: page.fileName,
        has_handwriting: !!page.metadata.has_handwriting,
        has_stamps: !!page.metadata.has_stamps,
      })),
    };

    fs.writeFileSync(
      path.join(OUT_DIR, 'docs', `${docId}.json`),
      JSON.stringify(docFile)
    );

    totalPages += pages.length;
    docCount++;
    if (docCount % 1000 === 0) console.log(`  Processed ${docCount} documents...`);
  }

  // Write search index
  console.log('Writing search index...');
  fs.writeFileSync(
    path.join(OUT_DIR, 'search-index.json'),
    JSON.stringify(searchIndex)
  );

  // Write stats
  fs.writeFileSync(
    path.join(OUT_DIR, 'stats.json'),
    JSON.stringify({
      documents: docCount,
      pages: totalPages,
      documentTypes: Object.keys(typeCounts).length,
    })
  );

  // Write types
  const typesArray = Object.entries(typeCounts)
    .map(([document_type, count]) => ({ document_type, count }))
    .sort((a, b) => b.count - a.count);
  fs.writeFileSync(
    path.join(OUT_DIR, 'types.json'),
    JSON.stringify(typesArray)
  );

  // Stats
  const indexSize = fs.statSync(path.join(OUT_DIR, 'search-index.json')).size;
  console.log(`\n=== Static Build Complete ===`);
  console.log(`Documents: ${docCount}`);
  console.log(`Pages: ${totalPages}`);
  console.log(`Search index: ${(indexSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Document files: ${docCount} JSON files in data/docs/`);
}

main();
