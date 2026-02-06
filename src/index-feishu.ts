/**
 * NanoClaw - Feishu (Lark) Version
 * Main application using Feishu as the messaging channel
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';

import express from 'express';

import {
  ASSISTANT_NAME,
  DATA_DIR,
  GROUPS_DIR,
  IPC_POLL_INTERVAL,
  MAIN_GROUP_FOLDER,
  TRIGGER_PATTERN,
  FEISHU_APP_ID,
  FEISHU_WEBHOOK_PORT,
  FEISHU_VERIFICATION_TOKEN,
  FEISHU_ENCRYPT_KEY,
} from './config.js';
import {
  AvailableGroup,
  runContainerAgent,
  writeGroupsSnapshot,
  writeTasksSnapshot,
} from './container-runner.js';
import {
  getAllChats,
  getAllTasks,
  initDatabase,
  setLastGroupSync,
  storeChatMetadata,
  storeMessage,
  updateChatName,
  getMessagesSince,
} from './db.js';
import { startSchedulerLoop } from './task-scheduler.js';
import { RegisteredGroup, Session } from './types.js';
import { loadJson, saveJson } from './utils.js';
import { logger } from './logger.js';
import {
  sendFeishuMessage,
  verifyFeishuToken,
  verifyFeishuSignature,
  parseFeishuMessageEvent,
  getFeishuChat,
  getFeishuUser,
  createFeishuWSClient,
  createFeishuEventDispatcher,
  type FeishuEvent,
  type FeishuMessage,
} from './feishu.js';

const GROUP_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

let sessions: Session = {};
let registeredGroups: Record<string, RegisteredGroup> = {};
let lastAgentTimestamp: Record<string, string> = {};

interface FeishuState {
  last_timestamp?: string;
  last_agent_timestamp?: Record<string, string>;
}

interface URLVerificationRequest {
  type: 'url_verification';
  challenge: string;
  token: string;
}

interface URLVerificationResponse {
  challenge: string;
}

function loadState(): void {
  const statePath = path.join(DATA_DIR, 'feishu_state.json');
  const state = loadJson<FeishuState>(statePath, {});
  lastAgentTimestamp = state.last_agent_timestamp || {};
  sessions = loadJson(path.join(DATA_DIR, 'sessions.json'), {});
  registeredGroups = loadJson(
    path.join(DATA_DIR, 'registered_groups.json'),
    {},
  );
  logger.info(
    { groupCount: Object.keys(registeredGroups).length },
    'Feishu state loaded',
  );
}

function saveState(): void {
  saveJson(path.join(DATA_DIR, 'feishu_state.json'), {
    last_agent_timestamp: lastAgentTimestamp,
  });
  saveJson(path.join(DATA_DIR, 'sessions.json'), sessions);
}

function registerGroup(chatId: string, group: RegisteredGroup): void {
  registeredGroups[chatId] = group;
  saveJson(path.join(DATA_DIR, 'registered_groups.json'), registeredGroups);

  // Create group folder
  const groupDir = path.join(GROUPS_DIR, group.folder);
  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

  logger.info(
    { chatId, name: group.name, folder: group.folder },
    'Group registered',
  );
}

async function syncGroupMetadata(): Promise<void> {
  try {
    logger.info('Syncing Feishu chat metadata...');
    let count = 0;

    for (const [chatId, group] of Object.entries(registeredGroups)) {
      const chat = await getFeishuChat(chatId);
      if (chat && chat.name) {
        updateChatName(chatId, chat.name);
        count++;
      }
    }

    setLastGroupSync();
    logger.info({ count }, 'Feishu chat metadata synced');
  } catch (err) {
    logger.error({ err }, 'Failed to sync Feishu chat metadata');
  }
}

function getAvailableGroups(): AvailableGroup[] {
  const chats = getAllChats();
  const registeredJids = new Set(Object.keys(registeredGroups));

  return chats.map((c) => ({
    jid: c.jid,
    name: c.name,
    lastActivity: c.last_message_time,
    isRegistered: registeredJids.has(c.jid),
  }));
}

async function processFeishuMessage(msg: FeishuMessage): Promise<void> {
  const group = registeredGroups[msg.chat_id];
  if (!group) {
    logger.debug({ chatId: msg.chat_id }, 'Message from unregistered chat, ignoring');
    return;
  }

  const content = msg.content.trim();
  const isMainGroup = group.folder === MAIN_GROUP_FOLDER;
  const hasTrigger = TRIGGER_PATTERN.test(content);

  logger.info({ 
    chatId: msg.chat_id, 
    groupFolder: group.folder,
    isMainGroup, 
    content,
    hasTrigger,
    triggerPattern: TRIGGER_PATTERN.toString()
  }, 'Processing message details');

  // Main group responds to all messages; other groups require trigger prefix
  if (!isMainGroup && !hasTrigger) {
    logger.info({ chatId: msg.chat_id, content }, 'Message without trigger in non-main group, ignoring');
    return;
  }

  // Get all messages since last agent interaction
  const sinceTimestamp = lastAgentTimestamp[msg.chat_id] || '';
  const missedMessages = getMessagesSince(
    msg.chat_id,
    '', 
    ASSISTANT_NAME,
  );

  // If the current message wasn't in DB yet (race condition), add it
  if (!missedMessages.find(m => m.id === msg.message_id)) {
    missedMessages.push({
      id: msg.message_id,
      chat_jid: msg.chat_id,
      sender: msg.sender_id,
      sender_name: msg.sender_name,
      content: msg.content,
      timestamp: msg.timestamp.toString(),
    });
  }

  logger.info({
    chatId: msg.chat_id,
    sinceTimestamp,
    missedMessagesCount: missedMessages.length
  }, 'Retrieved messages for agent');

  // If there's a trigger, we might want to strip it for the agent's prompt
  // but keep the full message in history for context.
  // For now, we'll just send the messages as-is.

  const lines = missedMessages.map((m) => {
    const escapeXml = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    
    // Strip trigger if present at the start of the message
    let processedContent = m.content;
    if (TRIGGER_PATTERN.test(processedContent)) {
      processedContent = processedContent.replace(TRIGGER_PATTERN, '').trim();
    }

    return `<message sender="${escapeXml(m.sender_name)}" time="${m.timestamp}">${escapeXml(processedContent)}</message>`;
  });
  const prompt = `<messages>\n${lines.join('\n')}\n</messages>`;

  logger.info({
    chatId: msg.chat_id,
    messageCount: missedMessages.length,
  }, 'Messages being sent to agent');

  if (!prompt || lines.length === 0) {
    logger.debug({ chatId: msg.chat_id }, 'No messages to process');
    return;
  }

  logger.info(
    { group: group.name, messageCount: missedMessages.length },
    'Processing Feishu message',
  );

  const response = await runAgent(group, prompt, msg.chat_id);

  if (response) {
    lastAgentTimestamp[msg.chat_id] = msg.create_time;
    saveState();

    const sendResult = await sendFeishuMessage(
      msg.chat_id,
      `${ASSISTANT_NAME}: ${response}`,
    );

    if (sendResult) {
      logger.info({ chatId: msg.chat_id, messageId: sendResult.message_id }, 'Response sent');
    } else {
      logger.error({ chatId: msg.chat_id }, 'Failed to send response');
    }
  }
}

async function runAgent(
  group: RegisteredGroup,
  prompt: string,
  chatJid: string,
): Promise<string | null> {
  const isMain = group.folder === MAIN_GROUP_FOLDER;
  const sessionId = sessions[group.folder];

  // Update tasks snapshot
  const tasks = getAllTasks();
  writeTasksSnapshot(
    group.folder,
    isMain,
    tasks.map((t) => ({
      id: t.id,
      groupFolder: t.group_folder,
      prompt: t.prompt,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  // Update available groups snapshot
  const availableGroups = getAvailableGroups();
  writeGroupsSnapshot(
    group.folder,
    isMain,
    availableGroups,
    new Set(Object.keys(registeredGroups)),
  );

  try {
    const output = await runContainerAgent(group, {
      prompt,
      sessionId,
      groupFolder: group.folder,
      chatJid,
      isMain,
    });

    if (output.newSessionId) {
      sessions[group.folder] = output.newSessionId;
      saveJson(path.join(DATA_DIR, 'sessions.json'), sessions);
    }

    if (output.status === 'error') {
      logger.error(
        { group: group.name, error: output.error },
        'Container agent error',
      );
      return null;
    }

    return output.result;
  } catch (err) {
    logger.error({ group: group.name, err }, 'Agent error');
    return null;
  }
}

function startIpcWatcher(): void {
  const ipcBaseDir = path.join(DATA_DIR, 'ipc');
  fs.mkdirSync(ipcBaseDir, { recursive: true });

  const processIpcFiles = async () => {
    let groupFolders: string[];
    try {
      groupFolders = fs.readdirSync(ipcBaseDir).filter((f) => {
        const stat = fs.statSync(path.join(ipcBaseDir, f));
        return stat.isDirectory() && f !== 'errors';
      });
    } catch (err) {
      logger.error({ err }, 'Error reading IPC base directory');
      setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
      return;
    }

    for (const sourceGroup of groupFolders) {
      const isMain = sourceGroup === MAIN_GROUP_FOLDER;
      const messagesDir = path.join(ipcBaseDir, sourceGroup, 'messages');
      const tasksDir = path.join(ipcBaseDir, sourceGroup, 'tasks');

      // Process messages
      try {
        if (fs.existsSync(messagesDir)) {
          const messageFiles = fs
            .readdirSync(messagesDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of messageFiles) {
            const filePath = path.join(messagesDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              if (data.type === 'message' && data.chatJid && data.text) {
                const targetGroup = registeredGroups[data.chatJid];
                if (
                  isMain ||
                  (targetGroup && targetGroup.folder === sourceGroup)
                ) {
                  const sendResult = await sendFeishuMessage(
                    data.chatJid,
                    `${ASSISTANT_NAME}: ${data.text}`,
                  );
                  if (sendResult) {
                    logger.info(
                      { chatJid: data.chatJid, sourceGroup },
                      'IPC message sent',
                    );
                  }
                } else {
                  logger.warn(
                    { chatJid: data.chatJid, sourceGroup },
                    'Unauthorized IPC message attempt blocked',
                  );
                }
              }
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC message',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error(
          { err, sourceGroup },
          'Error reading IPC messages directory',
        );
      }

      // Process tasks (simplified - same logic as WhatsApp version)
      try {
        if (fs.existsSync(tasksDir)) {
          const taskFiles = fs
            .readdirSync(tasksDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of taskFiles) {
            const filePath = path.join(tasksDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              await processTaskIpc(data, sourceGroup, isMain);
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC task',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error({ err, sourceGroup }, 'Error reading IPC tasks directory');
      }
    }

    setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
  };

  processIpcFiles();
  logger.info('IPC watcher started');
}

async function processTaskIpc(
  data: any,
  sourceGroup: string,
  isMain: boolean,
): Promise<void> {
  // Import task functions dynamically to avoid circular deps
  const {
    createTask,
    updateTask,
    deleteTask,
    getTaskById: getTask,
  } = await import('./db.js');
  const { CronExpressionParser } = await import('cron-parser');
  const { TIMEZONE } = await import('./config.js');

  switch (data.type) {
    case 'schedule_task':
      if (
        data.prompt &&
        data.schedule_type &&
        data.schedule_value &&
        data.groupFolder
      ) {
        const targetGroup = data.groupFolder;
        if (!isMain && targetGroup !== sourceGroup) {
          logger.warn(
            { sourceGroup, targetGroup },
            'Unauthorized schedule_task attempt blocked',
          );
          break;
        }

        const targetJid = Object.entries(registeredGroups).find(
          ([, group]) => group.folder === targetGroup,
        )?.[0];

        if (!targetJid) {
          logger.warn(
            { targetGroup },
            'Cannot schedule task: target group not registered',
          );
          break;
        }

        const scheduleType = data.schedule_type as 'cron' | 'interval' | 'once';
        let nextRun: string | null = null;

        if (scheduleType === 'cron') {
          try {
            const interval = CronExpressionParser.parse(data.schedule_value, {
              tz: TIMEZONE,
            });
            nextRun = interval.next().toISOString();
          } catch {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid cron expression',
            );
            break;
          }
        } else if (scheduleType === 'interval') {
          const ms = parseInt(data.schedule_value, 10);
          if (isNaN(ms) || ms <= 0) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid interval',
            );
            break;
          }
          nextRun = new Date(Date.now() + ms).toISOString();
        } else if (scheduleType === 'once') {
          const scheduled = new Date(data.schedule_value);
          if (isNaN(scheduled.getTime())) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid timestamp',
            );
            break;
          }
          nextRun = scheduled.toISOString();
        }

        const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const contextMode =
          data.context_mode === 'group' || data.context_mode === 'isolated'
            ? data.context_mode
            : 'isolated';

        createTask({
          id: taskId,
          group_folder: targetGroup,
          chat_jid: targetJid,
          prompt: data.prompt,
          schedule_type: scheduleType,
          schedule_value: data.schedule_value,
          context_mode: contextMode,
          next_run: nextRun,
          status: 'active',
          created_at: new Date().toISOString(),
        });

        logger.info(
          { taskId, sourceGroup, targetGroup, contextMode },
          'Task created via IPC',
        );
      }
      break;

    case 'pause_task':
    case 'resume_task':
    case 'cancel_task':
    case 'refresh_groups':
    case 'register_group':
      // Implement same as WhatsApp version
      logger.debug({ type: data.type, sourceGroup }, 'IPC task type received');
      break;
  }
}

async function handleFeishuEvent(data: any): Promise<any> {
  try {
    logger.info({ 
      eventType: data.header?.event_type || data.type,
      eventId: data.header?.event_id
    }, 'Feishu event handler triggered');

    const msg = await parseFeishuMessageEvent(data);
    if (msg) {
      logger.info({ chatId: msg.chat_id, content: msg.content }, 'Processing message from event');
      // Store message
      storeChatMetadata(msg.chat_id, msg.create_time);

      let group = registeredGroups[msg.chat_id];
      logger.info({ chatId: msg.chat_id, hasGroup: !!group }, 'Feishu message received and parsed');

      // Auto-register first chat as main channel if no groups registered yet
      if (!group && Object.keys(registeredGroups).length === 0) {
        logger.info(
          { chatId: msg.chat_id, sender: msg.sender_name },
          'Auto-registering first chat as main channel',
        );

        const newGroup = {
          name: 'main',
          folder: 'main',
          trigger: `@${ASSISTANT_NAME}`,
          added_at: new Date().toISOString(),
        };
        registerGroup(msg.chat_id, newGroup);
        group = newGroup;

        // Send welcome message
        sendFeishuMessage(
          msg.chat_id,
          `👋 Welcome to NanoClaw!\n\nI'm ${ASSISTANT_NAME}, your personal AI assistant.\n\nThis chat has been registered as your main control channel.\n\nTry sending: @${ASSISTANT_NAME} hello`,
        ).catch((err) => {
          logger.error({ err }, 'Failed to send welcome message');
        });
      }

      if (group) {
        logger.info({ chatId: msg.chat_id, isMain: group.folder === MAIN_GROUP_FOLDER }, 'Group found, storing and processing message');
        // Store message in database
        storeMessage(
          {
            key: {
              remoteJid: msg.chat_id,
              fromMe: false,
              id: msg.message_id,
            },
            message: { conversation: msg.content },
            messageTimestamp: Math.floor(msg.timestamp / 1000),
            pushName: msg.sender_name,
          } as any,
          msg.chat_id,
          false,
          msg.sender_name,
        );

        // Process message asynchronously
        processFeishuMessage(msg).catch((err) => {
          logger.error({ err, messageId: msg.message_id }, 'Error processing message');
        });
      } else {
        logger.info({ chatId: msg.chat_id }, 'No group found for message and not auto-registered');
      }
    } else {
      logger.info({ 
        eventType: data.header?.event_type || data.type,
        eventId: data.header?.event_id,
        body: JSON.stringify(data).substring(0, 1000)
      }, 'Unhandled Feishu event received');
    }
  } catch (err) {
    logger.error({ err }, 'Error handling Feishu event');
  }
  return {};
}

// Create Express app for Feishu webhooks
function createWebhookApp(): express.Application {
  const app = express();

  // Raw body parser for signature verification
  app.use('/webhook/feishu', express.raw({ type: 'application/json' }));

  // Feishu webhook endpoint
  app.post('/webhook/feishu', async (req, res) => {
    try {
      const rawBody = req.body;
      const timestamp = req.header('X-Lark-Request-Timestamp') || '';
      const nonce = req.header('X-Lark-Request-Nonce') || '';
      const signature = req.header('X-Lark-Signature') || '';

      let bodyStr = rawBody.toString();
      const originalBodyStr = bodyStr; // Keep original for signature verification

      logger.info({
        hasTimestamp: !!timestamp,
        hasNonce: !!nonce,
        hasSignature: !!signature,
        bodyLength: rawBody?.length || 0,
        bodyPreview: bodyStr.substring(0, 100),
      }, 'Feishu webhook request received');

      // Verify signature BEFORE decryption
      if (timestamp && nonce && signature && FEISHU_ENCRYPT_KEY) {
        const isValid = verifyFeishuSignature(
          timestamp,
          nonce,
          originalBodyStr,
          signature,
        );
        if (!isValid) {
          logger.warn({ timestamp, nonce }, 'Invalid Feishu signature');
        }
      }

      // Decrypt if payload is encrypted
      try {
        const parsed = JSON.parse(bodyStr);
        if (parsed.encrypt) {
          logger.info('Encrypted payload detected, decrypting...');
          const crypto = await import('crypto');
          const keyBytes = Buffer.from(FEISHU_ENCRYPT_KEY, 'utf8');
          const keyHash = crypto.createHash('sha256').update(keyBytes).digest();
          const encryptedData = parsed.encrypt;
          const encryptedBuffer = Buffer.from(encryptedData, 'base64');
          const iv = encryptedBuffer.slice(0, 16);
          const ciphertext = encryptedBuffer.slice(16);
          const decipher = crypto.createDecipheriv('aes-256-cbc', keyHash, iv);
          let decrypted = decipher.update(ciphertext);
          decrypted = Buffer.concat([decrypted, decipher.final()]);
          bodyStr = decrypted.toString('utf8');
        }
      } catch (decryptErr) {
        logger.error({ decryptErr }, 'Decryption failed');
      }

      let payload;
      try {
        payload = JSON.parse(bodyStr);
      } catch (parseErr) {
        logger.error({ parseErr, bodyStr }, 'Failed to parse webhook payload');
        return res.status(400).json({ code: 400, msg: 'Invalid JSON' });
      }

      // URL verification challenge
      if (payload.type === 'url_verification') {
        if (verifyFeishuToken(payload.token)) {
          return res.json({ challenge: payload.challenge });
        } else {
          return res.status(401).json({ code: 401, msg: 'Unauthorized' });
        }
      }

      // Event handling
      await handleFeishuEvent(payload);
      res.json({ code: 0, msg: 'success' });
    } catch (err) {
      logger.error({ err }, 'Error handling Feishu webhook');
      res.status(500).json({ code: 500, msg: 'Internal error' });
    }
  });

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'nanoclaw-feishu' });
  });

  // Debug endpoint to check configuration
  app.get('/debug', (_req, res) => {
    res.json({
      appId: FEISHU_APP_ID ? `${FEISHU_APP_ID.slice(0, 10)}...` : 'not set',
      hasVerificationToken: !!FEISHU_VERIFICATION_TOKEN,
      hasEncryptKey: !!FEISHU_ENCRYPT_KEY,
      webhookPort: FEISHU_WEBHOOK_PORT,
      registeredGroups: Object.keys(registeredGroups),
    });
  });

  return app;
}

interface TunnelInfo {
  url: string | null;
  process: ReturnType<typeof spawn> | null;
}

/**
 * Start Cloudflare tunnel for external webhook access
 */
