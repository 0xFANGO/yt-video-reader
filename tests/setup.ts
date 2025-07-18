import { beforeAll, afterAll } from 'vitest';

// Global test setup
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.STORAGE_PATH = './test-data';
  process.env.TEMP_PATH = './test-tmp';
});

afterAll(() => {
  // Cleanup after all tests
});

// Mock console methods to reduce noise in tests
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  log: () => {}, // Suppress logs in tests
  warn: () => {}, // Suppress warnings in tests
  error: originalConsole.error, // Keep errors for debugging
};