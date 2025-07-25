import { AudioConfig, TranscriptionResult, transcriptionToSRT } from '../types/audio.js';
import { whisperCLI } from '../utils/whisper-cli.js';
import { formatDuration } from '../utils/time.js';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';

/**
 * Transcription options
 */
export interface TranscriptionOptions {
  audioPath: string;
  outputDir: string;
  config: AudioConfig;
  onProgress?: (progress: number) => void;
  onTextStream?: (segment: {
    type: 'segment-start' | 'segment-text' | 'segment-complete';
    segmentId: number;
    text: string;
    startTime: number;
    endTime?: number;
    confidence?: number;
    isPartial: boolean;
  }) => void;
}

/**
 * Transcription error class
 */
export class TranscriptionError extends Error {
  constructor(message: string, public code: string, public details?: any) {
    super(message);
    this.name = 'TranscriptionError';
  }

  // Static factory methods for common errors
  static emptyResult(details: { textLength: number; segmentsCount: number; duration: number }): TranscriptionError {
    return new TranscriptionError(
      'Transcription completed but returned empty results',
      'EMPTY_TRANSCRIPTION',
      details
    );
  }

  static parseFailure(rawOutput: string): TranscriptionError {
    return new TranscriptionError(
      'Failed to parse transcription output',
      'PARSE_FAILURE',
      { rawOutputLength: rawOutput.length, preview: rawOutput.substring(0, 200) }
    );
  }
}

/**
 * Audio transcription service using whisper.cpp CLI
 */
export class Transcriber {
  constructor() {
    // Validate whisper installation on initialization
    this.validateInstallation();
  }

  /**
   * Validate whisper.cpp installation
   */
  private async validateInstallation(): Promise<void> {
    try {
      const validation = await whisperCLI.validateInstallation();
      if (!validation.isValid) {
        console.error('Whisper installation validation failed:', validation.errors);
        throw new TranscriptionError(
          'Whisper.cpp installation is invalid',
          'INSTALLATION_INVALID',
          validation.errors
        );
      }
    } catch (error) {
      console.error('Failed to validate whisper installation:', error);
    }
  }

  /**
   * Transcribe audio file using whisper.cpp
   */
  async transcribeAudio(options: TranscriptionOptions): Promise<TranscriptionResult> {
    const { audioPath, outputDir, config, onProgress, onTextStream } = options;

    // Validate input file
    if (!existsSync(audioPath)) {
      throw new TranscriptionError('Audio file not found', 'FILE_NOT_FOUND', { audioPath });
    }

    // Validate audio file format and size
    await this.validateAudioFile(audioPath);

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    try {
      console.log(`Starting transcription for: ${audioPath}`);
      console.log(`Using model: ${config.model}`);
      console.log(`Language: ${config.language || 'auto'}`);

      // Start transcription
      const transcriptionResult = await whisperCLI.transcribeAudio(
        audioPath,
        outputDir,
        config,
        onProgress,
        onTextStream
      );

      // Save transcription results
      await this.saveTranscriptionResults(transcriptionResult, outputDir);

      console.log(`Transcription completed. Found ${transcriptionResult.segments.length} segments.`);
      
      return transcriptionResult;
    } catch (error) {
      if (error instanceof TranscriptionError) {
        throw error;
      }

      throw new TranscriptionError(
        `Transcription failed: ${error instanceof Error ? error.message : String(error)}`,
        'TRANSCRIPTION_FAILED',
        error
      );
    }
  }

  /**
   * Get transcription progress estimate
   */
  estimateTranscriptionTime(audioDurationSeconds: number): number {
    return whisperCLI.estimateProcessingTime(audioDurationSeconds);
  }

  /**
   * Test transcription with a short audio file
   */
  async testTranscription(testAudioPath: string): Promise<boolean> {
    try {
      return await whisperCLI.testTranscription(testAudioPath);
    } catch (error) {
      console.error('Transcription test failed:', error);
      return false;
    }
  }

  /**
   * Get available languages for transcription
   */
  async getAvailableLanguages(): Promise<string[]> {
    try {
      return await whisperCLI.getAvailableLanguages();
    } catch (error) {
      console.error('Failed to get available languages:', error);
      return [];
    }
  }

  /**
   * Get whisper model information
   */
  async getModelInfo(): Promise<{
    modelPath: string;
    modelSize: number;
    modelType: string;
  }> {
    try {
      return await whisperCLI.getModelInfo();
    } catch (error) {
      throw new TranscriptionError(
        `Failed to get model info: ${error instanceof Error ? error.message : String(error)}`,
        'MODEL_INFO_FAILED',
        error
      );
    }
  }

