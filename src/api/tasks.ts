import { z } from 'zod';
import { router, protectedProcedure, handleAsyncOperation } from './trpc.js';
import { 
  CreateTaskInputSchema, 
  TaskStatusInputSchema, 
  TaskFilesInputSchema, 
  TaskDeletionInputSchema,
  TaskCreationResponse,
  TaskStatusResponse,
  TaskFilesResponse,
  TaskDeletionResponse,
  createApiResponse,
  createApiErrorResponse
} from '../types/api.js';
import { generateTaskId, createDefaultManifest } from '../types/task.js';
import { fileManager } from '../utils/file-manager.js';
import { queueConfig } from '../utils/queue-config.js';
import { videoProcessingFlowProducer } from '../services/flow-producer.js';
import { isValidYouTubeUrl } from '../utils/validation.js';

/**
 * Task management router
 */
export const tasksRouter = router({
  /**
   * Create a new video processing task
   */
  create: protectedProcedure
    .input(CreateTaskInputSchema)
    .output(z.object({
      taskId: z.string(),
      status: z.string(),
      message: z.string(),
    }))
    .mutation(async ({ input }): Promise<TaskCreationResponse> => {
      return handleAsyncOperation(async () => {
        const { link, options } = input;

        // Validate YouTube URL
        if (!isValidYouTubeUrl(link)) {
          throw new Error('Invalid YouTube URL');
        }

        // Create video processing flow using the new flow system
        // The flow producer will generate its own taskId to avoid conflicts
        try {
          const flowResult = await videoProcessingFlowProducer.createVideoProcessingFlow(
            link,
            {
              ...(options?.language && { language: options.language }),
              priority: options?.priority || 'normal',
            }
          );

          console.log(`Created flow-based task: ${flowResult.taskId} for URL: ${link}`);
          console.log(`Flow ID: ${flowResult.flowId}`);
          console.log(`Estimated duration: ${flowResult.estimatedDuration} seconds`);

          return {
            taskId: flowResult.taskId,
            status: 'pending',
            message: 'Task created and queued for concurrent processing',
          };
        } catch (flowError) {
          if (flowError instanceof Error && flowError.message.includes('Maximum concurrent flows exceeded')) {
            throw new Error('System is at maximum capacity. Please try again in a few minutes.');
          }
          
          throw flowError;
        }
      }, 'Failed to create task');
    }),

  /**
   * Get task status and progress
   */
  getStatus: protectedProcedure
    .input(TaskStatusInputSchema)
    .output(z.object({
      taskId: z.string(),
      status: z.string(),
      progress: z.number(),
      currentStep: z.string(),
      createdAt: z.string(),
      finishedAt: z.string().optional(),
      files: z.record(z.string(), z.string()),
      error: z.string().optional(),
      videoTitle: z.string().optional(),
      videoDuration: z.number().optional(),
    }))
    .query(async ({ input }): Promise<TaskStatusResponse> => {
      return handleAsyncOperation(async () => {
        const { taskId } = input;

        // Check if task exists
        if (!fileManager.taskDirectoryExists(taskId)) {
          throw new Error('Task not found');
        }

        // Load task manifest
        const manifest = await fileManager.loadManifest(taskId);
        if (!manifest) {
          throw new Error('Task manifest not found');
        }

        return {
          taskId: manifest.taskId,
          status: manifest.status,
          progress: manifest.progress,
          currentStep: manifest.currentStep,
          createdAt: manifest.createdAt,
          finishedAt: manifest.finishedAt,
          files: manifest.files,
          error: manifest.error,
          videoTitle: manifest.videoTitle,
          videoDuration: manifest.videoDuration,
        };
      }, 'Failed to get task status');
    }),

  /**
   * Get task files
   */
  getFiles: protectedProcedure
    .input(TaskFilesInputSchema)
    .output(z.object({
      taskId: z.string(),
      files: z.array(z.object({
        filename: z.string(),
        path: z.string(),
        size: z.number(),
        mimeType: z.string(),
        createdAt: z.string(),
      })),
    }))
    .query(async ({ input }): Promise<TaskFilesResponse> => {
      return handleAsyncOperation(async () => {
        const { taskId } = input;

        // Check if task exists
        if (!fileManager.taskDirectoryExists(taskId)) {
          throw new Error('Task not found');
        }

        // Get task files
        const files = await fileManager.getTaskFiles(taskId);

        return {
          taskId,
          files,
        };
      }, 'Failed to get task files');
    }),

  /**
   * Delete a task and all its files
   */
  delete: protectedProcedure
    .input(TaskDeletionInputSchema)
    .output(z.object({
      taskId: z.string(),
      deleted: z.boolean(),
      message: z.string(),
    }))
    .mutation(async ({ input }): Promise<TaskDeletionResponse> => {
      return handleAsyncOperation(async () => {
        const { taskId } = input;

        // Check if task exists
        if (!fileManager.taskDirectoryExists(taskId)) {
          throw new Error('Task not found');
        }

        // Clean up task directory
        await fileManager.cleanupTask(taskId);

        console.log(`Deleted task: ${taskId}`);

        return {
          taskId,
          deleted: true,
          message: 'Task deleted successfully',
        };
      }, 'Failed to delete task');
    }),

  /**
   * List all tasks
   */
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
      status: z.enum(['pending', 'downloading', 'extracting', 'separating', 'transcribing', 'summarizing', 'completed', 'failed']).optional(),
    }))
    .query(async ({ input }) => {
      return handleAsyncOperation(async () => {
        const { limit, offset, status } = input;

        // This would need to be implemented with a proper database
        // For now, return empty array
        return {
          tasks: [],
          total: 0,
          limit,
          offset,
        };
      }, 'Failed to list tasks');
    }),

  /**
   * Get task statistics
   */
  getStats: protectedProcedure
    .query(async () => {
      return handleAsyncOperation(async () => {
        // Get storage statistics
        const storageStats = await fileManager.getStorageStats();
        
        // Get queue statistics
        const queueStats = await queueConfig.getQueueStats('video-processing');

        return {
          totalTasks: storageStats.totalTasks,
          completedTasks: queueStats.completed,
          failedTasks: queueStats.failed,
          activeTasks: queueStats.active,
          queueSize: queueStats.waiting,
          averageProcessingTime: 0, // Would need to track this
          storageUsed: storageStats.totalSize,
        };
      }, 'Failed to get task statistics');
    }),

  /**
   * Health check for task processing
   */
  healthCheck: protectedProcedure
    .query(async () => {
      return handleAsyncOperation(async () => {
        // Test Redis connection
        const redisHealthy = await queueConfig.testConnection();
        
        // Test storage
        const storageStats = await fileManager.getStorageStats();
        const storageHealthy = storageStats.totalTasks >= 0;

        // Test whisper configuration
        const { whisperCLI } = await import('../utils/whisper-cli.js');
        const whisperValidation = await whisperCLI.validateInstallation();

        return {
          status: redisHealthy && storageHealthy && whisperValidation.isValid ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          services: {
            redis: redisHealthy,
            storage: storageHealthy,
            whisper: whisperValidation.isValid,
          },
          version: '1.0.0',
        };
      }, 'Failed to perform health check');
    }),

  /**
   * Clean up old tasks
   */
  cleanupOld: protectedProcedure
    .input(z.object({
      maxAgeHours: z.number().min(1).max(168).default(24), // 1 hour to 1 week
    }))
    .mutation(async ({ input }) => {
      return handleAsyncOperation(async () => {
        const { maxAgeHours } = input;

        await fileManager.cleanupOldTasks(maxAgeHours);

        return {
          success: true,
          message: `Cleaned up tasks older than ${maxAgeHours} hours`,
        };
      }, 'Failed to cleanup old tasks');
    }),

  /**
   * Retry failed task
   */
  retry: protectedProcedure
    .input(z.object({
      taskId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return handleAsyncOperation(async () => {
        const { taskId } = input;

        // Check if task exists
        if (!fileManager.taskDirectoryExists(taskId)) {
          throw new Error('Task not found');
        }

        // Load task manifest
        const manifest = await fileManager.loadManifest(taskId);
        if (!manifest) {
          throw new Error('Task manifest not found');
        }

        // Only retry failed tasks
        if (manifest.status !== 'failed') {
          throw new Error('Task is not in failed state');
        }

        // Note: Task retry is currently limited due to not storing original URL
        // In the flow system, we need the original YouTube URL to recreate the flow
        throw new Error('Task retry is currently not supported with the flow system. Please create a new task with the original YouTube URL.');
      }, 'Failed to retry task');
    }),
});