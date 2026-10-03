import json
import asyncio
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.api.chat import store
from app.engines.manager import LLMManager

router = APIRouter()
manager = LLMManager()


async def build_linear_history(chat_id: str) -> list:
    chat_tree = await store.read_chat(chat_id)
    if not chat_tree or "nodes" not in chat_tree:
        return []

    nodes = chat_tree.get("nodes", {})
    curr_id = chat_tree.get("active_leaf_id")
    history = []

    while curr_id and curr_id in nodes:
        node = nodes[curr_id]
        history.append({"role": node["role"], "content": node["content"]})
        curr_id = node.get("parent_id")

    return list(reversed(history))


@router.websocket("/ws")
async def chat_websocket(websocket: WebSocket, token: Optional[str] = None):
    await websocket.accept()

    try:
        while True:
            raw_data = await websocket.receive_text()
            payload = json.loads(raw_data)

            if payload.get("event") == "send_message":
                data = payload.get("data", {})
                chat_id = data.get("chat_id")
                engine_name = data.get("engine", "ollama")
                model_name = data.get("model")

                messages = await build_linear_history(chat_id)

                try:
                    engine = manager.get_engine(engine_name)

                    # Inject assistant placeholder node into DAG
                    async with store.modify_chat(chat_id) as chat_tree:
                        nodes = chat_tree.setdefault("nodes", {})
                        parent_id = chat_tree.get("active_leaf_id")
                        new_node_id = f"node-{len(nodes) + 1}"

                        nodes[new_node_id] = {
                            "id": new_node_id,
                            "parent_id": parent_id,
                            "children_ids": [],
                            "role": "assistant",
                            "content": "",
                            "model_used": model_name,
                        }
                        if parent_id and parent_id in nodes:
                            nodes[parent_id].setdefault("children_ids", []).append(
                                new_node_id
                            )

                        chat_tree["active_leaf_id"] = new_node_id

                    # Stream tokens live
                    full_response = ""
                    async for chunk in engine.generate_stream(
                        messages, model=model_name
                    ):
                        full_response += chunk
                        await websocket.send_json(
                            {
                                "event": "token_chunk",
                                "data": {
                                    "chat_id": chat_id,
                                    "node_id": new_node_id,
                                    "chunk": chunk,
                                },
                            }
                        )

                    # Commit final concatenated text
                    async with store.modify_chat(chat_id) as chat_tree:
                        if new_node_id in chat_tree.get("nodes", {}):
                            chat_tree["nodes"][new_node_id]["content"] = full_response

                    # Broadcast completion signal to client
                    await websocket.send_json(
                        {
                            "event": "stream_end",
                            "data": {"chat_id": chat_id, "node_id": new_node_id},
                        }
                    )

                except Exception as e:
                    await websocket.send_json({"event": "error", "data": str(e)})

    except WebSocketDisconnect:
        print("Client disconnected")
