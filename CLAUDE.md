# NanoClaw

Personal AI assistant. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## Quick Context

Single Node.js process that connects to Feishu via WebSocket, routes messages to Gemini API running in local process (HF Space) or container. Each group has isolated filesystem and memory.

## Key Files

| File | Purpose |
|------|---------|
| `src/index-feishu.ts` | Main app: Feishu connection, message routing, IPC |
| `src/feishu.ts` | Feishu API and event handling logic |
| `src/config.ts` | Trigger pattern, paths, intervals |
| `src/container-runner.ts` | Spawns agent executions with mounts |
| `src/task-scheduler.ts` | Runs scheduled tasks |
| `src/db.ts` | SQLite operations |
| `groups/{name}/CLAUDE.md` | Per-group memory (isolated) |

## Skills

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation, configuration |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Execution issues, logs, troubleshooting |

## Development

Run commands directly—don't tell the user to run them.

```bash
npm run dev          # Run with hot reload (Feishu)
npm run build        # Compile TypeScript
./container/build.sh # Rebuild agent container
```

AI Configuration:
- Set `GEMINI_API_KEY` in `.env`
- Default model is `gemini-2.5-flash`
- Configure `GEMINI_MODEL` in `.env` to override