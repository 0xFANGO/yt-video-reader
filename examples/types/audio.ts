import { z } from 'zod';

/**
 * Whisper模型选项
 */
export type WhisperModel = 'base' | 'small' | 'medium' | 'large';

/**
 * 音频处理配置
 */
export interface AudioConfig {
  model: WhisperModel;
  language?: string;
  wordTimestamps: boolean;
  sampleRate: number;
  channels: number;
}

/**
 * 转录结果
 */
export interface TranscriptionResult {
  text: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  language: string;
  duration: number;
}

/**
 * 音频配置验证
 */
export const AudioConfigSchema = z.object({
  model: z.enum(['base', 'small', 'medium', 'large']).default('base'),
  language: z.string().optional(),
  wordTimestamps: z.boolean().default(true),
  sampleRate: z.number().default(16000),
  channels: z.number().default(1),
});

/**
 * 默认音频配置
 */
export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  model: 'base',
  wordTimestamps: true,
  sampleRate: 16000,
  channels: 1,
};

/**
 * 转录结果转SRT格式
 */
export function transcriptionToSRT(transcription: TranscriptionResult): string {
  let srtContent = '';
  
  transcription.segments.forEach((segment, index) => {
    const startTime = formatSRTTime(segment.start);
    const endTime = formatSRTTime(segment.end);
    
    srtContent += `${index + 1}\n`;
    srtContent += `${startTime} --> ${endTime}\n`;
    srtContent += `${segment.text.trim()}\n\n`;
  });
  
  return srtContent;
}

/**
 * 格式化SRT时间
 */
function formatSRTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}