import { Job } from 'bullmq';
import { TranscriptionResult } from '../types/audio.js';
import { SummarizationStageData, FlowStageResult } from '../types/flow.js';
import { aiSummarizer, SummaryResult, SummaryOptions } from '../services/ai-summarizer.js';
import { fileManager } from '../utils/file-manager.js';
import { videoProcessingFlowProducer } from '../services/flow-producer.js';
import { stageOrchestrator } from './stage-orchestrator.js';
import { broadcastTaskUpdate } from '../api/events.js';
import { ProgressThrottle } from '../utils/progress-throttle.js';
import { existsSync } from 'fs';
import { promises as fs } from 'fs';
// import path from 'path'; // Future use

/**
 * Summarization job data
 */
export interface SummarizationJobData {
  taskId: string;
  transcriptionPath: string;
  options?: {
    language?: string;
    style?: 'detailed';
    includeTimestamps?: boolean;
    customPrompt?: string;
  };
}

/**
 * Summarization worker for handling AI summary generation jobs
 */
export class SummarizeWorker {
  /**
   * Process flow-integrated summarization job for BullMQ Flows
   */
  async processFlowSummarizationJob(job: Job<SummarizationStageData>): Promise<FlowStageResult> {
    const { taskId, transcriptionResult, options } = job.data;
    const taskDir = fileManager.getTaskDirectory(taskId);
    const startTime = Date.now();

    console.log(`Starting flow summarization for task: ${taskId}`);
    console.log(`Options:`, options);

    try {
      // Create progress throttle instance for this job (200ms intervals)
      const progressThrottle = new ProgressThrottle(200);

      // Get transcription results from parent job
      const parentData = transcriptionResult || await this.getTranscriptionResults(job, taskId);
      
      if (!parentData || !parentData.files || !parentData.files['transcription.json']) {
        throw new Error('Transcription results not available - missing transcription file');
      }

      const transcriptionPath = parentData.files['transcription.json'];
      
      // Validate transcription file exists
      if (!existsSync(transcriptionPath)) {
        throw new Error(`Transcription file not found: ${transcriptionPath}`);
      }

      // Update manifest status for CLI sync
      await this.updateTaskManifest(taskId, { status: 'summarizing' });

      // Broadcast status change for CLI sync (immediate, not throttled)
      broadcastTaskUpdate(taskId, {
        type: 'status-change',
        data: { 
          status: 'summarizing', 
          stage: 'summarizing', 
          progress: 0, 
          step: 'Starting AI summary generation',
          timestamp: new Date().toISOString()
        }
      });

      // Update flow progress - starting summarization
      await videoProcessingFlowProducer.updateFlowProgress(
        taskId,
        'summarizing', // FIXED: changed from 'summarization' to match CLI
        0,
        'Starting AI summary generation'
      );

      // Load transcription result
      const transcriptionData = await this.loadTranscriptionResult(transcriptionPath);
      
      if (!transcriptionData) {
        throw new Error('Failed to load transcription result');
      }

      // Validate transcription content
      if (!transcriptionData.text || transcriptionData.text.trim().length === 0) {
        throw new Error('Transcription text is empty');
      }

      // Update job progress
      job.updateProgress(10);
      await videoProcessingFlowProducer.updateFlowProgress(
        taskId,
        'summarizing', // FIXED: changed from 'summarization' to match CLI
        10,
        'Preparing summary options...'
      );

      // Prepare summary options
      const summaryOptions: SummaryOptions = {
        transcription: transcriptionData,
        outputDir: taskDir,
        language: options?.language || 'Chinese',
        style: options?.style || 'detailed',
        includeTimestamps: options?.includeTimestamps ?? true,
      };

      // Generate summary with progress callbacks
      job.updateProgress(30);
      await videoProcessingFlowProducer.updateFlowProgress(
        taskId,
        'summarizing', // FIXED: changed from 'summarization' to match CLI
        30,
        'Generating AI summary...'
      );
      
      const summaryResult = await aiSummarizer.generateSummary(summaryOptions, async (progress, step) => {
        // Convert AI summarizer progress (85-100) to job progress (30-95)
        const jobProgress = 30 + ((progress - 85) / 15) * 65;
        const finalProgress = Math.min(95, Math.max(30, jobProgress));
        
        job.updateProgress(finalProgress);
        
        // THROTTLE progress broadcasts to prevent console spam
        if (await progressThrottle.shouldUpdate()) {
          videoProcessingFlowProducer.updateFlowProgress(
            taskId,
            'summarizing', // FIXED: changed from 'summarization' to match CLI
            finalProgress,
            step
          );

          broadcastTaskUpdate(taskId, {
            type: 'progress',
            data: { stage: 'summarizing', progress: finalProgress, step } // FIXED: stage ID
          });
        }
      });

      const processingTime = Date.now() - startTime;

      // Prepare final stage result with conditional markdown file tracking
      const files: Record<string, string> = {
        'summary.json': `${taskDir}/summary.json`,
        'summary.txt': `${taskDir}/summary.txt`,
      };

      // Add markdown file if deep notes were generated
      if (summaryResult.deepNotes && summaryResult.timeline) {
        // Determine markdown filename based on video title
        const manifestPath = `${taskDir}/manifest.json`;
        let markdownFileName = 'summary.md';
        
        try {
          const manifestContent = await fs.readFile(manifestPath, 'utf-8');
          const manifest = JSON.parse(manifestContent);
          const videoTitle = manifest.title || manifest.originalTitle;
          if (videoTitle) {
            // Use same sanitization logic as in ai-summarizer
            // eslint-disable-next-line no-control-regex
            const sanitizedTitle = videoTitle.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').substring(0, 100);
            markdownFileName = `${sanitizedTitle}.md`;
          }
        } catch (error) {
          console.warn('Could not read video title for markdown filename:', error);
        }
        
        files['summary.md'] = `${taskDir}/${markdownFileName}`;
      }

      const stageResult: FlowStageResult = {
        taskId,
        stage: 'summarizing', // FIXED: changed from 'summarization' to match CLI
        success: true,
        files,
        metadata: {
          summarizationCompletedAt: new Date().toISOString(),
          processingTime,
          summaryStats: {
            summaryLength: summaryResult.summary.length,
            keyPoints: summaryResult.keyPoints.length,
            highlights: summaryResult.highlights.length,
            topics: summaryResult.topics.length,
            language: options?.language || 'Chinese',
            style: options?.style || 'detailed',
            hasDeepNotes: !!summaryResult.deepNotes,
            hasTimeline: !!summaryResult.timeline,
          },
        },
      };

      // Update task manifest - final completion
      await this.updateTaskManifest(taskId, {
        status: 'completed',
        currentStep: 'All processing completed successfully',
        progress: 100,
        finishedAt: new Date().toISOString(),
        files: stageResult.files,
      });

      // Notify stage orchestrator of completion (this will complete the entire flow)
      await stageOrchestrator.handleStageCompletion(taskId, 'summarizing', stageResult); // FIXED: stage ID

      // Final progress update - complete flow
      await videoProcessingFlowProducer.updateFlowProgress(
        taskId,
        'summarizing', // FIXED: changed from 'summarization' to match CLI
        100,
        'Video processing flow completed successfully'
      );

      job.updateProgress(100);
      
      // Broadcast final completion
      broadcastTaskUpdate(taskId, {
        type: 'complete',
        data: {
          status: 'completed',
          progress: 100,
          step: 'All processing completed successfully',
          summary: {
            summaryLength: summaryResult.summary.length,
            keyPoints: summaryResult.keyPoints.length,
            topics: summaryResult.topics.length
          }
        }
      });

      console.log(`Flow summarization completed for task: ${taskId}`);
      console.log(`Processing time: ${processingTime}ms`);
      console.log(`Summary length: ${summaryResult.summary.length} characters`);
      console.log(`Key points: ${summaryResult.keyPoints.length}`);
      console.log(`Topics: ${summaryResult.topics.length}`);

      return stageResult;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`Flow summarization failed for task ${taskId}:`, error);

      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Create failure result
      const stageResult: FlowStageResult = {
        taskId,
        stage: 'summarizing', // FIXED: changed from 'summarization' to match CLI
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
      await stageOrchestrator.handleStageFailure(taskId, 'summarizing', errorMessage, job); // FIXED: stage ID

      // Update flow with failure
      await videoProcessingFlowProducer.failFlow(taskId, errorMessage);

      throw error; // Re-throw to let BullMQ handle retry logic
    }
  }

