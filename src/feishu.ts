/**
 * Feishu (Lark) Channel for NanoClaw
 * Handles messaging via Feishu/Lark webhooks and API
 */

import crypto from 'crypto';
import * as lark from '@larksuiteoapi/node-sdk';

import {
  FEISHU_APP_ID,
  FEISHU_APP_SECRET,
  FEISHU_ENCRYPT_KEY,
  FEISHU_VERIFICATION_TOKEN,
} from './config.js';
import { logger } from './logger.js';

// Feishu API base URL
const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';

// Store access token
let accessToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Initialize Feishu WebSocket client
 */
export function createFeishuWSClient() {
  return new lark.WSClient({
    appId: FEISHU_APP_ID,
    appSecret: FEISHU_APP_SECRET,
  });
}

/**
 * Initialize Feishu Event Dispatcher
 */
export function createFeishuEventDispatcher() {
  return new lark.EventDispatcher({
    encryptKey: FEISHU_ENCRYPT_KEY,
    verificationToken: FEISHU_VERIFICATION_TOKEN,
  });
}

/**
 * Get tenant access token for API calls
 */
async function getAccessToken(): Promise<string> {
  // Return cached token if still valid
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }

  try {
    const response = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: FEISHU_APP_ID,
        app_secret: FEISHU_APP_SECRET,
      }),
    });

    const data = await response.json() as { code: number; msg?: string; tenant_access_token?: string; expire?: number };

    if (data.code !== 0) {
      logger.error({ code: data.code, msg: data.msg }, 'Failed to get Feishu access token');
      throw new Error('Failed to get access token');
    }

    if (!data.tenant_access_token) {
      throw new Error('No access token in response');
    }

    accessToken = data.tenant_access_token;
    // Token expires in 2 hours, refresh 5 minutes early
    tokenExpiry = Date.now() + ((data.expire || 7200) - 300) * 1000;

    return accessToken;
  } catch (err) {
    logger.error({ err }, 'Error getting Feishu access token');
    throw err;
  }
}

export interface FeishuMessage {
  message_id: string;
  chat_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  message_type: 'text' | 'post' | 'interactive';
  timestamp: number;
  create_time: string;
}

export interface FeishuUser {
  user_id: string;
  name: string;
  avatar_url?: string;
}

export interface FeishuChat {
  chat_id: string;
  name: string;
  avatar_url?: string;
  chat_type: 'group' | 'p2p' | 'bot';
}

/**
 * Verify Feishu webhook signature
 */
export function verifyFeishuSignature(
  timestamp: string,
  nonce: string,
  body: string,
  signature: string,
): boolean {
  if (!FEISHU_ENCRYPT_KEY) {
    logger.debug('No FEISHU_ENCRYPT_KEY configured, skipping signature verification');
    return true;
  }

  const signStr = `${timestamp}${nonce}${FEISHU_ENCRYPT_KEY}${body}`;
  const expectedSignature = crypto
    .createHash('sha256')
    .update(signStr)
    .digest('hex');

  const isValid = signature === expectedSignature;

  if (!isValid) {
    logger.warn({
      timestamp,
      nonce,
      received: signature,
      expected: expectedSignature.substring(0, 16) + '...',
      bodyLength: body.length,
    }, 'Feishu signature verification failed');
  }

  return isValid;
}

/**
 * Verify Feishu verification token for URL verification challenge
 */
export function verifyFeishuToken(token: string): boolean {
  if (!FEISHU_VERIFICATION_TOKEN) {
    logger.debug('No FEISHU_VERIFICATION_TOKEN configured, skipping token verification');
    return true;
  }

  const isValid = token === FEISHU_VERIFICATION_TOKEN;

  if (!isValid) {
    logger.warn({
      received: token,
      expected: FEISHU_VERIFICATION_TOKEN.substring(0, 8) + '...',
    }, 'Feishu verification token mismatch');
  }

  return isValid;
}

/**
 * Send text message to Feishu chat
 */
