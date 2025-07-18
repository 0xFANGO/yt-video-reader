import { z } from 'zod';
import { CreateTaskSchema, TaskStatus } from './task.js';

/**
 * API Response wrapper
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code: string;
    details?: any;
  };
}

/**
 * Task creation input (reuse from task.ts)
 */
export const CreateTaskInputSchema = CreateTaskSchema;
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

/**
 * Task creation response
 */
export const TaskCreationResponseSchema = z.object({
  taskId: z.string(),
  status: z.enum(['pending', 'downloading', 'extracting', 'separating', 'transcribing', 'summarizing', 'completed', 'failed']),
  message: z.string(),
});
export type TaskCreationResponse = z.infer<typeof TaskCreationResponseSchema>;

/**
 * Task status query input
 */
export const TaskStatusInputSchema = z.object({
  taskId: z.string(),
});
export type TaskStatusInput = z.infer<typeof TaskStatusInputSchema>;

/**
 * Task status response
 */
export const TaskStatusResponseSchema = z.object({
  taskId: z.string(),
  status: z.enum(['pending', 'downloading', 'extracting', 'separating', 'transcribing', 'summarizing', 'completed', 'failed']),
  progress: z.number(),
  currentStep: z.string(),
  createdAt: z.string(),
  finishedAt: z.string().optional(),
  files: z.record(z.string(), z.string()),
  error: z.string().optional(),
  videoTitle: z.string().optional(),
  videoDuration: z.number().optional(),
});
export type TaskStatusResponse = z.infer<typeof TaskStatusResponseSchema>;

/**
 * Task files query input
 */
export const TaskFilesInputSchema = z.object({
  taskId: z.string(),
});
export type TaskFilesInput = z.infer<typeof TaskFilesInputSchema>;

/**
 * File information
 */
export const FileInfoSchema = z.object({
  filename: z.string(),
  path: z.string(),
  size: z.number(),
  mimeType: z.string(),
  createdAt: z.string(),
});
export type FileInfo = z.infer<typeof FileInfoSchema>;

/**
 * Task files response
 */
export const TaskFilesResponseSchema = z.object({
  taskId: z.string(),
  files: z.array(FileInfoSchema),
});
export type TaskFilesResponse = z.infer<typeof TaskFilesResponseSchema>;

/**
 * Task deletion input
 */
export const TaskDeletionInputSchema = z.object({
  taskId: z.string(),
});
export type TaskDeletionInput = z.infer<typeof TaskDeletionInputSchema>;

/**
 * Task deletion response
 */
export const TaskDeletionResponseSchema = z.object({
  taskId: z.string(),
  deleted: z.boolean(),
  message: z.string(),
});
export type TaskDeletionResponse = z.infer<typeof TaskDeletionResponseSchema>;

/**
 * File download input
 */
export const FileDownloadInputSchema = z.object({
  taskId: z.string(),
  filename: z.string(),
});
export type FileDownloadInput = z.infer<typeof FileDownloadInputSchema>;

/**
 * Server-sent event message
 */
export const SSEMessageSchema = z.object({
  type: z.enum(['progress', 'status', 'error', 'complete']),
  taskId: z.string(),
  data: z.any(),
  timestamp: z.string(),
});
export type SSEMessage = z.infer<typeof SSEMessageSchema>;

/**
 * Health check response
 */
export const HealthCheckResponseSchema = z.object({
  status: z.enum(['healthy', 'unhealthy']),
  timestamp: z.string(),
  services: z.object({
    redis: z.boolean(),
    whisper: z.boolean(),
    storage: z.boolean(),
  }),
  version: z.string(),
});
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;

/**
 * Statistics response
 */
export const StatsResponseSchema = z.object({
  totalTasks: z.number(),
  completedTasks: z.number(),
  failedTasks: z.number(),
  activeTasks: z.number(),
  queueSize: z.number(),
  averageProcessingTime: z.number(),
});
export type StatsResponse = z.infer<typeof StatsResponseSchema>;

/**
 * Error response structure
 */
export const ErrorResponseSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.string(),
    details: z.any().optional(),
    timestamp: z.string(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/**
 * Create standardized API error response
 */
export function createApiError(
  message: string, 
  code: string, 
  details?: any
): ErrorResponse {
  return {
    error: {
      message,
      code,
      details,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Create standardized API success response
 */
export function createApiResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
  };
}

/**
 * Create standardized API error response with wrapper
 */
export function createApiErrorResponse(
  message: string, 
  code: string, 
  details?: any
): ApiResponse {
  return {
    success: false,
    error: {
      message,
      code,
      details,
    },
  };
}