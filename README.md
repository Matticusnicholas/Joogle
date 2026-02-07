# Joogle - Epstein Files Search Engine

A fast, live-search engine for the publicly released Jeffrey Epstein court documents. Search through thousands of OCR-processed pages with instant results, expandable document cards, and an optional AI assistant for document Q&A.

## Features

- **Live Search** - Results appear as you type, powered by SQLite FTS5 full-text search
- **Expandable Grid** - Documents shown as cards in a responsive grid; click to expand and read full pages
- **Document Viewer** - Full page-by-page viewer with in-document search, keyboard navigation, and page thumbnails
- **Entity Extraction** - Browse by people, organizations, locations mentioned in documents
- **AI Assistant** - Ask questions about the documents using a local LLM via Ollama (optional)
- **Filters** - Filter by document type, date range
- **Fast** - SQLite with FTS5 tokenized index for sub-millisecond search across 29,000+ pages

## Quick Start

```bash
# 1. Clone this repo
git clone https://github.com/Matticusnicholas/Joogle.git
cd Joogle

# 2. Clone the document data
git clone --depth 1 https://github.com/epstein-docs/epstein-docs.github.io.git data

# 3. Install dependencies
npm install

# 4. Ingest documents into search database
npm run ingest

# 5. Build frontend
npm run build

# 6. Start server
npm start
```

Then open http://localhost:3001

### Development Mode

```bash
npm run dev
```

This starts both the Express API server and the Vite dev server with hot reload.

## AI Assistant (Optional)

For AI-powered document Q&A, install [Ollama](https://ollama.ai):

```bash
# Install Ollama, then:
ollama pull mistral
```

The AI assistant will automatically connect when Ollama is running. Without Ollama, it falls back to keyword-based document search.

You can configure the model via environment variables:

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

- **Backend**: Node.js, Express, better-sqlite3 with FTS5
- **Frontend**: React 18, Vite
- **Search**: SQLite Full-Text Search (FTS5) with porter stemming
- **AI**: Ollama (local LLM inference)
- **Data**: ~29,000 OCR-processed JSON documents from epstein-docs

## Project Structure

```
Joogle/
├── server/
│   ├── index.js        # Express server
│   ├── database.js     # SQLite setup, queries, FTS5
│   ├── search.js       # Search API routes
│   ├── llm.js          # Ollama LLM integration
│   └── ingest.js       # Data ingestion script
├── client/
│   ├── index.html
│   └── src/
│       ├── App.jsx              # Main app with search state
│       ├── components/
│       │   ├── SearchBar.jsx    # Live search input + filters
│       │   ├── ResultsGrid.jsx  # Card grid with document cards
│       │   ├── DocumentViewer.jsx # Full document overlay viewer
│       │   ├── LLMChat.jsx      # AI chat interface
│       │   └── StatsBar.jsx     # Database statistics
│       └── styles/
│           └── app.css          # Dark theme styles
├── data/                # Cloned epstein-docs (gitignored)
├── joogle.db           # SQLite database (generated, gitignored)
├── vite.config.js
└── package.json
```

## Data Source

Document data from [epstein-docs/epstein-docs.github.io](https://github.com/epstein-docs/epstein-docs.github.io) - AI-processed OCR data from publicly released Epstein case documents.
