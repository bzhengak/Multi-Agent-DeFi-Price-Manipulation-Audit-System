import { saveJSON, loadJSON } from './blob';

// Settings file path in .storage
const SETTINGS_FILE = 'settings.json';

export interface AppSettings {
  // Etherscan V2 统一 API Key (所有链共用)
  etherscanApiKey?: string;
  // Per-chain API Keys (V2 向后兼容，优先使用统一 key)
  bscscanApiKey?: string;
  arbiscanApiKey?: string;
  basescanApiKey?: string;
  // Password (stored as bcrypt hash or plaintext)
  passwordHash?: string;
  // LLM
  llmModel?: string;
  // JWT
  jwtSecret?: string;
}

/**
 * Load settings from .storage/settings.json
 * Falls back to environment variables for each key
 */
export async function loadSettings(): Promise<AppSettings> {
  const data = await loadJSON<AppSettings>(SETTINGS_FILE);
  return data || {};
}

/**
 * Save settings to .storage/settings.json
 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  await saveJSON(SETTINGS_FILE, settings);
}

/**
 * Get a setting value, with .env fallback
 * Priority: settings.json > process.env > defaultValue
 */
export async function getSetting(key: keyof AppSettings, envKey?: string, defaultValue?: string): Promise<string | undefined> {
  const settings = await loadSettings();
  const value = settings[key];
  if (value) return value;

  // Fall back to environment variable
  if (envKey && process.env[envKey]) {
    return process.env[envKey];
  }

  return defaultValue;
}

/**
 * Get API key for a blockchain, checking settings first then env
 * V2 逻辑: 优先使用统一的 etherscanApiKey，然后回退到 per-chain key
 */
export async function getBlockchainApiKey(chain: string): Promise<string | undefined> {
  const settings = await loadSettings();

  // V2: 优先使用统一的 etherscanApiKey
  if (settings.etherscanApiKey) {
    return settings.etherscanApiKey;
  }
  if (process.env.ETHERSCAN_API_KEY) {
    return process.env.ETHERSCAN_API_KEY;
  }

  // 向后兼容: per-chain key
  const keyMap: Record<string, keyof AppSettings> = {
    ethereum: 'etherscanApiKey',
    bsc: 'bscscanApiKey',
    arbitrum: 'arbiscanApiKey',
    base: 'basescanApiKey',
    opbnb: 'bscscanApiKey',
  };

  const envMap: Record<string, string> = {
    ethereum: 'ETHERSCAN_API_KEY',
    bsc: 'BSCSCAN_API_KEY',
    arbitrum: 'ARBISCAN_API_KEY',
    base: 'BASESCAN_API_KEY',
    opbnb: 'BSCSCAN_API_KEY',
  };

  const settingKey = keyMap[chain.toLowerCase()];
  const envKeyName = envMap[chain.toLowerCase()];

  // Check settings.json per-chain key
  if (settingKey && settings[settingKey]) {
    return settings[settingKey];
  }

  // Fall back to env per-chain key
  if (envKeyName && process.env[envKeyName]) {
    return process.env[envKeyName];
  }

  return undefined;
}

/**
 * Get the password hash, checking settings first then env
 */
export async function getPasswordHash(): Promise<string | undefined> {
  const settings = await loadSettings();
  if (settings.passwordHash) return settings.passwordHash;
  return process.env.USER_PASSWORD_HASH;
}

/**
 * Mask a string for display, showing only first/last few chars
 */
export function maskSecret(value: string | undefined): string {
  if (!value) return '';
  if (value.length <= 8) return '••••••••';
  return value.substring(0, 4) + '•••••••' + value.substring(value.length - 4);
}
