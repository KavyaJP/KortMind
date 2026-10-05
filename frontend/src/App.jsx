import { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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

  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingMessageContent, setEditingMessageContent] = useState('');

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    connect();
    fetchChatList();
    fetchModels();
  }, [connect, fetchChatList, fetchModels]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (input.trim()) {
      sendMessage(input);
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRenameSubmit = (id) => {
    if (editTitle.trim()) renameChat(id, editTitle.trim());
    setEditingChatId(null);
  };

  const handleSelectChat = (id) => {
    loadChat(id);
    setIsSidebarOpen(false);
  };

  const handleNewChat = () => {
    createNewChat();
    setIsSidebarOpen(false);
  };

  return (
    // fixed inset-0 completely locks the layout to the viewport edges, preventing mobile scroll jumps
    <div className="fixed inset-0 flex bg-[#111111] text-gray-100 font-sans overflow-hidden">

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-72 md:w-64 bg-[#171717] border-r border-gray-800 flex flex-col transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
      >
        <div className="p-4 flex items-center justify-between gap-2 border-b border-gray-800/50 md:border-b-0">
          <button
            onClick={handleNewChat}
            disabled={isGenerating || isModelLoading}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 px-4 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span className="text-xl leading-none">+</span> New Chat
          </button>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden p-2 text-gray-400 hover:text-white rounded-lg"
            title="Close sidebar"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {chatList.map((chat) => (
            <div
              key={chat.id}
              className={`group flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors ${chatId === chat.id ? 'bg-gray-800' : 'hover:bg-gray-800/50'
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
                  onClick={() => handleSelectChat(chat.id)}
                  disabled={isGenerating || isModelLoading || editingChatId !== null}
                  className={`flex-1 text-left text-sm truncate ${chatId === chat.id ? 'text-white font-medium' : 'text-gray-400 hover:text-gray-200'
                    }`}
                >
                  {chat.title}
                </button>
              )}

              {!editingChatId && (
                <div className="hidden group-hover:flex items-center gap-2 ml-2">
                  <button onClick={() => { setEditingChatId(chat.id); setEditTitle(chat.title); }} className="text-gray-400 hover:text-white" title="Rename">✎</button>
                  <button onClick={() => deleteChat(chat.id)} className="text-gray-400 hover:text-red-400" title="Delete">×</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full bg-[#111111]">

        {/* flex-none forces header to stay at the top */}
        <header className="flex-none flex items-center justify-between p-3 md:p-4 bg-[#111111] border-b border-gray-800 z-10 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 -ml-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800/50 transition-colors"
              title="Open sidebar"
            >
              ☰
            </button>
            <h1 className="text-base md:text-lg font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent truncate">
              KortMind
            </h1>
          </div>

          <div className="flex items-center gap-2 md:gap-4 shrink-0">
            {isModelLoading && <span className="text-xs md:text-sm text-blue-400 animate-pulse font-medium">Switching...</span>}
            {models.length > 0 && (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={isGenerating || isModelLoading}
                className="bg-[#1a1a1a] border border-gray-700 text-gray-200 text-xs md:text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block px-2 md:px-3 py-1.5 disabled:opacity-50 max-w-[130px] md:max-w-xs truncate"
              >
                {models.map(model => <option key={model} value={model}>{model}</option>)}
              </select>
            )}
            <div className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} title={isConnected ? "Connected" : "Disconnected"} />
          </div>
        </header>

        {/* flex-1 allows this section to dynamically consume remaining space */}
        <main className="flex-1 overflow-y-auto px-3 py-4 md:px-4 md:py-6">
          <div className="max-w-3xl mx-auto space-y-6 md:space-y-8">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[60vh] text-gray-500 space-y-4 text-center">
                <div className="w-14 h-14 md:w-16 md:h-16 bg-gray-800 rounded-2xl flex items-center justify-center shadow-sm text-2xl">
                  ✨
                </div>
                <p className="text-base md:text-lg font-medium text-gray-400">How can I help you today?</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex flex-col gap-2 w-full ${msg.role === 'user' ? 'max-w-[85%] md:max-w-[70%] items-end' : 'max-w-full md:max-w-[90%] items-start'}`}>

                    {/* Message Content */}
                    {editingMessageId === msg.id ? (
                      <div className="w-full flex flex-col gap-3 bg-[#1e1e1e] p-3 md:p-4 rounded-2xl border border-gray-700">
                        <textarea
                          className="w-full rounded-xl bg-[#111111] border border-gray-700 p-3 text-white focus:outline-none focus:border-blue-500 resize-none text-sm md:text-base"
                          value={editingMessageContent}
                          onChange={(e) => setEditingMessageContent(e.target.value)}
                          rows={4}
                        />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingMessageId(null)} className="px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm bg-gray-800 hover:bg-gray-700 rounded-lg text-white font-medium transition-colors">Cancel</button>
                          <button
                            onClick={() => {
                              if (editingMessageContent.trim()) {
                                submitEdit(msg.id, editingMessageContent);
                                setEditingMessageId(null);
                              }
                            }}
                            disabled={!editingMessageContent.trim()}
                            className="px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm bg-white text-black hover:bg-gray-200 rounded-lg font-semibold transition-colors disabled:opacity-50"
                          >
                            Save & Send
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`px-4 py-3 md:px-5 md:py-4 shadow-sm text-sm md:text-base leading-relaxed ${msg.role === 'user'
                            ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm whitespace-pre-wrap'
                            : 'text-gray-100 rounded-2xl w-full'
                          }`}
                      >
                        {msg.role === 'assistant' ? (
                          <div className="prose prose-invert prose-p:leading-relaxed prose-pre:bg-[#1e1e1e] prose-pre:border prose-pre:border-gray-800 max-w-none text-gray-100 marker:text-gray-100 text-sm md:text-base overflow-x-auto">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          msg.content
                        )}
                      </div>
                    )}

                    {/* Branch Controls */}
                    {editingMessageId !== msg.id && (
                      <div className={`flex flex-wrap items-center gap-3 md:gap-4 text-xs font-semibold px-2 ${msg.role === 'user' ? 'justify-end text-blue-300' : 'justify-start text-gray-500'}`}>
                        {msg.branchCount > 1 && (
                          <div className="flex items-center gap-2 md:gap-3 bg-gray-800/40 px-2.5 py-1 rounded-full">
                            <button onClick={() => switchBranch(msg.siblingIds[msg.branchIndex - 2])} disabled={msg.branchIndex <= 1} className="hover:text-white disabled:opacity-30 transition-colors">◀</button>
                            <span className="tracking-widest">{msg.branchIndex} / {msg.branchCount}</span>
                            <button onClick={() => switchBranch(msg.siblingIds[msg.branchIndex])} disabled={msg.branchIndex >= msg.branchCount} className="hover:text-white disabled:opacity-30 transition-colors">▶</button>
                          </div>
                        )}
                        {msg.role === 'assistant' && !isGenerating && (
                          <button onClick={() => regenerateMessage(msg.id)} className="hover:text-white flex items-center gap-1.5 transition-colors">↻ Regenerate</button>
                        )}
                        {msg.role === 'user' && !isGenerating && (
                          <button onClick={() => { setEditingMessageId(msg.id); setEditingMessageContent(msg.content); }} className="hover:text-white flex items-center gap-1.5 transition-colors">✎ Edit</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {isGenerating && (
              <div className="flex justify-start">
                <div className="text-gray-400 p-3 animate-pulse text-sm flex items-center gap-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* flex-none forces footer to stay at the bottom */}
        <footer className="flex-none p-3 md:p-4 bg-[#111111] border-t border-gray-800 z-10 pb-safe">
          <div className="max-w-3xl mx-auto relative flex items-end gap-2 bg-[#1e1e1e] border border-gray-700 rounded-2xl p-2 focus-within:border-gray-500 focus-within:ring-1 focus-within:ring-gray-500 transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isGenerating || isModelLoading || !isConnected || !chatId}
              placeholder={!chatId ? "Select a chat..." : isModelLoading ? "Switching models..." : "Message KortMind..."}
              className="flex-1 max-h-[150px] md:max-h-[200px] min-h-[40px] md:min-h-[44px] bg-transparent p-2.5 md:p-3 text-sm md:text-base text-white focus:outline-none resize-none disabled:opacity-50"
              rows={1}
            />
            {isGenerating ? (
              <button
                onClick={stopGeneration}
                className="mb-1 mr-1 h-9 w-9 md:h-10 md:w-10 flex items-center justify-center rounded-xl bg-red-500 hover:bg-red-400 text-white transition-colors shrink-0"
                title="Stop generation"
              >
                ■
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() || isModelLoading || !isConnected || !chatId}
                className="mb-1 mr-1 h-9 w-9 md:h-10 md:w-10 flex items-center justify-center rounded-xl bg-white text-black hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 transition-colors shrink-0"
                title="Send message"
              >
                ↑
              </button>
            )}
          </div>
          <div className="text-center text-[11px] md:text-xs text-gray-500 mt-2 md:mt-3">
            Press <kbd className="font-sans bg-gray-800 px-1 py-0.5 rounded">Shift</kbd> + <kbd className="font-sans bg-gray-800 px-1 py-0.5 rounded">Enter</kbd> for a new line
          </div>
        </footer>

      </div>
    </div>
  );
}

export default App;