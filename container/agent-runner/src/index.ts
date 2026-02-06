/**
 * NanoClaw Agent Runner - Gemini Version
 * Runs inside a container, receives config via stdin, outputs result to stdout
 * Uses Google Gemini 2.5 API instead of Claude Code
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
}

interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

function writeOutput(output: ContainerOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

function log(message: string): void {
  console.error(`[agent-runner] ${message}`);
}

// Simple session storage (in-memory for this container)
const sessionHistory = new Map<string, Array<{ role: string; parts: any[] }>>();

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

// Tool implementations
class Tools {
  private workspaceGroup: string;
  private workspaceProject: string;

  constructor(workspaceGroup: string, workspaceProject?: string) {
    this.workspaceGroup = workspaceGroup;
    this.workspaceProject = workspaceProject || workspaceGroup;
  }

  resolvePath(targetPath: string): string {
    // If path is absolute, use it as-is (within workspace constraints)
    if (path.isAbsolute(targetPath)) {
      return targetPath;
    }
    // Otherwise, resolve relative to workspace group
    return path.resolve(this.workspaceGroup, targetPath);
  }

  // Bash tool - execute shell commands
  async bash(command: string, timeout = 30000): Promise<string> {
    try {
      const result = execSync(command, {
        cwd: this.workspaceGroup,
        timeout,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });
      return result || 'Command completed successfully';
    } catch (error: any) {
      return `Error: ${error.message}\n${error.stderr || ''}`;
    }
  }

  // Read tool - read file contents
  async read(filePath: string): Promise<string> {
    try {
      const resolvedPath = this.resolvePath(filePath);
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      return content;
    } catch (error: any) {
      return `Error reading file: ${error.message}`;
    }
  }

  // Write tool - write/create file
  async write(filePath: string, content: string): Promise<string> {
    try {
      const resolvedPath = this.resolvePath(filePath);
      const dir = path.dirname(resolvedPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(resolvedPath, content, 'utf-8');
      return `File written: ${resolvedPath}`;
    } catch (error: any) {
      return `Error writing file: ${error.message}`;
    }
  }

  // Edit tool - replace text in file
  async edit(filePath: string, oldText: string, newText: string): Promise<string> {
    try {
      const resolvedPath = this.resolvePath(filePath);
      let content = fs.readFileSync(resolvedPath, 'utf-8');
      if (!content.includes(oldText)) {
        return `Error: old_text not found in file`;
      }
      content = content.replace(oldText, newText);
      fs.writeFileSync(resolvedPath, content, 'utf-8');
      return `File edited: ${resolvedPath}`;
    } catch (error: any) {
      return `Error editing file: ${error.message}`;
    }
  }

  // Glob tool - find files by pattern
  async glob(pattern: string): Promise<string> {
    try {
      const { glob } = await import('glob');
      const resolvedPath = this.resolvePath(pattern);
      const files = glob.sync(resolvedPath, { cwd: this.workspaceGroup });
      return files.join('\n');
    } catch (error: any) {
      return `Error: ${error.message}`;
    }
  }

  // Grep tool - search for pattern in files
  async grep(pattern: string, filePath?: string): Promise<string> {
    try {
      let searchPath = filePath || this.workspaceGroup;
      if (!path.isAbsolute(searchPath)) {
        searchPath = this.resolvePath(searchPath);
      }

      const result = execSync(
        `grep -r "${pattern.replace(/"/g, '\\"')}" ${searchPath} 2>/dev/null || true`,
        { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
      );

      return result || 'No matches found';
    } catch (error: any) {
      return `Error: ${error.message}`;
    }
  }

  // WebSearch tool (simple implementation - returns note about limitation)
  async webSearch(query: string): Promise<string> {
    return `Web search is not directly implemented. For web searches, please use a search API or provide a specific URL to fetch.`;
  }

  // WebFetch tool - fetch URL content
  async webFetch(url: string): Promise<string> {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'NanoClaw/1.0' },
      });
      if (!response.ok) {
        return `Error: HTTP ${response.status} ${response.statusText}`;
      }
      const text = await response.text();
      // Limit response size
      return text.length > 50000 ? text.slice(0, 50000) + '\n... (truncated)' : text;
    } catch (error: any) {
      return `Error fetching URL: ${error.message}`;
    }
  }
}

// Function calling schema for Gemini with proper types
const FUNCTION_DECLARATIONS: any[] = [
  {
    name: 'bash',
    description: 'Execute a shell command in the workspace directory',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        command: {
          type: 'STRING' as const,
          description: 'The shell command to execute',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'read',
    description: 'Read the contents of a file',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        filePath: {
          type: 'STRING' as const,
          description: 'Path to the file to read (relative to workspace or absolute)',
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'write',
    description: 'Write content to a file (creates file if it doesn\'t exist)',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        filePath: {
          type: 'STRING' as const,
          description: 'Path to the file to write (relative to workspace or absolute)',
        },
        content: {
          type: 'STRING' as const,
          description: 'Content to write to the file',
        },
      },
      required: ['filePath', 'content'],
    },
  },
  {
    name: 'edit',
    description: 'Replace text in a file (exact match replacement)',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        filePath: {
          type: 'STRING' as const,
          description: 'Path to the file to edit',
        },
        oldText: {
          type: 'STRING' as const,
          description: 'Exact text to replace',
        },
        newText: {
          type: 'STRING' as const,
          description: 'New text to replace with',
        },
      },
      required: ['filePath', 'oldText', 'newText'],
    },
  },
  {
    name: 'glob',
    description: 'Find files matching a pattern (e.g., "**/*.ts" to find all TypeScript files)',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        pattern: {
          type: 'STRING' as const,
          description: 'Glob pattern to match files',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'grep',
    description: 'Search for a pattern in files',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        pattern: {
          type: 'STRING' as const,
          description: 'Pattern to search for',
        },
        filePath: {
          type: 'STRING' as const,
          description: 'Optional file or directory path to search in',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'webFetch',
    description: 'Fetch and return the content of a URL',
    parameters: {
      type: 'OBJECT' as const,
      properties: {
        url: {
          type: 'STRING' as const,
          description: 'The URL to fetch',
        },
      },
      required: ['url'],
    },
  },
];

