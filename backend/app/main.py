from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import chat, ws, models

app = FastAPI(title="KortMind API")

# Use allow_origin_regex so allow_credentials=True doesn't throw an error
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router, prefix="/api")
app.include_router(models.router, prefix="/api")
app.include_router(ws.router)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=20559, reload=True)
