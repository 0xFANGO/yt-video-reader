/**
 * Stage Orchestrator Worker
 * 
 * Coordinates between download, audio processing, and summarization stages.
 * Manages file path passing between stages and handles stage completion and error propagation.
 */

import { Job } from 'bullmq';
import { TaskFlowData, FlowStageResult } from '../types/flow.js';
import { createDefaultManifest } from '../types/task.js';
import { fileManager } from '../utils/file-manager.js';
import { videoProcessingFlowProducer } from '../services/flow-producer.js';
import { broadcastTaskUpdate } from '../api/events.js';

/**
 * Stage Orchestrator
 * 
 * Manages coordination between processing stages and ensures proper data flow
 */
export class StageOrchestrator {
  /**
   * Process orchestrator job - manages sequential stage execution
   */
  async processOrchestratorJob(job: Job<TaskFlowData>): Promise<FlowStageResult> {
    const { taskId, url } = job.data;
    
    console.log(`Starting orchestration for task: ${taskId}`);
    console.log(`URL: ${url}`);

    try {
      // Initialize task manifest
      const manifest = createDefaultManifest(taskId);
      manifest.status = 'downloading';
      manifest.currentStep = 'Starting video download';
      await fileManager.saveManifest(taskId, manifest);

      // Broadcast flow start
      broadcastTaskUpdate(taskId, {
        type: 'flow-start',
        data: {
          status: 'downloading',
          stage: 'orchestrator',
          progress: 0,
          step: 'Starting stage orchestration'
        }
      });

      // Update flow progress
      await videoProcessingFlowProducer.updateFlowProgress(
        taskId,
        'orchestrator',
        5,
        'Orchestrator managing stage execution'
      );

      // Orchestrator completes immediately, child jobs (download → audio → summary) will execute in sequence
      console.log(`Orchestrator: Flow coordination initialized for ${taskId}, child stages will execute in sequence`);

      return {
        taskId,
        stage: 'orchestrator',
        success: true,
        files: {},
        metadata: {
          orchestratorCompleted: new Date().toISOString(),
          nextStage: 'download',
          message: 'Orchestrator completed, BullMQ Flow will handle sequential stage execution'
        }
      };
    } catch (error) {
      console.error(`Orchestration failed for task ${taskId}:`, error);
      
      // Update flow with error
      await videoProcessingFlowProducer.failFlow(
        taskId,
        error instanceof Error ? error.message : String(error)
      );

      throw error;
    }
  }

