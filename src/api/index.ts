import { router, protectedProcedure } from './trpc.js';
import { tasksRouter } from './tasks.js';
import { filesRouter } from './files.js';
import { eventsRouter } from './events.js';
import { z } from 'zod';

/**
 * Main tRPC application router
 */
export const appRouter = router({
  /**
   * Task management endpoints
   */
  tasks: tasksRouter,

  /**
   * File management endpoints
   */
  files: filesRouter,

  /**
   * Event/SSE management endpoints
   */
  events: eventsRouter,

  /**
   * Health check endpoint
   */
  health: router({
    check: protectedProcedure.query(async () => {
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      };
    }),
  }),

  /**
   * System information endpoint
   */
  system: router({
    info: protectedProcedure.query(async () => {
      return {
        name: 'YouTube Video Processor',
        version: '1.0.0',
        description: 'AI-powered YouTube video processing system',
        features: [
          'YouTube video downloading',
          'Audio extraction and processing',
          'Voice separation',
          'Whisper.cpp transcription',
          'AI-powered summarization',
          'Real-time progress tracking',
        ],
        timestamp: new Date().toISOString(),
      };
    }),

    stats: protectedProcedure.query(async () => {
      try {
        const { fileManager } = await import('../utils/file-manager.js');
        const { queueConfig } = await import('../utils/queue-config.js');

        // Get storage statistics
        const storageStats = await fileManager.getStorageStats();
        
        // Get queue statistics
        const queueStats = await queueConfig.getQueueStats('video-processing');

        // Get system information
        const systemInfo = {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          memory: {
            used: process.memoryUsage().heapUsed,
            total: process.memoryUsage().heapTotal,
            external: process.memoryUsage().external,
          },
          uptime: process.uptime(),
        };

        return {
          storage: storageStats,
          queue: queueStats,
          system: systemInfo,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        console.error('Failed to get system stats:', error);
        return {
          error: 'Failed to get system statistics',
          timestamp: new Date().toISOString(),
        };
      }
    }),
  }),
});

/**
 * Export the app router type for client-side type inference
 */
export type AppRouter = typeof appRouter;

/**
 * tRPC context (can be extended with authentication, etc.)
 */
export interface TRPCContext {
  // Add context properties here (user, session, etc.)
}

/**
 * Create tRPC context
 */
export function createTRPCContext(): TRPCContext {
  return {
    // Initialize context properties
  };
}

/**
 * Export individual routers for testing
 */
export { tasksRouter, filesRouter, eventsRouter };

/**
 * Export tRPC utilities
 */
export { router, protectedProcedure } from './trpc.js';

/**
 * API metadata
 */
export const API_METADATA = {
  name: 'YouTube Video Processor API',
  version: '1.0.0',
  description: 'tRPC API for YouTube video processing with AI-powered summaries',
  endpoints: {
    tasks: {
      create: 'Create a new video processing task',
      getStatus: 'Get task status and progress',
      getFiles: 'Get task output files',
      delete: 'Delete a task and its files',
      list: 'List all tasks',
      getStats: 'Get task statistics',
      healthCheck: 'Check task processing health',
      cleanupOld: 'Clean up old tasks',
      retry: 'Retry a failed task',
    },
    files: {
      getInfo: 'Get file information',
      list: 'List files for a task',
      exists: 'Check if file exists',
      getDownloadUrl: 'Get file download URL',
      getStats: 'Get file statistics',
    },
    events: {
      getStats: 'Get SSE connection statistics',
      sendTestMessage: 'Send test message to subscribers',
      getTaskSubscriptions: 'Get active subscriptions for a task',
    },
    system: {
      info: 'Get system information',
      stats: 'Get system statistics',
    },
    health: {
      check: 'Health check endpoint',
    },
  },
  features: [
    'End-to-end type safety with TypeScript',
    'Real-time progress updates via SSE',
    'File download and streaming support',
    'Comprehensive error handling',
    'Queue-based processing with BullMQ',
    'AI-powered summarization with OpenAI',
    'Local Whisper.cpp transcription',
    'Voice separation with Demucs',
    'Automatic file cleanup',
    'Progress tracking and statistics',
  ],
  dependencies: {
    runtime: [
      'yt-dlp-wrap',
      'whisper.cpp',
      'demucs-wasm',
      'bullmq',
      'openai',
      'ffmpeg-static',
    ],
    services: [
      'Redis (BullMQ)',
      'OpenAI API',
      'Whisper.cpp',
      'FFmpeg',
    ],
  },
} as const;