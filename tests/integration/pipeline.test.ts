import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

describe('Video Processing Pipeline Integration', () => {
  
  beforeAll(() => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('Pipeline Components', () => {
    it('should have all required pipeline components available', async () => {
      // Test that we can import all the core components
      const { YouTubeDownloader } = await import('../../../src/services/youtube-downloader');
      const { AudioProcessor } = await import('../../../src/services/audio-processor');
      const { TranscriberService } = await import('../../../src/services/transcriber');
      const { AISummarizer } = await import('../../../src/services/ai-summarizer');
      const { fileManager } = await import('../../../src/utils/file-manager');
      const { queueConfig } = await import('../../../src/utils/queue-config');

      expect(YouTubeDownloader).toBeDefined();
      expect(AudioProcessor).toBeDefined();
      expect(TranscriberService).toBeDefined();
      expect(AISummarizer).toBeDefined();
      expect(fileManager).toBeDefined();
      expect(queueConfig).toBeDefined();
    });

    it('should validate YouTube URL before processing', async () => {
      const { isValidYouTubeUrl } = await import('../../../src/utils/validation');
      
      expect(isValidYouTubeUrl('https://youtube.com/watch?v=test123')).toBe(true);
      expect(isValidYouTubeUrl('https://not-youtube.com/video')).toBe(false);
    });

    it('should handle task manifest creation', async () => {
      const { createTaskManifest } = await import('../../../src/types/task');
      
      const manifest = createTaskManifest('test-task-123', {
        whisperModel: 'large-v3',
        language: 'auto',
        priority: 'normal',
      });
      
      expect(manifest).toEqual({
        taskId: 'test-task-123',
        status: 'pending',
        progress: 0,
        currentStep: 'initializing',
        whisperModel: 'large-v3',
        files: {},
        createdAt: expect.any(String),
      });
    });

    it('should validate environment configuration', async () => {
      const { validateEnvironment } = await import('../../../src/utils/validation');
      
      const result = validateEnvironment();
      
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('errors');
      expect(typeof result.isValid).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('Service Integration', () => {
    it('should have proper service dependencies', async () => {
      // Test that services can be instantiated
      const { YouTubeDownloader } = await import('../../../src/services/youtube-downloader');
      const { AudioProcessor } = await import('../../../src/services/audio-processor');
      const { TranscriberService } = await import('../../../src/services/transcriber');
      const { AISummarizer } = await import('../../../src/services/ai-summarizer');

      const downloader = new YouTubeDownloader();
      const audioProcessor = new AudioProcessor();
      const transcriber = new TranscriberService();
      const summarizer = new AISummarizer();

      expect(downloader).toBeInstanceOf(YouTubeDownloader);
      expect(audioProcessor).toBeInstanceOf(AudioProcessor);
      expect(transcriber).toBeInstanceOf(TranscriberService);
      expect(summarizer).toBeInstanceOf(AISummarizer);
    });
  });
});