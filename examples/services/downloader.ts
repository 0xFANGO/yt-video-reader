import youtubeDl from 'youtube-dl-exec';
import { promises as fs } from 'fs';
import path from 'path';
import { isYouTubeUrl } from '../types/task';

/**
 * YouTube视频下载服务示例
 */

export interface DownloadOptions {
  taskId: string;
  outputDir: string;
  format?: string;
}

export interface DownloadResult {
  videoPath: string;
  audioPath: string;
  title: string;
  duration: number;
}

export class DownloadError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'DownloadError';
  }
}

/**
 * 下载YouTube视频
 */
export async function downloadVideo(url: string, options: DownloadOptions): Promise<DownloadResult> {
  // 验证URL
  if (!isYouTubeUrl(url)) {
    throw new DownloadError('无效的YouTube链接', 'INVALID_URL');
  }

  // 确保输出目录存在
  await fs.mkdir(options.outputDir, { recursive: true });

  try {
    // 获取视频信息
    const info = await youtubeDl(url, {
      dumpSingleJson: true,
      noDownload: true,
    });

    // 下载视频
    const videoPath = path.join(options.outputDir, 'original.mp4');
    await youtubeDl(url, {
      output: videoPath,
      format: 'best[ext=mp4]',
    });

    // 提取音频
    const audioPath = await extractAudio(videoPath, options.outputDir);

    return {
      videoPath,
      audioPath,
      title: info.title || 'Unknown',
      duration: info.duration || 0,
    };
  } catch (error) {
    throw new DownloadError(
      `下载失败: ${error instanceof Error ? error.message : String(error)}`,
      'DOWNLOAD_FAILED'
    );
  }
}

/**
 * 提取音频
 */
async function extractAudio(videoPath: string, outputDir: string): Promise<string> {
  const ffmpeg = require('fluent-ffmpeg');
  const ffmpegStatic = require('ffmpeg-static');
  
  ffmpeg.setFfmpegPath(ffmpegStatic);
  
  const audioPath = path.join(outputDir, 'audio.wav');
  
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .output(audioPath)
      .audioFrequency(16000)
      .audioChannels(1)
      .on('end', () => resolve(audioPath))
      .on('error', reject)
      .run();
  });
}