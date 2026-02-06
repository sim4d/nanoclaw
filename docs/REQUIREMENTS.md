# NanoClaw Requirements

Original requirements and design decisions from the project creator.

---

## Philosophy

### Small Enough to Understand

The entire codebase should be something you can read and understand. One Node.js process. A handful of source files. No microservices, no message queues, no abstraction layers.

### Security Through True Isolation

Instead of application-level permission systems trying to prevent agents from accessing things, logic runs in isolated environments. The isolation is at the OS or container level. Agents can only see what's explicitly mounted.

### Built for One User

This isn't a framework or a platform. It's working software that fits my exact needs. You fork it and make it match your exact needs.

### Customization = Code Changes

No configuration sprawl. If you want different behavior, modify the code. The codebase is small enough that this is safe and practical.

---

## Vision

A personal AI assistant accessible via Feishu, with minimal custom code.

**Core components:**
- **AI Agent** as the core agent (Claude SDK or compatible)
- **Isolated Environments** for safe agent execution
- **Feishu** as the primary I/O channel
- **Persistent memory** per conversation and globally
- **Scheduled tasks** that run the agent and can message back
- **Web access** for search and browsing

---

## Architecture Decisions

### Message Routing
- A router listens to Feishu via WebSocket and routes messages based on configuration
- Only messages from registered groups are processed
- No trigger word required for registered groups

### Memory System
- **Per-group memory**: Each group has a folder with its own `CLAUDE.md`
- **Global memory**: Root `CLAUDE.md` is read by all groups, but only writable from "main"
- **Files**: Groups can create/read files in their folder and reference them

### Scheduled Tasks
- Users can ask the agent to schedule recurring or one-time tasks from any group
- Tasks run as full agents in the context of the group that created them
- Tasks have access to all tools including Bash (safe in sandbox)
- Task runs are logged to the database with duration and result

### Main Channel Privileges
- Main channel is the admin/control group
- Can write to global memory
- Can schedule tasks for any group
- Can view and manage tasks from all groups

---

## Integration Points

### Feishu
- Using @larksuiteoapi/node-sdk for WebSocket connection
- Persistent connection ensures delivery even behind NAT

### Scheduler
- Built-in scheduler runs on the host, spawns executions for task performance
- IPC via filesystem
- Tasks stored in SQLite with run history

---

## Personal Configuration (Reference)

- **Trigger**: `@Andy` (case insensitive)
- **Response prefix**: `Andy:`
- **Main channel**: Private chat in Feishu
