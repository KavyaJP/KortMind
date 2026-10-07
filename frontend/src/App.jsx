import { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useChatStore } from './store/useChatStore';

// Helper to parse <think> tags from model output
const parseMessageContent = (content) => {
  if (!content) return { thought: null, main: '', isThoughtComplete: true };

  const thinkStart = content.indexOf('<think>');
  if (thinkStart === -1) return { thought: null, main: content, isThoughtComplete: true };

  const thinkEnd = content.indexOf('</think>');
  if (thinkEnd === -1) {
    return {
      thought: content.substring(thinkStart + 7).trimStart(),
      main: content.substring(0, thinkStart).trim(),
      isThoughtComplete: false
    };
  }

  return {
    thought: content.substring(thinkStart + 7, thinkEnd).trim(),
    main: (content.substring(0, thinkStart) + content.substring(thinkEnd + 8)).trimStart(),
    isThoughtComplete: true
  };
};

// Custom component for rendering the collapsible thought process
const ThoughtBlock = ({ thought, isComplete }) => {
  const [isOpen, setIsOpen] = useState(!isComplete);

  // Auto-collapse when thinking finishes
  useEffect(() => {
    setIsOpen(!isComplete);
  }, [isComplete]);

  if (!thought) return null;

  return (
    <div className="mb-4 rounded-2xl border border-gray-700/50 bg-[#171717]/60 overflow-hidden shadow-sm">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-gray-400 hover:bg-gray-800/80 transition-colors"
      >
        <span className={`text-sm leading-none ${!isComplete ? 'animate-pulse' : 'opacity-70'}`}>
          🧠
        </span>
        <span className="tracking-wide">{isComplete ? 'Thought Process' : 'Thinking...'}</span>
        <span className={`ml-auto transform transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`}>
          ▼
        </span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-1 text-xs md:text-sm text-gray-400 whitespace-pre-wrap leading-relaxed border-t border-gray-700/30 mt-1">
          {thought}
          {!isComplete && <span className="animate-pulse inline-block ml-1">▌</span>}
        </div>
      )}
    </div>
  );
};

