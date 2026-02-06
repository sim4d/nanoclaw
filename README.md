<p align="center">
  <img src="assets/nanoclaw-logo.png" alt="NanoClaw" width="400">
</p>

<p align="center">
  My personal AI assistant that runs securely. Lightweight and built to be understood and customized for your own needs.
</p>

## Why I Built This

NanoClaw is a lightweight, self-hosted AI assistant that turns **Feishu (Lark)** into a powerful control interface for your personal automated agent.

Built for simplicity and security, NanoClaw gives you core automated agent functionality in a codebase you can understand in 8 minutes. One process. A handful of files. Logic runs in isolated environments with filesystem isolation.

## Quick Start

```bash
git clone https://github.com/gavrielc/nanoclaw.git
cd nanoclaw
npm install
npm run build
```

Configure `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, and `ANTHROPIC_API_KEY` in `.env`.

## Philosophy

**Small enough to understand.** One process, a few source files. No microservices, no message queues, no abstraction layers.

**Secure by isolation.** Logic runs in isolated environments (Docker or restricted local processes). Agents can only see what's explicitly mounted.

**Built for one user.** This isn't a framework. It's working software that fits my exact needs. You fork it and make it match your exact needs.

**Customization = code changes.** No configuration sprawl. Want different behavior? Modify the code. The codebase is small enough that this is safe.

**AI-native.** No complex installation wizard. Ask the agent what's happening. Describe the problem, the agent fixes it.

## What It Supports

- **Feishu I/O** - Message NanoClaw from your phone or desktop
- **Isolated group context** - Each group has its own `CLAUDE.md` memory, isolated filesystem, and runs in its own sandbox with only that filesystem mounted
- **Main channel** - Your private channel for admin control; every other group is completely isolated
- **Scheduled tasks** - Recurring jobs that run the agent and can message you back
- **Web access** - Search and fetch content
- **AI Powered** - Uses advanced LLMs via Anthropic API or compatible proxies

## Usage

Talk to your assistant with the trigger word (default: `@Andy`):

```
@Andy send an overview of the sales pipeline every weekday morning at 9am
@Andy review the git history for the past week each Friday and update the README if there's drift
@Andy every Monday at 8am, compile news on AI developments from Hacker News and TechCrunch and message me a briefing
```

From the main channel (your self-chat), you can manage groups and tasks:
```
list all scheduled tasks across groups
pause the Monday briefing task
join the Family Chat group
```

## Requirements

- macOS or Linux
- Node.js 20+
- [Docker](https://docker.com/products/docker-desktop) (optional, for container isolation)

## Architecture

```
Feishu (WebSocket) --> SQLite --> Local Process/Container (AI Agent) --> Response
```

Single Node.js process. Agents execute in isolated environments with mounted directories. IPC via filesystem. No daemons, no queues, no complexity.

Key files:
- `src/index-feishu.ts` - Main app: Feishu connection, routing, IPC
- `src/feishu.ts` - Feishu API and event handling
- `src/container-runner.ts` - Spawns agent executions
- `src/task-scheduler.ts` - Runs scheduled tasks
- `src/db.ts` - SQLite operations
- `groups/*/CLAUDE.md` - Per-group memory

## FAQ

**Why Feishu?**

Because it provides a great developer experience with WebSocket support, making it easy to host bots even behind NAT or on platforms like Hugging Face Spaces.

**Is this secure?**

Logic runs in isolated environments, not behind application-level permission checks. They can only access explicitly mounted directories. See [docs/SECURITY.md](docs/SECURITY.md) for the full security model.

**Why no configuration files?**

We don't want configuration sprawl. Every user should customize it so that the code matches exactly what they want rather than configuring a generic system.

## License

MIT
