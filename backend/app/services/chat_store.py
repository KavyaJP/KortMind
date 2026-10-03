import os
import json
import asyncio
import aiofiles
from filelock import FileLock, Timeout
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Dict, Any, Optional


class ChatStore:

    def __init__(self, data_dir: Optional[str] = None):
        if data_dir is None:
            # Resolve absolute path relative to project root
            base_dir = os.path.dirname(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            )
            self.data_dir = os.path.join(base_dir, "data", "chats")
        else:
            self.data_dir = os.path.abspath(data_dir)

        os.makedirs(self.data_dir, exist_ok=True)

    @asynccontextmanager
    async def modify_chat(self, chat_id: str) -> AsyncGenerator[Dict[str, Any], None]:
        file_path = os.path.join(self.data_dir, f"{chat_id}.json")
        lock_path = f"{file_path}.lock"

        lock = FileLock(lock_path, timeout=5.0)

        try:
            await asyncio.to_thread(lock.acquire)
        except Timeout:
            # Auto-clear orphaned lock files left behind by interrupted process reloads
            if os.path.exists(lock_path):
                try:
                    os.remove(lock_path)
                except OSError:
                    pass
            await asyncio.to_thread(lock.acquire)

        try:
            chat_data = {}
            if os.path.exists(file_path):
                async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
                    content = await f.read()
                    chat_data = json.loads(content) if content else {}

            yield chat_data

            async with aiofiles.open(file_path, "w", encoding="utf-8") as f:
                await f.write(json.dumps(chat_data, indent=2))

        finally:
            await asyncio.to_thread(lock.release)
