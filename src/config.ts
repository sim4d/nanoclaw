import path from 'path';

export const ASSISTANT_NAME = process.env.ASSISTANT_NAME || 'Andy';
export const POLL_INTERVAL = 2000;
export const SCHEDULER_POLL_INTERVAL = 60000;

// Absolute paths needed for container mounts
const PROJECT_ROOT = process.cwd();
const HOME_DIR = process.env.HOME || '/Users/user';

// Mount security: allowlist stored OUTSIDE project root, never mounted into containers
export const MOUNT_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'nanoclaw',
  'mount-allowlist.json',
);
export const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');
export const GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups');
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');
export const MAIN_GROUP_FOLDER = 'main';

export const CONTAINER_IMAGE =
  process.env.CONTAINER_IMAGE || 'nanoclaw-agent:latest';
export const CONTAINER_TIMEOUT = parseInt(
  process.env.CONTAINER_TIMEOUT || '300000',
  10,
);
export const CONTAINER_MAX_OUTPUT_SIZE = parseInt(
  process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760',
  10,
); // 10MB default
export const IPC_POLL_INTERVAL = 1000;

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const TRIGGER_PATTERN = new RegExp(
  `^@?${escapeRegex(ASSISTANT_NAME)}\\\\b`,
  'i',
);

// Timezone for scheduled tasks (cron expressions, etc.)
// Uses system timezone by default
export const TIMEZONE =
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;

// Feishu (Lark) Configuration
// NOTE: This project uses WebSocket mode for Feishu (both local and HF deployments)
// Only FEISHU_APP_ID and FEISHU_APP_SECRET are required for WebSocket mode
// FEISHU_ENCRYPT_KEY and FEISHU_VERIFICATION_TOKEN are ONLY needed for webhook mode
export const FEISHU_APP_ID = process.env.FEISHU_APP_ID || '';
export const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || '';
export const FEISHU_ENCRYPT_KEY = process.env.FEISHU_ENCRYPT_KEY || ''; // Webhook only
export const FEISHU_VERIFICATION_TOKEN = process.env.FEISHU_VERIFICATION_TOKEN || ''; // Webhook only
export const FEISHU_WEBHOOK_PORT = parseInt(
  process.env.FEISHU_WEBHOOK_PORT || process.env.PORT || '3000',
  10,
);

// LLM Configuration
// Supports Anthropic API (Claude) or compatible proxies
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
export const ANTHROPIC_AUTH_TOKEN = process.env.ANTHROPIC_AUTH_TOKEN || '';
export const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || '';
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || '';
export const ANTHROPIC_SMALL_FAST_MODEL = process.env.ANTHROPIC_SMALL_FAST_MODEL || '';
