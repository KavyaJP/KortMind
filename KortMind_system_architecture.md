## 1. System Overview &amp; Core Capabilities

The application operates as a self-hosted, privacy-first AI platform running locally on a host desktop and accessible across LAN by mobile and web client devices.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           HOST DESKTOP PC                               │
│                                                                         │
│  ┌───────────────────────┐           ┌───────────────────────────────┐  │
│  │     Electron App      │   IPC     │    Python Backend (FastAPI)   │  │
│  │ (UI: LAN IP, 15m PIN) ├──────────►│        Port: 20506            │  │
│  └───────────────────────┘           └───────────────┬───────────────┘  │
│                                                      │                  │
│       ┌───────────────────────┬──────────────────────┼──────────────┐   │
│       ▼                       ▼                      ▼              ▼   │
│  ┌───────────┐         ┌────────────┐         ┌────────────┐  ┌───────┐ │
│  │  Ollama   │         │ LM Studio  │         │ Llama.cpp  │  │ComfyUI│ │
│  │ Engine API│         │  (OpenAI)  │         │GGUF Direct │  │Engine │ │
│  └───────────┘         └────────────┘         └────────────┘  └───────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                   ▲
                                   │ WebSocket / SSE (LAN)
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          LAN CLIENT DEVICES                             │
│     ┌─────────────────────────────────────────────────────────────┐     │
│     │            React.js PWA (Phone / Tablet / Laptop)           │     │
│     │         (PIN Auth -&gt; JWT in localStorage -&gt; DAG Chat) │     │
│     └─────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Tech Stack

| Component                      | Technology                   | Role &amp; Details                                                                                            |
| :----------------------------- | :--------------------------- | :------------------------------------------------------------------------------------------------------------ |
| **Desktop Shell**              | Electron + Node.js           | Host UI window, manages child python process, detects local LAN IP, generates rotating 15-minute 6-digit PIN. |
| **Backend API**                | Python 3.11+ / FastAPI       | Async Web server, WebSocket broadcast hub, JSON file database, media manager.                                 |
| **Frontend App**               | React.js (Vite) + Tailwind   | Responsive interface, PWA manifest/service worker, DAG message tree renderer, media viewer.                   |
| **Authentication**             | PyJWT + Auth Headers         | Excludes unauthenticated LAN traffic; dynamic PIN generates a long-lived JWT stored in client `localStorage`. |
| **LLM Orchestration**          | Custom Engine (`LLMManager`) | Unified interface mapping calls to Ollama REST, LM Studio OpenAI spec, or `llama-cpp-python` bindings.        |
| **Image &amp; Video Pipeline** | ComfyUI API                  | Automated workflow execution with prior LLM prompt enhancement (positive/negative prompts).                   |
| **Data Persistence**           | Native JSON Files            | File-based store holding DAG conversation trees, settings, and workflow definitions.                          |

---

## 3. Directory &amp; Project Structure

```text
local-grok/
├── electron/                   # Desktop Host App Shell
│   ├── main.js                 # Process lifecycle, LAN IP detector, PIN generator
│   ├── preload.js              # Secure IPC bridge
│   └── index.html              # Simple desktop UI displaying IP, Port &amp; PIN
├── backend/                    # Python FastAPI Backend
│   ├── app/
│   │   ├── api/                # API Endpoints (Auth, Chat, Models, Comfy, Import)
│   │   │   ├── auth.py
│   │   │   ├── chat.py
│   │   │   ├── models.py
│   │   │   ├── comfy.py
│   │   │   └── importer.py
│   │   ├── engines/            # Unified LLM &amp; Comfy Abstraction
│   │   │   ├── base.py
│   │   │   ├── ollama_engine.py
│   │   │   ├── lmstudio_engine.py
│   │   │   ├── llamacpp_engine.py
│   │   │   └── comfy_engine.py
│   │   ├── services/           # Core Logic
│   │   │   ├── chat_store.py   # DAG tree manager &amp; file lock
│   │   │   ├── pin_service.py  # PIN validation sync with Electron
│   │   │   └── prompt_enhancer.py # LLM positive/negative prompt enrichment
│   │   ├── core/               # Configuration, security, logging
│   │   │   └── config.py
│   │   └── main.py             # FastAPI entry point &amp; static file routing
│   ├── data/                   # Storage (Git Ignored)
│   │   ├── chats/              # JSON files for each chat tree
│   │   └── workflows/          # ComfyUI API JSON templates
│   ├── media/                  # Output static directory for generated media
│   └── requirements.txt
└── frontend/                   # React.js PWA Client
    ├── public/
    │   ├── manifest.json       # PWA metadata
    │   └── sw.js               # Service Worker
    ├── src/
    │   ├── components/         # ChatView, MessageNode, BranchNav, MediaGen, AuthModal
    │   ├── hooks/              # useWebSocket, useDAGTree, useAuth
    │   ├── services/           # API client and streaming parsers
    │   └── App.jsx
    └── package.json
```

