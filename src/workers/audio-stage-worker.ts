/**
 * Audio Processing Stage Worker
 * 
 * Combines audio extraction and transcription into a single stage for the flow system.
 * Implements concurrency=2 for memory management and uses existing audio processing services.
 */

import { Job } from 'bullmq';
import { AudioProcessingStageData, FlowStageResult } from '../types/flow.js';
import { AudioConfig } from '../types/audio.js';
import { audioProcessor } from '../services/audio-processor.js';
import { transcriber } from '../services/transcriber.js';
import { fileManager } from '../utils/file-manager.js';
import { videoProcessingFlowProducer } from '../services/flow-producer.js';
import { stageOrchestrator } from './stage-orchestrator.js';
import { broadcastTaskUpdate } from '../api/events.js';
import { ProgressThrottle } from '../utils/progress-throttle.js';
import { existsSync } from 'fs';

/**
 * Audio Stage Worker
 * 
 * Processes audio extraction and transcription in a single stage with memory management
 */
export class AudioStageWorker {
  /**
   * Process audio stage job - combines extraction and transcription
   */
  async processAudioStage(job: Job<AudioProcessingStageData>): Promise<FlowStageResult> {
    const { taskId, downloadResult, options } = job.data;
    const taskDir = fileManager.getTaskDirectory(taskId);
    const startTime = Date.now();

    console.log(`Starting audio processing for task: ${taskId}`);

    try {
      // Create progress throttle instance for this job (200ms intervals)
      const progressThrottle = new ProgressThrottle(200);

      // Get download results from parent job
      const parentData = downloadResult || await this.getDownloadResults(job);
      
      if (!parentData || !parentData.files || !parentData.files['original.mp4']) {
        throw new Error('Download results not available - missing video file');
      }

      const videoPath = parentData.files['original.mp4'];
      
      // Validate video file exists
      if (!existsSync(videoPath)) {
        throw new Error(`Video file not found: ${videoPath}`);
      }

      // STAGE 1: EXTRACTING - Update manifest status for CLI sync
      await this.updateTaskManifest(taskId, { status: 'extracting' });

      // Broadcast status change for CLI sync (immediate, not throttled)
      broadcastTaskUpdate(taskId, {
        type: 'status-change',
        data: { 
          status: 'extracting', 
          stage: 'extracting', 
          progress: 0, 
          step: 'Starting audio extraction',
          timestamp: new Date().toISOString()
        }
      });

      // Update flow progress - starting audio extraction  
      await videoProcessingFlowProducer.updateFlowProgress(
        taskId,
        'extracting', // FIXED: changed from 'audio-processing' to match CLI
        0,
        'Starting audio extraction'
      );

      // Step 1: Extract audio from video
      console.log(`Extracting audio from: ${videoPath}`);
      const audioResult = await audioProcessor.extractAudio({
        taskId,
        inputPath: videoPath,
        outputDir: taskDir,
        sampleRate: 16000,
        channels: 1,
        onProgress: async (progress) => {
          const overallProgress = progress * 0.3; // Audio extraction is 30% of audio stage
          job.updateProgress(overallProgress);
          
          // THROTTLE progress broadcasts to prevent console spam
          if (await progressThrottle.shouldUpdate()) {
            videoProcessingFlowProducer.updateFlowProgress(
              taskId,
              'extracting', // FIXED: changed from 'audio-processing' to match CLI
              overallProgress,
              `Extracting audio... ${Math.round(progress)}%`
            );

            broadcastTaskUpdate(taskId, {
              type: 'progress',
              data: { 
                stage: 'extracting', // FIXED: changed to match CLI stage
                progress: overallProgress, 
                step: `Extracting audio... ${Math.round(progress)}%` 
              }
            });
          }
        },
      });

      console.log(`Audio extraction completed: ${audioResult.audioPath}`);

      // STAGE 2: SEPARATING - Update manifest status for CLI sync
      await this.updateTaskManifest(taskId, { status: 'separating' });

      // Broadcast status change for CLI sync (immediate, not throttled)
      broadcastTaskUpdate(taskId, {
        type: 'status-change',
        data: { 
          status: 'separating', 
          stage: 'separating', 
          progress: 30, 
          step: 'Starting voice separation',
          timestamp: new Date().toISOString()
        }
      });

      // Update progress - starting voice separation
      await videoProcessingFlowProducer.updateFlowProgress(
        taskId,
        'separating', // FIXED: changed from 'audio-processing' to match CLI
        30,
        'Starting voice separation'
      );

      // Step 2: Separate vocals (using existing implementation)
      console.log(`Separating vocals from: ${audioResult.audioPath}`);
      const separationResult = await audioProcessor.separateVocals({
        taskId,
        inputPath: audioResult.audioPath,
        outputDir: taskDir,
        onProgress: async (progress) => {
          const overallProgress = 30 + (progress * 0.2); // Separation is 20% of audio stage
          job.updateProgress(overallProgress);
          
          // THROTTLE progress broadcasts to prevent console spam
          if (await progressThrottle.shouldUpdate()) {
            videoProcessingFlowProducer.updateFlowProgress(
              taskId,
              'separating', // FIXED: changed from 'audio-processing' to match CLI
              overallProgress,
              `Separating vocals... ${Math.round(progress)}%`
            );

            broadcastTaskUpdate(taskId, {
              type: 'progress',
              data: { 
                stage: 'separating', // FIXED: changed to match CLI stage
                progress: overallProgress, 
                step: `Separating vocals... ${Math.round(progress)}%` 
              }
            });
          }
        },
      });

      console.log(`Voice separation completed: ${separationResult.vocalsPath || separationResult.audioPath}`);

      // STAGE 3: TRANSCRIBING - Update manifest status for CLI sync
      await this.updateTaskManifest(taskId, { status: 'transcribing' });

      // Broadcast status change for CLI sync (immediate, not throttled)
      broadcastTaskUpdate(taskId, {
        type: 'status-change',
        data: { 
          status: 'transcribing', 
          stage: 'transcribing', 
          progress: 50, 
          step: 'Starting audio transcription',
          timestamp: new Date().toISOString()
        }
      });

      // Update progress - starting transcription
      await videoProcessingFlowProducer.updateFlowProgress(
        taskId,
        'transcribing', // FIXED: changed from 'audio-processing' to match CLI
        50,
        'Starting audio transcription'
      );

      // Step 3: Transcribe audio using Whisper
      const audioPath = separationResult.vocalsPath || separationResult.audioPath;
      console.log(`Starting transcription for: ${audioPath}`);

      // Prepare audio configuration following CLAUDE.md specifications
      const audioConfig: AudioConfig = {
        model: 'large-v3',
        language: options?.language || 'auto',
        wordTimestamps: true,
        sampleRate: 16000,
        channels: 1,
        executablePath: process.env.WHISPER_EXECUTABLE_PATH!,
        modelPath: process.env.WHISPER_MODEL_PATH!,
      };

      // Validate whisper configuration
      if (!audioConfig.executablePath || !audioConfig.modelPath) {
        throw new Error('Whisper executable or model path not configured');
      }

      const transcriptionResult = await transcriber.transcribeAudio({
        audioPath,
        outputDir: taskDir,
        config: audioConfig,
        onProgress: async (progress) => {
          const overallProgress = 50 + (progress * 0.5); // Transcription is 50% of audio stage
          job.updateProgress(overallProgress);
          
          // THROTTLE progress broadcasts to prevent console spam
          if (await progressThrottle.shouldUpdate()) {
            videoProcessingFlowProducer.updateFlowProgress(
              taskId,
              'transcribing', // FIXED: changed from 'audio-processing' to match CLI
              overallProgress,
              `Transcribing audio... ${Math.round(progress)}%`
            );

            broadcastTaskUpdate(taskId, {
              type: 'progress',
              data: { 
                stage: 'transcribing', // FIXED: changed to match CLI stage
                progress: overallProgress, 
                step: `Transcribing audio... ${Math.round(progress)}%` 
              }
            });
          }
        },
        onTextStream: (segment) => {
          // Broadcast real-time transcription text
          broadcastTaskUpdate(taskId, {
            type: 'text-stream',
            data: segment
          });
        },
      });

      const processingTime = Date.now() - startTime;

      // Prepare stage result for summarization stage
      const stageResult: FlowStageResult = {
        taskId,
        stage: 'audio-processing',
        success: true,
        files: {
          'audio.wav': audioResult.audioPath,
          'vocals.wav': separationResult.vocalsPath || separationResult.audioPath,
          'accompaniment.wav': separationResult.accompanimentPath || '',
          'transcription.json': `${taskDir}/transcription.json`,
          'subtitle.srt': `${taskDir}/subtitle.srt`,
          'transcript.txt': `${taskDir}/transcript.txt`,
          'words.wts': `${taskDir}/words.wts`,
        },
        metadata: {
          audioProcessingCompletedAt: new Date().toISOString(),
          processingTime,
          transcriptionStats: {
            totalWords: transcriptionResult.text.split(/\s+/).length,
            totalSegments: transcriptionResult.segments.length,
            language: transcriptionResult.language,
            duration: transcriptionResult.duration,
          },
          audioStats: {
            sampleRate: audioConfig.sampleRate,
            channels: audioConfig.channels,
            format: 'wav',
          },
        },
      };

      // Update task manifest - audio processing completed, ready for summarization
      await this.updateTaskManifest(taskId, {
        status: 'transcribing', // Keep as transcribing since this stage just completed
        files: stageResult.files,
      });

      // Final progress update
      await videoProcessingFlowProducer.updateFlowProgress(
        taskId,
        'transcribing', // FIXED: changed from 'audio-processing' to match CLI
        100,
        'Audio processing completed, starting summarization'
      );

      console.log(`Audio processing completed for task: ${taskId}`);

      // Add summarization job now that audio processing is complete
      try {
        const { queueConfig } = await import('../utils/queue-config.js');
        const summaryQueue = queueConfig.createSummarizationQueue();
        
        const summaryJob = await summaryQueue.add('generate-summary', {
          taskId,
          transcriptionResult: stageResult, // Pass transcription results
          options: {
            language: 'English',
            style: 'detailed',
            includeTimestamps: true,
          },
        }, {
          jobId: `${taskId}-summary`,
          priority: 5,
          attempts: 3,
        });
        
        console.log(`Summarization job queued for task: ${taskId}`);
      } catch (error) {
        console.error(`Failed to queue summarization for ${taskId}:`, error);
      }
      console.log(`Processing time: ${processingTime}ms`);
      console.log(`Total segments: ${transcriptionResult.segments.length}`);
      console.log(`Language detected: ${transcriptionResult.language}`);

      return stageResult;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`Audio processing failed for task ${taskId}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Create failure result
      const stageResult: FlowStageResult = {
        taskId,
        stage: 'audio-processing',
        success: false,
        files: {},
        metadata: {
          error: errorMessage,
          failedAt: new Date().toISOString(),
          processingTime,
        },
        error: errorMessage,
      };

      // Update task manifest with error
      await this.updateTaskManifest(taskId, {
        status: 'failed',
        error: errorMessage,
      });

      // Notify stage orchestrator of failure
      await stageOrchestrator.handleStageFailure(taskId, 'audio-processing', errorMessage, job);

      // Update flow with failure
      await videoProcessingFlowProducer.failFlow(taskId, errorMessage);

      throw error; // Re-throw to let BullMQ handle retry logic
    }
  }

  /**
   * Get download results from parent job or task manifest
   */
  private async getDownloadResults(job: Job): Promise<any> {
    try {
      const { taskId } = job.data;
      
      // First try to get from task manifest (most reliable method)
      const manifest = await fileManager.loadManifest(taskId);
      
      if (manifest && manifest.files && manifest.files['original.mp4']) {
        console.log(`Got download results from manifest for ${taskId}`);
        return { files: manifest.files };
      }

      // For BullMQ flows, parent results should be available in job data or dependencies
      // Try to get parent job result if available (disabled due to TypeScript compatibility)
      /*
      try {
        if (job.parent) {
          const parentJob = await job.parent;
          if (parentJob) {
            const parentResult = parentJob.returnvalue;
            if (parentResult && parentResult.files) {
              console.log(`Got download results from parent job for ${taskId}`);
              return parentResult;
            }
          }
        }
      } catch (parentError) {
        console.warn('Could not get parent job result:', parentError);
      }
      */

      throw new Error('No download results available from parent job or manifest');
    } catch (error) {
      console.error('Failed to get download results:', error);
      throw new Error('Could not retrieve download results for audio processing');
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
   * Estimate audio processing time based on video duration
   */
  estimateAudioProcessingTime(videoDurationSeconds: number): number {
    // Estimates based on M4 Mini performance:
    // - Audio extraction: ~0.1x video duration
    // - Voice separation: ~0.2x video duration
    // - Transcription: ~0.25x video duration with large-v3
    const extractionTime = videoDurationSeconds * 0.1;
    const separationTime = videoDurationSeconds * 0.2;
    const transcriptionTime = videoDurationSeconds * 0.25;
    const overhead = 10; // Base overhead in seconds
    
    return Math.ceil(extractionTime + separationTime + transcriptionTime + overhead);
  }

  /**
   * Check memory usage and limits
   */
  async checkMemoryUsage(): Promise<{
    current: number;
    limit: number;
    available: number;
    canProcessMore: boolean;
  }> {
    const memoryUsage = process.memoryUsage();
    const currentUsage = memoryUsage.heapUsed;
    const memoryLimit = 2_000_000_000; // 2GB limit per job as specified in PRP
    const available = memoryLimit - currentUsage;
    
    return {
      current: currentUsage,
      limit: memoryLimit,
      available,
      canProcessMore: available > (memoryLimit * 0.3), // Keep 30% buffer
    };
  }

  /**
   * Cleanup audio processing resources
   */
  async cleanup(taskId: string): Promise<void> {
    try {
      const taskDir = fileManager.getTaskDirectory(taskId);
      
      // Clean up audio processor temporary files
      await audioProcessor.cleanup(taskDir);
      
      console.log(`Audio processing cleanup completed for task: ${taskId}`);
    } catch (error) {
      console.error(`Audio processing cleanup failed for task ${taskId}:`, error);
    }
  }
}

/**
 * Multi-job processor for audio processing worker
 */
export async function processAudioJobs(job: Job): Promise<any> {
  const worker = new AudioStageWorker();
  
  // Route based on job name
  switch (job.name) {
    case 'process-audio':
      return await worker.processAudioStage(job as Job<AudioProcessingStageData>);
    default:
      throw new Error(`Unknown audio job type: ${job.name}`);
  }
}

/**
 * Default audio stage worker instance
 */
export const audioStageWorker = new AudioStageWorker();