async function runAgentWithTools(
  prompt: string,
  tools: Tools,
  sessionId: string,
  maxIterations = 10,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  // Initialize the Generative AI client
  const genAI = new GoogleGenerativeAI(apiKey);

  // Use gemini-2.5-pro for high quality responses
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-pro',
    tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
  });

  // Get or create session history
  let history = sessionHistory.get(sessionId) || [];

  // Add system prompt
  const systemPrompt = `You are Andy, a helpful AI assistant running in a secure container environment.

## Your Capabilities
- Execute bash commands in a sandboxed workspace
- Read and write files
- Edit existing files
- Search for files and content
- Fetch content from URLs

## Important Guidelines
1. Be concise and direct - users prefer brief responses without unnecessary fluff
2. When completing tasks that require multiple steps, do all the work and then provide a final summary
3. Do NOT send intermediate status updates - just do the work and report the result
4. Use tools efficiently - batch file operations when possible
5. If a command fails, try to understand why and suggest a fix
6. Keep responses clean and readable

## Your Context
- You have access to a workspace directory where you can read and write files
- You can execute bash commands to perform operations
- When asked to explain code or make changes, read the relevant files first
- For Feishu messages, keep formatting simple with **bold** for emphasis

## Memory
The conversations/ folder contains searchable history of past conversations. Create files for important structured data.`;

  // Build chat history
  const chat = model.startChat({
    history: history,
    generationConfig: {
      maxOutputTokens: 8192,
      temperature: 0.7,
    },
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE, // Allow code execution
      },
    ],
  });

  // Add system prompt as first user message if new session
  if (history.length === 0) {
    await chat.sendMessage(systemPrompt);
  }

  let result = '';
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    const response = await chat.sendMessage(prompt);
    const responseText = response.response.text();

    // Check for function calls
    const functionCalls = response.response.functionCalls();

    if (!functionCalls || functionCalls.length === 0) {
      // No more function calls, return the final response
      result = responseText;

      // Save to history
      history.push({ role: 'user', parts: [{ text: prompt }] });
      history.push({ role: 'model', parts: [{ text: responseText }] });
      sessionHistory.set(sessionId, history);

      return result;
    }

    // Execute function calls
    const functionResults: any[] = [];
    for (const call of functionCalls) {
      log(`Tool call: ${call.name}`);

      const args = call.args as any;
      let toolResult: string;
      try {
        switch (call.name) {
          case 'bash':
            toolResult = await tools.bash(args.command as string);
            break;
          case 'read':
            toolResult = await tools.read(args.filePath as string);
            break;
          case 'write':
            toolResult = await tools.write(args.filePath as string, args.content as string);
            break;
          case 'edit':
            toolResult = await tools.edit(args.filePath as string, args.oldText as string, args.newText as string);
            break;
          case 'glob':
            toolResult = await tools.glob(args.pattern as string);
            break;
          case 'grep':
            toolResult = await tools.grep(args.pattern as string, args.filePath as string);
            break;
          case 'webFetch':
            toolResult = await tools.webFetch(args.url as string);
            break;
          default:
            toolResult = `Unknown tool: ${call.name}`;
        }
      } catch (error: any) {
        toolResult = `Error executing ${call.name}: ${error.message}`;
      }

      log(`Tool result: ${toolResult.slice(0, 100)}...`);
      functionResults.push({
        name: call.name,
        response: toolResult,
      });
    }

    // Send function results back to model
    prompt = ''; // Clear prompt for next iteration
    await chat.sendMessage(functionResults);
  }

  return 'Maximum iterations reached. Task may be incomplete.';
}

async function main(): Promise<void> {
  let input: ContainerInput;

  try {
    const stdinData = await readStdin();
    input = JSON.parse(stdinData);
    log(`Received input for group: ${input.groupFolder}`);
  } catch (err) {
    writeOutput({
      status: 'error',
      result: null,
      error: `Failed to parse input: ${err instanceof Error ? err.message : String(err)}`
    });
    process.exit(1);
  }

  const workspaceGroup = process.env.WORKSPACE_GROUP || '/workspace/group';
  const workspaceProject = process.env.WORKSPACE_PROJECT || workspaceGroup;

  // Initialize tools
  const tools = new Tools(workspaceGroup, workspaceProject);

  let result: string | null = null;
  const sessionId = input.sessionId || `session-${Date.now()}`;

  // Add context for scheduled tasks
  let prompt = input.prompt;
  if (input.isScheduledTask) {
    prompt = `[SCHEDULED TASK - You are running automatically, not in response to a user message.]\n\n${input.prompt}`;
  }

  try {
    log('Starting Gemini agent...');

    result = await runAgentWithTools(prompt, tools, sessionId);

    log('Agent completed successfully');
    writeOutput({
      status: 'success',
      result,
      newSessionId: sessionId,
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`Agent error: ${errorMessage}`);
    writeOutput({
      status: 'error',
      result: null,
      newSessionId: sessionId,
      error: errorMessage
    });
    process.exit(1);
  }
}

main();
