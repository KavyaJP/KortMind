from abc import ABC, abstractmethod
from typing import AsyncGenerator, List, Dict, Any


class BaseEngine(ABC):
    @abstractmethod
    async def generate_stream(
        self, messages: List[Dict[str, str]], model: str, **kwargs
    ) -> AsyncGenerator[str, None]:
        """Yields streaming text tokens given a linear conversation history."""
        yield ""

    @abstractmethod
    async def list_models(self) -> List[Dict[str, Any]]:
        """Returns available local models for the runtime engine."""
        pass