  /**
   * Validate audio file for transcription
   */
  private async validateAudioFile(audioPath: string): Promise<void> {
    try {
      const stats = await fs.stat(audioPath);
      
      // Check file size (max 1GB)
      const maxSize = 1024 * 1024 * 1024; // 1GB
      if (stats.size > maxSize) {
        throw new TranscriptionError(
          'Audio file too large for transcription',
          'FILE_TOO_LARGE',
          { size: stats.size, maxSize }
        );
      }

      // Check file is not empty
      if (stats.size === 0) {
        throw new TranscriptionError('Audio file is empty', 'FILE_EMPTY', { audioPath });
      }

      // Check file extension
      const ext = path.extname(audioPath).toLowerCase();
      const supportedExtensions = ['.wav', '.mp3', '.m4a', '.flac', '.ogg'];
      if (!supportedExtensions.includes(ext)) {
        console.warn(`Audio file extension ${ext} may not be supported by whisper.cpp`);
      }
    } catch (error) {
      if (error instanceof TranscriptionError) {
        throw error;
      }

      throw new TranscriptionError(
        `Audio file validation failed: ${error instanceof Error ? error.message : String(error)}`,
        'VALIDATION_FAILED',
        error
      );
    }
  }

  /**
   * Save transcription results to files
   */
  private async saveTranscriptionResults(
    transcription: TranscriptionResult,
    outputDir: string
  ): Promise<void> {
    try {
      // Debug logging before validation
      console.log('📊 Transcription Debug Stats:');
      console.log(`  Text length: ${transcription.text?.length || 0}`);
      console.log(`  Segments count: ${transcription.segments?.length || 0}`);
      console.log(`  Duration: ${transcription.duration || 0}s`);
      console.log(`  Language: ${transcription.language}`);
      console.log(`  Model: ${transcription.modelUsed}`);
      
      if (!transcription.text?.trim() || transcription.segments.length === 0) {
        console.error('❌ Empty transcription detected before saving!');
        console.error('Raw transcription object:', JSON.stringify(transcription, null, 2));
        throw TranscriptionError.emptyResult({
          textLength: transcription.text?.length || 0,
          segmentsCount: transcription.segments?.length || 0,
          duration: transcription.duration
        });
      }
      
      // Validate and fix timestamp data before saving
      const validatedTranscription = this.validateTimestamps(transcription);
      
      // Save full transcription as JSON
      const jsonPath = path.join(outputDir, 'transcription.json');
      await fs.writeFile(jsonPath, JSON.stringify(validatedTranscription, null, 2));

      // Save as SRT subtitle file
      const srtPath = path.join(outputDir, 'subtitle.srt');
      const srtContent = transcriptionToSRT(validatedTranscription);
      await fs.writeFile(srtPath, srtContent);

      // Save as plain text
      const txtPath = path.join(outputDir, 'transcript.txt');
      await fs.writeFile(txtPath, validatedTranscription.text);

      // Save word-level timestamps
      const wtsPath = path.join(outputDir, 'words.wts');
      const wtsContent = validatedTranscription.segments
        .map(segment => `${segment.start.toFixed(3)}\t${segment.end.toFixed(3)}\t${segment.text}`)
        .join('\n');
      await fs.writeFile(wtsPath, wtsContent);

      console.log('✅ Transcription results saved to:', outputDir);
    } catch (error) {
      console.error('Failed to save transcription results:', error);
      throw new TranscriptionError(
        `Failed to save transcription results: ${error instanceof Error ? error.message : String(error)}`,
        'SAVE_FAILED',
        error
      );
    }
  }

