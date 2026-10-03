import { create } from "zustand";

export const useChatStore = create((set, get) => ({
  chatId: "chat-123", // Hardcoded for testing
  messages: [],
  isConnected: false,
  isGenerating: false,
  activeLeafId: null,
  ws: null,

  connect: () => {
    if (get().ws) return;
    const ws = new WebSocket("ws://localhost:20559/api/ws");

    ws.onopen = () => set({ isConnected: true });
    ws.onclose = () => set({ isConnected: false, ws: null });

    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);

      if (payload.event === "token_chunk") {
        const { node_id, chunk } = payload.data;

        set((state) => {
          const messages = [...state.messages];
          const lastMsgIndex = messages.length - 1;

          // If the last bubble is our current generation, append the text
          if (messages[lastMsgIndex]?.id === node_id) {
            messages[lastMsgIndex].content += chunk;
          } else {
            // Otherwise, create a new assistant bubble
            messages.push({ id: node_id, role: "assistant", content: chunk });
          }
          return { messages, activeLeafId: node_id };
        });
      } else if (payload.event === "stream_end") {
        set({ isGenerating: false });
      } else if (payload.event === "error") {
        console.error("WebSocket Error:", payload.data);
        set({ isGenerating: false });
      }
    };

    set({ ws });
  },

  sendMessage: async (content) => {
    const { chatId, activeLeafId, ws } = get();
    if (!content.trim() || !ws || get().isGenerating) return;

    set({ isGenerating: true });

    // 1. Optimistically show the user message in the UI immediately
    const tempUserId = `temp-${Date.now()}`;
    set((state) => ({
      messages: [...state.messages, { id: tempUserId, role: "user", content }],
    }));

    try {
      // 2. Save the node to the backend DAG via REST
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

      // Swap the temp ID with the real one from the backend
      set((state) => ({
        activeLeafId: actualNodeId,
        messages: state.messages.map((m) =>
          m.id === tempUserId ? { ...m, id: actualNodeId } : m,
        ),
      }));

      // 3. Command the LLM to generate a response via WebSocket
      ws.send(
        JSON.stringify({
          event: "send_message",
          data: {
            chat_id: chatId,
            engine: "ollama",
            // Note: Hardcoded for now. We will build a dropdown for this later!
            model: "hf.co/bartowski/TheDrummer_Cydonia-24B-v4.3-GGUF:Q3_K_M",
          },
        }),
      );
    } catch (error) {
      console.error("Failed to send message:", error);
      set({ isGenerating: false });
    }
  },
}));
