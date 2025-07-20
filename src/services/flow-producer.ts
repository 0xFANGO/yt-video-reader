/**
 * Video Processing Flow Producer Service
 * 
 * Coordinates multi-stage video processing using BullMQ Flows for concurrent execution
 * while maintaining memory limits and proper stage dependencies.
 */

import { FlowProducer, FlowJob } from 'bullmq';
import { 
  DownloadStageData, 
  AudioProcessingStageData, 
  SummarizationStageData,
  VideoProcessingFlowConfig,
  DEFAULT_FLOW_CONFIG,
  FlowProgress
} from '../types/flow.js';
import { generateTaskId } from '../types/task.js';
import { queueConfig } from '../utils/queue-config.js';
import { isValidYouTubeUrl } from '../utils/validation.js';
import { fileManager } from '../utils/file-manager.js';

/**
 * Video Processing Flow Producer
 * 
 * Manages the creation and coordination of multi-stage video processing flows
 */
export class VideoProcessingFlowProducer {
  private flowProducer: FlowProducer;
  private config: VideoProcessingFlowConfig;
  private activeFlows: Map<string, FlowProgress> = new Map();

  constructor(config: VideoProcessingFlowConfig = DEFAULT_FLOW_CONFIG) {
    this.config = config;
    
    // Initialize FlowProducer with Redis connection
    this.flowProducer = new FlowProducer({
      connection: queueConfig.getRedisConnection(),
    });
  }

  /**
   * Create a video processing flow with concurrent stages
   * 
   * @param url YouTube video URL
   * @param options Processing options
   * @returns Flow information including task ID and flow ID
   */
  async createVideoProcessingFlow(
    url: string, 
    options?: { language?: string; priority?: 'low' | 'normal' | 'high' }
  ): Promise<{
    taskId: string;
    flowId: string;
    estimatedDuration: number;
  }> {
    // Validate YouTube URL
    if (!isValidYouTubeUrl(url)) {
      throw new Error('Invalid YouTube URL format');
    }

    // Check flow capacity
    if (this.activeFlows.size >= this.config.maxConcurrentFlows) {
      throw new Error('Maximum concurrent flows exceeded. Please wait for existing tasks to complete.');
    }

    // Generate unique task ID
    const taskId = generateTaskId();
    
    // Create task directory and initial manifest
    await fileManager.createTaskDirectory(taskId);
    
    // Create initial task manifest (no orchestrator, starts with download)
    const { createDefaultManifest } = await import('../types/task.js');
    const manifest = createDefaultManifest(taskId);
    manifest.status = 'downloading';
    manifest.currentStep = 'Starting video download';
    await fileManager.saveManifest(taskId, manifest);

    // Prepare stage data
    const downloadStageData: DownloadStageData = {
      taskId,
      url,
      options: {
        format: 'best[ext=mp4][height<=1080]',
        quality: 'best',
        priority: options?.priority || 'normal',
      },
    };

    const audioProcessingStageData: AudioProcessingStageData = {
      taskId,
      ...(options?.language ? { options: { language: options.language } } : {}),
    };

    const summarizationStageData: SummarizationStageData = {
      taskId,
      options: {
        language: options?.language || 'English',
        style: 'concise',
        includeTimestamps: true,
      },
    };

    // Simple approach: Use only download job with proper data flow
    // Other stages will be triggered by workers via queue additions based on manifest state
    const flowJob: FlowJob = {
      name: 'download-video',
      data: downloadStageData,
      queueName: this.config.stages.download.queueName,
      opts: {
        priority: this.config.stages.download.priority,
        attempts: this.config.stages.download.retries || 3,
        jobId: `${taskId}-download`,
      },
    };

    // Add flow to FlowProducer
    const flow = await this.flowProducer.add(flowJob);
    
    // Track flow progress
    const flowProgress: FlowProgress = {
      taskId,
      currentStage: 'download',
      overallProgress: 0,
      stageProgress: 0,
      step: 'Flow created, waiting for download to start',
      startedAt: new Date().toISOString(),
    };
    
    this.activeFlows.set(taskId, flowProgress);

    console.log(`Created video processing flow for task: ${taskId}`);
    console.log(`Flow ID: ${flow.job?.id || taskId}`);
    console.log(`URL: ${url}`);
    console.log(`Priority: ${options?.priority || 'normal'}`);

    return {
      taskId,
      flowId: String(flow.job?.id || `${taskId}-download`),
      estimatedDuration: this.estimateProcessingDuration(),
    };
  }