  /**
   * Validate and fix timestamp data
   */
  private validateTimestamps(transcription: TranscriptionResult): TranscriptionResult {
    // Check if all timestamps are zero (broken case)
    const hasValidTimestamps = transcription.segments.some(seg => seg.start > 0 || seg.end > 0);
    
    console.log(`Timestamp validation: ${transcription.segments.length} segments, hasValidTimestamps: ${hasValidTimestamps}`);
    
    if (!hasValidTimestamps && transcription.duration > 0 && transcription.segments.length > 1) {
      console.warn('All timestamps are zero, applying fallback timing distribution');
      
      // Apply fallback: distribute segments evenly across duration
      const segmentDuration = transcription.duration / transcription.segments.length;
      const validatedSegments = transcription.segments.map((seg, index) => ({
        ...seg,
        start: index * segmentDuration,
        end: (index + 1) * segmentDuration,
      }));
      
      const result = {
        ...transcription,
        segments: validatedSegments
      };
      
      console.log(`Applied fallback timing: ${validatedSegments.length} segments across ${formatDuration(transcription.duration)}`);
      return result;
    }
    
    // Validate timestamp consistency and fix any issues
    const validatedSegments = transcription.segments.map((seg, index) => {
      let start = seg.start;
      let end = seg.end;
      
      // Ensure end >= start
      if (end < start) {
        console.warn(`Segment ${index}: end (${end}) < start (${start}), swapping`);
        [start, end] = [end, start];
      }
      
      // Ensure start time is not negative
      if (start < 0) {
        console.warn(`Segment ${index}: negative start time (${start}), setting to 0`);
        start = 0;
      }
      
      return { ...seg, start, end };
    });
    
    return {
      ...transcription,
      segments: validatedSegments
    };
  }

  /**
   * Load existing transcription from directory
   */
  async loadTranscription(outputDir: string): Promise<TranscriptionResult | null> {
    try {
      const jsonPath = path.join(outputDir, 'transcription.json');
      
      if (!existsSync(jsonPath)) {
        return null;
      }

      const content = await fs.readFile(jsonPath, 'utf-8');
      return JSON.parse(content) as TranscriptionResult;
    } catch (error) {
      console.error('Failed to load existing transcription:', error);
      return null;
    }
  }

  /**
   * Get transcription statistics
   */
  getTranscriptionStats(transcription: TranscriptionResult): {
    totalWords: number;
    totalSegments: number;
    averageSegmentLength: number;
    totalDuration: number;
    wordsPerMinute: number;
  } {
    const totalWords = transcription.text.split(/\s+/).length;
    const totalSegments = transcription.segments.length;
    const averageSegmentLength = totalSegments > 0 
      ? transcription.segments.reduce((sum, seg) => sum + (seg.end - seg.start), 0) / totalSegments
      : 0;
    const totalDuration = transcription.duration;
    const wordsPerMinute = totalDuration > 0 ? (totalWords / totalDuration) * 60 : 0;

    return {
      totalWords,
      totalSegments,
      averageSegmentLength,
      totalDuration,
      wordsPerMinute,
    };
  }

  /**
   * Filter transcription by confidence (if available)
   */
  filterByConfidence(
    transcription: TranscriptionResult,
    minConfidence: number = 0.5
  ): TranscriptionResult {
    const filteredSegments = transcription.segments.filter(
      segment => !segment.confidence || segment.confidence >= minConfidence
    );

    return {
      ...transcription,
      segments: filteredSegments,
      text: filteredSegments.map(seg => seg.text).join(' '),
    };
  }

  /**
   * Split transcription into chunks
   */
  splitTranscription(
    transcription: TranscriptionResult,
    chunkDurationSeconds: number = 300 // 5 minutes
  ): TranscriptionResult[] {
    const chunks: TranscriptionResult[] = [];
    let currentChunk: TranscriptionResult = {
      text: '',
      segments: [],
      language: transcription.language,
      duration: 0,
      modelUsed: transcription.modelUsed,
    };

    let chunkStartTime = 0;

    for (const segment of transcription.segments) {
      if (segment.start - chunkStartTime >= chunkDurationSeconds && currentChunk.segments.length > 0) {
        // Finalize current chunk
        currentChunk.text = currentChunk.segments.map(seg => seg.text).join(' ');
        const firstSegment = currentChunk.segments[0];
        const lastSegment = currentChunk.segments[currentChunk.segments.length - 1];
        if (firstSegment && lastSegment) {
          currentChunk.duration = lastSegment.end - firstSegment.start;
        }
        chunks.push(currentChunk);

        // Start new chunk
        chunkStartTime = segment.start;
        currentChunk = {
          text: '',
          segments: [],
          language: transcription.language,
          duration: 0,
          modelUsed: transcription.modelUsed,
        };
      }

      currentChunk.segments.push(segment);
    }

    // Add final chunk if it has content
    if (currentChunk.segments.length > 0) {
      currentChunk.text = currentChunk.segments.map(seg => seg.text).join(' ');
      const firstSegment = currentChunk.segments[0];
      const lastSegment = currentChunk.segments[currentChunk.segments.length - 1];
      if (firstSegment && lastSegment) {
        currentChunk.duration = lastSegment.end - firstSegment.start;
      }
      chunks.push(currentChunk);
    }

    return chunks;
  }
}

/**
 * Default transcriber instance
 */
export const transcriber = new Transcriber();