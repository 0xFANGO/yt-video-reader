#!/usr/bin/env node

import { main } from '../cli/index.js';

/**
 * CLI entry point with proper error handling
 */
async function runCLI(): Promise<void> {
  try {
    await main();
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error instanceof Error ? error.message : String(error));
    
    // Show stack trace in development
    if (process.env.NODE_ENV === 'development') {
      console.error(error);
    }
    
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error.message);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  console.log('\nGracefully shutting down...');
  process.exit(0);
});

// Handle SIGTERM
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run the CLI
runCLI();