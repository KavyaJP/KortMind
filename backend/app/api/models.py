from fastapi import APIRouter
from app.engines.manager import LLMManager

router = APIRouter()
manager = LLMManager()


@router.get("/models")
async def get_models():
    models = await manager.list_all_models()
    return {"models": models}
