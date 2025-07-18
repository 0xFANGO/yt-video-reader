import { promises as fs } from 'fs';
import path from 'path';
import { AudioConfig, TranscriptionResult, transcriptionToSRT } from '../types/audio';

/**
 * 音频转录服务示例
 */

export interface TranscriptionOptions {
  audioPath: string;
  outputDir: string;
  config: AudioConfig;
}

export class TranscriptionError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

/**
 * 转录音频文件
 */
export async function transcribeAudio(options: TranscriptionOptions): Promise<TranscriptionResult> {
  // 验证音频文件
  await validateAudioFile(options.audioPath);

  try {
    // 使用smart-whisper转录
    const whisper = require('smart-whisper');
    
    const result = await whisper.transcribe(options.audioPath, {
      model: options.config.model,
      language: options.config.language,
      word_timestamps: options.config.wordTimestamps,
    });

    const transcription: TranscriptionResult = {
      text: result.text,
      segments: result.segments.map((segment: any) => ({
        start: segment.start,
        end: segment.end,
        text: segment.text,
      })),
      language: result.language || 'zh',
      duration: result.duration || 0,
    };

    // 保存转录结果
    await saveTranscription(transcription, options.outputDir);

    return transcription;
  } catch (error) {
    throw new TranscriptionError(
      `转录失败: ${error instanceof Error ? error.message : String(error)}`,
      'TRANSCRIPTION_FAILED'
    );
  }
}

/**
 * 验证音频文件
 */
async function validateAudioFile(audioPath: string): Promise<void> {
  try {
    const stats = await fs.stat(audioPath);
    if (!stats.isFile()) {
      throw new TranscriptionError('音频文件不存在', 'FILE_NOT_FOUND');
    }
  } catch (error) {
    throw new TranscriptionError('无法访问音频文件', 'FILE_ACCESS_ERROR');
  }
}

/**
 * 保存转录结果
 */
async function saveTranscription(transcription: TranscriptionResult, outputDir: string): Promise<void> {
  // 保存JSON格式
  const jsonPath = path.join(outputDir, 'transcription.json');
  await fs.writeFile(jsonPath, JSON.stringify(transcription, null, 2));

  // 保存SRT格式
  const srtPath = path.join(outputDir, 'subtitle.srt');
  const srtContent = transcriptionToSRT(transcription);
  await fs.writeFile(srtPath, srtContent);

  // 保存词级时间戳
  const wordsPath = path.join(outputDir, 'words.wts');
  const wordsContent = transcription.segments
    .map(segment => `${segment.start.toFixed(3)} ${segment.end.toFixed(3)} ${segment.text}`)
    .join('\n');
  await fs.writeFile(wordsPath, wordsContent);
}