import uvicorn
from fastapi import FastAPI
from app.api.chat import router as chat_router
from app.api.models import router as models_router
from app.api.ws import router as ws_router

app = FastAPI(title="KortMind API", version="1.0.0")

app.include_router(chat_router, prefix="/api")
app.include_router(models_router, prefix="/api")
app.include_router(ws_router, prefix="/api")

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=20506, reload=True)
