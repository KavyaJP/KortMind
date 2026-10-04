import json
import asyncio
import re
import httpx
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.chat_store import ChatStore

router = APIRouter(tags=["websocket"])
store = ChatStore()

active_tasks = {}


@router.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("[WS] Client connected")

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
        print("[WS] Client disconnected")
    except Exception as e:
        print(f"[WS] Error: {e}")


def create_fallback_title(prompt: str) -> str:
    clean = re.sub(r"\s+", " ", prompt).strip()
    words = clean.split(" ")
    if len(words) > 5:
        title = " ".join(words[:5]) + "..."
    else:
        title = clean
    return title[:35]


async def auto_generate_title(
    websocket: WebSocket, chat_id: str, first_user_message: str
):
    # Hardcode the dedicated, fast 1.5B model for titling
    title_model = "hf.co/Goekdeniz-Guelmez/Josiefied-Qwen2.5-1.5B-Instruct-abliterated-v3-gguf:Q5_K_M"

    # Short pause to let Ollama free its streaming runner
    await asyncio.sleep(0.5)

    # Enhanced prompt for higher quality titles
    prompt = f"Analyze the following user query and generate a highly descriptive, punchy title in 4 words or less. Output EXACTLY the title text and absolutely nothing else. Do not use quotes, markdown, punctuation, or preamble.\n\nQuery: {first_user_message}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(
                "http://localhost:11434/api/chat",
                json={
                    "model": title_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": False,
                },
            )
            if res.status_code == 200:
                raw_text = res.json().get("message", {}).get("content", "")

                # Strip out <think>...</think> reasoning blocks
                clean_text = re.sub(
                    r"<think>.*?</think>", "", raw_text, flags=re.DOTALL
                )
                title = clean_text.strip(" \n\"'.*#:-")

                if title:
                    print(
                        f"[AutoTitle] LLM Title Generated: '{title}' for chat {chat_id}"
                    )
                    async with store.modify_chat(chat_id) as chat_tree:
                        chat_tree["title"] = title

                    await websocket.send_text(
                        json.dumps(
                            {
                                "event": "title_updated",
                                "data": {"chat_id": chat_id, "title": title},
                            }
                        )
                    )
            else:
                print(f"[AutoTitle] Ollama HTTP status: {res.status_code}")
    except Exception as e:
        print(f"[AutoTitle] LLM titling failed ({e}), retaining fallback title.")


async def generate_response_stream(
    websocket: WebSocket, chat_id: str, engine: str, model: str
):
    new_node_id = None
    first_user_content = None
    user_msg_count = 0

    try:
        chat_tree = await store.read_chat(chat_id)
        nodes = chat_tree.get("nodes", {})
        leaf_id = chat_tree.get("active_leaf_id")

        messages = []
        curr_id = leaf_id
        while curr_id and curr_id in nodes:
            node = nodes[curr_id]
            if node.get("content"):
                role = node.get("role", "user")
                messages.append({"role": role, "content": node.get("content", "")})
                if role == "user":
                    user_msg_count += 1
                    first_user_content = node.get("content")
            curr_id = node.get("parent_id")

        messages.reverse()

        # 1. Set immediate fallback title if chat is new
        if user_msg_count == 1 and first_user_content:
            current_title = chat_tree.get("title", "New Chat")
            if current_title == "New Chat":
                fallback_title = create_fallback_title(first_user_content)
                print(
                    f"[AutoTitle] Setting immediate fallback title: '{fallback_title}'"
                )
                async with store.modify_chat(chat_id) as chat_tree_mod:
                    chat_tree_mod["title"] = fallback_title
                await websocket.send_text(
                    json.dumps(
                        {
                            "event": "title_updated",
                            "data": {"chat_id": chat_id, "title": fallback_title},
                        }
                    )
                )

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
                if response.status_code != 200:
                    err_bytes = await response.aread()
                    raise Exception(
                        f"Ollama HTTP {response.status_code}: {err_bytes.decode('utf-8')}"
                    )

                async for line in response.aiter_lines():
                    if not line:
                        continue
                    chunk_data = json.loads(line)

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

        # 2. Refine title in background via LLM after streaming finishes
        if user_msg_count == 1 and first_user_content:
            await auto_generate_title(websocket, chat_id, first_user_content)

    except asyncio.CancelledError:
        print(f"Generation cancelled for chat {chat_id}")
        await websocket.send_text(
            json.dumps({"event": "stream_end", "data": {"chat_id": chat_id}})
        )

    except Exception as e:
        print(f"Generation error: {e}")
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
