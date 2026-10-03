import httpx
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["models"])


class ModelSwitch(BaseModel):
    model: str


@router.get("/models")
async def list_models():
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("http://localhost:11434/api/tags")
            response.raise_for_status()
            data = response.json()
            models = [model["name"] for model in data.get("models", [])]
            return {"status": "success", "models": models}
    except Exception as e:
        return {"status": "error", "message": str(e), "models": []}


@router.post("/models/switch")
async def switch_model(payload: ModelSwitch):
    target_model = payload.model
    try:
        # 120s timeout since swapping models in/out of VRAM can take a moment
        async with httpx.AsyncClient(timeout=120.0) as client:
            # 1. Find currently running models
            ps_res = await client.get("http://localhost:11434/api/ps")
            if ps_res.status_code == 200:
                running_models = ps_res.json().get("models", [])
                for rm in running_models:
                    rm_name = rm.get("name")
                    if rm_name != target_model:
                        # Unload old model by setting keep_alive to 0
                        await client.post(
                            "http://localhost:11434/api/generate",
                            json={"model": rm_name, "keep_alive": 0},
                        )

            # 2. Preload the new model (empty prompt primes it into memory)
            await client.post(
                "http://localhost:11434/api/generate",
                json={"model": target_model, "prompt": "", "keep_alive": "30m"},
            )

        return {"status": "success", "model": target_model}
    except Exception as e:
        return {"status": "error", "message": str(e)}
