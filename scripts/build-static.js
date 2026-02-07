/**
 * Build static data files from the epstein-docs JSON documents.
 * Generates:
 *   - public/data/search-index.json  (compact metadata for all docs)
 *   - public/data/inverted.json      (word -> [docIndex, ...] for full-text search)
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

// Common English stop words to skip in the inverted index
const STOP_WORDS = new Set([
  'the','be','to','of','and','a','in','that','have','i','it','for','not','on',
  'with','he','as','you','do','at','this','but','his','by','from','they','we',
  'say','her','she','or','an','will','my','one','all','would','there','their',
  'what','so','up','out','if','about','who','get','which','go','me','when',
  'make','can','like','time','no','just','him','know','take','people','into',
  'year','your','good','some','could','them','see','other','than','then','now',
  'look','only','come','its','over','think','also','back','after','use','two',
  'how','our','work','first','well','way','even','new','want','because','any',
  'these','give','day','most','us','was','were','been','has','had','are','is',
  'did','does','may','shall','should','said',
]);

function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
}

function main() {
  console.log('=== Building Static Data Files ===');

  if (!fs.existsSync(DATA_DIR)) {
    console.error(`Data directory not found: ${DATA_DIR}`);
    console.error('Clone the data first: git clone --depth 1 https://github.com/epstein-docs/epstein-docs.github.io.git data');
    process.exit(1);
  }

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
  const invertedIndex = {}; // word -> [docIdx, docIdx, ...]
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

    const docIdx = searchIndex.length; // index position for inverted index

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

    // Build ALL searchable text from every page
    const combinedText = pages.map(p => p.fullText).filter(Boolean).join(' ');

    // Tokenize and add to inverted index
    const allText = [
      combinedText,
      people.join(' '),
      orgs.join(' '),
      locations.join(' '),
      docType || '',
      docId,
      docNum,
    ].join(' ');

    const words = tokenize(allText);
    const uniqueWords = new Set(words);
    for (const word of uniqueWords) {
      if (!invertedIndex[word]) {
        invertedIndex[word] = [];
      }
      invertedIndex[word].push(docIdx);
    }

    // Store a short preview for display (not for search - inverted index handles that)
    const preview = combinedText.substring(0, 300).replace(/\s+/g, ' ').trim();

    searchIndex.push({
      id: docId,
      n: docNum,
      t: docType,
      d: date,
      p: people,
      o: orgs,
      l: locations,
      v: preview, // short preview for no-query browsing
      c: pages.length,
    });

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

  // Write search index (metadata only)
  console.log('Writing search index...');
  fs.writeFileSync(
    path.join(OUT_DIR, 'search-index.json'),
    JSON.stringify(searchIndex)
  );

  // Write inverted index
  console.log('Writing inverted index...');
  const uniqueWordCount = Object.keys(invertedIndex).length;
  console.log(`  ${uniqueWordCount} unique words indexed`);
  fs.writeFileSync(
    path.join(OUT_DIR, 'inverted.json'),
    JSON.stringify(invertedIndex)
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

  const indexSize = fs.statSync(path.join(OUT_DIR, 'search-index.json')).size;
  const invertedSize = fs.statSync(path.join(OUT_DIR, 'inverted.json')).size;
  console.log(`\n=== Static Build Complete ===`);
  console.log(`Documents: ${docCount}`);
  console.log(`Pages: ${totalPages}`);
  console.log(`Unique words: ${uniqueWordCount}`);
  console.log(`Metadata index: ${(indexSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Inverted index: ${(invertedSize / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Document files: ${docCount} JSON files in data/docs/`);
}

main();
