import youtubeDl from 'youtube-dl-exec';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import { isValidYouTubeUrl, extractVideoId, validateFileSize } from '../utils/validation.js';

/**
 * Download options for YouTube videos
 */
export interface DownloadOptions {
  taskId: string;
  outputDir: string;
  format?: string;
  quality?: string;
  onProgress?: (progress: number) => void;
}

/**
 * Download result information
 */
export interface DownloadResult {
  videoPath: string;
  audioPath: string;
  title: string;
  duration: number;
  videoId: string;
  thumbnail?: string;
  description?: string;
  uploader?: string;
  uploadDate?: string;
  viewCount?: number;
  likeCount?: number;
  fileSize: number;
}

/**
 * Download error class
 */
export class DownloadError extends Error {
  constructor(message: string, public code: string, public details?: any) {
    super(message);
    this.name = 'DownloadError';
  }
}

/**
 * YouTube downloader service
 */
export class YouTubeDownloader {
  constructor() {
    // youtube-dl-exec handles binary management automatically
  }

  /**
   * Initialize yt-dlp binary
   */
  async initialize(): Promise<void> {
    try {
      // Test the binary
      await this.testBinary();
    } catch (error) {
      throw new DownloadError(
        `Failed to initialize yt-dlp: ${error instanceof Error ? error.message : String(error)}`,
        'INIT_FAILED',
        error
      );
    }
  }

  /**
   * Download YouTube video
   */
  async downloadVideo(url: string, options: DownloadOptions): Promise<DownloadResult> {
    // Validate URL
    if (!isValidYouTubeUrl(url)) {
      throw new DownloadError('Invalid YouTube URL', 'INVALID_URL', { url });
    }

    // Extract video ID
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new DownloadError('Could not extract video ID from URL', 'INVALID_VIDEO_ID', { url });
    }

    // Ensure output directory exists
    await fs.mkdir(options.outputDir, { recursive: true });

