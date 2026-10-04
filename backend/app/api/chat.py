import os
import time
import httpx
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel
from app.services.chat_store import ChatStore

router = APIRouter(tags=["chat"])
store = ChatStore()


class NodeCreate(BaseModel):
    parent_id: Optional[str] = None
    role: str
    content: str


class ChatUpdate(BaseModel):
    title: str


class AutoTitleRequest(BaseModel):
    prompt: str
    model: str


@router.get("/chat")
async def list_chats():
    chats = []
    if os.path.exists(store.data_dir):
        for filename in os.listdir(store.data_dir):
            if filename.endswith(".json"):
                chat_id = filename[:-5]
                # Read the file to get the title field
                chat_tree = await store.read_chat(chat_id)
                title = chat_tree.get("title", chat_id)
                chats.append({"id": chat_id, "title": title})

    chats.sort(key=lambda x: x["id"], reverse=True)
    return {"status": "success", "chats": chats}


@router.post("/chat")
async def create_chat():
    chat_id = f"chat-{int(time.time())}"
    async with store.modify_chat(chat_id) as chat_tree:
        chat_tree["title"] = "New Chat"
        chat_tree["nodes"] = {}
        chat_tree["active_leaf_id"] = None
    return {"status": "success", "chat_id": chat_id, "title": "New Chat"}


@router.get("/chat/{chat_id}/history")
async def get_chat_history(chat_id: str):
    chat_tree = await store.read_chat(chat_id)
    if not chat_tree or "nodes" not in chat_tree:
        return {"status": "success", "messages": []}

    nodes = chat_tree.get("nodes", {})
    curr_id = chat_tree.get("active_leaf_id")
    history = []

    while curr_id and curr_id in nodes:
        node = nodes[curr_id]
        history.append(
            {
                "id": node.get("id"),
                "role": node.get("role"),
                "content": node.get("content"),
            }
        )
        curr_id = node.get("parent_id")

    return {"status": "success", "messages": list(reversed(history))}


@router.post("/chat/{chat_id}/nodes")
async def add_node(chat_id: str, node: NodeCreate):
    async with store.modify_chat(chat_id) as chat_tree:
        nodes = chat_tree.setdefault("nodes", {})
        new_node_id = f"node-{len(nodes) + 1}"

        nodes[new_node_id] = {
            "id": new_node_id,
            "parent_id": node.parent_id,
            "children_ids": [],
            "role": node.role,
            "content": node.content,
        }

        if node.parent_id and node.parent_id in nodes:
            nodes[node.parent_id].setdefault("children_ids", []).append(new_node_id)

        chat_tree["active_leaf_id"] = new_node_id

    return {"status": "success", "node_id": new_node_id}


@router.patch("/chat/{chat_id}")
async def rename_chat(chat_id: str, update: ChatUpdate):
    async with store.modify_chat(chat_id) as chat_tree:
        chat_tree["title"] = update.title
    return {"status": "success", "title": update.title}


@router.delete("/chat/{chat_id}")
async def delete_chat(chat_id: str):
    success = await store.delete_chat(chat_id)
    return {"status": "success" if success else "error"}


@router.post("/{chat_id}/title/auto")
async def auto_generate_title(chat_id: str, req: AutoTitleRequest):
    prompt = f"Summarize this message into a concise chat title (maximum 4 words). Respond ONLY with the title. Do not include quotes, punctuation, labels, or any introductory text.\n\nMessage: {req.prompt}"

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            # Switched to /api/chat and formatted as a messages array
            res = await client.post(
                "http://localhost:11434/api/chat",
                json={
                    "model": req.model,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": False,
                },
            )

            if res.status_code == 200:
                data = res.json()
                # The chat API returns the response inside message -> content
                raw_title = data.get("message", {}).get("content", "")

                # Strip out any lingering punctuation or quotes
                title = raw_title.strip(" \n\"'.*#")

                if title:
                    async with store.modify_chat(chat_id) as chat_tree:
                        chat_tree["title"] = title
                    return {"title": title}
    except Exception as e:
        print(f"Title generation failed: {e}")

    return {"status": "error"}
