import os
import time
import httpx
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.chat_store import chat_store

router = APIRouter(tags=["chat"])


class NodeCreate(BaseModel):
    parent_id: Optional[str] = None
    role: str
    content: str


class ChatUpdate(BaseModel):
    title: str


class AutoTitleRequest(BaseModel):
    prompt: str
    model: str


class SetActiveLeafRequest(BaseModel):
    leaf_id: str


@router.get("/chat")
async def list_chats():
    summaries = await chat_store.list_chats()
    chats = [{"id": s["chat_id"], "title": s["title"]} for s in summaries]
    return {"status": "success", "chats": chats}


@router.post("/chat")
async def create_chat():
    chat_data = await chat_store.create_chat()
    return {
        "status": "success",
        "chat_id": chat_data["chat_id"],
        "title": chat_data["title"],
    }


@router.get("/chat/{chat_id}/history")
async def get_chat_history(chat_id: str):
    # Now returning the FULL tree so the frontend can calculate branches
    try:
        chat = await chat_store.get_chat(chat_id)
        if not chat:
            return {"status": "success", "nodes": {}, "active_leaf_id": None}
        return {
            "status": "success",
            "nodes": chat.get("nodes", {}),
            "active_leaf_id": chat.get("active_leaf_id"),
        }
    except ValueError:
        return {"status": "success", "nodes": {}, "active_leaf_id": None}


@router.post("/chat/{chat_id}/nodes")
async def add_node(chat_id: str, node: NodeCreate):
    try:
        parent_id = node.parent_id
        if not parent_id:
            chat_data = await chat_store.get_chat(chat_id)
            if chat_data:
                parent_id = chat_data.get("active_leaf_id", "root")
            else:
                parent_id = "root"

        new_node = await chat_store.add_node(
            chat_id=chat_id, parent_id=parent_id, role=node.role, content=node.content
        )
        return {"status": "success", "node_id": new_node["id"]}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/chat/{chat_id}")
async def rename_chat(chat_id: str, update: ChatUpdate):
    async with chat_store._get_lock(chat_id):
        chat = await chat_store._load_chat_unlocked(chat_id)
        if chat:
            chat["title"] = update.title
            await chat_store._save_chat_to_disk(chat_id, chat)
    return {"status": "success", "title": update.title}


@router.delete("/chat/{chat_id}")
async def delete_chat(chat_id: str):
    file_path = chat_store._get_file_path(chat_id)
    if file_path.exists():
        file_path.unlink()
        return {"status": "success"}
    return {"status": "error"}


@router.post("/chat/{chat_id}/active-leaf")
async def set_active_branch(chat_id: str, req: SetActiveLeafRequest):
    try:
        await chat_store.set_active_leaf(chat_id, req.leaf_id)
        return {"status": "success", "active_leaf_id": req.leaf_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{chat_id}/title/auto")
async def auto_generate_title(chat_id: str, req: AutoTitleRequest):
    prompt = f"Summarize this message into a concise chat title (maximum 4 words). Respond ONLY with the title. Do not include quotes, punctuation, labels, or any introductory text.\n\nMessage: {req.prompt}"

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
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
                raw_title = data.get("message", {}).get("content", "")
                title = raw_title.strip(" \n\"'.*#")

                if title:
                    async with chat_store._get_lock(chat_id):
                        chat = await chat_store._load_chat_unlocked(chat_id)
                        if chat:
                            chat["title"] = title
                            await chat_store._save_chat_to_disk(chat_id, chat)
                    return {"title": title}
    except Exception as e:
        print(f"Title generation failed: {e}")

    return {"status": "error"}
