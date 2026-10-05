import { create } from "zustand";

// Dynamically grab the IP/Hostname of whatever device is viewing the page
const HOST =
  typeof window !== "undefined" ? window.location.hostname : "localhost";
const HTTP_URL = `http://${HOST}:20559`;
const WS_URL = `ws://${HOST}:20559`;

const buildLinearPath = (nodes, activeLeafId) => {
  if (!activeLeafId || !nodes[activeLeafId]) return [];
  const path = [];
  let currId = activeLeafId;

  while (currId && nodes[currId]) {
    path.push(nodes[currId]);
    currId = nodes[currId].parent_id;
  }
  path.reverse();

  return path
    .filter((n) => n.id !== "root")
    .map((node) => {
      let branchIndex = 1;
      let branchCount = 1;
      let siblingIds = [];

      if (node.parent_id && nodes[node.parent_id]) {
        siblingIds = nodes[node.parent_id].children_ids || [];
        branchCount = siblingIds.length;
        branchIndex = siblingIds.indexOf(node.id) + 1;
      }

      return {
        id: node.id,
        role: node.role,
        content: node.content,
        branchIndex,
        branchCount,
        siblingIds,
      };
    });
};

export const useChatStore = create((set, get) => ({
  chatList: [],
  chatId: null,
  nodes: {},
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
      const res = await fetch(`${HTTP_URL}/api/models`);
      const data = await res.json();
      const availableModels = data.models || [];

      if (availableModels.length > 0) {
        set({ models: availableModels });
        const savedModel = localStorage.getItem("lastSelectedModel");
        let targetModel = availableModels[0];

        if (savedModel && availableModels.includes(savedModel)) {
          targetModel = savedModel;
        } else {
          localStorage.setItem("lastSelectedModel", targetModel);
        }

        set({ selectedModel: targetModel });

        fetch(`${HTTP_URL}/api/models/switch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: targetModel }),
        }).catch((err) => console.error("Failed to sync initial model:", err));
      } else if (retryCount < 4) {
        setTimeout(() => get().fetchModels(retryCount + 1), 1500);
      }
    } catch (error) {
      if (retryCount < 4) {
        setTimeout(() => get().fetchModels(retryCount + 1), 1500);
      }
    }
  },

  setSelectedModel: async (model) => {
    set({ selectedModel: model, isModelLoading: true });
    localStorage.setItem("lastSelectedModel", model);

    try {
      await fetch(`${HTTP_URL}/api/models/switch`, {
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
      const res = await fetch(`${HTTP_URL}/api/chat`);
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
      const res = await fetch(`${HTTP_URL}/api/chat`, {
        method: "POST",
      });
      const data = await res.json();

      set((state) => ({
        chatList: [{ id: data.chat_id, title: data.title }, ...state.chatList],
        chatId: data.chat_id,
        nodes: {},
        messages: [],
        activeLeafId: null,
      }));
    } catch (error) {
      console.error("Failed to create chat", error);
    }
  },

  renameChat: async (targetChatId, newTitle) => {
    try {
      await fetch(`${HTTP_URL}/api/chat/${targetChatId}`, {
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
      await fetch(`${HTTP_URL}/api/chat/${targetId}`, {
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
        set({ messages: [], nodes: {}, activeLeafId: null });
      }
    } catch (error) {
      console.error("Failed to delete chat", error);
    }
  },

  loadChat: async (chatId) => {
    try {
      const res = await fetch(`${HTTP_URL}/api/chat/${chatId}/history`);
      const data = await res.json();

      const nodes = data.nodes || {};
      const leafId = data.active_leaf_id;

      set({
        chatId,
        nodes,
        activeLeafId: leafId,
        messages: buildLinearPath(nodes, leafId),
      });
    } catch (error) {
      console.error(`Failed to load chat ${chatId}`, error);
    }
  },

  connect: () => {
    if (get().ws) return;
    const ws = new WebSocket(`${WS_URL}/api/ws`);

    ws.onopen = () => set({ isConnected: true });
    ws.onclose = () => set({ isConnected: false, ws: null });

    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);

      if (payload.event === "token_chunk") {
        const { node_id, chunk, chat_id } = payload.data;
        if (get().chatId !== chat_id) return;

        set((state) => {
          const newNodes = { ...state.nodes };

          if (!newNodes[node_id]) {
            const parentId = state.activeLeafId;
            newNodes[node_id] = {
              id: node_id,
              parent_id: parentId,
              children_ids: [],
              role: "assistant",
              content: "",
            };
            if (
              parentId &&
              newNodes[parentId] &&
              !newNodes[parentId].children_ids.includes(node_id)
            ) {
              newNodes[parentId].children_ids.push(node_id);
            }
          }

          newNodes[node_id].content += chunk;

          return {
            nodes: newNodes,
            activeLeafId: node_id,
            messages: buildLinearPath(newNodes, node_id),
          };
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
        set({ isGenerating: false });
      }
    };

    set({ ws });
  },

  stopGeneration: () => {
    const { ws, chatId, isGenerating } = get();
    if (!ws || !isGenerating || !chatId) return;

    ws.send(
      JSON.stringify({ event: "stop_generation", data: { chat_id: chatId } }),
    );
    set({ isGenerating: false });
  },

  switchBranch: async (siblingId) => {
    const { chatId, nodes } = get();
    if (!chatId || !siblingId || !nodes[siblingId]) return;

    let currId = siblingId;
    while (
      nodes[currId] &&
      nodes[currId].children_ids &&
      nodes[currId].children_ids.length > 0
    ) {
      const children = nodes[currId].children_ids;
      currId = children[children.length - 1];
    }

    const newLeafId = currId;

    set({
      activeLeafId: newLeafId,
      messages: buildLinearPath(nodes, newLeafId),
    });

    try {
      await fetch(`${HTTP_URL}/api/chat/${chatId}/active-leaf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaf_id: newLeafId }),
      });
    } catch (e) {
      console.error("Failed to sync branch switch", e);
    }
  },

  regenerateMessage: async (msgId) => {
    const { nodes, chatId, ws, selectedModel, models } = get();
    const targetModel = selectedModel || models[0];
    const msgNode = nodes[msgId];

    if (!msgNode || msgNode.role !== "assistant") return;

    const parentId = msgNode.parent_id;

    set({
      isGenerating: true,
      activeLeafId: parentId,
      messages: buildLinearPath(nodes, parentId),
    });

    try {
      await fetch(`${HTTP_URL}/api/chat/${chatId}/active-leaf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaf_id: parentId }),
      });

      ws.send(
        JSON.stringify({
          event: "send_message",
          data: { chat_id: chatId, engine: "ollama", model: targetModel },
        }),
      );
    } catch (e) {
      console.error(e);
      set({ isGenerating: false });
    }
  },

  submitEdit: async (msgId, newContent) => {
    const { nodes, chatId } = get();
    const msgNode = nodes[msgId];
    if (!msgNode || msgNode.role !== "user") return;

    const parentId = msgNode.parent_id || "root";

    set({
      activeLeafId: parentId,
      messages: buildLinearPath(nodes, parentId),
    });

    try {
      await fetch(`${HTTP_URL}/api/chat/${chatId}/active-leaf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaf_id: parentId }),
      });
    } catch (e) {
      console.error("Failed to sync edit rollback", e);
    }

    get().sendMessage(newContent);
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

    const targetModel = selectedModel || models[0];
    if (!targetModel) {
      alert("No model selected or loaded yet.");
      return;
    }

    set({ isGenerating: true });

    const tempUserId = `temp-${Date.now()}`;
    set((state) => {
      const newNodes = { ...state.nodes };
      const parentId = state.activeLeafId || "root";

      if (!newNodes["root"]) {
        newNodes["root"] = {
          id: "root",
          parent_id: null,
          children_ids: [],
          role: "system",
          content: "",
        };
      }

      newNodes[tempUserId] = {
        id: tempUserId,
        parent_id: parentId,
        children_ids: [],
        role: "user",
        content: content,
      };

      if (
        newNodes[parentId] &&
        !newNodes[parentId].children_ids.includes(tempUserId)
      ) {
        newNodes[parentId].children_ids.push(tempUserId);
      }

      return {
        nodes: newNodes,
        activeLeafId: tempUserId,
        messages: buildLinearPath(newNodes, tempUserId),
      };
    });

    try {
      const res = await fetch(`${HTTP_URL}/api/chat/${chatId}/nodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parent_id: activeLeafId,
          role: "user",
          content: content,
        }),
      });
      const data = await res.json();
      const actualNodeId = data.node_id;

      set((state) => {
        const updatedNodes = { ...state.nodes };
        const tempNode = updatedNodes[tempUserId];

        if (tempNode) {
          updatedNodes[actualNodeId] = { ...tempNode, id: actualNodeId };
          delete updatedNodes[tempUserId];

          const parentId = updatedNodes[actualNodeId].parent_id;
          if (parentId && updatedNodes[parentId]) {
            updatedNodes[parentId].children_ids = updatedNodes[
              parentId
            ].children_ids.map((id) => (id === tempUserId ? actualNodeId : id));
          }
        }

        const newActiveLeafId =
          state.activeLeafId === tempUserId ? actualNodeId : state.activeLeafId;
        return {
          nodes: updatedNodes,
          activeLeafId: newActiveLeafId,
          messages: buildLinearPath(updatedNodes, newActiveLeafId),
        };
      });

      ws.send(
        JSON.stringify({
          event: "send_message",
          data: { chat_id: chatId, engine: "ollama", model: targetModel },
        }),
      );
    } catch (error) {
      console.error("Failed to send message:", error);
      set({ isGenerating: false });
    }
  },
}));
