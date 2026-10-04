import { create } from "zustand";

export const useChatStore = create((set, get) => ({
  chatList: [],
  chatId: null,
  messages: [],
  models: [],
  selectedModel: "",
  isConnected: false,
  isGenerating: false,
  isModelLoading: false,
  activeLeafId: null,
  ws: null,

  fetchModels: async (retryCount = 0) => {
    try {
      const res = await fetch("http://localhost:20559/api/models");
      const data = await res.json();
      const availableModels = data.models || [];

      if (availableModels.length > 0) {
        set({ models: availableModels });

        // Retrieve last used model from localStorage
        const savedModel = localStorage.getItem("lastSelectedModel");

        let targetModel = availableModels[0]; // Default fallback

        if (savedModel && availableModels.includes(savedModel)) {
          targetModel = savedModel;
        } else {
          // If saved model wasn't found or isn't set, persist the default
          localStorage.setItem("lastSelectedModel", targetModel);
        }

        set({ selectedModel: targetModel });

        // Sync selected model with backend engine
        fetch("http://localhost:20559/api/models/switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: targetModel }),
        }).catch((err) => console.error("Failed to sync initial model:", err));
      } else if (retryCount < 4) {
        // Retry loop if frontend loads before backend fully exposes models
        console.warn(
          `[useChatStore] Model list empty, retrying... (${retryCount + 1}/4)`,
        );
        setTimeout(() => get().fetchModels(retryCount + 1), 1500);
      }
    } catch (error) {
      console.error("Failed to fetch models", error);
      if (retryCount < 4) {
        setTimeout(() => get().fetchModels(retryCount + 1), 1500);
      }
    }
  },

  setSelectedModel: async (model) => {
    set({ selectedModel: model, isModelLoading: true });
    // Persist choice immediately
    localStorage.setItem("lastSelectedModel", model);

    try {
      await fetch("http://localhost:20559/api/models/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
    } catch (error) {
      console.error("Failed to switch model", error);
    } finally {
      set({ isModelLoading: false });
    }
  },

  fetchChatList: async () => {
    try {
      const res = await fetch("http://localhost:20559/api/chat");
      const data = await res.json();
      set({ chatList: data.chats });

      if (data.chats.length > 0 && !get().chatId) {
        get().loadChat(data.chats[0].id);
      }
    } catch (error) {
      console.error("Failed to fetch chat list", error);
    }
  },

  createNewChat: async () => {
    try {
      const res = await fetch("http://localhost:20559/api/chat", {
        method: "POST",
      });
      const data = await res.json();

      set((state) => ({
        chatList: [{ id: data.chat_id, title: data.title }, ...state.chatList],
        chatId: data.chat_id,
        messages: [],
        activeLeafId: null,
      }));
    } catch (error) {
      console.error("Failed to create chat", error);
    }
  },

  renameChat: async (targetChatId, newTitle) => {
    try {
      await fetch(`http://localhost:20559/api/chat/${targetChatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      set((state) => ({
        chatList: state.chatList.map((c) =>
          c.id === targetChatId ? { ...c, title: newTitle } : c,
        ),
      }));
    } catch (error) {
      console.error("Failed to rename chat", error);
    }
  },

  deleteChat: async (targetId) => {
    try {
      await fetch(`http://localhost:20559/api/chat/${targetId}`, {
        method: "DELETE",
      });

      set((state) => {
        const newList = state.chatList.filter((c) => c.id !== targetId);
        const isDeletingActive = state.chatId === targetId;
        const nextChatId = isDeletingActive
          ? newList.length > 0
            ? newList[0].id
            : null
          : state.chatId;

        return { chatList: newList, chatId: nextChatId };
      });

      const { chatId } = get();
      if (chatId) {
        get().loadChat(chatId);
      } else {
        set({ messages: [], activeLeafId: null });
      }
    } catch (error) {
      console.error("Failed to delete chat", error);
    }
  },

  loadChat: async (chatId) => {
    try {
      const res = await fetch(
        `http://localhost:20559/api/chat/${chatId}/history`,
      );
      const data = await res.json();

      const msgs = data.messages || [];
      const leafId = msgs.length > 0 ? msgs[msgs.length - 1].id : null;

      set({
        chatId,
        messages: msgs,
        activeLeafId: leafId,
      });
    } catch (error) {
      console.error(`Failed to load chat ${chatId}`, error);
    }
  },

  connect: () => {
    if (get().ws) return;
    const ws = new WebSocket("ws://localhost:20559/api/ws");

    ws.onopen = () => set({ isConnected: true });
    ws.onclose = () => set({ isConnected: false, ws: null });

    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);

      if (payload.event === "token_chunk") {
        const { node_id, chunk, chat_id } = payload.data;
        if (get().chatId !== chat_id) return;

        set((state) => {
          const messages = [...state.messages];
          const lastMsgIndex = messages.length - 1;

          if (messages[lastMsgIndex]?.id === node_id) {
            messages[lastMsgIndex].content += chunk;
          } else {
            messages.push({ id: node_id, role: "assistant", content: chunk });
          }
          return { messages, activeLeafId: node_id };
        });
      } else if (payload.event === "title_updated") {
        const { chat_id, title } = payload.data;
        set((state) => ({
          chatList: state.chatList.map((c) =>
            c.id === chat_id ? { ...c, title } : c,
          ),
        }));
      } else if (payload.event === "stream_end") {
        set({ isGenerating: false });
      } else if (payload.event === "error") {
        console.error("WebSocket Error:", payload.data);
        set({ isGenerating: false });
      }
    };

    set({ ws });
  },

  stopGeneration: () => {
    const { ws, chatId, isGenerating } = get();
    if (!ws || !isGenerating || !chatId) return;

    ws.send(
      JSON.stringify({
        event: "stop_generation",
        data: { chat_id: chatId },
      }),
    );

    set({ isGenerating: false });
  },

  sendMessage: async (content) => {
    const {
      chatId,
      activeLeafId,
      ws,
      selectedModel,
      models,
      isGenerating,
      isModelLoading,
    } = get();
    if (!content.trim() || !ws || isGenerating || isModelLoading || !chatId)
      return;

    // Failsafe to prevent 400 error if models are genuinely missing
    const targetModel = selectedModel || models[0];
    if (!targetModel) {
      alert(
        "No model selected or loaded yet. Please wait a moment or ensure Ollama has models pulled.",
      );
      return;
    }

    set({ isGenerating: true });

    const tempUserId = `temp-${Date.now()}`;
    set((state) => ({
      messages: [...state.messages, { id: tempUserId, role: "user", content }],
    }));

    try {
      const res = await fetch(
        `http://localhost:20559/api/chat/${chatId}/nodes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parent_id: activeLeafId,
            role: "user",
            content: content,
          }),
        },
      );
      const data = await res.json();
      const actualNodeId = data.node_id;

      set((state) => ({
        activeLeafId: actualNodeId,
        messages: state.messages.map((m) =>
          m.id === tempUserId ? { ...m, id: actualNodeId } : m,
        ),
      }));

      ws.send(
        JSON.stringify({
          event: "send_message",
          data: {
            chat_id: chatId,
            engine: "ollama",
            model: targetModel,
          },
        }),
      );
    } catch (error) {
      console.error("Failed to send message:", error);
      set({ isGenerating: false });
    }
  },
}));
