import { Job } from 'bullmq';
import { TaskProcessingData, TaskManifest, TaskStatus } from '../types/task.js';
import { AudioConfig, DEFAULT_AUDIO_CONFIG } from '../types/audio.js';
import { youTubeDownloader } from '../services/youtube-downloader.js';
import { audioProcessor } from '../services/audio-processor.js';
import { transcriber } from '../services/transcriber.js';
import { aiSummarizer } from '../services/ai-summarizer.js';
import { fileManager } from '../utils/file-manager.js';
import { broadcastTaskUpdate } from '../api/events.js';

/**
 * Video processor worker - handles the complete video processing pipeline
 */
export class VideoProcessorWorker {
  /**
   * Process video job - main pipeline orchestrator
   */
  async processVideoJob(job: Job<TaskProcessingData>): Promise<void> {
    const { taskId, url, options } = job.data;
    const taskDir = fileManager.getTaskDirectory(taskId);

    console.log(`Starting video processing for task: ${taskId}`);
    console.log(`URL: ${url}`);
    console.log(`Options:`, options);

    try {
      // Initialize task directory
      await fileManager.createTaskDirectory(taskId);

      // Step 1: Download video
      await this.updateTaskStatus(taskId, 'downloading', 10, 'Downloading video from YouTube');
      const downloadResult = await youTubeDownloader.downloadVideo(url, {
        taskId,
        outputDir: taskDir,
        onProgress: (progress) => {
          const jobProgress = 10 + (progress * 0.15); // 10-25%
          job.updateProgress(jobProgress);
          broadcastTaskUpdate(taskId, {
            type: 'progress',
            data: { stage: 'downloading', progress: jobProgress, step: `Downloading video... ${Math.round(progress)}%` }
          });
        },
      });

      // Update manifest with video info
      await this.updateTaskManifest(taskId, {
        videoTitle: downloadResult.title,
        videoDuration: downloadResult.duration,
        files: { 'original.mp4': downloadResult.videoPath },
      });

      // Step 2: Extract audio
      await this.updateTaskStatus(taskId, 'extracting', 25, 'Extracting audio from video');
      const audioResult = await audioProcessor.extractAudio({
        taskId,
        inputPath: downloadResult.videoPath,
        outputDir: taskDir,
        sampleRate: 16000,
        channels: 1,
        onProgress: (progress) => {
          const jobProgress = 25 + (progress * 0.15); // 25-40%
          job.updateProgress(jobProgress);
          broadcastTaskUpdate(taskId, {
            type: 'progress',
            data: { stage: 'extracting', progress: jobProgress, step: `Extracting audio... ${Math.round(progress)}%` }
          });
        },
      });

      // Update manifest with audio file
      await this.updateTaskManifest(taskId, {
        files: { 'audio.wav': audioResult.audioPath },
      });

      // Step 3: Separate vocals (optional, currently copies original)
      await this.updateTaskStatus(taskId, 'separating', 40, 'Separating vocals from audio');
      const separationResult = await audioProcessor.separateVocals({
        taskId,
        inputPath: audioResult.audioPath,
        outputDir: taskDir,
        onProgress: (progress) => {
          const jobProgress = 40 + (progress * 0.15); // 40-55%
          job.updateProgress(jobProgress);
          broadcastTaskUpdate(taskId, {
            type: 'progress',
            data: { stage: 'separating', progress: jobProgress, step: `Separating vocals... ${Math.round(progress)}%` }
          });
        },
      });

      // Update manifest with separated audio files
      await this.updateTaskManifest(taskId, {
        files: { 
          'vocals.wav': separationResult.vocalsPath || separationResult.audioPath,
          'accompaniment.wav': separationResult.accompanimentPath || '',
        },
      });

      // Step 4: Transcribe audio
      await this.updateTaskStatus(taskId, 'transcribing', 55, 'Transcribing audio using Whisper');
      const audioConfig: AudioConfig = {
        model: 'large-v3',
        language: options?.language || 'auto',
        wordTimestamps: true,
        sampleRate: 16000,
        channels: 1,
        executablePath: process.env.WHISPER_EXECUTABLE_PATH!,
        modelPath: process.env.WHISPER_MODEL_PATH!,
      };

      const transcriptionResult = await transcriber.transcribeAudio({
        audioPath: separationResult.vocalsPath || separationResult.audioPath,
        outputDir: taskDir,
        config: audioConfig,
        onProgress: (progress) => {
          const jobProgress = 55 + (progress * 0.25); // 55-80%
          job.updateProgress(jobProgress);
          broadcastTaskUpdate(taskId, {
            type: 'progress',
            data: { stage: 'transcribing', progress: jobProgress, step: `Transcribing audio... ${Math.round(progress)}%` }
          });
        },
        onTextStream: (segment) => {
          // Broadcast real-time transcription text
          broadcastTaskUpdate(taskId, {
            type: 'text-stream',
            data: segment
          });
        },
      });

      // Update manifest with transcription files
      await this.updateTaskManifest(taskId, {
        files: { 
          'transcription.json': `${taskDir}/transcription.json`,
          'subtitle.srt': `${taskDir}/subtitle.srt`,
          'transcript.txt': `${taskDir}/transcript.txt`,
          'words.wts': `${taskDir}/words.wts`,
        },
      });

      // Step 5: Generate AI summary
      await this.updateTaskStatus(taskId, 'summarizing', 80, 'Generating AI summary');
      const summaryResult = await aiSummarizer.generateSummary({
        transcription: transcriptionResult,
        outputDir: taskDir,
        language: options?.language || 'English',
        style: 'concise',
        includeTimestamps: true,
      }, (progress, step) => {
        // Convert AI summarizer progress (85-100) to job progress (80-95)
        const jobProgress = 80 + ((progress - 85) / 15) * 15;
        job.updateProgress(Math.min(95, Math.max(80, jobProgress)));
        broadcastTaskUpdate(taskId, {
          type: 'progress',
          data: { stage: 'summarizing', progress: jobProgress, step }
        });
      });

      // Update manifest with summary files
      await this.updateTaskManifest(taskId, {
        files: { 
          'summary.json': `${taskDir}/summary.json`,
          'summary.txt': `${taskDir}/summary.txt`,
        },
      });

      // Step 6: Complete processing
      await this.updateTaskStatus(taskId, 'completed', 100, 'Processing completed successfully');
      job.updateProgress(100);
      broadcastTaskUpdate(taskId, {
        type: 'complete',
        data: { 
          status: 'completed', 
          progress: 100, 
          step: 'All processing completed successfully',
          summary: {
            duration: downloadResult.duration,
            segments: transcriptionResult.segments.length,
            topics: summaryResult.topics.length
          }
        }
      });
      
      console.log(`Video processing completed for task: ${taskId}`);
      console.log(`Total duration: ${downloadResult.duration} seconds`);
      console.log(`Transcription segments: ${transcriptionResult.segments.length}`);
      console.log(`Summary topics: ${summaryResult.topics.length}`);

    } catch (error) {
      console.error(`Video processing failed for task ${taskId}:`, error);
      await this.updateTaskStatus(taskId, 'failed', undefined, 'Processing failed', error);
      throw error;
    }
  }

