import os
import json
import asyncio
import aiofiles
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Dict, Any, Optional


class ChatStore:
    def __init__(self, data_dir: Optional[str] = None):
        if data_dir is None:
            base_dir = os.path.dirname(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            )
            self.data_dir = os.path.join(base_dir, "data", "chats")
        else:
            self.data_dir = os.path.abspath(data_dir)

        os.makedirs(self.data_dir, exist_ok=True)
        self._locks: Dict[str, asyncio.Lock] = {}

    def _get_lock(self, chat_id: str) -> asyncio.Lock:
        if chat_id not in self._locks:
            self._locks[chat_id] = asyncio.Lock()
        return self._locks[chat_id]

    async def read_chat(self, chat_id: str) -> Dict[str, Any]:
        file_path = os.path.join(self.data_dir, f"{chat_id}.json")
        if not os.path.exists(file_path):
            return {}

        async with self._get_lock(chat_id):
            try:
                async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
                    content = await f.read()
                    return json.loads(content) if content else {}
            except (json.JSONDecodeError, FileNotFoundError):
                return {}

    @asynccontextmanager
    async def modify_chat(self, chat_id: str) -> AsyncGenerator[Dict[str, Any], None]:
        file_path = os.path.join(self.data_dir, f"{chat_id}.json")
        lock = self._get_lock(chat_id)

        async with lock:
            chat_data = {}
            if os.path.exists(file_path):
                try:
                    async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
                        content = await f.read()
                        chat_data = json.loads(content) if content else {}
                except json.JSONDecodeError:
                    chat_data = {}

            yield chat_data

            async with aiofiles.open(file_path, "w", encoding="utf-8") as f:
                await f.write(json.dumps(chat_data, indent=2))

    async def delete_chat(self, chat_id: str) -> bool:
        file_path = os.path.join(self.data_dir, f"{chat_id}.json")
        async with self._get_lock(chat_id):
            if os.path.exists(file_path):
                os.remove(file_path)
                return True
        return False
