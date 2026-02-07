import React, { useState, useRef, useEffect } from 'react';
import { search, getDocument } from '../api.js';

export default function LLMChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const askQuestion = async () => {
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setLoading(true);

    try {
      // Search for relevant documents
      const { results: docs, total } = await search(question, { limit: 8 });

      if (docs.length === 0) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `No documents found matching "${question}". Try different search terms — names, locations, dates, or document types.`,
          sources: [],
        }]);
        setLoading(false);
        return;
      }

      // Load full text for top 3 results for deeper analysis
      const detailed = await Promise.all(
        docs.slice(0, 3).map(d => getDocument(d.doc_id).catch(() => null))
      );

      // Build a comprehensive answer from the documents
      let answer = `Found **${total}** documents related to "${question}".\n\n`;
      answer += `**Top results:**\n\n`;

      for (let i = 0; i < Math.min(docs.length, 5); i++) {
        const doc = docs[i];
        const detail = detailed[i];
        const people = doc.people?.length > 0 ? doc.people.join(', ') : 'N/A';

        answer += `**${i + 1}. ${doc.doc_id}**`;
        if (doc.document_type) answer += ` (${doc.document_type})`;
        if (doc.date) answer += ` — ${doc.date}`;
        answer += `\n`;
        if (doc.people?.length > 0) answer += `   People: ${people}\n`;

        // Show a relevant excerpt
        if (detail?.pages?.[0]?.full_text) {
          const text = detail.pages[0].full_text;
          // Try to find the most relevant sentence
          const lowerQ = question.toLowerCase();
          const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
          const relevant = sentences.find(s => s.toLowerCase().includes(lowerQ)) || sentences[0] || '';
          if (relevant) {
            answer += `   > ${relevant.trim().substring(0, 200)}...\n`;
          }
        }
        answer += `\n`;
      }

      answer += `\n*Click on any document card in the search results above to read the full text. For AI-powered analysis, run with the Node.js server and Ollama.*`;

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: answer,
        sources: docs.slice(0, 5).map(d => d.doc_id),
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${err.message}`,
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h3>Document Research Assistant</h3>
        <div className="llm-status offline">Search Mode</div>
      </div>

      <div className="chat-notice">
        <p>Ask questions to search and summarize relevant documents. For full AI-powered answers, run the local server with <a href="https://ollama.ai" target="_blank" rel="noreferrer">Ollama</a>.</p>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>Ask questions about the Epstein files:</p>
            <div className="chat-suggestions">
              {[
                'Who visited Epstein\'s island most frequently?',
                'What do the flight logs show?',
                'What legal proceedings involved Ghislaine Maxwell?',
                'What financial records are in the documents?',
              ].map(q => (
                <button key={q} className="chat-suggestion" onClick={() => setInput(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role}`}>
            <div className="chat-message-content">
              {msg.role === 'assistant'
                ? msg.content.split('\n').map((line, j) => {
                    // Basic markdown rendering
                    let rendered = line
                      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\*(.+?)\*/g, '<em>$1</em>')
                      .replace(/^> (.+)/, '<blockquote>$1</blockquote>');
                    return <span key={j} dangerouslySetInnerHTML={{ __html: rendered + '<br/>' }} />;
                  })
                : msg.content
              }
            </div>
            {msg.sources?.length > 0 && (
              <div className="chat-sources">
                <span>Sources: </span>
                {msg.sources.map((s, j) => (
                  <span key={j} className="chat-source-tag">{s}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <input
          type="text"
          className="chat-input"
          placeholder="Ask about the documents..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && askQuestion()}
          disabled={loading}
        />
        <button className="chat-send" onClick={askQuestion} disabled={loading || !input.trim()}>
          {loading ? '...' : 'Ask'}
        </button>
      </div>
    </div>
  );
}
