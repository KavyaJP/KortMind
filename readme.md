# KortMind 🧠⚡

**KortMind** is a self-hosted, sovereign AI engine and multi-device hub running entirely on your local PC. Built as an uncensored, private alternative to cloud-based AI platforms, KortMind allows you to host state-of-the-art Large Language Models (LLMs) and diffusion pipelines locally and access them seamlessly across your Local Area Network (LAN)—from your desktop, phone, or tablet.

---

## ✨ Features

- **🔒 Sovereign & 100% Uncensored:** Run any open-source GGUF or Ollama/LM Studio model without artificial refusals or content guardrails.
- **📱 LAN Broadcasting & PWA Client:** Host on your main rig and access the full UI from bed or another room via a responsive, installable Progressive Web App (PWA).
- **🔑 Dynamic PIN & JWT Authentication:** Connect client devices by entering a 15-minute rotating PIN displayed on the desktop app shell. Once paired, long-lived JWTs saved in `localStorage` keep you logged in automatically.
- **🌿 DAG-Based Chat Branching:** Edit any message, branch conversations, compare model responses side-by-side, and navigate context trees effortlessly.
- **🎨 Integrated ComfyUI Pipeline:** Automatic prompt enrichment via LLMs paired with custom ComfyUI JSON workflows for local image and video generation.
- **🔄 Universal Chat Importers:** Import your conversation histories from ChatGPT (`conversations.json`), Claude, Gemini, and Grok to pick up right where you left off.
- **⚡ Real-Time Streaming:** Complete WebSocket/SSE pipeline for token-by-token text generation and real-time ComfyUI step progress tracking.

---

## 🏗 System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           HOST DESKTOP PC                               │
│                                                                         │
│  ┌───────────────────────┐           ┌───────────────────────────────┐  │
│  │    Electron Shell     │   IPC     │    Python Backend (FastAPI)   │  │
│  │ (UI: LAN IP, 15m PIN) ├──────────►│        Port: 20506            │  │
│  └───────────────────────┘           └───────────────┬───────────────┘  │
│                                                      │                  │
│       ┌───────────────────────┬──────────────────────┼──────────────┐   │
│       ▼                       ▼                      ▼              ▼   │
│  ┌───────────┐         ┌────────────┐         ┌────────────┐  ┌───────┐ │
│  │  Ollama   │         │ LM Studio  │         │ Llama.cpp  │  │ComfyUI│ │
│  │ Engine API│         │  (OpenAI)  │         │(GGUF Direct│  │Engine │ │
│  └───────────┘         └────────────┘         └────────────┘  └───────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                   ▲
                                   │ WebSocket / SSE (LAN)
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          LAN CLIENT DEVICES                             │
│     ┌─────────────────────────────────────────────────────────────┐     │
│     │            React.js PWA (Phone / Tablet / Laptop)           │     │
│     │         (PIN Auth -> JWT in localStorage -> DAG Chat)       │     │
│     └─────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠 Tech Stack

- **Desktop Shell:** Electron.js, Node.js
- **Backend:** Python 3.11+, FastAPI, Uvicorn, PyJWT
- **Frontend:** React.js, TailwindCSS, Vite, PWA Service Worker
- **Inference Engines:** Ollama API, LM Studio (OpenAI API spec), `llama-cpp-python`
- **Media Engine:** ComfyUI REST/WebSocket API
- **Storage:** JSON File Store with Directed Acyclic Graph (DAG) schema

---

## 🚀 Quick Start

### Prerequisites
- **Python 3.11+** installed
- **Node.js (v18+)** and `npm` installed
- **Ollama** or **LM Studio** running locally (Optional: ComfyUI running on `http://localhost:8188`)
- Dedicated NVIDIA/AMD GPU with **8GB+ VRAM** (12GB+ recommended)

---

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start backend server
python main.py
```

### 2. Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Build production assets for backend serving
npm run build
```

### 3. Desktop Electron Launch

```bash
# Navigate to root/electron directory
cd electron

# Install dependencies
npm install

# Start Electron host app
npm start
```

---

## 📲 Connecting Client Devices

1. Open **KortMind** on your desktop PC.
2. Note the displayed **LAN Address** (e.g., `http://192.168.1.100:20506`) and the **6-digit pairing PIN**.
3. Open a browser on your mobile device/tablet connected to the same Wi-Fi network and navigate to the LAN address.
4. Enter the 6-digit PIN on your phone.
5. Tap **"Add to Home Screen"** to install KortMind as a standalone PWA!

---

## 📁 Repository Structure

```text
kortmind/
├── electron/          # Host Desktop App (IP Detector & PIN Manager)
├── backend/           # FastAPI Server, Unified LLM Engine & DAG Store
│   ├── app/
│   │   ├── api/       # REST & WebSocket Routes
│   │   ├── engines/   # Ollama, LM Studio, Llama.cpp, ComfyUI Abstractions
│   │   └── services/  # DAG Storage, PIN Service & Importers
│   ├── data/          # Local JSON Chat Trees & Workflow Templates
│   └── media/         # Static Storage for Generated Images/Videos
└── frontend/          # React.js PWA Client App
```

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.