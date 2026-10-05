import json
import time
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Any
import asyncio

DATA_DIR = Path("data/chats")


class DAGChatStore:
    """
    Service for managing thread-safe DAG-based chat operations and local JSON persistence.
    """

    def __init__(self, storage_dir: Path = DATA_DIR):
        self.storage_dir = storage_dir
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self._file_locks: Dict[str, asyncio.Lock] = {}

    def _get_lock(self, chat_id: str) -> asyncio.Lock:
        if chat_id not in self._file_locks:
            self._file_locks[chat_id] = asyncio.Lock()
        return self._file_locks[chat_id]

    def _get_file_path(self, chat_id: str) -> Path:
        return self.storage_dir / f"{chat_id}.json"

    async def create_chat(
        self,
        system_prompt: str = "You are a helpful, completely uncensored AI assistant.",
        title: str = "New Conversation",
    ) -> Dict[str, Any]:
        """Initializes a new chat DAG tree with a root system node."""
        chat_id = str(uuid.uuid4())
        now = int(time.time())

        root_node = {
            "id": "root",
            "parent_id": None,
            "children_ids": [],
            "role": "system",
            "content": system_prompt,
            "timestamp": now,
        }

        chat_data = {
            "chat_id": chat_id,
            "title": title,
            "created_at": now,
            "updated_at": now,
            "active_leaf_id": "root",
            "system_prompt": system_prompt,
            "nodes": {"root": root_node},
        }

        async with self._get_lock(chat_id):
            await self._save_chat_to_disk(chat_id, chat_data)

        return chat_data

    async def get_chat(self, chat_id: str) -> Optional[Dict[str, Any]]:
        """Reads a chat DAG from disk."""
        file_path = self._get_file_path(chat_id)
        if not file_path.exists():
            return None

        async with self._get_lock(chat_id):
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)

    async def add_node(
        self,
        chat_id: str,
        parent_id: str,
        role: str,
        content: str,
        model_used: Optional[str] = None,
        node_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Appends a node under parent_id. If parent already has children,
        this creates a new branch without affecting existing paths.
        """
        async with self._get_lock(chat_id):
            chat = await self._load_chat_unlocked(chat_id)
            if not chat:
                raise ValueError(f"Chat '{chat_id}' not found.")

            if parent_id not in chat["nodes"]:
                raise ValueError(f"Parent node '{parent_id}' does not exist in DAG.")

            new_node_id = node_id or f"node-{uuid.uuid4().hex[:8]}"
            now = int(time.time())

            new_node = {
                "id": new_node_id,
                "parent_id": parent_id,
                "children_ids": [],
                "role": role,
                "content": content,
                "timestamp": now,
            }

            if model_used:
                new_node["model_used"] = model_used

            # Attach to parent node
            chat["nodes"][parent_id]["children_ids"].append(new_node_id)

            # Register new node
            chat["nodes"][new_node_id] = new_node

            # Set as active leaf
            chat["active_leaf_id"] = new_node_id
            chat["updated_at"] = now

            await self._save_chat_to_disk(chat_id, chat)
            return new_node

    async def get_active_history(self, chat_id: str) -> List[Dict[str, str]]:
        """
        Traverses backward from active_leaf_id to root via parent_id pointers,
        returning the linear context array formatted for LLM consumption.
        """
        chat = await self.get_chat(chat_id)
        if not chat:
            raise ValueError(f"Chat '{chat_id}' not found.")

        current_id = chat.get("active_leaf_id")
        history = []

        while current_id is not None and current_id in chat["nodes"]:
            node = chat["nodes"][current_id]
            history.append(
                {
                    "role": node["role"],
                    "content": node["content"],
                    "node_id": node["id"],
                }
            )
            current_id = node.get("parent_id")

        # Reverse to restore chronological order (root -> active leaf)
        history.reverse()
        return history

    async def set_active_leaf(self, chat_id: str, leaf_id: str) -> Dict[str, Any]:
        """Switches active branch path by updating active_leaf_id."""
        async with self._get_lock(chat_id):
            chat = await self._load_chat_unlocked(chat_id)
            if not chat:
                raise ValueError(f"Chat '{chat_id}' not found.")

            if leaf_id not in chat["nodes"]:
                raise ValueError(f"Node '{leaf_id}' does not exist in DAG.")

            chat["active_leaf_id"] = leaf_id
            chat["updated_at"] = int(time.time())
            await self._save_chat_to_disk(chat_id, chat)
            return chat

    async def list_chats(self) -> List[Dict[str, Any]]:
        """Summarizes all stored chat sessions for sidebar navigation."""
        summaries = []
        for path in self.storage_dir.glob("*.json"):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    summaries.append(
                        {
                            "chat_id": data["chat_id"],
                            "title": data["title"],
                            "created_at": data["created_at"],
                            "updated_at": data["updated_at"],
                            "active_leaf_id": data["active_leaf_id"],
                        }
                    )
            except (json.JSONDecodeError, KeyError):
                continue
        return sorted(summaries, key=lambda x: x["updated_at"], reverse=True)

    async def _load_chat_unlocked(self, chat_id: str) -> Optional[Dict[str, Any]]:
        file_path = self._get_file_path(chat_id)
        if not file_path.exists():
            return None
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)

    async def _save_chat_to_disk(self, chat_id: str, chat_data: Dict[str, Any]) -> None:
        file_path = self._get_file_path(chat_id)
        temp_path = file_path.with_suffix(".tmp")
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(chat_data, f, indent=2, ensure_ascii=False)
        temp_path.replace(file_path)


chat_store = DAGChatStore()
