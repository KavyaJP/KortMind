from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from app.services.chat_store import ChatStore

router = APIRouter()
store = ChatStore()


class AddNodeRequest(BaseModel):
    parent_id: Optional[str] = None
    role: str
    content: str
    model_used: Optional[str] = None


@router.post("/chat/{chat_id}/nodes")
async def add_chat_node(chat_id: str, payload: AddNodeRequest):
    async with store.modify_chat(chat_id) as chat_tree:
        if not chat_tree:
            chat_tree.update(
                {
                    "chat_id": chat_id,
                    "title": "New Conversation",
                    "active_leaf_id": None,
                    "nodes": {},
                }
            )

        nodes = chat_tree["nodes"]
        new_node_id = f"node-{len(nodes) + 1}"

        # Create node
        nodes[new_node_id] = {
            "id": new_node_id,
            "parent_id": payload.parent_id,
            "children_ids": [],
            "role": payload.role,
            "content": payload.content,
            "model_used": payload.model_used,
        }

        # Link to parent if present
        if payload.parent_id and payload.parent_id in nodes:
            nodes[payload.parent_id]["children_ids"].append(new_node_id)

        # Update active leaf path
        chat_tree["active_leaf_id"] = new_node_id

    return {"status": "success", "node_id": new_node_id}


@router.get("/chat/{chat_id}/history")
async def get_active_history(chat_id: str):
    """Traverses backward from active_leaf_id to root to build linear LLM context."""
    async with store.modify_chat(chat_id) as chat_tree:
        if not chat_tree or "nodes" not in chat_tree:
            raise HTTPException(status_code=404, detail="Chat not found")

        nodes = chat_tree.get("nodes", {})
        curr_id = chat_tree.get("active_leaf_id")
        history = []

        while curr_id and curr_id in nodes:
            node = nodes[curr_id]
            history.append({"role": node["role"], "content": node["content"]})
            curr_id = node.get("parent_id")

        return {"chat_id": chat_id, "messages": list(reversed(history))}
