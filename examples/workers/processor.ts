import { Job } from 'bullmq';
import { downloadVideo } from '../services/downloader';
import { transcribeAudio } from '../services/transcriber';
import { generateSummary } from '../services/summarizer';
import { DEFAULT_AUDIO_CONFIG } from '../types/audio';

/**
 * 视频处理工作流示例
 */

export interface ProcessJobData {
  taskId: string;
  url: string;
  options?: {
    whisperModel?: string;
    language?: string;
  };
}

/**
 * 处理视频任务
 */
export async function processVideoJob(job: Job<ProcessJobData>): Promise<void> {
  const { taskId, url, options } = job.data;
  
  try {
    // 步骤1: 下载视频
    await updateProgress(job, 10, 'downloading');
    const downloadResult = await downloadVideo(url, {
      taskId,
      outputDir: `./data/${taskId}`,
    });

    // 步骤2: 转录音频
    await updateProgress(job, 50, 'transcribing');
    const transcriptionResult = await transcribeAudio({
      audioPath: downloadResult.audioPath,
      outputDir: `./data/${taskId}`,
      config: {
        ...DEFAULT_AUDIO_CONFIG,
        model: options?.whisperModel as any || 'base',
        language: options?.language,
      },
    });

    // 步骤3: 生成总结
    await updateProgress(job, 90, 'summarizing');
    await generateSummary({
      transcription: transcriptionResult,
      outputDir: `./data/${taskId}`,
      language: options?.language,
    });

    // 完成
    await updateProgress(job, 100, 'completed');
    console.log(`任务完成: ${taskId}`);
    
  } catch (error) {
    console.error(`任务失败: ${taskId}`, error);
    await updateTaskStatus(taskId, 'failed', error);
    throw error;
  }
}

/**
 * 更新任务进度
 */
async function updateProgress(job: Job, progress: number, step: string): Promise<void> {
  job.updateProgress(progress);
  await updateTaskStatus(job.data.taskId, step, null, progress);
}

/**
 * 更新任务状态
 */
async function updateTaskStatus(
  taskId: string, 
  status: string, 
  error?: any, 
  progress?: number
): Promise<void> {
  // 实际实现中，这里会更新数据库中的任务状态
  console.log(`任务状态更新: ${taskId} - ${status} (${progress}%)`);
  
  if (error) {
    console.error(`任务错误: ${taskId}`, error);
  }
}