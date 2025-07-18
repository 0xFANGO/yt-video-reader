import { describe, it, expect, vi, beforeEach } from 'vitest';
import { YouTubeDownloader, DownloadError } from '../../../src/services/youtube-downloader.js';

// Mock youtube-dl-exec
vi.mock('youtube-dl-exec', () => ({
  default: vi.fn(),
}));

// Mock filesystem
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  promises: {
    mkdir: vi.fn(),
    stat: vi.fn(),
  },
}));

describe('YouTubeDownloader', () => {
  let downloader: YouTubeDownloader;

  beforeEach(() => {
    downloader = new YouTubeDownloader();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance successfully', () => {
      expect(downloader).toBeInstanceOf(YouTubeDownloader);
    });
  });

  describe('getVideoInfo', () => {
    it('should handle video info request', async () => {
      const mockYoutubeDl = await import('youtube-dl-exec');
      const youtubeDl = mockYoutubeDl.default as any;
      
      youtubeDl.mockResolvedValue({
        title: 'Test Video',
        duration: 120,
        thumbnail: 'https://example.com/thumb.jpg',
        description: 'Test description',
        uploader: 'Test Channel',
        upload_date: '20231201',
        view_count: 1000,
        like_count: 50,
        formats: [],
      });

      const result = await downloader.getVideoInfo('https://youtube.com/watch?v=test');
      
      expect(result).toEqual({
        title: 'Test Video',
        duration: 120,
        thumbnail: 'https://example.com/thumb.jpg',
        description: 'Test description',
        uploader: 'Test Channel',
        uploadDate: '20231201',
        viewCount: 1000,
        likeCount: 50,
        formats: [],
      });
    });

    it('should handle string response from youtube-dl', async () => {
      const mockYoutubeDl = await import('youtube-dl-exec');
      const youtubeDl = mockYoutubeDl.default as any;
      
      youtubeDl.mockResolvedValue('string response');

      await expect(
        downloader.getVideoInfo('https://youtube.com/watch?v=test')
      ).rejects.toThrow(DownloadError);
    });
  });

  describe('getOptimalFormat', () => {
    it('should return default format when no formats available', async () => {
      vi.spyOn(downloader, 'getAvailableFormats').mockResolvedValue([]);
      
      const format = await downloader.getOptimalFormat('https://youtube.com/watch?v=test');
      expect(format).toBe('best[ext=mp4][height<=1080]');
    });

    it('should handle errors gracefully', async () => {
      vi.spyOn(downloader, 'getAvailableFormats').mockRejectedValue(new Error('Failed'));
      
      const format = await downloader.getOptimalFormat('https://youtube.com/watch?v=test');
      expect(format).toBe('best[ext=mp4][height<=1080]');
    });
  });

  describe('downloadVideo', () => {
    it('should reject invalid YouTube URLs', async () => {
      await expect(
        downloader.downloadVideo('https://not-youtube.com/video', {
          taskId: 'test',
          outputDir: '/tmp',
        })
      ).rejects.toThrow(DownloadError);
    });

    it('should reject URLs without extractable video ID', async () => {
      await expect(
        downloader.downloadVideo('https://youtube.com', {
          taskId: 'test',
          outputDir: '/tmp',
        })
      ).rejects.toThrow(DownloadError);
    });
  });
});