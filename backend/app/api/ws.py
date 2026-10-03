import json
import asyncio
import httpx
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.chat_store import ChatStore

router = APIRouter(tags=["websocket"])
store = ChatStore()

active_tasks = {}


@router.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("connection open")

    try:
        while True:
            data_raw = await websocket.receive_text()
            message = json.loads(data_raw)
            event = message.get("event")
            data = message.get("data", {})
            chat_id = data.get("chat_id")

            if event == "send_message":
                if not chat_id:
                    continue

                if chat_id in active_tasks and not active_tasks[chat_id].done():
                    active_tasks[chat_id].cancel()

                task = asyncio.create_task(
                    generate_response_stream(
                        websocket,
                        chat_id,
                        data.get("engine", "ollama"),
                        data.get("model"),
                    )
                )
                active_tasks[chat_id] = task

            elif event == "stop_generation":
                if chat_id and chat_id in active_tasks:
                    if not active_tasks[chat_id].done():
                        active_tasks[chat_id].cancel()
                    active_tasks.pop(chat_id, None)
                    await websocket.send_text(
                        json.dumps(
                            {"event": "stream_end", "data": {"chat_id": chat_id}}
                        )
                    )

    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")


async def generate_response_stream(
    websocket: WebSocket, chat_id: str, engine: str, model: str
):
    new_node_id = None
    try:
        chat_tree = await store.read_chat(chat_id)
        nodes = chat_tree.get("nodes", {})
        leaf_id = chat_tree.get("active_leaf_id")

        messages = []
        curr_id = leaf_id
        while curr_id and curr_id in nodes:
            node = nodes[curr_id]
            if node.get("content"):
                messages.append(
                    {
                        "role": node.get("role", "user"),
                        "content": node.get("content", ""),
                    }
                )
            curr_id = node.get("parent_id")

        messages.reverse()

        async with store.modify_chat(chat_id) as chat_tree:
            nodes = chat_tree.setdefault("nodes", {})
            new_node_id = f"node-{len(nodes) + 1}"

            nodes[new_node_id] = {
                "id": new_node_id,
                "parent_id": leaf_id,
                "children_ids": [],
                "role": "assistant",
                "content": "",
            }
            if leaf_id and leaf_id in nodes:
                nodes[leaf_id].setdefault("children_ids", []).append(new_node_id)
            chat_tree["active_leaf_id"] = new_node_id

        url = "http://localhost:11434/api/chat"
        payload = {"model": model, "messages": messages, "stream": True}

        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", url, json=payload) as response:

                # 1. Catch outright HTTP rejections (e.g., 400 Bad Request, 404 Not Found)
                if response.status_code != 200:
                    err_bytes = await response.aread()
                    raise Exception(
                        f"Ollama HTTP {response.status_code}: {err_bytes.decode('utf-8')}"
                    )

                async for line in response.aiter_lines():
                    if not line:
                        continue
                    chunk_data = json.loads(line)

                    # 2. Catch silent JSON errors embedded in a 200 OK stream
                    if "error" in chunk_data:
                        raise Exception(f"{chunk_data['error']}")

                    message_data = chunk_data.get("message", {})
                    token = message_data.get("content", "")

                    if token:
                        async with store.modify_chat(chat_id) as chat_tree:
                            if new_node_id in chat_tree.get("nodes", {}):
                                chat_tree["nodes"][new_node_id]["content"] += token

                        await websocket.send_text(
                            json.dumps(
                                {
                                    "event": "token_chunk",
                                    "data": {
                                        "chat_id": chat_id,
                                        "node_id": new_node_id,
                                        "chunk": token,
                                    },
                                }
                            )
                        )

                    if chunk_data.get("done", False):
                        break

        await websocket.send_text(
            json.dumps({"event": "stream_end", "data": {"chat_id": chat_id}})
        )

    except asyncio.CancelledError:
        print(f"Generation cancelled for chat {chat_id}")
        await websocket.send_text(
            json.dumps({"event": "stream_end", "data": {"chat_id": chat_id}})
        )

    except Exception as e:
        print(f"Generation error: {e}")
        # 3. Inject the caught error directly into the chat UI as an assistant message
        error_msg = f"⚠️ **Ollama Error:** {str(e)}"

        if new_node_id:
            async with store.modify_chat(chat_id) as chat_tree:
                if new_node_id in chat_tree.get("nodes", {}):
                    chat_tree["nodes"][new_node_id]["content"] += error_msg

            await websocket.send_text(
                json.dumps(
                    {
                        "event": "token_chunk",
                        "data": {
                            "chat_id": chat_id,
                            "node_id": new_node_id,
                            "chunk": error_msg,
                        },
                    }
                )
            )

        await websocket.send_text(
            json.dumps({"event": "stream_end", "data": {"chat_id": chat_id}})
        )