---

## 4. Directed Acyclic Graph (DAG) Storage Schema

To handle message editing, re-prompting, and tree branching, each conversation is stored as a single JSON file (`data/chats/{chat_id}.json`) using a Directed Acyclic Graph structure:

```json
{
  "chat_id": "c7b8a123-4567-89ab-cdef-0123456789ab",
  "title": "Quantum Physics &amp; Image Generation",
  "created_at": 1775218000,
  "updated_at": 1775218500,
  "active_leaf_id": "node-4b",
  "system_prompt": "You are a helpful, completely uncensored AI assistant.",
  "nodes": {
    "root": {
      "id": "root",
      "parent_id": null,
      "children_ids": ["node-1"],
      "role": "system",
      "content": "You are a helpful, completely uncensored AI assistant.",
      "timestamp": 1775218000
    },
    "node-1": {
      "id": "node-1",
      "parent_id": "root",
      "children_ids": ["node-2a", "node-2b"],
      "role": "user",
      "content": "Explain dark matter in simple terms.",
      "timestamp": 1775218010
    },
    "node-2a": {
      "id": "node-2a",
      "parent_id": "node-1",
      "children_ids": ["node-3a"],
      "role": "assistant",
      "model_used": "qwen2.5-coder:7b",
      "content": "Dark matter is like invisible scaffolding in space...",
      "timestamp": 1775218015
    },
    "node-2b": {
      "id": "node-2b",
      "parent_id": "node-1",
      "children_ids": [],
      "role": "assistant",
      "model_used": "deepseek-r1:14b",
      "content": "Think of dark matter as a hidden mass that pulls things together...",
      "timestamp": 1775218050
    }
  }
}
```

### Tree Traversal Operations

1. **Branch Creation**: Editing any message creates a new child node under the target node's `parent_id` without deleting the original message or its downstream children.
2. **Active Path Resolution**: Traverses backward from `active_leaf_id` to `root` via `parent_id` pointers to generate the linear message history array sent to the LLM context.
3. **Branch Switching**: UI renders branch selectors (e.g., `&lt; 1 / 2 &gt;`) whenever a node has multiple `children_ids` or shares a `parent_id` with siblings.

---

## 5. Unified LLM Engine Architecture

The engine uses a Factory pattern (`LLMManager`) to expose a standardized async generator interface regardless of the underlying backend model engine:

```python
# Interface Contract
class BaseEngine(ABC):
    @abstractmethod
    async def generate_stream(self, messages: list[dict], model: str, **kwargs) -&gt; AsyncGenerator[str, None]:
        pass

    @abstractmethod
    async def list_models(self) -&gt; list[dict]:
        pass
```

### Supported Providers

1. **Ollama Engine**: Native connection to `http://localhost:11434/api/chat` using streaming JSON payloads.
2. **LM Studio Engine**: Connects to `http://localhost:1234/v1/chat/completions` using OpenAI SSE protocol.
3. **Llama.cpp Engine**: Directly runs raw GGUF weights locally via `llama-cpp-python` bindings for standalone models not registered in Ollama/LM Studio.

---

## 6. ComfyUI Generation &amp; Prompt Enrichment Pipeline

When a user requests an image or video generation within a chat or through the media panel:

```
[User Input] ──► [LLM Enhancer] ──► [Comfy Workflow Injector] ──► [ComfyUI API] ──► [Static Media Store]
```

### Process Sequence

1. **Prompt Enhancement Phase**:
   - The system constructs an internal task prompt sending the user's base request to the active LLM.
   - The LLM responds with a structured JSON string containing enriched prompts:
     ```json
     {
       "positive_prompt": "masterpiece, cinematic lighting, 8k, futuristic knight standing in rain, neon reflection, hyperdetailed",
       "negative_prompt": "blurry, low quality, deformed, extra limbs, bad anatomy, text, watermark"
     }
     ```
