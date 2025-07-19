import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { promises as fs } from 'fs';
import { existsSync, statSync } from 'fs';
import path from 'path';
import { AudioFileInfo } from '../types/audio.js';

/**
 * Audio processing options
 */
export interface AudioProcessingOptions {
  taskId: string;
  inputPath: string;
  outputDir: string;
  sampleRate?: number;
  channels?: number;
  format?: string;
  onProgress?: (progress: number) => void;
}

/**
 * Audio processing result
 */
export interface AudioProcessingResult {
  audioPath: string;
  vocalsPath?: string;
  accompanimentPath?: string;
  duration: number;
  sampleRate: number;
  channels: number;
  fileSize: number;
}

/**
 * Audio processing error class
 */
export class AudioProcessingError extends Error {
  constructor(message: string, public code: string, public details?: any) {
    super(message);
    this.name = 'AudioProcessingError';
  }
}

/**
 * Audio processor service
 */
export class AudioProcessor {
  constructor() {
    // Set ffmpeg path
    if (ffmpegStatic) {
      ffmpeg.setFfmpegPath(ffmpegStatic);
    }
  }

  /**
   * Extract audio from video file
   */
  async extractAudio(options: AudioProcessingOptions): Promise<AudioProcessingResult> {
    const { inputPath, outputDir, sampleRate = 16000, channels = 1 } = options;

    // Validate input file
    if (!existsSync(inputPath)) {
      throw new AudioProcessingError('Input video file not found', 'FILE_NOT_FOUND', { inputPath });
    }

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    const audioPath = path.join(outputDir, 'audio.wav');

    try {
      // Get video information first
      const videoInfo = await this.getVideoInfo(inputPath);
      
      // Extract audio using ffmpeg
      await this.runFFmpegCommand(
        inputPath,
        audioPath,
        {
          audioFrequency: sampleRate,
          audioChannels: channels,
          audioCodec: 'pcm_s16le',
          format: 'wav',
        },
        options.onProgress
      );

      // Validate output file
      if (!existsSync(audioPath)) {
        throw new AudioProcessingError('Audio extraction failed - output file not created', 'EXTRACTION_FAILED');
      }

      // Get output file information
      const audioInfo = await this.getAudioInfo(audioPath);
      const stats = await fs.stat(audioPath);

      return {
        audioPath,
        duration: audioInfo.duration,
        sampleRate: audioInfo.sampleRate,
        channels: audioInfo.channels,
        fileSize: stats.size,
      };
    } catch (error) {
      if (error instanceof AudioProcessingError) {
        throw error;
      }
      
      throw new AudioProcessingError(
        `Audio extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        'EXTRACTION_FAILED',
        error
      );
    }
  }

  /**
   * Separate vocals from audio using demucs-wasm
   */
  async separateVocals(options: AudioProcessingOptions): Promise<AudioProcessingResult> {
    const { inputPath, outputDir } = options;

    // Validate input file
    if (!existsSync(inputPath)) {
      throw new AudioProcessingError('Input audio file not found', 'FILE_NOT_FOUND', { inputPath });
    }

    const vocalsPath = path.join(outputDir, 'vocals.wav');
    const accompanimentPath = path.join(outputDir, 'accompaniment.wav');

    try {
      // For now, we'll use a simple approach without demucs-wasm
      // In a real implementation, you would integrate demucs-wasm here
      // This is a placeholder that copies the original audio as "vocals"
      
      console.log('Voice separation not implemented yet, using original audio as vocals');
      
      // Copy original audio as vocals (temporary solution)
      await fs.copyFile(inputPath, vocalsPath);
      
      // Create silent accompaniment track (temporary solution)
      await this.createSilentTrack(vocalsPath, accompanimentPath);

      // Get audio information
      const audioInfo = await this.getAudioInfo(vocalsPath);
      const stats = await fs.stat(vocalsPath);

      return {
        audioPath: inputPath,
        vocalsPath,
        accompanimentPath,
        duration: audioInfo.duration,
        sampleRate: audioInfo.sampleRate,
        channels: audioInfo.channels,
        fileSize: stats.size,
      };
    } catch (error) {
      throw new AudioProcessingError(
        `Voice separation failed: ${error instanceof Error ? error.message : String(error)}`,
        'SEPARATION_FAILED',
        error
      );
    }
  }

  /**
   * Enhance audio quality
   */
  async enhanceAudio(inputPath: string, outputPath: string, options?: {
    noiseReduction?: boolean;
    amplify?: number;
    normalize?: boolean;
  }): Promise<void> {
    const { noiseReduction = true, amplify = 1.0, normalize = true } = options || {};

    try {
      const ffmpegCommand = ffmpeg(inputPath);

      // Apply audio filters
      const filters: string[] = [];
      
      if (noiseReduction) {
        filters.push('highpass=f=80'); // Remove low-frequency noise
        filters.push('lowpass=f=8000'); // Remove high-frequency noise
      }
      
      if (amplify !== 1.0) {
        filters.push(`volume=${amplify}`);
      }
      
      if (normalize) {
        filters.push('loudnorm');
      }

      if (filters.length > 0) {
        ffmpegCommand.audioFilters(filters.join(','));
      }

      await new Promise<void>((resolve, reject) => {
        ffmpegCommand
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', reject)
          .run();
      });
    } catch (error) {
      throw new AudioProcessingError(
        `Audio enhancement failed: ${error instanceof Error ? error.message : String(error)}`,
        'ENHANCEMENT_FAILED',
        error
      );
    }
  }

  /**
   * Get audio file information
   */
  async getAudioInfo(filePath: string): Promise<AudioFileInfo> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(new AudioProcessingError(
            `Failed to get audio info: ${err.message}`,
            'INFO_FAILED',
            err
          ));
          return;
        }

        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
        if (!audioStream) {
          reject(new AudioProcessingError('No audio stream found', 'NO_AUDIO_STREAM'));
          return;
        }

        const stats = statSync(filePath);

        resolve({
          path: filePath,
          duration: Number(metadata.format.duration) || 0,
          sampleRate: Number(audioStream.sample_rate) || 0,
          channels: Number(audioStream.channels) || 0,
          bitrate: Number(audioStream.bit_rate) || 0,
          format: audioStream.codec_name || 'unknown',
          size: stats.size,
        });
      });
    });
  }

  /**
   * Get video file information
   */
  async getVideoInfo(filePath: string): Promise<{
    duration: number;
    width: number;
    height: number;
    fps: number;
    bitrate: number;
  }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(new AudioProcessingError(
            `Failed to get video info: ${err.message}`,
            'INFO_FAILED',
            err
          ));
          return;
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        if (!videoStream) {
          reject(new AudioProcessingError('No video stream found', 'NO_VIDEO_STREAM'));
          return;
        }

        resolve({
          duration: metadata.format.duration || 0,
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          fps: this.parseFPS(videoStream.r_frame_rate),
          bitrate: Number(videoStream.bit_rate) || 0,
        });
      });
    });
  }

  /**
   * Convert audio to different format
   */
  async convertAudio(
    inputPath: string,
    outputPath: string,
    options: {
      format?: string;
      sampleRate?: number;
      channels?: number;
      bitrate?: string;
    } = {}
  ): Promise<void> {
    const { format = 'wav', sampleRate = 16000, channels = 1, bitrate = '128k' } = options;

    try {
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .output(outputPath)
          .audioFrequency(sampleRate)
          .audioChannels(channels)
          .audioBitrate(bitrate)
          .format(format)
          .on('end', () => resolve())
          .on('error', reject)
          .run();
      });
    } catch (error) {
      throw new AudioProcessingError(
        `Audio conversion failed: ${error instanceof Error ? error.message : String(error)}`,
        'CONVERSION_FAILED',
        error
      );
    }
  }

  /**
   * Create silent audio track
   */
  private async createSilentTrack(referencePath: string, outputPath: string): Promise<void> {
    try {
      const audioInfo = await this.getAudioInfo(referencePath);
      
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(`anullsrc=channel_layout=mono:sample_rate=${audioInfo.sampleRate}`)
          .inputOptions(['-f', 'lavfi'])
          .output(outputPath)
          .duration(audioInfo.duration)
          .audioCodec('pcm_s16le')
          .format('wav')
          .on('end', () => resolve())
          .on('error', reject)
          .run();
      });
    } catch (error) {
      throw new AudioProcessingError(
        `Failed to create silent track: ${error instanceof Error ? error.message : String(error)}`,
        'SILENT_TRACK_FAILED',
        error
      );
    }
  }

  /**
   * Run FFmpeg command with progress tracking
   */
  private async runFFmpegCommand(
    inputPath: string,
    outputPath: string,
    options: {
      audioFrequency?: number;
      audioChannels?: number;
      audioCodec?: string;
      format?: string;
    },
    onProgress?: (progress: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath);

      // Apply audio options
      if (options.audioFrequency) {
        command.audioFrequency(options.audioFrequency);
      }
      if (options.audioChannels) {
        command.audioChannels(options.audioChannels);
      }
      if (options.audioCodec) {
        command.audioCodec(options.audioCodec);
      }
      if (options.format) {
        command.format(options.format);
      }

      command
        .output(outputPath)
        .on('progress', (progress) => {
          if (onProgress && progress.percent) {
            onProgress(Math.round(progress.percent));
          }
        })
        .on('end', () => resolve())
        .on('error', reject)
        .run();
    });
  }

  /**
   * Parse frame rate string
   */
  private parseFPS(frameRate: string | undefined): number {
    if (!frameRate) return 0;
    
    const parts = frameRate.split('/');
    if (parts.length === 2 && parts[0] && parts[1]) {
      const num = parseInt(parts[0], 10);
      const den = parseInt(parts[1], 10);
      return den !== 0 ? num / den : 0;
    }
    
    return parseFloat(frameRate) || 0;
  }

  /**
   * Clean up temporary files
   */
  async cleanup(directory: string): Promise<void> {
    try {
      const files = await fs.readdir(directory);
      const tempFiles = files.filter(file => 
        file.startsWith('temp_') || 
        file.endsWith('.tmp') ||
        file.endsWith('.part')
      );

      for (const file of tempFiles) {
        try {
          await fs.unlink(path.join(directory, file));
        } catch (error) {
          console.warn(`Failed to cleanup temp file ${file}:`, error);
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup temporary files:', error);
    }
  }
}

/**
 * Default audio processor instance
 */
export const audioProcessor = new AudioProcessor();