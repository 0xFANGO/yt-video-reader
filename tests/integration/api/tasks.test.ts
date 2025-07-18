import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { appRouter } from '../../../src/api/index.js';
import { createTRPCMsw } from 'msw-trpc';
import { setupServer } from 'msw/node';

// Mock external dependencies
vi.mock('../../../src/services/youtube-downloader.js', () => ({
  youTubeDownloader: {
    initialize: vi.fn().mockResolvedValue(undefined),
    getVideoInfo: vi.fn().mockResolvedValue({
      title: 'Test Video',
      duration: 120,
      thumbnail: 'https://example.com/thumb.jpg',
      description: 'Test description',
      uploader: 'Test Channel',
      uploadDate: '20231201',
      viewCount: 1000,
      likeCount: 50,
      formats: [],
    }),
  },
}));

vi.mock('../../../src/utils/queue-config.js', () => ({
  queueConfig: {
    testConnection: vi.fn().mockResolvedValue(true),
    createVideoQueue: vi.fn().mockReturnValue({
      add: vi.fn().mockResolvedValue({ id: 'job-123' }),
    }),
    getQueueStats: vi.fn().mockResolvedValue({
      waiting: 0,
      active: 0,
      completed: 5,
      failed: 0,
      delayed: 0,
    }),
  },
}));

vi.mock('../../../src/utils/file-manager.js', () => ({
  fileManager: {
    createTaskDirectory: vi.fn().mockResolvedValue(undefined),
    saveManifest: vi.fn().mockResolvedValue(undefined),
    loadManifest: vi.fn().mockResolvedValue({
      taskId: 'test-task-123',
      status: 'pending',
      progress: 0,
      currentStep: 'initializing',
      whisperModel: 'large-v3',
      files: {},
      createdAt: new Date().toISOString(),
    }),
    taskDirectoryExists: vi.fn().mockReturnValue(true),
    getStorageStats: vi.fn().mockResolvedValue({
      totalTasks: 5,
      totalSize: 1024 * 1024 * 100, // 100MB
      oldestTask: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    }),
  },
}));

describe('Tasks API Integration', () => {
  const trpc = appRouter.createCaller({});

  beforeAll(() => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const result = await trpc.health.check();
      
      expect(result).toEqual({
        status: 'healthy',
        timestamp: expect.any(String),
        version: '1.0.0',
      });
    });
  });

  describe('System Info', () => {
    it('should return system information', async () => {
      const result = await trpc.system.info();
      
      expect(result).toEqual({
        name: 'YouTube Video Processor',
        version: '1.0.0',
        description: 'AI-powered YouTube video processing system',
        features: expect.arrayContaining([
          'YouTube video downloading',
          'Audio extraction and processing',
          'Voice separation',
          'Whisper.cpp transcription',
          'AI-powered summarization',
          'Real-time progress tracking',
        ]),
        timestamp: expect.any(String),
      });
    });

    it('should return system statistics', async () => {
      const result = await trpc.system.stats();
      
      expect(result).toHaveProperty('storage');
      expect(result).toHaveProperty('queue');
      expect(result).toHaveProperty('system');
      expect(result).toHaveProperty('timestamp');
      
      expect(result.storage).toEqual({
        totalTasks: 5,
        totalSize: 1024 * 1024 * 100,
        oldestTask: expect.any(String),
      });
      
      expect(result.queue).toEqual({
        waiting: 0,
        active: 0,
        completed: 5,
        failed: 0,
        delayed: 0,
      });
    });
  });

  describe('Task Operations', () => {
    it('should validate YouTube URL in task creation', async () => {
      await expect(
        trpc.tasks.create({
          link: 'https://not-youtube.com/video',
        })
      ).rejects.toThrow();
    });

    it('should handle task status retrieval', async () => {
      const result = await trpc.tasks.getStatus({
        taskId: 'test-task-123',
      });
      
      expect(result).toEqual({
        taskId: 'test-task-123',
        status: 'pending',
        progress: 0,
        currentStep: 'initializing',
        files: {},
        createdAt: expect.any(String),
        error: undefined,
        finishedAt: undefined,
        videoDuration: undefined,
        videoTitle: undefined,
      });
    });

    it('should handle task not found', async () => {
      const fileManager = await import('../../../src/utils/file-manager.js');
      vi.mocked(fileManager.fileManager.loadManifest).mockResolvedValueOnce(null);
      
      await expect(
        trpc.tasks.getStatus({ taskId: 'nonexistent' })
      ).rejects.toThrow('Task manifest not found');
    });
  });
});