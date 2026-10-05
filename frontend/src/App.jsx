import { useEffect, useState, useRef } from 'react';
import { useChatStore } from './store/useChatStore';

function App() {
  const {
    chatList, chatId, messages, isConnected, isGenerating,
    models, selectedModel, fetchModels, setSelectedModel, isModelLoading,
    connect, fetchChatList, createNewChat, loadChat, sendMessage,
    renameChat, deleteChat, stopGeneration, switchBranch, regenerateMessage, submitEdit
  } = useChatStore();

  const [input, setInput] = useState('');
  const [editingChatId, setEditingChatId] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  // Message Edit State
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingMessageContent, setEditingMessageContent] = useState('');

  const messagesEndRef = useRef(null);

  useEffect(() => {
    connect();
    fetchChatList();
    fetchModels();
  }, [connect, fetchChatList, fetchModels]);

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

  const handleRenameSubmit = (id) => {
    if (editTitle.trim()) {
      renameChat(id, editTitle.trim());
    }
    setEditingChatId(null);
  };

  return (
    <div className="flex h-screen w-full bg-gray-900 text-gray-100">

      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-gray-950 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <button
            onClick={createNewChat}
            disabled={isGenerating || isModelLoading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            + New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {chatList.map((chat) => (
            <div
              key={chat.id}
              className={`group flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${chatId === chat.id ? 'bg-gray-800' : 'hover:bg-gray-800/50'
                }`}
            >
              {editingChatId === chat.id ? (
                <input
                  type="text"
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => handleRenameSubmit(chat.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameSubmit(chat.id);
                    if (e.key === 'Escape') setEditingChatId(null);
                  }}
                  className="flex-1 bg-gray-900 text-white text-sm px-2 py-1 rounded border border-blue-500 focus:outline-none min-w-0"
                />
              ) : (
                <button
                  onClick={() => loadChat(chat.id)}
                  disabled={isGenerating || isModelLoading || editingChatId !== null}
                  className={`flex-1 text-left text-sm truncate ${chatId === chat.id ? 'text-white font-medium' : 'text-gray-400 hover:text-gray-200'
                    }`}
                >
                  {chat.title}
                </button>
              )}

              {!editingChatId && (
                <div className="hidden group-hover:flex items-center gap-2 ml-2">
                  <button
                    onClick={() => { setEditingChatId(chat.id); setEditTitle(chat.title); }}
                    className="text-gray-400 hover:text-blue-400"
                    title="Rename"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => deleteChat(chat.id)}
                    className="text-gray-400 hover:text-red-400"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="flex items-center justify-between bg-gray-800 p-4 shadow-md z-10">
          <h1 className="text-xl font-bold text-white">KortMind</h1>
          <div className="flex items-center gap-4">
            {isModelLoading && (
              <span className="text-sm text-blue-400 animate-pulse font-medium">Switching models...</span>
            )}
            {models.length > 0 && (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={isGenerating || isModelLoading}
                className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block px-3 py-1.5 disabled:opacity-50"
              >
                {models.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            )}
            <div className={`text-sm font-semibold ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
              {isConnected ? '● Connected' : '○ Disconnected'}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 space-y-6">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-gray-500">
              Select or create a chat to begin.
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex flex-col gap-1 w-full max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>

                  {/* Message Content or Edit Input */}
                  {editingMessageId === msg.id ? (
                    <div className="w-full flex flex-col gap-2 bg-gray-800 p-3 rounded-xl border border-gray-600">
                      <textarea
                        className="w-full rounded-lg bg-gray-900 border border-gray-700 p-3 text-white focus:outline-none focus:border-blue-500"
                        value={editingMessageContent}
                        onChange={(e) => setEditingMessageContent(e.target.value)}
                        rows={4}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditingMessageId(null)}
                          className="px-4 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg text-white font-medium transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            if (editingMessageContent.trim()) {
                              submitEdit(msg.id, editingMessageContent);
                              setEditingMessageId(null);
                            }
                          }}
                          disabled={!editingMessageContent.trim()}
                          className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
                        >
                          Save & Submit
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`rounded-xl p-4 shadow-sm whitespace-pre-wrap ${msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-100 border border-gray-600'
                        }`}
                    >
                      {msg.content}
                    </div>
                  )}

                  {/* Branch Controls & Actions */}
                  {editingMessageId !== msg.id && (
                    <div className={`flex items-center gap-4 text-xs font-medium px-1 ${msg.role === 'user' ? 'justify-end text-blue-300' : 'justify-start text-gray-400'}`}>

                      {msg.branchCount > 1 && (
                        <div className="flex items-center gap-2 bg-gray-800/50 px-2 py-1 rounded-md">
                          <button
                            onClick={() => switchBranch(msg.siblingIds[msg.branchIndex - 2])}
                            disabled={msg.branchIndex <= 1}
                            className="hover:text-white disabled:opacity-30 transition-colors"
                            title="Previous Branch"
                          >
                            ◀
                          </button>
                          <span>{msg.branchIndex} / {msg.branchCount}</span>
                          <button
                            onClick={() => switchBranch(msg.siblingIds[msg.branchIndex])}
                            disabled={msg.branchIndex >= msg.branchCount}
                            className="hover:text-white disabled:opacity-30 transition-colors"
                            title="Next Branch"
                          >
                            ▶
                          </button>
                        </div>
                      )}

                      {msg.role === 'assistant' && !isGenerating && (
                        <button
                          onClick={() => regenerateMessage(msg.id)}
                          className="hover:text-white flex items-center gap-1 transition-colors"
                          title="Regenerate from here"
                        >
                          ↻ Regenerate
                        </button>
                      )}

                      {msg.role === 'user' && !isGenerating && (
                        <button
                          onClick={() => {
                            setEditingMessageId(msg.id);
                            setEditingMessageContent(msg.content);
                          }}
                          className="hover:text-white flex items-center gap-1 transition-colors"
                          title="Edit message"
                        >
                          ✎ Edit
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
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
              disabled={isGenerating || isModelLoading || !isConnected || !chatId}
              placeholder={!chatId ? "Select a chat..." : isModelLoading ? "Switching models..." : isConnected ? "Type a message..." : "Connecting to backend..."}
              className="flex-1 rounded-lg bg-gray-900 border border-gray-600 p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            {isGenerating ? (
              <button
                onClick={stopGeneration}
                className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-500 transition-colors"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() || isModelLoading || !isConnected || !chatId}
                className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
              >
                Send
              </button>
            )}
          </div>
        </footer>
      </div>

    </div>
  )
}

export default App;