import React, { useState, useRef, useEffect } from 'react';

export default function LLMChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [llmStatus, setLlmStatus] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetch('/api/llm/status')
      .then(r => r.json())
      .then(setLlmStatus)
      .catch(() => setLlmStatus({ available: false, message: 'Cannot connect to server' }));
  }, []);

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
      // Try streaming first
      const res = await fetch('/api/llm/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      if (res.headers.get('content-type')?.includes('text/event-stream')) {
        // Handle SSE stream
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        let sources = [];
        let model = '';

        setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.token) {
                fullResponse += data.token;
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: 'assistant',
                    content: fullResponse,
                    streaming: true,
                  };
                  return updated;
                });
              }
              if (data.done) {
                sources = data.sources || [];
                model = data.model || '';
              }
            } catch { /* skip */ }
          }
        }

        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: fullResponse,
            sources,
            model,
            streaming: false,
          };
          return updated;
        });
      } else {
        // Non-streaming fallback
        const data = await res.json();
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.answer,
          sources: data.sources,
          model: data.model,
        }]);
      }
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
        <h3>AI Document Assistant</h3>
        <div className={`llm-status ${llmStatus?.available ? 'online' : 'offline'}`}>
          {llmStatus?.available ? 'AI Online' : 'Keyword Mode'}
        </div>
      </div>

      {!llmStatus?.available && (
        <div className="chat-notice">
          <p>For AI-powered answers, install <a href="https://ollama.ai" target="_blank" rel="noreferrer">Ollama</a> and run:</p>
          <code>ollama pull mistral</code>
          <p>Currently using keyword-based document search as fallback.</p>
        </div>
      )}

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
              {msg.content}
              {msg.streaming && <span className="cursor-blink">▋</span>}
            </div>
            {msg.sources?.length > 0 && (
              <div className="chat-sources">
                <span>Sources: </span>
                {msg.sources.map((s, j) => (
                  <span key={j} className="chat-source-tag">{s}</span>
                ))}
              </div>
            )}
            {msg.model && <div className="chat-model">via {msg.model}</div>}
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
