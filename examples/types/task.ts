import { z } from 'zod';

/**
 * 任务状态类型
 */
export type TaskStatus = 'pending' | 'downloading' | 'extracting' | 'separating' | 'transcribing' | 'summarizing' | 'completed' | 'failed';

/**
 * 任务清单结构
 */
export interface TaskManifest {
  taskId: string;
  status: TaskStatus;
  progress: number;
  currentStep: string;
  createdAt: string;
  finishedAt?: string;
  files: Record<string, string>;
  error?: string;
}

/**
 * 任务创建输入验证
 */
export const CreateTaskSchema = z.object({
  link: z.string().url().refine(isYouTubeUrl, "必须是有效的YouTube链接"),
  options: z.object({
    whisperModel: z.enum(['base', 'small', 'medium', 'large']).default('base'),
    language: z.string().optional(),
  }).optional(),
});

/**
 * YouTube URL验证
 */
export function isYouTubeUrl(url: string): boolean {
  const youtubePattern = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/;
  return youtubePattern.test(url);
}

/**
 * 生成任务ID
 */
export function generateTaskId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * 创建默认任务清单
 */
export function createDefaultManifest(taskId: string): TaskManifest {
  return {
    taskId,
    status: 'pending',
    progress: 0,
    currentStep: 'initializing',
    createdAt: new Date().toISOString(),
    files: {},
  };
}