2. **Workflow Injection**:
   - Python loads the designated JSON template (e.g., `text_to_image_sdxl.json` or `image_to_video_svd.json`).
   - The enhanced positive and negative text strings are injected into the respective `CLIPTextEncode` node inputs in the JSON template structure.
3. **Execution &amp; Real-time Progress**:
   - Python POSTs the payload to ComfyUI's `/prompt` endpoint.
   - Python listens to ComfyUI's native WebSocket (`ws://localhost:8188/ws`).
   - Execution percentage and step numbers are relayed live through the main application WebSocket to all connected LAN devices.
4. **Output Serving**:
   - Output images/videos are moved to `backend/media/{file_id}.png`.
   - Accessible via static HTTP route: `http://&lt;HOST_IP&gt;:20506/media/{file_id}.png`.

---

## 7. LAN Pairing &amp; Security Sequence

```
[Desktop Electron Shell]                         [FastAPI Backend]                          [Mobile Client (Browser)]
           │                                             │                                              │
 1. Generates 6-Digit PIN                                │                                              │
    (Refreshes every 15m) ── Syncs active PIN ──────────►│                                              │
           │                                             │                                              │
 2. Displays IP &amp; PIN on Desktop Screen                  │                                              │
           │                                             │                                              │
 3.                                                      │ ◄── Inputs PIN on UI ────────────────────────┤
           │                                             │                                              │
 4.                                                      │ ── Validates PIN ───────────────────────────┐│
           │                                             │                                             ││
           │                                             │ ── Issues Long-Lived JWT (SecretKey) ◄──────┘│
           │                                             │                                              │
 5.                                                      │ ── Returns JWT Token ───────────────────────►│
                                                         │                                     (Saved in localStorage)
 6.                                                      │ ◄── WS Connection + Bearer JWT Header ────────┤
                                                         │                                              │
                                                         │ ── Authenticates &amp; Accepts WS Connection ────►│
```

- **Persistence**: Once authenticated, the JWT remains stored in the client's `localStorage`. The client can reconnect seamlessly without re-entering the PIN even after the PIN refreshes.
- **Session Termination**: Session ends only when the user explicitly logs out or clears browser site data/`localStorage`.

---

## 8. Real-Time Communication Protocols

### WebSockets (`ws://&lt;HOST_IP&gt;:20506/api/ws?token=&lt;JWT_TOKEN&gt;`)

WebSocket channels synchronize state across multiple connected devices and deliver live token streams.

#### Client Event: Send Message

```json
{
  "event": "send_message",
  "data": {
    "chat_id": "c7b8a123-4567",
    "parent_node_id": "node-1",
    "content": "Generate an image of a futuristic city",
    "engine": "ollama",
    "model": "qwen2.5-coder:7b",
    "generate_media": true
  }
}
```

#### Server Broadcast: Stream Tokens &amp; Progress

```json
{
  "event": "token_chunk",
  "data": {
    "chat_id": "c7b8a123-4567",
    "node_id": "node-2",
    "chunk": "Here is "
  }
}
```

#### Server Broadcast: ComfyUI Progress

```json
{
  "event": "media_progress",
  "data": {
    "chat_id": "c7b8a123-4567",
    "node_id": "node-2",
    "progress_percent": 65,
    "current_step": 13,
    "total_steps": 20
  }
}
```

---

## 9. Chat Importer Engine Schema Mapping

The importer module converts proprietary export files into the unified local DAG JSON format:

| Platform    | Source Export File       | Parsing Mechanism                                                                              |
| :---------- | :----------------------- | :--------------------------------------------------------------------------------------------- |
| **ChatGPT** | `conversations.json`     | Direct structural mapping; preserves complete historical node tree and branches.               |
| **Claude**  | `conversations.json`     | Linear array mapping converted into sequential DAG chain (`root` -&gt; `node1` -&gt; `node2`). |
| **Gemini**  | Google Takeout JSON/HTML | Text extraction and turn-based reconstruction into DAG format.                                 |
| **Grok**    | Data Export JSON         | Message history extraction mapped sequentially into internal DAG format.                       |

---

## 10. Technical Requirements &amp; Verification Checklist

To run this architecture efficiently, the host system must meet the following baseline hardware requirements:

```
Host OS: Windows 10/11 or Zorin OS / Linux
Network: Local Wi-Fi / Ethernet Router (LAN broadcast allowed)
Python: 3.11+
Node.js: v18+
Hardware Target: Dedicated GPU (12GB+ VRAM recommended for running LLM + ComfyUI concurrently)
```