  /**
   * Get transcription results from parent job or task manifest
   */
  private async getTranscriptionResults(job: Job, taskId: string): Promise<any> {
    try {
      // First try to get from task manifest (most reliable method)
      const manifest = await fileManager.loadManifest(taskId);
      
      if (manifest && manifest.files && manifest.files['transcription.json']) {
        console.log(`Got transcription results from manifest for ${taskId}`);
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
              console.log(`Got transcription results from parent job for ${taskId}`);
              return parentResult;
            }
          }
        }
      } catch (parentError) {
        console.warn('Could not get parent job result:', parentError);
      }
      */

      throw new Error('No transcription results available from parent job or manifest');
    } catch (error) {
      console.error('Failed to get transcription results:', error);
      throw new Error('Could not retrieve transcription results for summarization');
    }
  }

  /**
   * Process summarization job (legacy method - preserved for backward compatibility)
   */
  async processSummarizationJob(job: Job<SummarizationJobData>): Promise<{
    taskId: string;
    summaryResult: SummaryResult;
    status: 'completed' | 'failed';
    error?: string;
    processingTime: number;
  }> {
    const { taskId, transcriptionPath, options } = job.data;
    const taskDir = fileManager.getTaskDirectory(taskId);
    const startTime = Date.now();

    console.log(`Starting summarization for task: ${taskId}`);
    console.log(`Transcription path: ${transcriptionPath}`);
    console.log(`Options:`, options);

    try {
      // Validate transcription file
      if (!existsSync(transcriptionPath)) {
        throw new Error(`Transcription file not found: ${transcriptionPath}`);
      }

      // Load transcription result
      const transcriptionResult = await this.loadTranscriptionResult(transcriptionPath);
      
      if (!transcriptionResult) {
        throw new Error('Failed to load transcription result');
      }

      // Validate transcription content
      if (!transcriptionResult.text || transcriptionResult.text.trim().length === 0) {
        throw new Error('Transcription text is empty');
      }

      // Update job progress
      job.updateProgress(10);
      broadcastTaskUpdate(taskId, {
        type: 'progress',
        data: { stage: 'summarizing', progress: 10, step: 'Preparing summary options...' }
      });

      // Prepare summary options
      const summaryOptions: SummaryOptions = {
        transcription: transcriptionResult,
        outputDir: taskDir,
        language: options?.language || 'Chinese',
        style: options?.style || 'detailed',
        includeTimestamps: options?.includeTimestamps ?? true,
      };

      // Generate summary with progress callbacks
      job.updateProgress(30);
      broadcastTaskUpdate(taskId, {
        type: 'progress',
        data: { stage: 'summarizing', progress: 30, step: 'Starting AI summary generation...' }
      });
      
      const summaryResult = await aiSummarizer.generateSummary(summaryOptions, (progress, step) => {
        // Convert AI summarizer progress (85-100) to job progress (30-95)
        const jobProgress = 30 + ((progress - 85) / 15) * 65;
        job.updateProgress(Math.min(95, Math.max(30, jobProgress)));
        broadcastTaskUpdate(taskId, {
          type: 'progress',
          data: { stage: 'summarizing', progress: jobProgress, step }
        });
      });

      // Calculate processing time
      const processingTime = Date.now() - startTime;

      // Update task manifest with conditional markdown file
      const files: Record<string, string> = {
        'summary.json': `${taskDir}/summary.json`,
        'summary.txt': `${taskDir}/summary.txt`,
      };

      // Add markdown file if deep notes were generated
      if (summaryResult.deepNotes && summaryResult.timeline) {
        const manifestPath = `${taskDir}/manifest.json`;
        let markdownFileName = 'summary.md';
        
        try {
          const manifestContent = await fs.readFile(manifestPath, 'utf-8');
          const manifest = JSON.parse(manifestContent);
          const videoTitle = manifest.title || manifest.originalTitle;
          if (videoTitle) {
            // eslint-disable-next-line no-control-regex
            const sanitizedTitle = videoTitle.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').substring(0, 100);
            markdownFileName = `${sanitizedTitle}.md`;
          }
        } catch (error) {
          console.warn('Could not read video title for markdown filename:', error);
        }
        
        files['summary.md'] = `${taskDir}/${markdownFileName}`;
      }

      await this.updateTaskManifest(taskId, { files });

      // Log summary statistics
      console.log(`Summarization completed for task: ${taskId}`);
      console.log(`Processing time: ${processingTime}ms`);
      console.log(`Summary length: ${summaryResult.summary.length} characters`);
      console.log(`Key points: ${summaryResult.keyPoints.length}`);
      console.log(`Highlights: ${summaryResult.highlights.length}`);
      console.log(`Topics: ${summaryResult.topics.length}`);

      job.updateProgress(100);
      broadcastTaskUpdate(taskId, {
        type: 'progress',
        data: { stage: 'summarizing', progress: 100, step: 'Summary generation completed' }
      });

      return {
        taskId,
        summaryResult,
        status: 'completed',
        processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`Summarization failed for task ${taskId}:`, error);

      // Update task manifest with error
      await this.updateTaskManifest(taskId, {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        taskId,
        summaryResult: {
          summary: '',
          highlights: [],
          topics: [],
          keyPoints: [],
          metadata: {
            totalWords: 0,
            processingTime,
            model: 'gpt-4o',
            language: options?.language || 'Chinese',
            style: options?.style || 'detailed',
          },
        },
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        processingTime,
      };
    }
  }

  /**
   * Generate custom summary with specific prompt
   */
  async generateCustomSummary(job: Job<{
    taskId: string;
    transcriptionPath: string;
    customPrompt: string;
    language?: string;
  }>): Promise<{
    taskId: string;
    customSummary: string;
    status: 'completed' | 'failed';
    error?: string;
  }> {
    const { taskId, transcriptionPath, customPrompt, language } = job.data;

    try {
      // Load transcription
      const transcriptionResult = await this.loadTranscriptionResult(transcriptionPath);
      
      if (!transcriptionResult) {
        throw new Error('Failed to load transcription result');
      }

      // This would require extending the AI summarizer to support custom prompts
      // For now, use the standard summarization with custom language
      const summaryOptions: SummaryOptions = {
        transcription: transcriptionResult,
        outputDir: fileManager.getTaskDirectory(taskId),
        language: language || 'English',
        style: 'detailed',
        includeTimestamps: true,
      };

      const summaryResult = await aiSummarizer.generateSummary(summaryOptions);

      return {
        taskId,
        customSummary: summaryResult.summary,
        status: 'completed',
      };
    } catch (error) {
      console.error(`Custom summarization failed for task ${taskId}:`, error);
      return {
        taskId,
        customSummary: '',
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Process batch summarization
   */
  async processBatchSummarization(job: Job<{
    tasks: Array<{ taskId: string; transcriptionPath: string; options?: any }>;
  }>): Promise<{
    results: Array<{
      taskId: string;
      status: 'completed' | 'failed';
      summaryResult?: SummaryResult;
      error?: string;
    }>;
  }> {
    const { tasks } = job.data;
    const results: Array<{
      taskId: string;
      status: 'completed' | 'failed';
      summaryResult?: SummaryResult;
      error?: string;
    }> = [];

    console.log(`Processing batch summarization with ${tasks.length} tasks`);

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      
      try {
        // Update batch progress
        job.updateProgress((i / tasks.length) * 100);

        // Create individual job data
        if (!task) {
          throw new Error('Task is undefined');
        }
        
        const jobData: SummarizationJobData = {
          taskId: task.taskId,
          transcriptionPath: task.transcriptionPath,
          options: task.options,
        };

        // Process individual summarization
        const result = await this.processSummarizationJob({
          data: jobData,
          updateProgress: () => {}, // No individual progress for batch
        } as unknown as Job<SummarizationJobData>);

        results.push({
          taskId: task.taskId,
          status: result.status,
          summaryResult: result.summaryResult,
          ...(result.error && { error: result.error }),
        });

        // Add delay to respect rate limits
        await this.delay(1000);
      } catch (error) {
        results.push({
          taskId: task?.taskId || 'unknown',
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(`Batch summarization completed: ${results.length} tasks processed`);
    const successful = results.filter(r => r.status === 'completed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    console.log(`Successful: ${successful}, Failed: ${failed}`);

    return { results };
  }

  /**
   * Test AI summarization capability
   */
  async testSummarizationCapability(job: Job<{
    testTranscriptionPath: string;
  }>): Promise<{
    isWorking: boolean;
    testSummary?: string;
    error?: string;
    processingTime: number;
  }> {
    const { testTranscriptionPath } = job.data;
    const startTime = Date.now();

    try {
      console.log('Testing summarization capability...');

      // Load test transcription
      const transcriptionResult = await this.loadTranscriptionResult(testTranscriptionPath);
      
      if (!transcriptionResult) {
        throw new Error('Failed to load test transcription');
      }

      // Generate test summary
      const testSummary = await aiSummarizer.generateSummary({
        transcription: transcriptionResult,
        outputDir: '/tmp',
        language: 'English',
        style: 'detailed',
        includeTimestamps: false,
      });

      const processingTime = Date.now() - startTime;

      console.log('Summarization capability test completed');
      console.log(`Processing time: ${processingTime}ms`);
      console.log(`Test summary length: ${testSummary.summary.length} characters`);

      return {
        isWorking: true,
        testSummary: testSummary.summary,
        processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error('Summarization capability test failed:', error);
      return {
        isWorking: false,
        error: error instanceof Error ? error.message : String(error),
        processingTime,
      };
    }
  }

  /**
   * Get summarization statistics
   */
  async getSummarizationStats(): Promise<{
    totalSummaries: number;
    successfulSummaries: number;
    failedSummaries: number;
    averageProcessingTime: number;
    averageSummaryLength: number;
    rateLimitStatus: any;
  }> {
    try {
      const rateLimitStatus = await aiSummarizer.getSummaryStats();
      
      // This would need to be tracked in a database or persistent storage
      // For now, return placeholder values with actual rate limit status
      return {
        totalSummaries: 0,
        successfulSummaries: 0,
        failedSummaries: 0,
        averageProcessingTime: 0,
        averageSummaryLength: 0,
        rateLimitStatus,
      };
    } catch (error) {
      console.error('Failed to get summarization stats:', error);
      return {
        totalSummaries: 0,
        successfulSummaries: 0,
        failedSummaries: 0,
        averageProcessingTime: 0,
        averageSummaryLength: 0,
        rateLimitStatus: null,
      };
    }
  }

  /**
   * Load transcription result from file
   */
  private async loadTranscriptionResult(transcriptionPath: string): Promise<TranscriptionResult | null> {
    try {
      const content = await fs.readFile(transcriptionPath, 'utf-8');
      return JSON.parse(content) as TranscriptionResult;
    } catch (error) {
      console.error(`Failed to load transcription from ${transcriptionPath}:`, error);
      return null;
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
   * Delay execution for rate limiting
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate summarization configuration
   */
  async validateConfiguration(): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check OpenAI API key
      if (!process.env.OPENAI_API_KEY) {
        errors.push('OPENAI_API_KEY environment variable not set');
      }

      // Test API connection
      try {
        await aiSummarizer.getSummaryStats();
      } catch (error) {
        errors.push('Failed to connect to OpenAI API');
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

  /**
   * Cleanup summarization resources
   */
  async cleanup(taskId: string): Promise<void> {
    try {
      console.log(`Summarization cleanup completed for task: ${taskId}`);
    } catch (error) {
      console.error(`Summarization cleanup failed for task ${taskId}:`, error);
    }
  }

  /**
   * Estimate summarization time
   */
  estimateSummarizationTime(transcriptionLength: number): number {
    // Rough estimate based on text length
    // OpenAI API typically processes ~1000 tokens per second
    // 1 token ≈ 4 characters on average
    const tokens = transcriptionLength / 4;
    const processingTime = tokens / 1000; // seconds
    
    // Add API latency and overhead
    const overhead = 5; // seconds
    
    return Math.ceil(processingTime + overhead);
  }
}

/**
 * Worker processor function for BullMQ
 */
export async function processSummarizationJob(job: Job<SummarizationJobData>): Promise<any> {
  const worker = new SummarizeWorker();
  return await worker.processSummarizationJob(job);
}

/**
 * Custom summary processor function for BullMQ
 */
export async function processCustomSummaryJob(job: Job<{
  taskId: string;
  transcriptionPath: string;
  customPrompt: string;
  language?: string;
}>): Promise<any> {
  const worker = new SummarizeWorker();
  return await worker.generateCustomSummary(job);
}

/**
 * Test summarization processor function for BullMQ
 */
export async function processSummarizationTestJob(job: Job<{
  testTranscriptionPath: string;
}>): Promise<any> {
  const worker = new SummarizeWorker();
  return await worker.testSummarizationCapability(job);
}

/**
 * Multi-job processor for summarization worker (handles both flow and legacy jobs)
 */
export async function processSummarizationJobs(job: Job): Promise<any> {
  const worker = new SummarizeWorker();
  
  // Route based on job name
  switch (job.name) {
    case 'generate-summary':
      return await worker.processFlowSummarizationJob(job as Job<SummarizationStageData>);
    case 'process-summarization':
    default:
      return await worker.processSummarizationJob(job as Job<SummarizationJobData>);
  }
}

/**
 * Default summarize worker instance
 */
export const summarizeWorker = new SummarizeWorker();