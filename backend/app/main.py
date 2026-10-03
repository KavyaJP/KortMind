import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.chat import router as chat_router
from app.api.models import router as models_router
from app.api.ws import router as ws_router

app = FastAPI(title="KortMind API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:20560",
        "http://localhost:20506",  # Added the port Vite actually launched on
        "http://localhost:5173",
        "http://127.0.0.1:20506",
        "http://127.0.0.1:20560",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router, prefix="/api")
app.include_router(models_router, prefix="/api")
app.include_router(ws_router, prefix="/api")

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=20559,
        reload=True,
        reload_dirs=["app"],
    )