  /**
   * Get flow status and progress
   */
  async getFlowStatus(taskId: string): Promise<FlowProgress | null> {
    return this.activeFlows.get(taskId) || null;
  }

  /**
   * Update flow progress (called by stage workers)
   */
  async updateFlowProgress(
    taskId: string,
    stage: string,
    stageProgress: number,
    step: string
  ): Promise<void> {
    const flowProgress = this.activeFlows.get(taskId);
    if (!flowProgress) {
      console.warn(`No flow progress found for task: ${taskId}`);
      return;
    }

    // Calculate overall progress based on stage
    let overallProgress = 0;
    switch (stage) {
      case 'download':
        overallProgress = stageProgress * 0.25; // Download is 25% of total
        break;
      case 'audio-processing':
        overallProgress = 25 + (stageProgress * 0.6); // Audio processing is 60% of total
        break;
      case 'summarization':
        overallProgress = 85 + (stageProgress * 0.15); // Summarization is 15% of total
        break;
    }

    // Update progress
    flowProgress.currentStage = stage;
    flowProgress.overallProgress = Math.min(100, Math.max(0, overallProgress));
    flowProgress.stageProgress = stageProgress;
    flowProgress.step = step;

    this.activeFlows.set(taskId, flowProgress);

    console.log(`Flow progress updated for ${taskId}: ${stage} (${stageProgress}%) - ${step}`);
  }

  /**
   * Complete flow (remove from active tracking)
   */
  async completeFlow(taskId: string): Promise<void> {
    const flowProgress = this.activeFlows.get(taskId);
    if (flowProgress) {
      flowProgress.overallProgress = 100;
      flowProgress.step = 'Flow completed successfully';
      
      // Remove from active flows after a delay to allow final status queries
      setTimeout(() => {
        this.activeFlows.delete(taskId);
      }, 30000); // Keep for 30 seconds
    }

    console.log(`Flow completed for task: ${taskId}`);
  }

  /**
   * Handle flow failure
   */
  async failFlow(taskId: string, error: string): Promise<void> {
    const flowProgress = this.activeFlows.get(taskId);
    if (flowProgress) {
      flowProgress.step = `Flow failed: ${error}`;
      
      // Remove from active flows after a delay
      setTimeout(() => {
        this.activeFlows.delete(taskId);
      }, 60000); // Keep for 1 minute to allow error inspection
    }

    console.error(`Flow failed for task: ${taskId} - ${error}`);
  }

  /**
   * Get active flows count for capacity management
   */
  getActiveFlowsCount(): number {
    return this.activeFlows.size;
  }

  /**
   * Get active flows summary
   */
  getActiveFlowsSummary(): Array<{
    taskId: string;
    currentStage: string;
    overallProgress: number;
    step: string;
    startedAt: string;
  }> {
    return Array.from(this.activeFlows.values()).map(flow => ({
      taskId: flow.taskId,
      currentStage: flow.currentStage,
      overallProgress: flow.overallProgress,
      step: flow.step,
      startedAt: flow.startedAt,
    }));
  }

  /**
   * Estimate processing duration based on video analysis
   */
  private estimateProcessingDuration(): number {
    // Base estimate for average 10-minute video
    // Download: ~30 seconds
    // Audio processing: ~60 seconds (extraction + transcription)
    // Summarization: ~15 seconds
    // Total: ~105 seconds
    return 105;
  }

  /**
   * Convert priority string to numeric value
   */
  private getPriorityValue(priority: 'low' | 'normal' | 'high'): number {
    switch (priority) {
      case 'high': return 10;
      case 'normal': return 5;
      case 'low': return 1;
      default: return 5;
    }
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    await this.flowProducer.close();
    this.activeFlows.clear();
    console.log('FlowProducer closed and resources cleaned up');
  }

  /**
   * Get flow statistics
   */
  async getFlowStats(): Promise<{
    activeFlows: number;
    maxConcurrentFlows: number;
    flowCapacityUsed: number;
    averageFlowDuration: number;
  }> {
    return {
      activeFlows: this.activeFlows.size,
      maxConcurrentFlows: this.config.maxConcurrentFlows,
      flowCapacityUsed: (this.activeFlows.size / this.config.maxConcurrentFlows) * 100,
      averageFlowDuration: this.estimateProcessingDuration(),
    };
  }
}

/**
 * Default flow producer instance
 */
export const videoProcessingFlowProducer = new VideoProcessingFlowProducer();