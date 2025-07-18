import { z } from 'zod';
import { router, protectedProcedure, handleAsyncOperation } from './trpc.js';
import { FileDownloadInputSchema } from '../types/api.js';
import { fileManager } from '../utils/file-manager.js';
import { existsSync, statSync, createReadStream } from 'fs';
import { Request, Response } from 'express';
import path from 'path';

/**
 * File management router
 */
export const filesRouter = router({
  /**
   * Get file information
   */
  getInfo: protectedProcedure
    .input(FileDownloadInputSchema)
    .query(async ({ input }) => {
      return handleAsyncOperation(async () => {
        const { taskId, filename } = input;

        // Check if task exists
        if (!fileManager.taskDirectoryExists(taskId)) {
          throw new Error('Task not found');
        }

        // Check if file exists
        if (!fileManager.fileExists(taskId, filename)) {
          throw new Error('File not found');
        }

        // Get file path
        const filePath = fileManager.getFilePath(taskId, filename);
        const stats = statSync(filePath);

        return {
          filename,
          size: stats.size,
          mimeType: getMimeType(filename),
          createdAt: stats.birthtime.toISOString(),
          modifiedAt: stats.mtime.toISOString(),
        };
      }, 'Failed to get file info');
    }),

  /**
   * List files for a task
   */
  list: protectedProcedure
    .input(z.object({
      taskId: z.string(),
    }))
    .query(async ({ input }) => {
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
          files: files.map(file => ({
            filename: file.filename,
            size: file.size,
            mimeType: file.mimeType,
            createdAt: file.createdAt,
          })),
        };
      }, 'Failed to list files');
    }),

  /**
   * Check if file exists
   */
  exists: protectedProcedure
    .input(FileDownloadInputSchema)
    .query(async ({ input }) => {
      return handleAsyncOperation(async () => {
        const { taskId, filename } = input;

        // Check if task exists
        if (!fileManager.taskDirectoryExists(taskId)) {
          return { exists: false, reason: 'Task not found' };
        }

        // Check if file exists
        const exists = fileManager.fileExists(taskId, filename);

        return {
          exists,
          reason: exists ? null : 'File not found',
        };
      }, 'Failed to check file existence');
    }),

  /**
   * Get file download URL (for signed URLs in production)
   */
  getDownloadUrl: protectedProcedure
    .input(FileDownloadInputSchema.extend({
      expiresIn: z.number().min(60).max(3600).default(3600), // 1 minute to 1 hour
    }))
    .query(async ({ input }) => {
      return handleAsyncOperation(async () => {
        const { taskId, filename, expiresIn } = input;

        // Check if task exists
        if (!fileManager.taskDirectoryExists(taskId)) {
          throw new Error('Task not found');
        }

        // Check if file exists
        if (!fileManager.fileExists(taskId, filename)) {
          throw new Error('File not found');
        }

        // In production, this would generate a signed URL
        // For now, return a simple download URL
        const downloadUrl = `/api/files/download/${taskId}/${filename}`;
        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

        return {
          downloadUrl,
          expiresAt,
          filename,
        };
      }, 'Failed to get download URL');
    }),

  /**
   * Get file statistics
   */
  getStats: protectedProcedure
    .input(z.object({
      taskId: z.string(),
    }))
    .query(async ({ input }) => {
      return handleAsyncOperation(async () => {
        const { taskId } = input;

        // Check if task exists
        if (!fileManager.taskDirectoryExists(taskId)) {
          throw new Error('Task not found');
        }

        // Get task files
        const files = await fileManager.getTaskFiles(taskId);

        const stats = {
          totalFiles: files.length,
          totalSize: files.reduce((sum, file) => sum + file.size, 0),
          fileTypes: files.reduce((acc, file) => {
            const ext = path.extname(file.filename).toLowerCase();
            acc[ext] = (acc[ext] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          largestFile: files.reduce((largest, file) => 
            file.size > largest.size ? file : largest, 
            files[0] || { filename: '', size: 0 }
          ),
        };

        return stats;
      }, 'Failed to get file statistics');
    }),
});

/**
 * Express middleware for file downloads
 */
export function createFileDownloadHandler() {
  return async (req: Request, res: Response) => {
    try {
      const { taskId, filename } = req.params;

      if (!taskId || !filename) {
        return res.status(400).json({ error: 'Missing taskId or filename' });
      }

      // Check if task exists
      if (!fileManager.taskDirectoryExists(taskId)) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Check if file exists
      if (!fileManager.fileExists(taskId, filename)) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Get file path
      const filePath = fileManager.getFilePath(taskId, filename);
      
      if (!existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found on disk' });
      }

      // Get file stats
      const stats = statSync(filePath);
      const mimeType = getMimeType(filename);

      // Set headers
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour cache

      // Handle range requests (for video streaming)
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0] || '0', 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        const chunksize = (end - start) + 1;
        
        const stream = createReadStream(filePath, { start, end });
        
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Length', chunksize);
        
        stream.pipe(res);
        return;
      } else {
        // Stream the entire file
        const stream = createReadStream(filePath);
        stream.pipe(res);
        return;
      }
    } catch (error) {
      console.error('File download error:', error);
      return res.status(500).json({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  };
}

/**
 * Get MIME type based on file extension
 */
function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  
  const mimeTypes: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
    '.srt': 'text/srt',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.wts': 'text/plain',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Express middleware for file preview (for images/text files)
 */
export function createFilePreviewHandler() {
  return async (req: Request, res: Response) => {
    try {
      const { taskId, filename } = req.params;

      if (!taskId || !filename) {
        return res.status(400).json({ error: 'Missing taskId or filename' });
      }

      // Check if task exists
      if (!fileManager.taskDirectoryExists(taskId)) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Check if file exists
      if (!fileManager.fileExists(taskId, filename)) {
        return res.status(404).json({ error: 'File not found' });
      }

      // Get file path
      const filePath = fileManager.getFilePath(taskId, filename);
      const mimeType = getMimeType(filename);

      // Only allow preview for certain file types
      const previewableTypes = [
        'text/plain',
        'text/srt',
        'application/json',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
      ];

      if (!previewableTypes.includes(mimeType)) {
        return res.status(400).json({ 
          error: 'File type not previewable',
          mimeType 
        });
      }

      // Set headers
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour cache

      // Stream the file
      const stream = createReadStream(filePath);
      stream.pipe(res);
      return;
    } catch (error) {
      console.error('File preview error:', error);
      return res.status(500).json({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  };
}