  /**
   * Handle stage completion and coordinate next stage
   */
  async handleStageCompletion(
    taskId: string,
    completedStage: string,
    stageResult: FlowStageResult
  ): Promise<void> {
    console.log(`Stage ${completedStage} completed for task: ${taskId}`);

    try {
      // Update task manifest with stage completion
      let manifest = await fileManager.loadManifest(taskId);
      if (!manifest) {
        manifest = createDefaultManifest(taskId);
      }

      // Merge stage results into manifest
      manifest.files = { ...manifest.files, ...stageResult.files };
      
      // Update stage-specific status - CRITICAL: Update manifest.status for CLI sync
      switch (completedStage) {
        case 'download': {
          manifest.status = 'extracting'; // NEW: Set status to next stage for CLI sync
          manifest.currentStep = 'Download completed, starting audio processing';
          manifest.progress = 25;
          if (stageResult.metadata?.videoTitle) {
            manifest.videoTitle = stageResult.metadata.videoTitle;
          }
          if (stageResult.metadata?.videoDuration) {
            manifest.videoDuration = stageResult.metadata.videoDuration;
          }
          break;
        }
        case 'audio-processing': {
          manifest.status = 'summarizing'; // NEW: Set status to next stage for CLI sync
          manifest.currentStep = 'Audio processing completed, starting summarization';
          manifest.progress = 85;
          break;
        }
          
        case 'summarizing':
          manifest.status = 'completed';
          manifest.currentStep = 'All processing completed successfully';
          manifest.progress = 100;
          manifest.finishedAt = new Date().toISOString();
          
          // Complete the flow
          await videoProcessingFlowProducer.completeFlow(taskId);
          break;
      }

      await fileManager.saveManifest(taskId, manifest);

      // Broadcast stage completion
      broadcastTaskUpdate(taskId, {
        type: 'stage-complete',
        data: {
          completedStage,
          status: manifest.status,
          progress: manifest.progress,
          step: manifest.currentStep,
          stageResult
        }
      });

      // NEW: Broadcast immediate status change event for CLI sync
      broadcastTaskUpdate(taskId, {
        type: 'status-change',
        data: {
          status: manifest.status,
          stage: completedStage,
          progress: manifest.progress,
          step: manifest.currentStep,
          timestamp: new Date().toISOString()
        }
      });

      console.log(`Stage coordination completed for ${taskId}: ${completedStage}`);
    } catch (error) {
      console.error(`Failed to handle stage completion for ${taskId}:`, error);
      
      // Update flow with error
      await videoProcessingFlowProducer.failFlow(
        taskId,
        `Stage completion handling failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Handle stage failure and decide on recovery strategy
   */
  async handleStageFailure(
    taskId: string,
    failedStage: string,
    error: string,
    job: Job
  ): Promise<void> {
    console.error(`Stage ${failedStage} failed for task: ${taskId} - ${error}`);

    try {
      // Update task manifest with failure
      let manifest = await fileManager.loadManifest(taskId);
      if (!manifest) {
        manifest = createDefaultManifest(taskId);
      }

      manifest.status = 'failed';
      manifest.currentStep = `Failed at ${failedStage}: ${error}`;
      manifest.error = error;
      
      await fileManager.saveManifest(taskId, manifest);

      // Broadcast failure
      broadcastTaskUpdate(taskId, {
        type: 'stage-failed',
        data: {
          failedStage,
          status: 'failed',
          step: manifest.currentStep,
          error
        }
      });

      // Update flow with failure
      await videoProcessingFlowProducer.failFlow(taskId, error);

      // Check if job should be retried based on stage and error type
      const shouldRetry = this.shouldRetryStage(failedStage, error, job.attemptsMade);
      
      if (shouldRetry) {
        console.log(`Retrying stage ${failedStage} for task: ${taskId} (attempt ${job.attemptsMade + 1})`);
        
        // Reset manifest for retry
        manifest.status = 'pending';
        manifest.currentStep = `Retrying ${failedStage}...`;
        delete manifest.error;
        
        await fileManager.saveManifest(taskId, manifest);

        // The BullMQ retry mechanism will handle the actual retry
        throw new Error(error); // Re-throw to trigger retry
      } else {
        console.log(`Not retrying stage ${failedStage} for task: ${taskId} - max attempts reached or non-retryable error`);
      }
    } catch (coordinationError) {
      console.error(`Failed to handle stage failure coordination for ${taskId}:`, coordinationError);
    }
  }

  /**
   * Get stage results from completed child jobs
   */
  async getStageResults(job: Job): Promise<Record<string, any>> {
    try {
      const childrenValues = await job.getChildrenValues();
      return childrenValues || {};
    } catch (error) {
      console.error('Failed to get stage results:', error);
      return {};
    }
  }

  /**
   * Validate stage data consistency
   */
  async validateStageData(
    taskId: string,
    stage: string,
    stageData: any
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate task directory exists
    if (!fileManager.taskDirectoryExists(taskId)) {
      errors.push(`Task directory not found for ${taskId}`);
    }

    // Stage-specific validations
    switch (stage) {
      case 'download':
        if (!stageData?.url) {
          errors.push('Download stage missing URL');
        }
        break;
        
      case 'audio-processing':
        // Check if download files exist
        const manifest = await fileManager.loadManifest(taskId);
        if (!manifest?.files?.['original.mp4']) {
          errors.push('Audio processing stage missing video file from download');
        }
        break;
        
      case 'summarization':
        // Check if transcription files exist
        const manifestSumm = await fileManager.loadManifest(taskId);
        if (!manifestSumm?.files?.['transcription.json']) {
          errors.push('Summarization stage missing transcription file');
        }
        break;
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Determine if a stage should be retried based on failure type
   */
  private shouldRetryStage(stage: string, error: string, attemptsMade: number): boolean {
    const maxAttempts = this.getMaxAttemptsForStage(stage);
    
    if (attemptsMade >= maxAttempts) {
      return false;
    }

    // Don't retry for certain error types
    const nonRetryableErrors = [
      'Invalid YouTube URL',
      'Video not found',
      'Video too long',
      'Insufficient disk space',
      'Invalid file format'
    ];

    const isNonRetryable = nonRetryableErrors.some(nonRetryError => 
      error.toLowerCase().includes(nonRetryError.toLowerCase())
    );

    return !isNonRetryable;
  }

  /**
   * Get maximum retry attempts for each stage
   */
  private getMaxAttemptsForStage(stage: string): number {
    switch (stage) {
      case 'download': return 3;
      case 'audio-processing': return 2;
      case 'summarization': return 3;
      default: return 1;
    }
  }

  /**
   * Wait for job completion using polling approach (avoids QueueEvents dependency)
   * DISABLED: TypeScript compatibility issues with BullMQ queue access
   */
  private async waitForJobCompletion(job: Job, timeoutMs: number): Promise<any> {
    // Disabled due to TypeScript compatibility issues
    throw new Error('waitForJobCompletion is disabled due to TypeScript compatibility issues');
    /*
    const startTime = Date.now();
    const pollInterval = 2000; // Poll every 2 seconds
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        // Get fresh job instance from queue to check current state
        const queue = job.queue;
        const freshJob = await queue.getJob(job.id as string);
        
        if (!freshJob) {
          throw new Error(`Job ${job.id} not found in queue`);
        }
        
        const state = await freshJob.getState();
        
        if (state === 'completed') {
          console.log(`Job ${job.id} completed successfully`);
          return freshJob.returnvalue;
        } else if (state === 'failed') {
          console.error(`Job ${job.id} failed:`, freshJob.failedReason);
          throw new Error(`Job failed: ${freshJob.failedReason || 'Unknown error'}`);
        } else if (state === 'stalled') {
          console.warn(`Job ${job.id} is stalled`);
          throw new Error('Job stalled - worker may be down');
        }
        
        // Job is still processing (waiting, active, etc.), wait and poll again
        console.log(`Job ${job.id} is in state: ${state}, waiting...`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        if (error instanceof Error && error.message.includes('Job failed')) {
          throw error;
        }
        console.warn(`Error polling job ${job.id}:`, error);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    throw new Error(`Job ${job.id} timed out after ${timeoutMs}ms`);
    */
  }

  /**
   * Get processing statistics for monitoring
   */
  async getProcessingStats(): Promise<{
    activeStages: Record<string, number>;
    averageStageTime: Record<string, number>;
    stageSuccessRate: Record<string, number>;
  }> {
    // This would need to be tracked in a database for production
    // For now, return placeholder values
    return {
      activeStages: {
        download: 0,
        'audio-processing': 0,
        summarization: 0
      },
      averageStageTime: {
        download: 30,
        'audio-processing': 60,
        summarization: 15
      },
      stageSuccessRate: {
        download: 95,
        'audio-processing': 90,
        summarization: 98
      }
    };
  }
}

/**
 * Multi-job processor for orchestrator worker
 */
export async function processOrchestratorJobs(job: Job): Promise<any> {
  const orchestrator = new StageOrchestrator();
  
  // Route based on job name
  switch (job.name) {
    case 'video-processing-orchestrator':
      return await orchestrator.processOrchestratorJob(job as Job<TaskFlowData>);
    default:
      throw new Error(`Unknown orchestrator job type: ${job.name}`);
  }
}

/**
 * Default stage orchestrator instance
 */
export const stageOrchestrator = new StageOrchestrator();