// Custom component to handle code block rendering with a copy button
const CodeBlock = ({ node, inline, className, children, ...props }) => {
  const match = /language-(\w+)/.exec(className || '');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!inline && match) {
    return (
      <div className="relative rounded-lg overflow-hidden border border-gray-700 bg-[#1e1e1e] my-4 max-w-full">
        <div className="flex items-center justify-between px-4 py-1.5 bg-[#2d2d2d] border-b border-gray-700 text-xs text-gray-400 font-sans">
          <span className="uppercase font-semibold">{match[1]}</span>
          <button
            onClick={handleCopy}
            className="hover:text-white transition-colors flex items-center gap-1"
            title="Copy code"
          >
            {copied ? '✓ Copied' : '⧉ Copy'}
          </button>
        </div>
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={match[1]}
          PreTag="div"
          customStyle={{ margin: 0, padding: '1rem', background: 'transparent', overflowX: 'auto' }}
          {...props}
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      </div>
    );
  }
  return (
    <code className={`${className || ''} bg-gray-800/80 px-1.5 py-0.5 rounded text-sm`} {...props}>
      {children}
    </code>
  );
};

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
  const [copiedMessageId, setCopiedMessageId] = useState(null);

  // Scroll management state
  const [isScrolledUp, setIsScrolledUp] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    connect();
    fetchChatList();
    fetchModels();
  }, [connect, fetchChatList, fetchModels]);

  // Reset scroll state when switching to a different chat
  useEffect(() => {
    setIsScrolledUp(false);
  }, [chatId]);

  // Smart auto-scroll: only force scroll to bottom if the user hasn't manually scrolled up
  useEffect(() => {
    if (!isScrolledUp) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages, isScrolledUp]);

  // Detect manual scrolling
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    // If distance from bottom is > 100px, consider it "scrolled up"
    const isUp = scrollHeight - scrollTop - clientHeight > 100;
    setIsScrolledUp(isUp);
  };

  // Jump to bottom button handler
  const scrollToBottom = () => {
    setIsScrolledUp(false);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

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
      scrollToBottom(); // Force scroll down when a new message is sent
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

  const copyFullMessage = (msgId, rawContent) => {
    const parsed = parseMessageContent(rawContent);
    const textToCopy = parsed.main || rawContent;
    navigator.clipboard.writeText(textToCopy.trim());
    setCopiedMessageId(msgId);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  return (
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
                <div className="flex md:hidden md:group-hover:flex items-center gap-2 ml-2 shrink-0">
                  <button onClick={() => { setEditingChatId(chat.id); setEditTitle(chat.title); }} className="p-1 text-gray-400 hover:text-white" title="Rename">✎</button>
                  <button onClick={() => deleteChat(chat.id)} className="p-1 text-gray-400 hover:text-red-400" title="Delete">×</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full bg-[#111111] relative">

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

        <main
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-3 pt-4 pb-32 md:px-4 md:pt-6 md:pb-48"
        >
          <div className="max-w-3xl mx-auto space-y-6 md:space-y-8">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[60vh] text-gray-500 space-y-4 text-center">
                <div className="w-14 h-14 md:w-16 md:h-16 bg-gray-800 rounded-2xl flex items-center justify-center shadow-sm text-2xl">
                  ✨
                </div>
                <p className="text-base md:text-lg font-medium text-gray-400">How can I help you today?</p>
              </div>
            ) : (
              messages.map((msg) => {
                const parsedContent = msg.role === 'assistant'
                  ? parseMessageContent(msg.content)
                  : { thought: null, main: msg.content, isThoughtComplete: true };

                return (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex flex-col gap-2 w-full ${msg.role === 'user' ? 'max-w-[85%] md:max-w-[70%] items-end' : 'max-w-full md:max-w-[90%] items-start'}`}>

                      {/* Message Content */}
                      {editingMessageId === msg.id ? (
                        <div className="w-full flex flex-col gap-3 bg-[#1e1e1e] p-3 md:p-4 rounded-2xl border border-gray-700 shadow-sm">
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
                              ? 'bg-blue-600 text-white rounded-3xl rounded-br-sm whitespace-pre-wrap'
                              : 'text-gray-100 w-full'
                            }`}
                        >
                          {msg.role === 'assistant' ? (
                            <div className="max-w-none text-gray-100 marker:text-gray-100 text-sm md:text-base w-full">
                              <ThoughtBlock thought={parsedContent.thought} isComplete={parsedContent.isThoughtComplete} />
                              <div className="prose prose-invert prose-p:leading-relaxed prose-pre:bg-transparent prose-pre:p-0 prose-pre:border-0 w-full max-w-full">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{ code: CodeBlock }}
                                >
                                  {parsedContent.main}
                                </ReactMarkdown>
                              </div>
                            </div>
                          ) : (
                            msg.content
                          )}
                        </div>
                      )}

                      {/* Branch Controls & Global Copy */}
                      {editingMessageId !== msg.id && (
                        <div className={`flex flex-wrap items-center gap-3 md:gap-4 text-xs font-semibold px-2 mt-1 ${msg.role === 'user' ? 'justify-end text-blue-300' : 'justify-start text-gray-500'}`}>
                          {msg.branchCount > 1 && (
                            <div className="flex items-center gap-2 md:gap-3 bg-gray-800/40 px-2.5 py-1 rounded-full">
                              <button onClick={() => switchBranch(msg.siblingIds[msg.branchIndex - 2])} disabled={msg.branchIndex <= 1} className="hover:text-white disabled:opacity-30 transition-colors">◀</button>
                              <span className="tracking-widest">{msg.branchIndex} / {msg.branchCount}</span>
                              <button onClick={() => switchBranch(msg.siblingIds[msg.branchIndex])} disabled={msg.branchIndex >= msg.branchCount} className="hover:text-white disabled:opacity-30 transition-colors">▶</button>
                            </div>
                          )}

                          <button
                            onClick={() => copyFullMessage(msg.id, msg.content)}
                            className="hover:text-white flex items-center gap-1.5 transition-colors"
                          >
                            {copiedMessageId === msg.id ? '✓ Copied' : '⧉ Copy'}
                          </button>

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
                );
              })
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

        {/* Floating Scroll to Bottom Button */}
        {isScrolledUp && (
          <button
            onClick={scrollToBottom}
            className="absolute z-30 right-4 md:right-8 bottom-36 md:bottom-44 p-2.5 bg-[#2d2d2d] text-gray-300 rounded-full shadow-xl border border-gray-700 hover:text-white hover:bg-[#3d3d3d] transition-all focus:outline-none"
            title="Scroll to bottom"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        )}

        {/* Floating Input Area */}
        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-[#111111] via-[#111111]/95 to-transparent pt-12 pb-4 md:pb-6 px-3 md:px-4 z-20 pb-safe pointer-events-none">
          <div className="max-w-3xl mx-auto pointer-events-auto">
            <div className="relative flex items-end gap-2 bg-[#1e1e1e] border border-gray-700 rounded-[1.5rem] p-2 shadow-2xl focus-within:border-gray-500 focus-within:ring-1 focus-within:ring-gray-500 transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isGenerating || isModelLoading || !isConnected || !chatId}
                placeholder={!chatId ? "Select a chat..." : isModelLoading ? "Switching models..." : "Message KortMind..."}
                className="flex-1 max-h-[150px] md:max-h-[200px] min-h-[44px] bg-transparent p-3 md:p-3.5 text-sm md:text-base text-white focus:outline-none resize-none disabled:opacity-50"
                rows={1}
              />
              {isGenerating ? (
                <button
                  onClick={stopGeneration}
                  className="mb-1 mr-1 h-9 w-9 md:h-11 md:w-11 flex items-center justify-center rounded-2xl bg-red-500 hover:bg-red-400 text-white transition-colors shrink-0"
                  title="Stop generation"
                >
                  ■
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isModelLoading || !isConnected || !chatId}
                  className="mb-1 mr-1 h-9 w-9 md:h-11 md:w-11 flex items-center justify-center rounded-2xl bg-white text-black hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 transition-colors shrink-0 shadow-sm"
                  title="Send message"
                >
                  ↑
                </button>
              )}
            </div>
            <div className="text-center text-[11px] md:text-xs text-gray-500 mt-2 md:mt-3">
              Press <kbd className="font-sans bg-gray-800 px-1.5 py-0.5 rounded-md">Shift</kbd> + <kbd className="font-sans bg-gray-800 px-1.5 py-0.5 rounded-md">Enter</kbd> for a new line
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;