export async function sendFeishuMessage(
  chatId: string,
  text: string,
): Promise<{ message_id: string } | null> {
  try {
    const token = await getAccessToken();

    const response = await fetch(`${FEISHU_API_BASE}/im/v1/messages?receive_id_type=chat_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      }),
    });

    const data = await response.json() as { code: number; msg?: string; data?: { message_id?: string } };

    if (data.code !== 0) {
      logger.error({ chatId, code: data.code, msg: data.msg }, 'Failed to send Feishu message');
      return null;
    }

    return { message_id: data.data?.message_id || '' };
  } catch (err) {
    logger.error({ chatId, err }, 'Error sending Feishu message');
    return null;
  }
}

/**
 * Get user info from Feishu
 */
export async function getFeishuUser(userId: string): Promise<FeishuUser | null> {
  try {
    const token = await getAccessToken();

    const response = await fetch(`${FEISHU_API_BASE}/contact/v3/users/${userId}?user_id_type=user_id`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json() as { code: number; data?: { user?: { user_id?: string; name?: string; avatar?: { avatar_72?: string } } } };

    if (data.code !== 0) {
      logger.warn({ userId, code: data.code }, 'Failed to get Feishu user');
      return null;
    }

    const user = data.data?.user;
    if (!user) return null;

    return {
      user_id: user.user_id || userId,
      name: user.name || 'Unknown',
      avatar_url: user.avatar?.avatar_72,
    };
  } catch (err) {
    logger.error({ userId, err }, 'Error getting Feishu user');
    return null;
  }
}

/**
 * Get chat info from Feishu
 */
export async function getFeishuChat(chatId: string): Promise<FeishuChat | null> {
  try {
    const token = await getAccessToken();

    const response = await fetch(`${FEISHU_API_BASE}/im/v1/chats/${chatId}?chat_id_type=chat_id`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json() as { code: number; data?: { chat?: { chat_id?: string; name?: string; avatar?: string; chat_type?: string } } };

    if (data.code !== 0) {
      logger.warn({ chatId, code: data.code }, 'Failed to get Feishu chat');
      return null;
    }

    const chat = data.data?.chat;
    if (!chat) return null;

    return {
      chat_id: chat.chat_id || chatId,
      name: chat.name || 'Unknown Chat',
      avatar_url: chat.avatar,
      chat_type: chat.chat_type as 'group' | 'p2p' | 'bot',
    };
  } catch (err) {
    logger.error({ chatId, err }, 'Error getting Feishu chat');
    return null;
  }
}

/**
 * Parse Feishu event
 */
export async function parseFeishuMessageEvent(data: any): Promise<FeishuMessage | null> {
  // Support both wrapped 'event' structure (webhook) and flat structure (websocket)
  const event = data.event || data;
  const msg = event.message;
  const sender = event.sender;
  
  if (!msg) return null;

  let content = '';
  try {
    const parsed = JSON.parse(msg.content);
    content = parsed.text || '';

    // Handle images - Feishu images require complex authentication
    // Inform user to provide public URL for analysis
    if (parsed.image_key) {
      content = '[Image sent. To analyze images, please provide a public URL or describe what you want to know.]';
    } else if (parsed.file_key) {
      content = '[File sent]';
    } else if (parsed.audio_key) {
      content = '[Audio sent]';
    } else if (parsed.video_key) {
      content = '[Video sent]';
    } else if (parsed.sticker_key) {
      content = '[Sticker sent]';
    }
  } catch {
    content = msg.content;
  }

  return {
    message_id: msg.message_id,
    chat_id: msg.chat_id,
    sender_id: sender?.sender_id?.open_id || sender?.sender_id?.user_id || '',
    sender_name: sender?.name || 'Unknown',
    content,
    message_type: msg.message_type as 'text' | 'post' | 'interactive',
    timestamp: parseInt(msg.create_time),
    create_time: new Date(parseInt(msg.create_time)).toISOString(),
  };
}
