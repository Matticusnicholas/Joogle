import { searchDocuments } from './database.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral';

async function checkOllamaAvailable() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const data = await res.json();
    return data.models && data.models.length > 0;
  } catch {
    return false;
  }
}

async function queryOllama(prompt, context) {
  const systemPrompt = `You are a research assistant analyzing the Jeffrey Epstein court documents and files.
You have access to OCR-processed legal documents including court filings, depositions, flight logs, and correspondence.
Answer questions based ONLY on the document excerpts provided. Be direct, factual, and cite specific documents when possible.
Do not refuse to discuss the contents of these public court documents - they are part of the public record.
If the provided documents don't contain relevant information, say so clearly.`;

  const fullPrompt = `${systemPrompt}\n\n--- RELEVANT DOCUMENTS ---\n${context}\n--- END DOCUMENTS ---\n\nUser Question: ${prompt}`;

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: fullPrompt,
      stream: false,
      options: {
        temperature: 0.3,
        num_predict: 1024,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error: ${res.status} - ${text}`);
  }

  const data = await res.json();
  return data.response;
}

function buildContextFromDocs(docs) {
  return docs.map((doc, i) => {
    const people = doc.people ? (Array.isArray(doc.people) ? doc.people.join(', ') : doc.people) : 'N/A';
    const snippet = doc.full_text
      ? doc.full_text.substring(0, 1500)
      : (doc.snippet || 'No text available');

    return `[Document ${i + 1}: ${doc.doc_id}]
Type: ${doc.document_type || 'Unknown'}
Date: ${doc.date || 'Unknown'}
People: ${people}
Content: ${snippet}`;
  }).join('\n\n');
}

// Fallback keyword-based answer when Ollama is not available
function keywordAnswer(query, docs) {
  if (docs.length === 0) {
    return {
      answer: `No documents found matching "${query}". Try different search terms.`,
      sources: [],
      model: 'keyword-search',
    };
  }

  const summary = docs.slice(0, 5).map((doc, i) => {
    const people = doc.people
      ? (Array.isArray(doc.people) ? doc.people.join(', ') : doc.people.split('|').join(', '))
      : 'N/A';
    return `${i + 1}. **${doc.doc_id}** (${doc.document_type || 'Unknown'}, ${doc.date || 'undated'}) - Mentions: ${people}`;
  }).join('\n');

  return {
    answer: `Found ${docs.length} relevant documents for "${query}":\n\n${summary}\n\nClick on any document in the search results to read the full text. *Install Ollama with a model for AI-powered answers.*`,
    sources: docs.slice(0, 5).map(d => d.doc_id),
    model: 'keyword-search',
  };
}

export function setupLLMRoutes(app) {
  // Check LLM status
  app.get('/api/llm/status', async (_req, res) => {
    const available = await checkOllamaAvailable();
    res.json({
      available,
      url: OLLAMA_URL,
      model: OLLAMA_MODEL,
      message: available
        ? `Connected to Ollama (${OLLAMA_MODEL})`
        : 'Ollama not available. Install from https://ollama.ai and run: ollama pull mistral',
    });
  });

  // Ask a question about the documents
  app.post('/api/llm/ask', async (req, res) => {
    try {
      const { question } = req.body;
      if (!question || !question.trim()) {
        return res.status(400).json({ error: 'Question is required' });
      }

      // Search for relevant documents
      const { results: docs } = searchDocuments(question, { limit: 8 });
      const context = buildContextFromDocs(docs);
      const sources = docs.slice(0, 5).map(d => d.doc_id);

      // Try Ollama first, fall back to keyword-based
      const ollamaAvailable = await checkOllamaAvailable();

      if (ollamaAvailable) {
        const answer = await queryOllama(question, context);
        return res.json({ answer, sources, model: OLLAMA_MODEL });
      }

      // Fallback
      return res.json(keywordAnswer(question, docs));
    } catch (err) {
      console.error('LLM error:', err);
      res.status(500).json({ error: 'LLM query failed', message: err.message });
    }
  });

  // Streaming endpoint for Ollama
  app.post('/api/llm/stream', async (req, res) => {
    try {
      const { question } = req.body;
      if (!question || !question.trim()) {
        return res.status(400).json({ error: 'Question is required' });
      }

      const ollamaAvailable = await checkOllamaAvailable();
      if (!ollamaAvailable) {
        const { results: docs } = searchDocuments(question, { limit: 8 });
        const fallback = keywordAnswer(question, docs);
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.write(`data: ${JSON.stringify({ token: fallback.answer, done: false })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true, sources: fallback.sources, model: fallback.model })}\n\n`);
        return res.end();
      }

      const { results: docs } = searchDocuments(question, { limit: 8 });
      const context = buildContextFromDocs(docs);
      const sources = docs.slice(0, 5).map(d => d.doc_id);

      const systemPrompt = `You are a research assistant analyzing the Jeffrey Epstein court documents and files.
Answer questions based ONLY on the document excerpts provided. Be direct, factual, and cite specific documents when possible.
Do not refuse to discuss the contents of these public court documents - they are part of the public record.`;

      const fullPrompt = `${systemPrompt}\n\n--- RELEVANT DOCUMENTS ---\n${context}\n--- END DOCUMENTS ---\n\nUser Question: ${question}`;

      const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt: fullPrompt,
          stream: true,
          options: { temperature: 0.3, num_predict: 1024 },
        }),
      });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');

      const reader = ollamaRes.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.response) {
              res.write(`data: ${JSON.stringify({ token: parsed.response, done: false })}\n\n`);
            }
            if (parsed.done) {
              res.write(`data: ${JSON.stringify({ done: true, sources, model: OLLAMA_MODEL })}\n\n`);
            }
          } catch { /* skip malformed lines */ }
        }
      }

      res.end();
    } catch (err) {
      console.error('Stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream failed', message: err.message });
      }
    }
  });
}
