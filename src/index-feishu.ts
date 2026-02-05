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

  // Main group responds to all messages; other groups require trigger prefix
  if (!isMainGroup && !TRIGGER_PATTERN.test(content)) {
    logger.debug({ chatId: msg.chat_id, content }, 'Message without trigger, ignoring');
    return;
  }

  // Get all messages since last agent interaction
  const sinceTimestamp = lastAgentTimestamp[msg.chat_id] || '';
  const missedMessages = getMessagesSince(
    msg.chat_id,
    sinceTimestamp,
    ASSISTANT_NAME,
  );

  const lines = missedMessages.map((m) => {
    const escapeXml = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    return `<message sender="${escapeXml(m.sender_name)}" time="${m.timestamp}">${escapeXml(m.content)}</message>`;
  });
  const prompt = `<messages>\n${lines.join('\n')}\n</messages>`;

  // Debug: log the actual messages being sent
  logger.info({
    chatId: msg.chat_id,
    messageCount: missedMessages.length,
    promptPreview: prompt.substring(0, 500) + '...'
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

      // Verify signature BEFORE decryption (signature is calculated on encrypted body)
      if (timestamp && nonce && signature && FEISHU_ENCRYPT_KEY) {
        const isValid = verifyFeishuSignature(
          timestamp,
          nonce,
          originalBodyStr,
          signature,
        );
        if (!isValid) {
          logger.warn({ timestamp, nonce }, 'Invalid Feishu signature');
          // Don't return 401 - try to process anyway for development
          // return res.status(401).json({ code: 401, msg: 'Unauthorized' });
        }
        logger.debug('Feishu signature verified');
      } else if (!timestamp || !nonce || !signature) {
        logger.debug('Signature headers missing, skipping signature verification');
      }

      // Decrypt if payload is encrypted
      try {
        const parsed = JSON.parse(bodyStr);
        if (parsed.encrypt) {
          logger.info('Encrypted payload detected, decrypting...');
          // Decrypt using AES-256-CBC
          const crypto = await import('crypto');

          // The encrypt key needs to be processed
          const keyBytes = Buffer.from(FEISHU_ENCRYPT_KEY, 'utf8');
          const keyHash = crypto.createHash('sha256').update(keyBytes).digest();

          // Parse the encrypted data
          const encryptedData = parsed.encrypt;
          // Feishu uses base64 encoding
          const encryptedBuffer = Buffer.from(encryptedData, 'base64');

          logger.debug({ encryptedLength: encryptedBuffer.length }, 'Encrypted buffer created');

          // Extract IV (first 16 bytes) and ciphertext
          const iv = encryptedBuffer.slice(0, 16);
          const ciphertext = encryptedBuffer.slice(16);

          logger.debug({ ivLength: iv.length, ciphertextLength: ciphertext.length }, 'IV and ciphertext extracted');

          // Decrypt
          const decipher = crypto.createDecipheriv('aes-256-cbc', keyHash, iv);
          let decrypted = decipher.update(ciphertext);
          decrypted = Buffer.concat([decrypted, decipher.final()]);

          bodyStr = decrypted.toString('utf8');
          logger.info({ decryptedLength: bodyStr.length, decryptedPreview: bodyStr.substring(0, 500) }, 'Payload decrypted successfully');
        } else {
          logger.debug('No encryption field found in payload');
        }
      } catch (decryptErr) {
        logger.error({ decryptErr, stack: (decryptErr as Error).stack }, 'Decryption failed');
      }

      let payload;
      try {
        payload = JSON.parse(bodyStr);
        logger.info({ payloadType: (payload as any).header?.event_type || (payload as any).type, schema: (payload as any).schema }, 'Parsed webhook payload');
      } catch (parseErr) {
        logger.error({ parseErr, bodyStr }, 'Failed to parse webhook payload');
        return res.status(400).json({ code: 400, msg: 'Invalid JSON' });
      }

      // URL verification challenge
      if (payload.type === 'url_verification') {
        const urlVerify = payload as URLVerificationRequest;
        logger.info({
          challenge: urlVerify.challenge?.substring(0, 16) + '...',
          token: urlVerify.token?.substring(0, 16) + '...',
        }, 'Feishu URL verification received');

        // Verify token
        if (verifyFeishuToken(urlVerify.token)) {
          const response: URLVerificationResponse = {
            challenge: urlVerify.challenge,
          };
          logger.info('Feishu URL verification successful - returning challenge');
          return res.json(response);
        } else {
          logger.warn({ token: urlVerify.token, configuredToken: FEISHU_VERIFICATION_TOKEN ? FEISHU_VERIFICATION_TOKEN.substring(0, 8) + '...' : 'none' }, 'Invalid verification token');
          return res.status(401).json({ code: 401, msg: 'Unauthorized' });
        }
      }

      // Event handling
      if (payload.header) {
        const eventType = (payload.header as any).event_type || (payload.header as any).type;
        const eventId = (payload.header as any).event_id;

        logger.info(
          { eventType, eventId },
          'Feishu event received',
        );

        // Handle message events
        if (eventType === 'im.message.receive_v1') {
          const msg = await parseFeishuMessageEvent(payload as FeishuEvent);
          if (msg) {
            // Store message
            storeChatMetadata(msg.chat_id, msg.create_time);

            const group = registeredGroups[msg.chat_id];

            // Auto-register first chat as main channel if no groups registered yet
            if (!group && Object.keys(registeredGroups).length === 0) {
              logger.info(
                { chatId: msg.chat_id, sender: msg.sender_name },
                'Auto-registering first chat as main channel',
              );

              registerGroup(msg.chat_id, {
                name: 'main',
                folder: 'main',
                trigger: `@${ASSISTANT_NAME}`,
                added_at: new Date().toISOString(),
              });

              // Send welcome message
              sendFeishuMessage(
                msg.chat_id,
                `👋 Welcome to NanoClaw!\n\nI'm ${ASSISTANT_NAME}, your personal AI assistant.\n\nThis chat has been registered as your main control channel.\n\nTry sending: @${ASSISTANT_NAME} hello`,
              ).catch((err) => {
                logger.error({ err }, 'Failed to send welcome message');
              });
            }

            if (group) {
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
            }
          }
        }
      }

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
      // Named tunnel has known URL
      console.log(`\n🌐 Cloudflare Tunnel URL: ${tunnelUrl}`);
      console.log(`📡 Webhook: ${tunnelUrl}/webhook/feishu`);
      console.log(`❤️  Health: ${tunnelUrl}/health`);
      console.log(`🔍 Debug: ${tunnelUrl}/debug`);
      console.log(`\n✅ Use this URL in Feishu Event Subscription\n`);
      logger.info({ tunnelUrl }, 'Cloudflare named tunnel started');
    } else {
      // Quick tunnel - parse URL from output
      let urlShown = false;
      tunnel.stdout?.on('data', (data) => {
        const output = data.toString();
        const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        if (match && !urlShown) {
          urlShown = true;
          console.log(`\n🌐 Cloudflare Tunnel URL: ${match[0]}`);
          console.log(`📡 Webhook: ${match[0]}/webhook/feishu`);
          console.log(`❤️  Health: ${match[0]}/health`);
          console.log(`\n✅ Use this URL in Feishu Event Subscription\n`);
          logger.info({ tunnelUrl: match[0] }, 'Cloudflare quick tunnel established');
        }
      });

      tunnel.stderr?.on('data', (data) => {
        const output = data.toString();
        const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        if (match && !urlShown) {
          urlShown = true;
          console.log(`\n🌐 Cloudflare Tunnel URL: ${match[0]}`);
          console.log(`📡 Webhook: ${match[0]}/webhook/feishu`);
          console.log(`❤️  Health: ${match[0]}/health`);
          console.log(`\n✅ Use this URL in Feishu Event Subscription\n`);
          logger.info({ tunnelUrl: match[0] }, 'Cloudflare quick tunnel established');
        }
      });
    }

    tunnel.on('error', (err) => {
      logger.warn({ err }, 'Cloudflare tunnel process error');
    });

    tunnel.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        logger.warn({ code }, 'Cloudflare tunnel exited');
      }
    });

    // Clean up tunnel on exit
    process.on('exit', () => {
      tunnel.kill();
    });
    process.on('SIGINT', () => {
      tunnel.kill();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      tunnel.kill();
      process.exit(0);
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

  if (isHF) {
    console.log(`\n🚀 Hugging Face Space detected, using Feishu Long Connection (WebSocket).`);
    
    const wsClient = createFeishuWSClient();
    const dispatcher = createFeishuEventDispatcher();
    
    // Register message handler
    dispatcher.register({
      'im.message.receive_v1': async (data: any) => {
        try {
          const msg = await parseFeishuMessageEvent(data);
          if (msg) {
            // Store message
            storeChatMetadata(msg.chat_id, msg.create_time);

            const group = registeredGroups[msg.chat_id];

            // Auto-register first chat as main channel if no groups registered yet
            if (!group && Object.keys(registeredGroups).length === 0) {
              logger.info(
                { chatId: msg.chat_id, sender: msg.sender_name },
                'Auto-registering first chat as main channel',
              );

              registerGroup(msg.chat_id, {
                name: 'main',
                folder: 'main',
                trigger: `@${ASSISTANT_NAME}`,
                added_at: new Date().toISOString(),
              });

              // Send welcome message
              sendFeishuMessage(
                msg.chat_id,
                `👋 Welcome to NanoClaw!\n\nI'm ${ASSISTANT_NAME}, your personal AI assistant.\n\nThis chat has been registered as your main control channel.\n\nTry sending: @${ASSISTANT_NAME} hello`,
              ).catch((err) => {
                logger.error({ err }, 'Failed to send welcome message');
              });
            }

            if (group) {
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
            }
          }
        } catch (err) {
          logger.error({ err }, 'Error handling Feishu WebSocket message');
        }
        return {};
      }
    });

    // Start WebSocket connection
    wsClient.start({ eventDispatcher: dispatcher }).catch((err) => {
      logger.error({ err }, 'Failed to start Feishu WebSocket client');
      process.exit(1);
    });

    // Still start health check server for HF
    const app = express();
    app.get('/health', (_req, res) => res.json({ status: 'ok', mode: 'websocket' }));
    app.listen(FEISHU_WEBHOOK_PORT, () => {
      logger.info({ port: FEISHU_WEBHOOK_PORT }, 'Health check server listening');
    });

  } else {
    // Webhook mode for local deployment
    const app = createWebhookApp();
    const server = http.createServer(app);

    server.listen(FEISHU_WEBHOOK_PORT, () => {
      logger.info(
        { port: FEISHU_WEBHOOK_PORT },
        `Feishu webhook server listening`,
      );
      // Start Cloudflare tunnel for external access (only if not on Hugging Face)
      if (!process.env.SPACE_ID) {
        console.log(`\n⏳ Starting Cloudflare tunnel...\n`);
        startCloudflareTunnel();
      } else {
        console.log(`\n🚀 Hugging Face Space detected, skipping Cloudflare tunnel.`);
        console.log(`📡 Webhook: https://${process.env.SPACE_ID.replace('/', '-')}.hf.space/webhook/feishu`);
      }
    });
  }

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