function startCloudflareTunnel(): TunnelInfo {
  try {
    // Check if named tunnel config exists
    const tunnelConfigPath = `${process.env.HOME}/.cloudflared/config.yml`;
    const hasNamedTunnel = fs.existsSync(tunnelConfigPath);

    const TUNNEL_URL = 'https://nanoclaw.sim4d.dpdns.org';

    let tunnelArgs: string[];
    let tunnelUrl: string;

    if (hasNamedTunnel) {
      // Use named tunnel with custom domain
      tunnelArgs = ['tunnel', 'run', 'nanoclaw-feishu'];
      tunnelUrl = TUNNEL_URL;
    } else {
      // Use quick tunnel (temporary URL)
      tunnelArgs = ['tunnel', '--url', `http://localhost:${FEISHU_WEBHOOK_PORT}`];
      tunnelUrl = ''; // Will be parsed from output
    }

    // Start cloudflared tunnel
    const tunnel = spawn('cloudflared', tunnelArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    if (hasNamedTunnel) {
      console.log(`\n🌐 Cloudflare Tunnel URL: ${tunnelUrl}`);
      logger.info({ tunnelUrl }, 'Cloudflare named tunnel started');
    } else {
      let urlShown = false;
      const logUrl = (data: any) => {
        const output = data.toString();
        const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        if (match && !urlShown) {
          urlShown = true;
          console.log(`\n🌐 Cloudflare Tunnel URL: ${match[0]}`);
          logger.info({ tunnelUrl: match[0] }, 'Cloudflare quick tunnel established');
        }
      };
      tunnel.stdout?.on('data', logUrl);
      tunnel.stderr?.on('data', logUrl);
    }

    tunnel.on('error', (err) => {
      logger.warn({ err }, 'Cloudflare tunnel process error');
    });

    return { url: hasNamedTunnel ? tunnelUrl : null, process: tunnel };
  } catch (err) {
    logger.warn({ err }, 'Failed to start Cloudflare tunnel');
    return { url: null, process: null };
  }
}

async function main(): Promise<void> {
  if (!FEISHU_APP_ID) {
    console.error('FEISHU_APP_ID not configured. Please set it in .env');
    process.exit(1);
  }

  // Initialize database
  initDatabase();
  logger.info('Database initialized');

  // Load state
  loadState();

  // Sync chat metadata
  await syncGroupMetadata();

  const isHF = !!process.env.SPACE_ID;

  // Always use WebSocket for both local and HF deployments
  console.log(`\n🚀 Using Feishu Long Connection (WebSocket) for ${isHF ? 'Hugging Face' : 'local'} deployment.`);

  const wsClient = createFeishuWSClient();
  const dispatcher = createFeishuEventDispatcher();

  // Register message handlers (using multiple common names to be safe)
  const handlers = {
    'im.message.receive_v1': handleFeishuEvent,
    'p2.im.message.receive_v1': handleFeishuEvent,
    'p2_im_message_receive_v1': handleFeishuEvent,
    'im.chat.access_event.bot_p2p_chat_entered_v1': async (data: any) => {
      logger.info({ eventId: data.header?.event_id }, 'Bot entered P2P chat');
      return {};
    },
    'im.message.message_read_v1': async (data: any) => {
      logger.debug({ eventId: data.header?.event_id }, 'Message read event received');
      return {};
    }
  };

  dispatcher.register(handlers);

  // Start WebSocket connection
  wsClient.start({ eventDispatcher: dispatcher }).catch((err) => {
    logger.error({ err }, 'Failed to start Feishu WebSocket client');
    process.exit(1);
  });

  // Start health check server (useful for both local and HF)
  const app = express();
  app.get('/health', (_req, res) => res.json({ status: 'ok', mode: 'websocket' }));
  app.listen(FEISHU_WEBHOOK_PORT, () => {
    logger.info({ port: FEISHU_WEBHOOK_PORT }, 'Health check server listening');
  });

  // Start IPC watcher
  startIpcWatcher();

  // Start scheduler
  startSchedulerLoop({
    sendMessage: async (jid: string, text: string) => {
      const result = await sendFeishuMessage(jid, text);
      if (!result) {
        logger.error({ jid }, 'Failed to send scheduled message');
      }
    },
    registeredGroups: () => registeredGroups,
    getSessions: () => sessions,
  });

  // Periodic sync
  setInterval(() => {
    syncGroupMetadata().catch((err) =>
      logger.error({ err }, 'Periodic sync failed'),
    );
  }, GROUP_SYNC_INTERVAL_MS);
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start NanoClaw (Feishu)');
  process.exit(1);
});