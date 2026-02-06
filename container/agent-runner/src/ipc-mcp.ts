import fs from 'fs';
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

interface IpcMcpOptions {
  chatId: string;
  groupFolder: string;
  isMain: boolean;
}

export function createIpcMcp(options: IpcMcpOptions): McpServer {
  const server = new McpServer({
    name: 'nanoclaw',
    version: '1.0.0',
  });

  const ipcDir = '/workspace/ipc';
  const messagesDir = path.join(ipcDir, 'messages');
  const tasksDir = path.join(ipcDir, 'tasks');

  // Tool to send a message back to the chat
  server.tool(
    'mcp__nanoclaw__send_message',
    {
      text: z.string().describe('The message text to send'),
      chatId: z.string().optional().describe('Target chat ID (defaults to current chat)'),
    },
    async ({ text, chatId }) => {
      const targetChatId = chatId || options.chatId;
      const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const filePath = path.join(messagesDir, `${messageId}.json`);

      fs.mkdirSync(messagesDir, { recursive: true });
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          type: 'message',
          chatId: targetChatId,
          text,
        }),
      );

      return {
        content: [{ type: 'text', text: `Message queued for delivery to ${targetChatId}` }],
      };
    },
  );

  // Tool to schedule a new task
  server.tool(
    'mcp__nanoclaw__schedule_task',
    {
      prompt: z.string().describe('The prompt to run for the task'),
      schedule_type: z.enum(['cron', 'interval', 'once']).describe('Schedule type'),
      schedule_value: z.string().describe('Cron expression, interval in ms, or ISO timestamp'),
      groupFolder: z.string().optional().describe('Target group folder (defaults to current group)'),
      context_mode: z.enum(['group', 'isolated']).optional().describe('Context mode (defaults to isolated)'),
    },
    async (args) => {
      const targetGroup = args.groupFolder || options.groupFolder;
      
      if (!options.isMain && targetGroup !== options.groupFolder) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Permission denied: Only the main group can schedule tasks for other groups.' }],
        };
      }

      const taskId = `task-req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const filePath = path.join(tasksDir, `${taskId}.json`);

      fs.mkdirSync(tasksDir, { recursive: true });
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          type: 'schedule_task',
          ...args,
          groupFolder: targetGroup,
        }),
      );

      return {
        content: [{ type: 'text', text: `Task scheduling request queued for group: ${targetGroup}` }],
      };
    },
  );

  return server;
}
