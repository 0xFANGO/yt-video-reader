import { z } from 'zod';

/**
 * Task status flow with proper state transitions
 */
export type TaskStatus = 'pending' | 'downloading' | 'extracting' | 'separating' | 'transcribing' | 'summarizing' | 'completed' | 'failed';

/**
 * Task manifest structure for tracking progress and files
 */
export interface TaskManifest {
  taskId: string;
  status: TaskStatus;
  progress: number;
  currentStep: string;
  createdAt: string;
  finishedAt?: string;
  files: Record<string, string>;  // filename -> filepath mapping
  error?: string;
  whisperModel: 'large-v3';      // Fixed to user's installed model
  videoTitle?: string;
  videoDuration?: number;
}

/**
 * Task creation input validation schema
 */
export const CreateTaskSchema = z.object({
  link: z.string().url().refine(isYouTubeUrl, "Must be a valid YouTube URL"),
  options: z.object({
    language: z.string().optional(),
    priority: z.enum(['low', 'normal', 'high']).default('normal'),
  }).optional(),
});

/**
 * Task creation input type
 */
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

/**
 * YouTube URL validation patterns
 */
export function isYouTubeUrl(url: string): boolean {
  const youtubePatterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
    /^https?:\/\/(www\.)?youtu\.be\/[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/embed\/[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/v\/[\w-]+/,
  ];
  
  return youtubePatterns.some(pattern => pattern.test(url));
}

/**
 * Generate unique task ID
 */
export function generateTaskId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `task_${timestamp}_${randomPart}`;
}

/**
 * Create default task manifest
 */
export function createDefaultManifest(taskId: string): TaskManifest {
  return {
    taskId,
    status: 'pending',
    progress: 0,
    currentStep: 'initializing',
    createdAt: new Date().toISOString(),
    files: {},
    whisperModel: 'large-v3',
  };
}

/**
 * Task result for API responses
 */
export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  message: string;
}

/**
 * Task processing data for workers
 */
export interface TaskProcessingData {
  taskId: string;
  url: string;
  options?: {
    language?: string;
    priority?: 'low' | 'normal' | 'high';
  };
}