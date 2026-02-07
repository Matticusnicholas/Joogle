# Joogle - Epstein Files Search Engine

A fast, live-search engine for the publicly released Jeffrey Epstein court documents. Search through thousands of OCR-processed pages with instant results, expandable document cards, and an optional AI assistant for document Q&A.

## Features

- **Live Search** - Results appear as you type, powered by Fuse.js fuzzy search (static) or SQLite FTS5 (server)
- **Expandable Grid** - Documents shown as cards in a responsive grid; click to expand and read full pages
- **Document Viewer** - Full page-by-page viewer with in-document search, keyboard navigation, and page thumbnails
- **Entity Extraction** - Browse by people, organizations, locations mentioned in documents
- **AI Assistant** - Ask questions about the documents (search-based on GitHub Pages, LLM-powered with local server)
- **Filters** - Filter by document type
- **GitHub Pages Ready** - Fully static deployment via GitHub Actions

## Deploy to GitHub Pages (Free Hosting)

The GitHub Actions workflow is already set up. You just need to enable Pages:

1. Go to your repo **Settings** > **Pages**
2. Under **Source**, select **GitHub Actions**
3. Push to `main` branch (or click "Run workflow" in the Actions tab)
4. The action will automatically clone the data, build everything, and deploy

That's it - the workflow handles:
- Cloning the 29,000+ document files from epstein-docs
- Building the search index (4.6 MB, ~1 MB gzipped)
- Creating 8,192 individual document JSON files
- Building the React frontend
- Deploying to GitHub Pages

## Local Development

### Quick Start (Static Mode)

```bash
# 1. Clone this repo
git clone https://github.com/Matticusnicholas/Joogle.git
cd Joogle

# 2. Clone the document data
git clone --depth 1 https://github.com/epstein-docs/epstein-docs.github.io.git data

# 3. Install dependencies
npm install

# 4. Build static data + frontend
npm run build:static

# 5. Serve the dist folder (any static server works)
npx serve dist
```

### Server Mode (with SQLite + Ollama LLM)

```bash
# Steps 1-3 same as above, then:

# 4. Ingest documents into SQLite
npm run ingest

# 5. Build frontend
npm run build

# 6. Start server
npm start
```

Then open http://localhost:3001

### Dev Mode (hot reload)

```bash
npm run dev
```

## AI Assistant (Optional - Server Mode)

For AI-powered document Q&A, install [Ollama](https://ollama.ai):

```bash
ollama pull mistral
```

The AI assistant auto-connects when Ollama is running. Configure via environment variables:

```bash
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=mistral
```

### Recommended Models

- **mistral** (default) - Good balance of quality and speed
- **llama2-uncensored** - Less filtered responses
- **dolphin-mistral** - Uncensored, good for research
- **solar** - Strong reasoning for document analysis

## Tech Stack

- **Frontend**: React 18, Vite, Fuse.js (client-side fuzzy search)
- **Backend** (optional): Node.js, Express, better-sqlite3 with FTS5
- **AI** (optional): Ollama (local LLM inference)
- **Hosting**: GitHub Pages via GitHub Actions
- **Data**: ~29,000 OCR-processed JSON documents from epstein-docs

## Project Structure

```
Joogle/
├── .github/workflows/
│   └── deploy.yml       # GitHub Pages CI/CD
├── scripts/
│   └── build-static.js  # Generates static JSON data files
├── server/
│   ├── index.js         # Express server (optional)
│   ├── database.js      # SQLite setup, queries, FTS5
│   ├── search.js        # Search API routes
│   ├── llm.js           # Ollama LLM integration
│   └── ingest.js        # Data ingestion script
├── client/
│   ├── index.html
│   └── src/
│       ├── App.jsx              # Main app with search state
│       ├── api.js               # Unified API (static JSON / server)
│       ├── components/
│       │   ├── SearchBar.jsx    # Live search input + filters
│       │   ├── ResultsGrid.jsx  # Card grid with document cards
│       │   ├── DocumentViewer.jsx # Full document overlay viewer
│       │   ├── LLMChat.jsx      # AI chat / document research
│       │   └── StatsBar.jsx     # Database statistics
│       └── styles/
│           └── app.css          # Dark theme styles
├── vite.config.js
└── package.json
```

## Data Source

Document data from [epstein-docs/epstein-docs.github.io](https://github.com/epstein-docs/epstein-docs.github.io) - AI-processed OCR data from publicly released Epstein case documents.