  /**
   * Update task status and progress
   */
  private async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    progress?: number,
    currentStep?: string,
    error?: any
  ): Promise<void> {
    try {
      // Load existing manifest
      let manifest = await fileManager.loadManifest(taskId);
      
      if (!manifest) {
        // Create new manifest if it doesn't exist
        const { createDefaultManifest } = await import('../types/task.js');
        manifest = createDefaultManifest(taskId);
      }

      // Update manifest
      manifest.status = status;
      if (progress !== undefined) {
        manifest.progress = progress;
      }
      if (currentStep) {
        manifest.currentStep = currentStep;
      }
      if (error) {
        manifest.error = error instanceof Error ? error.message : String(error);
      }
      if (status === 'completed') {
        manifest.finishedAt = new Date().toISOString();
      }

      // Save updated manifest
      await fileManager.saveManifest(taskId, manifest);

      // Broadcast status update to SSE clients
      broadcastTaskUpdate(taskId, {
        type: 'status',
        data: manifest
      });

      console.log(`Task ${taskId} status updated: ${status} (${progress}%)`);
    } catch (error) {
      console.error(`Failed to update task status for ${taskId}:`, error);
    }
  }

  /**
   * Update task manifest with additional data
   */
  private async updateTaskManifest(
    taskId: string,
    updates: Partial<TaskManifest>
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
   * Estimate total processing time
   */
  estimateProcessingTime(videoDurationSeconds: number): number {
    // Rough estimates based on M4 Mini performance:
    // - Download: ~30 seconds for 10-minute video
    // - Audio extraction: ~10 seconds
    // - Voice separation: ~20 seconds  
    // - Transcription: ~25 seconds for 10-minute video with large-v3
    // - AI summary: ~10 seconds
    // Total: ~95 seconds for 10-minute video

    const baseTime = 60; // Base overhead in seconds
    const downloadTime = videoDurationSeconds * 0.5; // ~0.5x video duration
    const audioExtractionTime = videoDurationSeconds * 0.1; // ~0.1x video duration
    const voiceSeparationTime = videoDurationSeconds * 0.2; // ~0.2x video duration
    const transcriptionTime = videoDurationSeconds * 0.25; // ~0.25x video duration for large-v3
    const summaryTime = 10; // Fixed ~10 seconds for summary

    return Math.ceil(baseTime + downloadTime + audioExtractionTime + voiceSeparationTime + transcriptionTime + summaryTime);
  }

  /**
   * Cleanup task resources
   */
  async cleanupTask(taskId: string): Promise<void> {
    try {
      // Clean up audio processor temporary files
      const taskDir = fileManager.getTaskDirectory(taskId);
      await audioProcessor.cleanup(taskDir);

      // Clean up downloader temporary files
      await youTubeDownloader.cleanup();

      console.log(`Cleanup completed for task: ${taskId}`);
    } catch (error) {
      console.error(`Cleanup failed for task ${taskId}:`, error);
    }
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(taskId: string): Promise<{
    totalTime: number;
    stages: Record<string, number>;
    filesSizes: Record<string, number>;
  }> {
    try {
      const manifest = await fileManager.loadManifest(taskId);
      if (!manifest) {
        return { totalTime: 0, stages: {}, filesSizes: {} };
      }

      const totalTime = manifest.finishedAt && manifest.createdAt
        ? new Date(manifest.finishedAt).getTime() - new Date(manifest.createdAt).getTime()
        : 0;

      const fileSizes: Record<string, number> = {};
      for (const [filename, filepath] of Object.entries(manifest.files)) {
        try {
          fileSizes[filename] = fileManager.getFileSize(taskId, filename);
        } catch (error) {
          fileSizes[filename] = 0;
        }
      }

      return {
        totalTime,
        stages: {
          // This would need to be tracked during processing
          // For now, return empty stages
        },
        filesSizes: fileSizes,
      };
    } catch (error) {
      console.error(`Failed to get processing stats for ${taskId}:`, error);
      return { totalTime: 0, stages: {}, filesSizes: {} };
    }
  }
}

/**
 * Worker processor function for BullMQ
 */
export async function processVideoJob(job: Job<TaskProcessingData>): Promise<void> {
  const worker = new VideoProcessorWorker();
  await worker.processVideoJob(job);
}

/**
 * Default video processor worker instance
 */
export const videoProcessorWorker = new VideoProcessorWorker();