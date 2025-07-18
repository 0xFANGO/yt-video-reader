import { z } from 'zod';

/**
 * Whisper model type - fixed to user's installed model
 */
export type WhisperModel = 'large-v3';

/**
 * Audio processing configuration
 */
export interface AudioConfig {
  model: WhisperModel;
  language?: string;
  wordTimestamps: boolean;
  sampleRate: number;           // 16000 for whisper
  channels: number;             // 1 for mono
  executablePath: string;       // Path to whisper.cpp main
  modelPath: string;            // Path to ggml-large-v3.bin
}

/**
 * Transcription segment with timestamps
 */
export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  confidence?: number;
}

/**
 * Transcription result structure
 */
export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
  language: string;
  duration: number;
  modelUsed: WhisperModel;
}

/**
 * Whisper CLI output structure
 */
export interface WhisperCliOutput {
  transcription: TranscriptionResult;
  processingTime: number;
  memoryUsage?: number;
}

/**
 * Audio configuration validation schema
 */
export const AudioConfigSchema = z.object({
  model: z.literal('large-v3'),
  language: z.string().optional(),
  wordTimestamps: z.boolean().default(true),
  sampleRate: z.number().default(16000),
  channels: z.number().default(1),
  executablePath: z.string(),
  modelPath: z.string(),
});

/**
 * Default audio configuration
 */
export const DEFAULT_AUDIO_CONFIG: Omit<AudioConfig, 'executablePath' | 'modelPath'> = {
  model: 'large-v3',
  wordTimestamps: true,
  sampleRate: 16000,
  channels: 1,
};

/**
 * Convert transcription result to SRT format
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
 * Format time in SRT format (HH:MM:SS,mmm)
 */
export function formatSRTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

/**
 * Parse whisper.cpp CLI output
 */
export function parseWhisperOutput(output: string): TranscriptionResult {
  // Parse JSON output from whisper.cpp
  try {
    const jsonOutput = JSON.parse(output);
    
    return {
      text: jsonOutput.text || '',
      segments: jsonOutput.segments?.map((seg: any) => ({
        start: seg.start || 0,
        end: seg.end || 0,
        text: seg.text || '',
        confidence: seg.confidence,
      })) || [],
      language: jsonOutput.language || 'auto',
      duration: jsonOutput.duration || 0,
      modelUsed: 'large-v3',
    };
  } catch (error) {
    // Fallback: parse plain text output
    return {
      text: output.trim(),
      segments: [{
        start: 0,
        end: 0,
        text: output.trim(),
      }],
      language: 'auto',
      duration: 0,
      modelUsed: 'large-v3',
    };
  }
}

/**
 * Audio processing options
 */
export interface AudioProcessingOptions {
  extractAudio: boolean;
  separateVocals: boolean;
  enhanceAudio: boolean;
  normalizeVolume: boolean;
}

/**
 * Audio file information
 */
export interface AudioFileInfo {
  path: string;
  duration: number;
  sampleRate: number;
  channels: number;
  bitrate: number;
  format: string;
  size: number;
}