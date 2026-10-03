import { useEffect, useState, useRef } from 'react';
import { useChatStore } from './store/useChatStore';

function App() {
  const { messages, isConnected, isGenerating, connect, sendMessage } = useChatStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  // Connect to the WebSocket when the app loads
  useEffect(() => {
    connect();
  }, [connect]);

  // Auto-scroll to the bottom when new tokens stream in
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (input.trim()) {
      sendMessage(input);
      setInput('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-screen w-full flex-col">
      <header className="flex items-center justify-between bg-gray-800 p-4 shadow-md">
        <h1 className="text-xl font-bold text-white">Local Grok</h1>
        <div className={`text-sm font-semibold ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
          {isConnected ? '● Connected' : '○ Disconnected'}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-xl p-4 shadow-sm whitespace-pre-wrap ${msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-100 border border-gray-600'
                }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isGenerating && (
          <div className="flex justify-start">
            <div className="bg-gray-800 text-gray-400 p-3 rounded-lg animate-pulse text-sm">
              Generating...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <footer className="bg-gray-800 p-4 border-t border-gray-700">
        <div className="mx-auto flex max-w-4xl gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isGenerating || !isConnected}
            placeholder={isConnected ? "Type a message..." : "Connecting to backend..."}
            className="flex-1 rounded-lg bg-gray-900 border border-gray-600 p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={isGenerating || !input.trim() || !isConnected}
            className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  )
}

export default App;