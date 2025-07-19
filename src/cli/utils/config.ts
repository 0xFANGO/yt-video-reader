import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { z } from 'zod';

/**
 * CLI Configuration schema
 */
const CLIConfigSchema = z.object({
  defaultLanguage: z.string().default('auto'),
  defaultPriority: z.enum(['low', 'normal', 'high']).default('normal'),
  apiBaseUrl: z.string().default('http://localhost:3000/trpc'),
  maxConcurrentTasks: z.number().min(1).max(10).default(3),
  autoOpenFiles: z.boolean().default(false),
  progressAnimations: z.boolean().default(true),
  theme: z.enum(['light', 'dark', 'auto']).default('auto'),
  showTimestamps: z.boolean().default(true),
  retryAttempts: z.number().min(1).max(5).default(3),
  requestTimeout: z.number().min(5000).max(60000).default(30000), // milliseconds
});

/**
 * CLI Configuration type
 */
export type CLIConfig = z.infer<typeof CLIConfigSchema>;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: CLIConfig = {
  defaultLanguage: 'auto',
  defaultPriority: 'normal',
  apiBaseUrl: 'http://localhost:3000/trpc',
  maxConcurrentTasks: 3,
  autoOpenFiles: false,
  progressAnimations: true,
  theme: 'auto',
  showTimestamps: true,
  retryAttempts: 3,
  requestTimeout: 30000,
};

/**
 * Configuration file path
 */
const CONFIG_DIR = join(homedir(), '.yt-cli');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/**
 * Ensure configuration directory exists
 */
async function ensureConfigDirectory(): Promise<void> {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load configuration from file or return defaults
 */
export async function loadConfig(): Promise<CLIConfig> {
  try {
    await ensureConfigDirectory();
    
    if (!existsSync(CONFIG_FILE)) {
      // Create default config file if it doesn't exist
      await saveConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }

    const configData = await readFile(CONFIG_FILE, 'utf-8');
    const parsedConfig = JSON.parse(configData);
    
    // Validate and merge with defaults
    const validatedConfig = CLIConfigSchema.parse({
      ...DEFAULT_CONFIG,
      ...parsedConfig,
    });

    return validatedConfig;
  } catch (error) {
    console.warn('Failed to load config, using defaults:', error instanceof Error ? error.message : String(error));
    return DEFAULT_CONFIG;
  }
}

/**
 * Save configuration to file
 */
export async function saveConfig(config: CLIConfig): Promise<void> {
  try {
    await ensureConfigDirectory();
    
    // Validate configuration before saving
    const validatedConfig = CLIConfigSchema.parse(config);
    
    await writeFile(CONFIG_FILE, JSON.stringify(validatedConfig, null, 2), 'utf-8');
  } catch (error) {
    throw new Error(`Failed to save configuration: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Update specific configuration values
 */
export async function updateConfig(updates: Partial<CLIConfig>): Promise<CLIConfig> {
  const currentConfig = await loadConfig();
  const newConfig = { ...currentConfig, ...updates };
  
  await saveConfig(newConfig);
  return newConfig;
}

/**
 * Reset configuration to defaults
 */
export async function resetConfig(): Promise<CLIConfig> {
  await saveConfig(DEFAULT_CONFIG);
  return DEFAULT_CONFIG;
}

/**
 * Get configuration value with environment variable override
 */
export function getConfigValue<K extends keyof CLIConfig>(
  config: CLIConfig,
  key: K,
  envVar?: string
): CLIConfig[K] {
  // Check for environment variable override
  if (envVar && process.env[envVar]) {
    const envValue = process.env[envVar];
    
    // Type-safe parsing based on config value type
    switch (typeof config[key]) {
      case 'boolean':
        return (envValue.toLowerCase() === 'true') as CLIConfig[K];
      case 'number':
        const num = parseInt(envValue, 10);
        return (isNaN(num) ? config[key] : num) as CLIConfig[K];
      default:
        return envValue as CLIConfig[K];
    }
  }
  
  return config[key];
}

/**
 * Validate configuration object
 */
export function validateConfig(config: any): { isValid: boolean; errors: string[] } {
  try {
    CLIConfigSchema.parse(config);
    return { isValid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: error.errors.map(err => `${err.path.join('.')}: ${err.message}`),
      };
    }
    
    return {
      isValid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

/**
 * Get configuration file path
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * Check if configuration file exists
 */
export function configExists(): boolean {
  return existsSync(CONFIG_FILE);
}

/**
 * Configuration change listener type
 */
export type ConfigChangeListener = (config: CLIConfig) => void;

/**
 * Configuration manager class for reactive updates
 */
export class ConfigManager {
  private config: CLIConfig = DEFAULT_CONFIG;
  private listeners: ConfigChangeListener[] = [];

  constructor() {
    this.loadConfig();
  }

  async loadConfig(): Promise<CLIConfig> {
    this.config = await loadConfig();
    this.notifyListeners();
    return this.config;
  }

  async updateConfig(updates: Partial<CLIConfig>): Promise<CLIConfig> {
    this.config = await updateConfig(updates);
    this.notifyListeners();
    return this.config;
  }

  getConfig(): CLIConfig {
    return { ...this.config };
  }

  subscribe(listener: ConfigChangeListener): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.config));
  }
}

/**
 * Global configuration manager instance
 */
export const configManager = new ConfigManager();