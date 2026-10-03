from typing import Dict
from app.engines.base import BaseEngine
from app.engines.ollama_engine import OllamaEngine


class LLMManager:
    def __init__(self):
        self.engines: Dict[str, BaseEngine] = {"ollama": OllamaEngine()}

    def get_engine(self, engine_name: str) -> BaseEngine:
        engine = self.engines.get(engine_name.lower())
        if not engine:
            raise ValueError(f"Engine '{engine_name}' is not supported or configured.")
        return engine

    async def list_all_models(self) -> list:
        all_models = []
        for engine_name, engine in self.engines.items():
            try:
                models = await engine.list_models()
                all_models.extend(models)
            except Exception:
                # Engine down or unreachable
                continue
        return all_models
