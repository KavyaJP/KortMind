import asyncio
import websockets
import json


async def test_ws():
    uri = "ws://localhost:20506/api/ws"

    async with websockets.connect(uri) as websocket:
        # Trigger generation
        payload = {
            "event": "send_message",
            "data": {
                "chat_id": "chat-123",
                "engine": "ollama",
                "model": "hf.co/bartowski/TheDrummer_Cydonia-24B-v4.3-GGUF:Q3_K_M",
            },
        }

        print(f"Requesting generation from {payload['data']['model']}...\n")
        await websocket.send(json.dumps(payload))

        # Listen for the stream
        try:
            while True:
                response = await websocket.recv()
                data = json.loads(response)

                if data.get("event") == "token_chunk":
                    # Print tokens in real-time as they arrive
                    print(data["data"]["chunk"], end="", flush=True)
                elif data.get("event") == "stream_end":
                    # Cleanly exit loop when backend signals completion
                    print("\n\n[Stream Complete]")
                    break
                elif data.get("event") == "error":
                    print(f"\n[Error]: {data['data']}")
                    break
        except websockets.exceptions.ConnectionClosed:
            print("\n\n[Connection Closed]")


if __name__ == "__main__":
    asyncio.run(test_ws())
