<p align="center">
  <img src="assets/nanoclaw-logo.png" alt="NanoClaw" width="400">
</p>

<p align="center">
  My personal AI assistant that runs securely. Lightweight and built to be understood and customized for your own needs.
</p>

## Why I Built This

NanoClaw is a lightweight, self-hosted AI assistant that turns **Feishu (Lark)** into a powerful control interface for your personal automated agent.

Built for simplicity and security, NanoClaw gives you core automated agent functionality in a codebase you can understand in 8 minutes. One process. A handful of files. Logic runs in isolated environments with filesystem isolation.

## Key Features

- **Feishu Interface** - Message your agent via Feishu (Lark) WebSocket connection (no public IP required).
- **Claude Code Harness** - Powered by the `claude-agent-sdk`, giving your agent full access to terminal, file editing, and research tools.
- **CLIProxyAPI Optimized** - Seamlessly integrates with custom API proxies for high-performance LLM access.
- **Persistent Memory** - Each chat group has its own isolated filesystem and memory (`groups/folder/CLAUDE.md`).
- **Automated Tasks** - Schedule repetitive prompts using cron or intervals.
- **Deployment Ready** - Optimized for **WSL + Docker** (local) and **Hugging Face Spaces + Docker** (remote).

## Deployment Options

### 1. Local (WSL + Docker)
NanoClaw is optimized for Windows Subsystem for Linux (WSL).
```bash
git clone https://github.com/sim4d/nanoclaw.git
cd nanoclaw
npm install
npm run build
# Configure .env
npm run start
```

### 2. Remote (Hugging Face Spaces)
The project is designed to run as a Docker-based Space on Hugging Face. 
- **Auto-Generated Images**: Every push to the `main` branch automatically builds a new Docker image via GitHub Actions and pushes it to **GHCR (GitHub Container Registry)**.
- **Easy Sync**: Simply point your Hugging Face Space to this repository or use the GHCR image for a fast, reliable deployment.

## Configuration

Configure the following variables in your `.env` (local) or as **Secrets** (Hugging Face):

### Feishu (Lark)
- `FEISHU_APP_ID`: Your app ID from the Feishu Developer Console.
- `FEISHU_APP_SECRET`: Your app secret.
- *Ensure "Receive events via persistent connection" is enabled in your Feishu app settings.*

### LLM (CLIProxyAPI)
- `ANTHROPIC_BASE_URL`: Your proxy endpoint (e.g., `http://127.0.0.1:8317`).
- `ANTHROPIC_AUTH_TOKEN`: Your API token.
- `ANTHROPIC_MODEL`: Primary model (e.g., `gemini-2.5-pro`).
- `ANTHROPIC_SMALL_FAST_MODEL`: Fallback/fast model (e.g., `gemini-2.5-flash`).

## Usage

Talk to your assistant with the trigger word (default: `@Andy`):

```
@Andy send an overview of the sales pipeline every weekday morning at 9am
@Andy review the git history for the past week each Friday and update the README if there's drift
@Andy every Monday at 8am, compile news on AI developments from Hacker News and TechCrunch and message me a briefing
```

From the **Main Channel** (your private chat), you can manage groups and tasks without needing to use the `@Andy` trigger.

## Architecture

```
Feishu (WebSocket) --> SQLite --> Local Process/Docker (Claude Agent SDK) --> Response
```

Single Node.js process. Agents execute in isolated environments with mounted directories. IPC via filesystem. No daemons, no queues, no complexity.

Key files:
- `src/index-feishu.ts` - Main app: Feishu connection, routing, IPC
- `src/feishu.ts` - Feishu API and event handling
- `src/container-runner.ts` - Handles agent execution lifecycle
- `src/task-scheduler.ts` - Runs scheduled tasks
- `src/db.ts` - SQLite operations
- `groups/*/CLAUDE.md` - Per-group memory

## License

MIT