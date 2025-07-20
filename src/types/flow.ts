/**
 * Flow-based task data structures for concurrent video processing
 */

import { TaskStatus } from './task.js';

/**
 * Enhanced task flow data for multi-stage processing
 */
export interface TaskFlowData {
  taskId: string;
  url: string;
  options?: {
    language?: string;
    priority?: 'low' | 'normal' | 'high';
  };
  stage?: 'download' | 'audio_processing' | 'summarization';
  previousStageResult?: any;
}

/**
 * Flow stage result structure
 */
export interface FlowStageResult {
  taskId: string;
  stage: string;
  success: boolean;
  files: Record<string, string>;
  metadata: any;
  error?: string;
}

/**
 * Download stage data
 */
export interface DownloadStageData {
  taskId: string;
  url: string;
  options?: {
    format?: string;
    quality?: string;
    priority?: 'low' | 'normal' | 'high';
  };
}

/**
 * Audio processing stage data
 */
export interface AudioProcessingStageData {
  taskId: string;
  downloadResult?: any;
  options?: {
    language?: string;
  };
}

/**
 * Summarization stage data
 */
export interface SummarizationStageData {
  taskId: string;
  transcriptionResult?: any;
  options?: {
    language?: string;
    style?: 'detailed';
    includeTimestamps?: boolean;
  };
}

/**
 * Flow progress tracking
 */
export interface FlowProgress {
  taskId: string;
  currentStage: string;
  overallProgress: number;
  stageProgress: number;
  step: string;
  startedAt: string;
  estimatedCompletion?: string;
}

/**
 * Stage configuration
 */
export interface StageConfig {
  name: string;
  queueName: string;
  concurrency: number;
  priority: number;
  timeout?: number;
  retries?: number;
}

/**
 * Video processing flow configuration
 */
export interface VideoProcessingFlowConfig {
  stages: {
    download: StageConfig;
    audioProcessing: StageConfig;
    summarization: StageConfig;
  };
  maxConcurrentFlows: number;
  memoryLimits: {
    transcription: number; // Max memory per transcription job in bytes
    maxConcurrentTranscriptions: number;
  };
}

/**
 * Default flow configuration following CLAUDE.md requirements
 */
export const DEFAULT_FLOW_CONFIG: VideoProcessingFlowConfig = {
  stages: {
    download: {
      name: 'download',
      queueName: 'download',
      concurrency: 3, // 3 concurrent downloads
      priority: 10,
      timeout: 300000, // 5 minutes
      retries: 3,
    },
    audioProcessing: {
      name: 'audio-processing',
      queueName: 'audio-processing',
      concurrency: 2, // Memory limit: max 2 transcription jobs
      priority: 5,
      timeout: 600000, // 10 minutes for large files
      retries: 2,
    },
    summarization: {
      name: 'summarization',
      queueName: 'summarization',
      concurrency: 1, // OpenAI rate limiting
      priority: 1,
      timeout: 120000, // 2 minutes
      retries: 3,
    },
  },
  maxConcurrentFlows: 5,
  memoryLimits: {
    transcription: 2_000_000_000, // 2GB per transcription job
    maxConcurrentTranscriptions: 2,
  },
};