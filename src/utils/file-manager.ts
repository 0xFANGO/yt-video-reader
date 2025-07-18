import { promises as fs } from 'fs';
import { existsSync, statSync } from 'fs';
import path from 'path';
import { TaskManifest } from '../types/task.js';

/**
 * File manager for handling task directories and files
 */
export class FileManager {
  private storagePath: string;

  constructor(storagePath: string) {
    this.storagePath = path.resolve(storagePath);
  }

  /**
   * Create task directory with proper permissions
   */
  async createTaskDirectory(taskId: string): Promise<string> {
    const taskDir = path.join(this.storagePath, taskId);
    
    try {
      await fs.mkdir(taskDir, { recursive: true, mode: 0o755 });
      return taskDir;
    } catch (error) {
      throw new Error(`Failed to create task directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get task directory path
   */
  getTaskDirectory(taskId: string): string {
    return path.join(this.storagePath, taskId);
  }

  /**
   * Check if task directory exists
   */
  taskDirectoryExists(taskId: string): boolean {
    const taskDir = this.getTaskDirectory(taskId);
    return existsSync(taskDir);
  }

  /**
   * Save task manifest to file
   */
  async saveManifest(taskId: string, manifest: TaskManifest): Promise<void> {
    const taskDir = this.getTaskDirectory(taskId);
    const manifestPath = path.join(taskDir, 'manifest.json');
    
    try {
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    } catch (error) {
      throw new Error(`Failed to save manifest: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load task manifest from file
   */
  async loadManifest(taskId: string): Promise<TaskManifest | null> {
    const taskDir = this.getTaskDirectory(taskId);
    const manifestPath = path.join(taskDir, 'manifest.json');
    
    try {
      if (!existsSync(manifestPath)) {
        return null;
      }
      
      const content = await fs.readFile(manifestPath, 'utf-8');
      return JSON.parse(content) as TaskManifest;
    } catch (error) {
      console.error(`Failed to load manifest for ${taskId}:`, error);
      return null;
    }
  }

  /**
   * Get file information for a task
   */
  async getTaskFiles(taskId: string): Promise<Array<{
    filename: string;
    path: string;
    size: number;
    mimeType: string;
    createdAt: string;
  }>> {
    const taskDir = this.getTaskDirectory(taskId);
    
    if (!existsSync(taskDir)) {
      return [];
    }

    try {
      const files = await fs.readdir(taskDir);
      const fileInfos = await Promise.all(
        files.map(async (filename) => {
          const filePath = path.join(taskDir, filename);
          const stats = await fs.stat(filePath);
          
          return {
            filename,
            path: filePath,
            size: stats.size,
            mimeType: this.getMimeType(filename),
            createdAt: stats.birthtime.toISOString(),
          };
        })
      );
      
      return fileInfos;
    } catch (error) {
      console.error(`Failed to get task files for ${taskId}:`, error);
      return [];
    }
  }

  /**
   * Get file path for a specific file in task directory
   */
  getFilePath(taskId: string, filename: string): string {
    // Sanitize filename to prevent directory traversal
    const sanitizedFilename = this.sanitizeFilename(filename);
    return path.join(this.getTaskDirectory(taskId), sanitizedFilename);
  }

  /**
   * Check if file exists in task directory
   */
  fileExists(taskId: string, filename: string): boolean {
    const filePath = this.getFilePath(taskId, filename);
    return existsSync(filePath);
  }

  /**
   * Get file size
   */
  getFileSize(taskId: string, filename: string): number {
    const filePath = this.getFilePath(taskId, filename);
    if (!existsSync(filePath)) {
      return 0;
    }
    return statSync(filePath).size;
  }

  /**
   * Clean up task directory and all its contents
   */
  async cleanupTask(taskId: string): Promise<void> {
    const taskDir = this.getTaskDirectory(taskId);
    
    if (!existsSync(taskDir)) {
      return;
    }

    try {
      await fs.rm(taskDir, { recursive: true, force: true });
      console.log(`Cleaned up task directory: ${taskId}`);
    } catch (error) {
      console.error(`Failed to cleanup task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Clean up old tasks based on age
   */
  async cleanupOldTasks(maxAgeHours: number = 24): Promise<void> {
    const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
    
    try {
      if (!existsSync(this.storagePath)) {
        return;
      }

      const entries = await fs.readdir(this.storagePath);
      const cleanupPromises = entries.map(async (entry) => {
        const entryPath = path.join(this.storagePath, entry);
        const stats = await fs.stat(entryPath);
        
        if (stats.isDirectory() && stats.birthtime.getTime() < cutoffTime) {
          await this.cleanupTask(entry);
        }
      });

      await Promise.allSettled(cleanupPromises);
      console.log(`Cleaned up tasks older than ${maxAgeHours} hours`);
    } catch (error) {
      console.error('Failed to cleanup old tasks:', error);
    }
  }

  /**
   * Get storage usage statistics
   */
  async getStorageStats(): Promise<{
    totalTasks: number;
    totalSize: number;
    oldestTask: string | null;
    newestTask: string | null;
  }> {
    try {
      if (!existsSync(this.storagePath)) {
        return { totalTasks: 0, totalSize: 0, oldestTask: null, newestTask: null };
      }

      const entries = await fs.readdir(this.storagePath);
      let totalSize = 0;
      let oldestTime = Infinity;
      let newestTime = 0;
      let oldestTask = null;
      let newestTask = null;

      for (const entry of entries) {
        const entryPath = path.join(this.storagePath, entry);
        const stats = await fs.stat(entryPath);
        
        if (stats.isDirectory()) {
          totalSize += await this.getDirectorySize(entryPath);
          
          if (stats.birthtime.getTime() < oldestTime) {
            oldestTime = stats.birthtime.getTime();
            oldestTask = entry;
          }
          
          if (stats.birthtime.getTime() > newestTime) {
            newestTime = stats.birthtime.getTime();
            newestTask = entry;
          }
        }
      }

      return {
        totalTasks: entries.length,
        totalSize,
        oldestTask,
        newestTask,
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return { totalTasks: 0, totalSize: 0, oldestTask: null, newestTask: null };
    }
  }

  /**
   * Sanitize filename to prevent directory traversal
   */
  private sanitizeFilename(filename: string): string {
    // Remove path separators and dangerous characters
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  /**
   * Get MIME type based on file extension
   */
  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.srt': 'text/srt',
      '.json': 'application/json',
      '.txt': 'text/plain',
      '.wts': 'text/plain',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Get directory size recursively
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;
    
    try {
      const entries = await fs.readdir(dirPath);
      
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);
        const stats = await fs.stat(entryPath);
        
        if (stats.isDirectory()) {
          totalSize += await this.getDirectorySize(entryPath);
        } else {
          totalSize += stats.size;
        }
      }
    } catch (error) {
      console.error(`Failed to get directory size for ${dirPath}:`, error);
    }
    
    return totalSize;
  }
}

/**
 * Default file manager instance
 */
export const fileManager = new FileManager(process.env.STORAGE_PATH || './data');