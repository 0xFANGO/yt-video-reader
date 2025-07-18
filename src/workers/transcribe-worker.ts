import { Job } from 'bullmq';
import { AudioConfig, TranscriptionResult } from '../types/audio.js';
import { transcriber } from '../services/transcriber.js';
import { fileManager } from '../utils/file-manager.js';
import { existsSync } from 'fs';

/**
 * Transcription job data
 */
export interface TranscriptionJobData {
  taskId: string;
  audioPath: string;
  options?: {
    language?: string;
    model?: 'large-v3';
    wordTimestamps?: boolean;
    confidence?: boolean;
  };
}

/**
 * Transcription worker for handling audio transcription jobs
 */
export class TranscribeWorker {
  /**
   * Process transcription job
   */
  async processTranscriptionJob(job: Job<TranscriptionJobData>): Promise<{
    taskId: string;
    transcriptionResult: TranscriptionResult;
    status: 'completed' | 'failed';
    error?: string;
    processingTime: number;
  }> {
    const { taskId, audioPath, options } = job.data;
    const taskDir = fileManager.getTaskDirectory(taskId);
    const startTime = Date.now();

    console.log(`Starting transcription for task: ${taskId}`);
    console.log(`Audio path: ${audioPath}`);
    console.log(`Options:`, options);

    try {
      // Validate audio file
      if (!existsSync(audioPath)) {
        throw new Error(`Audio file not found: ${audioPath}`);
      }

      // Prepare audio configuration
      const audioConfig: AudioConfig = {
        model: 'large-v3',
        language: options?.language || 'auto',
        wordTimestamps: options?.wordTimestamps ?? true,
        sampleRate: 16000,
        channels: 1,
        executablePath: process.env.WHISPER_EXECUTABLE_PATH!,
        modelPath: process.env.WHISPER_MODEL_PATH!,
      };

      // Validate whisper configuration
      if (!audioConfig.executablePath || !audioConfig.modelPath) {
        throw new Error('Whisper executable or model path not configured');
      }

      // Update job progress
      job.updateProgress(0);

      // Start transcription
      const transcriptionResult = await transcriber.transcribeAudio({
        audioPath,
        outputDir: taskDir,
        config: audioConfig,
        onProgress: (progress) => {
          job.updateProgress(progress);
        },
      });

      // Calculate processing time
      const processingTime = Date.now() - startTime;

      // Update task manifest
      await this.updateTaskManifest(taskId, {
        files: {
          'transcription.json': `${taskDir}/transcription.json`,
          'subtitle.srt': `${taskDir}/subtitle.srt`,
          'transcript.txt': `${taskDir}/transcript.txt`,
          'words.wts': `${taskDir}/words.wts`,
        },
      });

      // Log transcription statistics
      const stats = transcriber.getTranscriptionStats(transcriptionResult);
      console.log(`Transcription completed for task: ${taskId}`);
      console.log(`Processing time: ${processingTime}ms`);
      console.log(`Total words: ${stats.totalWords}`);
      console.log(`Total segments: ${stats.totalSegments}`);
      console.log(`Language detected: ${transcriptionResult.language}`);
      console.log(`Words per minute: ${stats.wordsPerMinute.toFixed(2)}`);

      return {
        taskId,
        transcriptionResult,
        status: 'completed',
        processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`Transcription failed for task ${taskId}:`, error);

      // Update task manifest with error
      await this.updateTaskManifest(taskId, {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        taskId,
        transcriptionResult: {
          text: '',
          segments: [],
          language: 'unknown',
          duration: 0,
          modelUsed: 'large-v3',
        },
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        processingTime,
      };
    }
  }

  /**
   * Test transcription capability
   */
  async testTranscriptionCapability(job: Job<{ testAudioPath: string }>): Promise<{
    isWorking: boolean;
    modelInfo: any;
    testResult?: TranscriptionResult;
    error?: string;
  }> {
    const { testAudioPath } = job.data;

    try {
      console.log('Testing transcription capability...');

      // Test whisper installation
      const isWorking = await transcriber.testTranscription(testAudioPath);
      
      // Get model information
      const modelInfo = await transcriber.getModelInfo();

      console.log('Transcription capability test completed');
      console.log(`Whisper working: ${isWorking}`);
      console.log(`Model info:`, modelInfo);

      return {
        isWorking,
        modelInfo,
      };
    } catch (error) {
      console.error('Transcription capability test failed:', error);
      return {
        isWorking: false,
        modelInfo: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get available languages for transcription
   */
  async getAvailableLanguages(job: Job): Promise<{
    languages: string[];
    autoDetect: boolean;
  }> {
    try {
      const languages = await transcriber.getAvailableLanguages();
      
      console.log(`Found ${languages.length} available languages`);
      
      return {
        languages,
        autoDetect: true,
      };
    } catch (error) {
      console.error('Failed to get available languages:', error);
      return {
        languages: [],
        autoDetect: false,
      };
    }
  }

  /**
   * Process batch transcription
   */
  async processBatchTranscription(job: Job<{
    tasks: Array<{ taskId: string; audioPath: string; options?: any }>;
  }>): Promise<{
    results: Array<{
      taskId: string;
      status: 'completed' | 'failed';
      transcriptionResult?: TranscriptionResult;
      error?: string;
    }>;
  }> {
    const { tasks } = job.data;
    const results: Array<{
      taskId: string;
      status: 'completed' | 'failed';
      transcriptionResult?: TranscriptionResult;
      error?: string;
    }> = [];

    console.log(`Processing batch transcription with ${tasks.length} tasks`);

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      
      try {
        // Update batch progress
        job.updateProgress((i / tasks.length) * 100);

        // Create individual job data
        if (!task) {
          throw new Error('Task is undefined');
        }
        
        const jobData: TranscriptionJobData = {
          taskId: task.taskId,
          audioPath: task.audioPath,
          options: task.options,
        };

        // Process individual transcription
        const result = await this.processTranscriptionJob({
          data: jobData,
          updateProgress: () => {}, // No individual progress for batch
        } as unknown as Job<TranscriptionJobData>);

        results.push({
          taskId: task.taskId,
          status: result.status,
          transcriptionResult: result.transcriptionResult,
          ...(result.error && { error: result.error }),
        });
      } catch (error) {
        results.push({
          taskId: task?.taskId || 'unknown',
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(`Batch transcription completed: ${results.length} tasks processed`);
    const successful = results.filter(r => r.status === 'completed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    console.log(`Successful: ${successful}, Failed: ${failed}`);

    return { results };
  }

  /**
   * Estimate transcription time
   */
  estimateTranscriptionTime(job: Job<{ audioDurationSeconds: number }>): Promise<{
    estimatedTime: number;
    confidence: number;
  }> {
    const { audioDurationSeconds } = job.data;
    
    const estimatedTime = transcriber.estimateTranscriptionTime(audioDurationSeconds);
    
    // Confidence based on audio duration
    // Shorter audio = higher confidence in estimate
    const confidence = Math.max(0.5, Math.min(1.0, 1.0 - (audioDurationSeconds / 3600)));
    
    return Promise.resolve({
      estimatedTime,
      confidence,
    });
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
   * Get transcription statistics
   */
  async getTranscriptionStats(): Promise<{
    totalTranscriptions: number;
    successfulTranscriptions: number;
    failedTranscriptions: number;
    averageProcessingTime: number;
    averageAccuracy: number;
  }> {
    // This would need to be tracked in a database or persistent storage
    // For now, return placeholder values
    return {
      totalTranscriptions: 0,
      successfulTranscriptions: 0,
      failedTranscriptions: 0,
      averageProcessingTime: 0,
      averageAccuracy: 0,
    };
  }

  /**
   * Cleanup transcription resources
   */
  async cleanup(taskId: string): Promise<void> {
    try {
      console.log(`Transcription cleanup completed for task: ${taskId}`);
    } catch (error) {
      console.error(`Transcription cleanup failed for task ${taskId}:`, error);
    }
  }

  /**
   * Validate transcription configuration
   */
  async validateConfiguration(): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check environment variables
      if (!process.env.WHISPER_EXECUTABLE_PATH) {
        errors.push('WHISPER_EXECUTABLE_PATH environment variable not set');
      }

      if (!process.env.WHISPER_MODEL_PATH) {
        errors.push('WHISPER_MODEL_PATH environment variable not set');
      }

      // Check file existence
      if (process.env.WHISPER_EXECUTABLE_PATH && !existsSync(process.env.WHISPER_EXECUTABLE_PATH)) {
        errors.push('Whisper executable not found at specified path');
      }

      if (process.env.WHISPER_MODEL_PATH && !existsSync(process.env.WHISPER_MODEL_PATH)) {
        errors.push('Whisper model not found at specified path');
      }

      // Test transcription capability
      try {
        await transcriber.getModelInfo();
      } catch (error) {
        errors.push('Failed to load whisper model');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
      };
    } catch (error) {
      errors.push(`Configuration validation failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        isValid: false,
        errors,
        warnings,
      };
    }
  }
}

/**
 * Worker processor function for BullMQ
 */
export async function processTranscriptionJob(job: Job<TranscriptionJobData>): Promise<any> {
  const worker = new TranscribeWorker();
  return await worker.processTranscriptionJob(job);
}

/**
 * Test transcription processor function for BullMQ
 */
export async function processTranscriptionTestJob(job: Job<{ testAudioPath: string }>): Promise<any> {
  const worker = new TranscribeWorker();
  return await worker.testTranscriptionCapability(job);
}

/**
 * Languages processor function for BullMQ
 */
export async function processLanguagesJob(job: Job): Promise<any> {
  const worker = new TranscribeWorker();
  return await worker.getAvailableLanguages(job);
}

/**
 * Default transcribe worker instance
 */
export const transcribeWorker = new TranscribeWorker();