import httpx
import json
from typing import AsyncGenerator, List, Dict, Any
from app.engines.base import BaseEngine


class OllamaEngine(BaseEngine):
    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url

    async def generate_stream(
        self, messages: List[Dict[str, str]], model: str, **kwargs
    ) -> AsyncGenerator[str, None]:
        url = f"{self.base_url}/api/chat"
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "options": kwargs.get("options", {}),
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("POST", url, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line:
                        data = json.loads(line)
                        if "message" in data and "content" in data["message"]:
                            yield data["message"]["content"]

    async def list_models(self) -> List[Dict[str, Any]]:
        url = f"{self.base_url}/api/tags"
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            models = response.json().get("models", [])
            return [
                {"id": m["name"], "name": m["name"], "engine": "ollama"} for m in models
            ]
