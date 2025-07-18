import { Job } from 'bullmq';
import { TaskProcessingData } from '../types/task.js';
import { youTubeDownloader } from '../services/youtube-downloader.js';
import { fileManager } from '../utils/file-manager.js';

/**
 * Download job data
 */
export interface DownloadJobData {
  taskId: string;
  url: string;
  options?: {
    quality?: string;
    format?: string;
    priority?: 'low' | 'normal' | 'high';
  };
}

/**
 * Download worker for handling YouTube video downloads
 */
export class DownloadWorker {
  /**
   * Process download job
   */
  async processDownloadJob(job: Job<DownloadJobData>): Promise<{
    taskId: string;
    downloadResult: any;
    status: 'completed' | 'failed';
    error?: string;
  }> {
    const { taskId, url, options } = job.data;
    const taskDir = fileManager.getTaskDirectory(taskId);

    console.log(`Starting download for task: ${taskId}`);
    console.log(`URL: ${url}`);
    console.log(`Options:`, options);

    try {
      // Initialize task directory
      await fileManager.createTaskDirectory(taskId);

      // Update job progress
      job.updateProgress(0);

      // Download video with progress tracking
      const downloadResult = await youTubeDownloader.downloadVideo(url, {
        taskId,
        outputDir: taskDir,
        format: options?.format || 'best[ext=mp4][height<=1080]',
        quality: options?.quality || 'best',
        onProgress: (progress) => {
          job.updateProgress(progress);
        },
      });

      // Download thumbnail if available
      const thumbnailPath = await youTubeDownloader.downloadThumbnail(url, taskDir);
      if (thumbnailPath) {
        console.log(`Thumbnail downloaded: ${thumbnailPath}`);
      }

      // Update task manifest
      await this.updateTaskManifest(taskId, {
        videoTitle: downloadResult.title,
        videoDuration: downloadResult.duration,
        files: {
          'original.mp4': downloadResult.videoPath,
          ...(thumbnailPath && { 'thumbnail.jpg': thumbnailPath }),
        },
      });

      console.log(`Download completed for task: ${taskId}`);
      console.log(`Video title: ${downloadResult.title}`);
      console.log(`Duration: ${downloadResult.duration} seconds`);
      console.log(`File size: ${Math.round(downloadResult.fileSize / 1024 / 1024)} MB`);

      return {
        taskId,
        downloadResult,
        status: 'completed',
      };
    } catch (error) {
      console.error(`Download failed for task ${taskId}:`, error);
      
      // Update task manifest with error
      await this.updateTaskManifest(taskId, {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        taskId,
        downloadResult: null,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get video information without downloading
   */
  async getVideoInfo(job: Job<{ url: string }>): Promise<{
    title: string;
    duration: number;
    thumbnail: string;
    description: string;
    uploader: string;
    formats: any[];
  }> {
    const { url } = job.data;

    try {
      const videoInfo = await youTubeDownloader.getVideoInfo(url);
      
      console.log(`Video info retrieved for: ${url}`);
      console.log(`Title: ${videoInfo.title}`);
      console.log(`Duration: ${videoInfo.duration} seconds`);
      console.log(`Uploader: ${videoInfo.uploader}`);

      return videoInfo;
    } catch (error) {
      console.error(`Failed to get video info for ${url}:`, error);
      throw error;
    }
  }

  /**
   * Validate YouTube URL
   */
  async validateUrl(job: Job<{ url: string }>): Promise<{
    isValid: boolean;
    videoId: string | null;
    error?: string;
  }> {
    const { url } = job.data;

    try {
      const { isValidYouTubeUrl, extractVideoId } = await import('../utils/validation.js');
      
      const isValid = isValidYouTubeUrl(url);
      const videoId = extractVideoId(url);

      if (!isValid) {
        return {
          isValid: false,
          videoId: null,
          error: 'Invalid YouTube URL format',
        };
      }

      if (!videoId) {
        return {
          isValid: false,
          videoId: null,
          error: 'Could not extract video ID from URL',
        };
      }

      // Try to get video info to verify the video exists
      try {
        await youTubeDownloader.getVideoInfo(url);
      } catch (error) {
        return {
          isValid: false,
          videoId,
          error: 'Video not found or not accessible',
        };
      }

      return {
        isValid: true,
        videoId,
      };
    } catch (error) {
      console.error(`URL validation failed for ${url}:`, error);
      return {
        isValid: false,
        videoId: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get available video formats
   */
  async getAvailableFormats(job: Job<{ url: string }>): Promise<{
    formats: any[];
    recommendedFormat: string;
  }> {
    const { url } = job.data;

    try {
      const formats = await youTubeDownloader.getAvailableFormats(url);
      const recommendedFormat = await youTubeDownloader.getOptimalFormat(url);

      console.log(`Found ${formats.length} formats for: ${url}`);
      console.log(`Recommended format: ${recommendedFormat}`);

      return {
        formats,
        recommendedFormat,
      };
    } catch (error) {
      console.error(`Failed to get formats for ${url}:`, error);
      throw error;
    }
  }

  /**
   * Update task manifest
   */
  private async updateTaskManifest(
    taskId: string,
    updates: any
  ): Promise<void> {
    try {
      let manifest = await fileManager.loadManifest(taskId);
      
      if (!manifest) {
        const { createDefaultManifest } = await import('../types/task.js');
        manifest = createDefaultManifest(taskId);
      }

      // Merge updates
      Object.assign(manifest, updates);

      // Merge files if provided
      if (updates.files) {
        manifest.files = { ...manifest.files, ...updates.files };
      }

      await fileManager.saveManifest(taskId, manifest);
    } catch (error) {
      console.error(`Failed to update task manifest for ${taskId}:`, error);
    }
  }

  /**
   * Get download statistics
   */
  async getDownloadStats(): Promise<{
    totalDownloads: number;
    successfulDownloads: number;
    failedDownloads: number;
    averageDownloadTime: number;
    averageFileSize: number;
  }> {
    // This would need to be tracked in a database or persistent storage
    // For now, return placeholder values
    return {
      totalDownloads: 0,
      successfulDownloads: 0,
      failedDownloads: 0,
      averageDownloadTime: 0,
      averageFileSize: 0,
    };
  }

  /**
   * Cleanup download resources
   */
  async cleanup(taskId: string): Promise<void> {
    try {
      await youTubeDownloader.cleanup();
      console.log(`Download cleanup completed for task: ${taskId}`);
    } catch (error) {
      console.error(`Download cleanup failed for task ${taskId}:`, error);
    }
  }

  /**
   * Estimate download time based on video info
   */
  estimateDownloadTime(duration: number, quality: string = 'best'): number {
    // Rough estimates based on typical download speeds
    // Assuming ~10 Mbps connection and various quality settings
    
    const qualityMultipliers = {
      'best': 1.0,
      '720p': 0.6,
      '480p': 0.4,
      '360p': 0.3,
    };

    const multiplier = qualityMultipliers[quality as keyof typeof qualityMultipliers] || 1.0;
    
    // Base estimate: ~3x video duration for download
    const baseTime = duration * 3;
    
    return Math.ceil(baseTime * multiplier);
  }
}

/**
 * Worker processor function for BullMQ
 */
export async function processDownloadJob(job: Job<DownloadJobData>): Promise<any> {
  const worker = new DownloadWorker();
  return await worker.processDownloadJob(job);
}

/**
 * Video info processor function for BullMQ
 */
export async function processVideoInfoJob(job: Job<{ url: string }>): Promise<any> {
  const worker = new DownloadWorker();
  return await worker.getVideoInfo(job);
}

/**
 * URL validation processor function for BullMQ
 */
export async function processUrlValidationJob(job: Job<{ url: string }>): Promise<any> {
  const worker = new DownloadWorker();
  return await worker.validateUrl(job);
}

/**
 * Default download worker instance
 */
export const downloadWorker = new DownloadWorker();