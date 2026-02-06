# NanoClaw Specification

A personal AI assistant accessible via Feishu (Lark), with persistent memory per conversation and scheduled tasks.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Folder Structure](#folder-structure)
3. [Configuration](#configuration)
4. [Memory System](#memory-system)
5. [Session Management](#session-management)
6. [Message Flow](#message-flow)
7. [Commands](#commands)
8. [Scheduled Tasks](#scheduled-tasks)
9. [MCP Servers](#mcp-servers)
10. [Deployment](#deployment)
11. [Security Considerations](#security-considerations)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        HOST (Linux/HF Space)                         │
│                   (Main Node.js Process)                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐                     ┌────────────────────┐        │
│  │    Feishu    │────────────────────▶│   SQLite Database  │        │
│  │  (WebSocket) │◀────────────────────│   (messages.db)    │        │
│  └──────────────┘   store/send        └─────────┬──────────┘        │
│                                                  │                   │
│         ┌────────────────────────────────────────┘                   │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │  Message Loop    │    │  Scheduler Loop  │    │  IPC Watcher  │  │
│  │  (polls SQLite)  │    │  (checks tasks)  │    │  (file-based) │  │
│  └────────┬─────────┘    └────────┬─────────┘    └───────────────┘  │
│           │                       │                                  │
│           └───────────┬───────────┘                                  │
│                       │ spawns execution                             │
│                       ▼                                              │
├─────────────────────────────────────────────────────────────────────┤
│                  ISOLATED EXECUTION (Local/Docker)                   │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    AGENT RUNNER                               │   │
│  │                                                                │   │
│  │  Working directory: /workspace/group (mounted from host)       │   │
│  │  Volume mounts (if Docker):                                    │   │
│  │    • groups/{name}/ → /workspace/group                         │   │
│  │    • groups/global/ → /workspace/global/ (non-main only)        │   │
│  │    • data/sessions/{group}/.claude/ → /home/node/.claude/      │   │
│  │                                                                │   │
│  │  Tools (all groups):                                           │   │
│  │    • Bash (sandboxed)                                          │   │
│  │    • Read, Write, Edit, Glob, Grep (file operations)           │   │
│  │    • WebSearch, WebFetch (internet access)                     │   │
│  │    • mcp__nanoclaw__* (scheduler tools via IPC)                │   │
│  │                                                                │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Feishu Connection | Node.js (@larksuiteoapi/node-sdk) | Connect to Feishu via WebSocket |
| Message Storage | SQLite (better-sqlite3) | Store messages for context |
| Agent | Google Gemini API | High-speed, high-quality reasoning |
| Runtime | Node.js 20+ | Host process for routing and scheduling |

---

## Folder Structure

```
nanoclaw/
├── CLAUDE.md                      # Project context for AI
├── docs/
│   ├── SPEC.md                    # This specification document
│   ├── REQUIREMENTS.md            # Architecture decisions
│   └── SECURITY.md                # Security model
├── README.md                      # User documentation
├── package.json                   # Node.js dependencies
├── tsconfig.json                  # TypeScript configuration
├── .gitignore
│
├── src/
│   ├── index-feishu.ts            # Main application (Feishu + routing)
│   ├── feishu.ts                  # Feishu API client
│   ├── config.ts                  # Configuration constants
│   ├── types.ts                   # TypeScript interfaces
│   ├── utils.ts                   # Generic utility functions
│   ├── db.ts                      # Database initialization and queries
│   ├── task-scheduler.ts          # Runs scheduled tasks when due
│   └── container-runner.ts        # Spawns agents (local/Docker)
│
├── container/
│   ├── Dockerfile                 # Container image
│   ├── build.sh                   # Build script for container image
│   └── agent-runner/              # Code that runs inside the execution environment
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           └── index.ts           # Entry point (Gemini API + Tools)
│
├── dist/                          # Compiled JavaScript (gitignored)
│
├── groups/
│   ├── CLAUDE.md                  # Global memory (all groups read this)
│   ├── main/                      # Main control channel
│   │   ├── CLAUDE.md              # Main channel memory
│   │   └── logs/                  # Task execution logs
│   └── {Group Name}/              # Per-group folders
│       ├── CLAUDE.md              # Group-specific memory
│       ├── logs/                  # Task logs for this group
│
├── store/                         # Local data (gitignored)
│   └── messages.db                # SQLite database
│
├── data/                          # Application state (gitignored)
│   ├── sessions.json              # Active session IDs per group
│   ├── registered_groups.json     # Chat ID → folder mapping
│   ├── feishu_state.json          # Agent state tracking
│   ├── env/env                    # Filtered environment for agents
│   └── ipc/                       # Agent IPC (messages/, tasks/)
│
└── logs/                          # Runtime logs (gitignored)
```

---

## Configuration

Configuration constants are in `src/config.ts`:

```typescript
export const ASSISTANT_NAME = process.env.ASSISTANT_NAME || 'Andy';
export const MAIN_GROUP_FOLDER = 'main';
export const TRIGGER_PATTERN = new RegExp(`^@?${ASSISTANT_NAME}\\\\b`, 'i');
```

### Feishu Configuration

Required variables in `.env`:
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`

### Gemini Configuration

- `GEMINI_API_KEY`: Required for agent execution
- `GEMINI_MODEL`: Default is `gemini-2.5-flash`

---

## Message Flow

### Incoming Message Flow

```
1. User sends Feishu message
   │
   ▼
2. WSClient receives message via WebSocket
   │
   ▼
3. Message stored in SQLite (store/messages.db)
   │
   ▼
4. Event handler processes message:
   ├── Is chat_id registered? (First chat auto-registers as 'main')
   └── Should we respond? (Main: always; Others: @Andy trigger)
   │
   ▼
5. Message processor:
   ├── Fetch recent context from SQLite
   ├── Strip trigger if present
   └── Build prompt
   │
   ▼
6. Invokes Agent Runner:
   ├── Sets environment (WORKSPACE_GROUP, etc.)
   └── Calls Gemini API with tools
   │
   ▼
7. Agent processes message:
   ├── Reads CLAUDE.md for memory
   └── Uses tools (bash, read, write, etc.)
   │
   ▼
8. Response sent back to Feishu
```

---

## Security Considerations

### Execution Isolation

Agents run in isolated environments to prevent unauthorized access to the host system.

### Credential Storage

API keys and tokens are stored in `.env` and only specific required variables are passed to the agent runner.

---

## License

MIT