    try {
      // First, get video information
      const videoInfo = await this.getVideoInfo(url);
      
      // Validate video duration (max 4 hours)
      if (videoInfo.duration > 4 * 60 * 60) {
        throw new DownloadError('Video duration exceeds maximum limit of 4 hours', 'DURATION_EXCEEDED', { 
          duration: videoInfo.duration,
          maxDuration: 4 * 60 * 60
        });
      }

      // Download video
      const videoPath = await this.downloadVideoFile(url, options);
      
      // Validate file size
      if (!validateFileSize(videoPath)) {
        throw new DownloadError('Downloaded file exceeds size limit', 'FILE_SIZE_EXCEEDED', { 
          filePath: videoPath 
        });
      }

      // Get file size
      const stats = await fs.stat(videoPath);
      const fileSize = stats.size;

      return {
        videoPath,
        audioPath: '', // Will be set by audio processor
        title: videoInfo.title,
        duration: videoInfo.duration,
        videoId,
        thumbnail: videoInfo.thumbnail,
        description: videoInfo.description,
        uploader: videoInfo.uploader,
        uploadDate: videoInfo.uploadDate,
        viewCount: videoInfo.viewCount,
        likeCount: videoInfo.likeCount,
        fileSize,
      };
    } catch (error) {
      if (error instanceof DownloadError) {
        throw error;
      }
      
      throw new DownloadError(
        `Download failed: ${error instanceof Error ? error.message : String(error)}`,
        'DOWNLOAD_FAILED',
        error
      );
    }
  }

  /**
   * Get video information without downloading
   */
  async getVideoInfo(url: string): Promise<{
    title: string;
    duration: number;
    thumbnail: string;
    description: string;
    uploader: string;
    uploadDate: string;
    viewCount: number;
    likeCount: number;
    formats: any[];
  }> {
    try {
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        skipDownload: true,
      });
      
      // Type guard to ensure we have an object, not a string
      if (typeof info === 'string') {
        throw new DownloadError('Failed to get video info: received string instead of object', 'INFO_PARSE_ERROR');
      }
      
      return {
        title: info.title || 'Unknown Title',
        duration: info.duration || 0,
        thumbnail: info.thumbnail || '',
        description: info.description || '',
        uploader: info.uploader || 'Unknown',
        uploadDate: info.upload_date || '',
        viewCount: info.view_count || 0,
        likeCount: (info as any).like_count || 0,
        formats: info.formats || [],
      };
    } catch (error) {
      throw new DownloadError(
        `Failed to get video info: ${error instanceof Error ? error.message : String(error)}`,
        'INFO_FAILED',
        error
      );
    }
  }

  /**
   * Download video file
   */
  private async downloadVideoFile(url: string, options: DownloadOptions): Promise<string> {
    const finalPath = path.join(options.outputDir, 'original.mp4');
    
    try {
      await youtubeDl(url, {
        output: finalPath,
        format: options.format || 'best[ext=mp4][height<=1080]',
        noPlaylist: true,
        noWarnings: true,
        mergeOutputFormat: 'mp4',
      });

      if (existsSync(finalPath)) {
        return finalPath;
      } else {
        throw new DownloadError(
          'Download completed but file not found',
          'FILE_NOT_FOUND',
          { expectedPath: finalPath }
        );
      }
    } catch (error) {
      throw new DownloadError(
        `Download process failed: ${error instanceof Error ? error.message : String(error)}`,
        'PROCESS_FAILED',
        error
      );
    }
  }

  /**
   * Test yt-dlp binary
   */
  private async testBinary(): Promise<void> {
    try {
      // Test with version command
      await youtubeDl('--version');
      console.log('yt-dlp/youtube-dl binary is working');
    } catch (error) {
      throw new DownloadError(
        `yt-dlp binary test failed: ${error instanceof Error ? error.message : String(error)}`,
        'BINARY_TEST_FAILED',
        error
      );
    }
  }

  /**
   * Get available video formats
   */
  async getAvailableFormats(url: string): Promise<any[]> {
    try {
      const info = await this.getVideoInfo(url);
      return info.formats.filter(format => format.ext === 'mp4' || format.ext === 'webm');
    } catch (error) {
      throw new DownloadError(
        `Failed to get formats: ${error instanceof Error ? error.message : String(error)}`,
        'FORMATS_FAILED',
        error
      );
    }
  }

  /**
   * Get optimal format for processing
   */
  async getOptimalFormat(url: string): Promise<string> {
    try {
      const formats = await this.getAvailableFormats(url);
      
      // Prefer 720p MP4 for processing efficiency
      const preferredFormat = formats.find(f => 
        f.ext === 'mp4' && 
        f.height <= 720 && 
        f.height >= 480
      );
      
      if (preferredFormat) {
        return preferredFormat.format_id;
      }
      
      // Fallback to best MP4
      return 'best[ext=mp4][height<=1080]';
    } catch (error) {
      console.warn('Failed to get optimal format, using default:', error);
      return 'best[ext=mp4][height<=1080]';
    }
  }

  /**
   * Download thumbnail
   */
  async downloadThumbnail(url: string, outputDir: string): Promise<string | null> {
    try {
      const thumbnailPath = path.join(outputDir, 'thumbnail.jpg');
      
      await youtubeDl(url, {
        writeThumbnail: true,
        skipDownload: true,
        output: path.join(outputDir, 'thumbnail.%(ext)s'),
      });

      if (existsSync(thumbnailPath)) {
        return thumbnailPath;
      } else {
        return null;
      }
    } catch (error) {
      console.warn('Failed to download thumbnail:', error);
      return null;
    }
  }

  /**
   * Clean up temporary files
   */
  async cleanup(): Promise<void> {
    // Clean up any temporary files if needed
    // This could include partial downloads, etc.
  }
}

/**
 * Default YouTube downloader instance
 */
export const youTubeDownloader = new YouTubeDownloader();