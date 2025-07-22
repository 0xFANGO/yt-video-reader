import { spawn } from 'child_process';
import { AudioConfig, TranscriptionResult, parseWhisperOutput } from '../types/audio.js';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';

/**
 * Whisper CLI wrapper for transcription
 */
export class WhisperCLI {
  private executablePath: string;
  private modelPath: string;

  constructor(executablePath: string, modelPath: string) {
    this.executablePath = executablePath;
    this.modelPath = modelPath;
  }

  /**
   * Validate whisper.cpp installation
   */
  async validateInstallation(): Promise<{
    isValid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    // Check executable exists
    if (!existsSync(this.executablePath)) {
      errors.push(`Whisper executable not found at: ${this.executablePath}`);
    }

    // Check model exists
    if (!existsSync(this.modelPath)) {
      errors.push(`Whisper model not found at: ${this.modelPath}`);
    }

    // Test whisper.cpp with --help
    if (errors.length === 0) {
      try {
        const helpResult = await this.runWhisperCommand(['--help']);
        if (helpResult.exitCode !== 0) {
          errors.push('Whisper executable failed to run');
        }
      } catch (error) {
        errors.push(`Failed to test whisper executable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Transcribe audio file using whisper.cpp
   */
  async transcribeAudio(
    audioPath: string,
    outputDir: string,
    config: AudioConfig,
    onProgress?: (progress: number) => void,
    onTextStream?: (segment: {
      type: 'segment-start' | 'segment-text' | 'segment-complete';
      segmentId: number;
      text: string;
      startTime: number;
      endTime?: number;
      confidence?: number;
      isPartial: boolean;
    }) => void
  ): Promise<TranscriptionResult> {
    // Validate inputs
    if (!existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    if (!existsSync(outputDir)) {
      throw new Error(`Output directory not found: ${outputDir}`);
    }

    // Prepare output files
    const outputBaseName = path.join(outputDir, 'transcription');
    const jsonOutputPath = `${outputBaseName}.json`;
    // const srtOutputPath = `${outputBaseName}.srt`; // Future use
    const txtOutputPath = `${outputBaseName}.txt`;

    // Build whisper command arguments to ensure timestamp extraction
    const args = [
      '-m', this.modelPath,
      '-f', audioPath,
      '-of', outputBaseName,
      '-l', config.language || 'auto',
      '-pp',  // print progress
      '-pc',  // print colors
      '-otxt', // output txt
      '-osrt', // output srt  
      '-oj',   // output json - CRITICAL for timestamps
      '-t', '8', // number of threads
    ];

    // Enhanced word timestamps configuration
    if (config.wordTimestamps) {
      args.push('-ml', '1');     // max line length for word timestamps
      args.push('-sow');         // split on word - improves timestamp accuracy  
      args.push('-wt', '0.01');  // word timestamp threshold
      // Note: --print-realtime removed as it's not supported by all whisper-cli versions
    }

    try {
      console.log('🎯 Whisper Command Execution:');
      console.log(`  Executable: ${this.executablePath}`);
      console.log(`  Model: ${this.modelPath}`);
      console.log(`  Audio file: ${audioPath}`);
      console.log(`  Output dir: ${outputDir}`);
      console.log(`  Full command: ${this.executablePath} ${args.join(' ')}`);
      
      const result = await this.runWhisperCommand(args, onProgress, onTextStream);
      
      console.log('📤 Whisper Command Results:');
      console.log(`  Exit code: ${result.exitCode}`);
      console.log(`  STDOUT length: ${result.stdout.length}`);
      console.log(`  STDERR length: ${result.stderr.length}`);
      console.log(`  STDOUT preview: ${result.stdout.substring(0, 300)}...`);
      if (result.stderr) {
        console.log(`  STDERR preview: ${result.stderr.substring(0, 300)}...`);
      }
      
      if (result.exitCode !== 0) {
        console.error('Whisper command failed:');
        console.error('Exit code:', result.exitCode);
        console.error('STDERR:', result.stderr);
        console.error('STDOUT:', result.stdout.substring(0, 1000) + '...');
        throw new Error(`Whisper transcription failed with exit code ${result.exitCode}: ${result.stderr}`);
      }

      // Parse the output - prioritize JSON file for timestamp extraction
      let transcriptionResult: TranscriptionResult;
      
      if (existsSync(jsonOutputPath)) {
        const jsonContent = await fs.readFile(jsonOutputPath, 'utf-8');
        console.log('🔍 JSON output file analysis:');
        console.log(`  File size: ${jsonContent.length} bytes`);
        console.log(`  Content preview: ${jsonContent.substring(0, 500)}...`);
        
        transcriptionResult = parseWhisperOutput(jsonContent);
        console.log('📊 Parsed JSON result stats:');
        console.log(`  Text length: ${transcriptionResult.text?.length || 0}`);
        console.log(`  Segments: ${transcriptionResult.segments?.length || 0}`);
      } else if (existsSync(txtOutputPath)) {
        const textContent = await fs.readFile(txtOutputPath, 'utf-8');
        console.log('🔍 TXT output fallback:');
        console.log(`  File size: ${textContent.length} bytes`);
        console.log(`  Content preview: ${textContent.substring(0, 200)}...`);
        
        transcriptionResult = parseWhisperOutput(textContent);
      } else {
        console.log('🔍 STDOUT fallback:');
        console.log(`  Output length: ${result.stdout.length} bytes`);
        console.log(`  Content preview: ${result.stdout.substring(0, 200)}...`);
        
        transcriptionResult = parseWhisperOutput(result.stdout);
      }

      // Ensure we have the correct model information
      transcriptionResult.modelUsed = 'large-v3';

      // Critical validation before returning - only fail if BOTH text and segments are empty
      if (!transcriptionResult.text?.trim() && transcriptionResult.segments.length === 0) {
        console.error('❌ Whisper CLI returned completely empty transcription!');
        console.error('Raw whisper stdout:', result.stdout.substring(0, 1000));
        console.error('Raw whisper stderr:', result.stderr.substring(0, 1000));
        console.error('Generated files check:');
        console.error(`  JSON exists: ${existsSync(jsonOutputPath)}`);
        console.error(`  TXT exists: ${existsSync(txtOutputPath)}`);
        
        throw new Error(
          `Whisper transcription returned completely empty results - both text and segments are empty. ` +
          `Text length: ${transcriptionResult.text?.length || 0}, ` +
          `Segments: ${transcriptionResult.segments.length}, ` +
          `Duration: ${transcriptionResult.duration}s`
        );
      }

      return transcriptionResult;
    } catch (error) {
      throw new Error(`Whisper transcription failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get available languages from whisper.cpp
   */
  async getAvailableLanguages(): Promise<string[]> {
    try {
      const result = await this.runWhisperCommand(['--print-languages']);
      
      if (result.exitCode === 0) {
        // Parse languages from output
        const languages = result.stdout
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0 && !line.startsWith('whisper'))
          .map(line => {
            const match = line.match(/^([a-z]{2})\s+/);
            return match ? match[1] : null;
          })
          .filter(lang => lang !== null) as string[];
        
        return languages;
      }
      
      return [];
    } catch (error) {
      console.error('Failed to get available languages:', error);
      return [];
    }
  }

  /**
   * Run whisper command and capture output
   */
  private async runWhisperCommand(
    args: string[],
    onProgress?: (progress: number) => void,
    onTextStream?: (segment: {
      type: 'segment-start' | 'segment-text' | 'segment-complete';
      segmentId: number;
      text: string;
      startTime: number;
      endTime?: number;
      confidence?: number;
      isPartial: boolean;
    }) => void
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    return new Promise((resolve, reject) => {
      const process = spawn(this.executablePath, args);
      
      let stdout = '';
      let stderr = '';
      // const currentSegmentId = 0; // Future use
      // const segmentBuffer = ''; // Future use
      
      process.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        
        // Note: Raw whisper output can be logged here for debugging if needed
        
        // Parse progress from stdout
        if (onProgress) {
          const progressMatch = chunk.match(/progress\s*=\s*(\d+)%/);
          if (progressMatch) {
            const progress = parseInt(progressMatch[1]);
            onProgress(progress);
          }
        }

        // Parse real-time transcription text from stdout
        if (onTextStream) {
          this.parseTextStreamFromOutput(chunk, 0, onTextStream);
        }
      });
      
      process.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        
        // Parse progress from stderr as well
        if (onProgress) {
          const progressMatch = chunk.match(/\[(\d+)%\]/);
          if (progressMatch) {
            const progress = parseInt(progressMatch[1]);
            onProgress(progress);
          }
        }
      });
      
      process.on('close', (code) => {
        resolve({
          exitCode: code || 0,
          stdout,
          stderr,
        });
      });
      
      process.on('error', (error) => {
        reject(error);
      });
      
      // Set timeout to prevent hanging - increased for large-v3 model
      const timeout = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error('Whisper process timed out'));
      }, 60 * 60 * 1000); // 60 minutes timeout for large models
      
      process.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Estimate processing time based on audio duration
   */
  estimateProcessingTime(audioDurationSeconds: number): number {
    // Rough estimate: large-v3 model processes about 1 minute of audio per 6 seconds
    // This varies based on hardware and audio complexity
    return Math.ceil(audioDurationSeconds / 10);
  }

  /**
   * Get model information
   */
  async getModelInfo(): Promise<{
    modelPath: string;
    modelSize: number;
    modelType: string;
  }> {
    try {
      const stats = await fs.stat(this.modelPath);
      
      return {
        modelPath: this.modelPath,
        modelSize: stats.size,
        modelType: 'large-v3',
      };
    } catch (error) {
      throw new Error(`Failed to get model info: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Test whisper.cpp with a short audio file
   */
  async testTranscription(testAudioPath: string): Promise<boolean> {
    try {
      if (!existsSync(testAudioPath)) {
        console.warn('Test audio file not found, skipping transcription test');
        return true;
      }

      const tempDir = path.dirname(testAudioPath);
      const testConfig: AudioConfig = {
        model: 'large-v3',
        language: 'auto',
        wordTimestamps: true,
        sampleRate: 16000,
        channels: 1,
        executablePath: this.executablePath,
        modelPath: this.modelPath,
      };

      const result = await this.transcribeAudio(testAudioPath, tempDir, testConfig);
      
      return result.text.length > 0;
    } catch (error) {
      console.error('Whisper transcription test failed:', error);
      return false;
    }
  }

  /**
   * Parse real-time text stream from whisper output
   */
  private parseTextStreamFromOutput(
    chunk: string,
    segmentId: number,
    onTextStream: (segment: {
      type: 'segment-start' | 'segment-text' | 'segment-complete';
      segmentId: number;
      text: string;
      startTime: number;
      endTime?: number;
      confidence?: number;
      isPartial: boolean;
    }) => void
  ): void {
    try {
      const lines = chunk.split('\n');
      let currentSegmentId = segmentId;
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        // Pattern 1: Direct SRT-style timestamp format [00:01.200 --> 00:03.400]  Hello world
        const srtTimestampPattern = /\[(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2})\.(\d{3})\]\s*(.+)/;
        const srtMatch = srtTimestampPattern.exec(trimmedLine);
        
        if (srtMatch) {
          const startTime = this.parseTimestamp(srtMatch[1]!, srtMatch[2]!, srtMatch[3]!);
          const endTime = this.parseTimestamp(srtMatch[4]!, srtMatch[5]!, srtMatch[6]!);
          const text = srtMatch[7]?.trim();
          
          if (text && text.length > 0) {
            // Clean text of ANSI color codes
            const cleanText = this.cleanText(text);
            
            onTextStream({
              type: 'segment-start',
              segmentId: currentSegmentId,
              text: '',
              startTime,
              endTime,
              isPartial: false,
            });

            onTextStream({
              type: 'segment-text',
              segmentId: currentSegmentId,
              text: cleanText,
              startTime,
              endTime,
              isPartial: false,
            });

            onTextStream({
              type: 'segment-complete',
              segmentId: currentSegmentId,
              text: cleanText,
              startTime,
              endTime,
              isPartial: false,
            });
            
            currentSegmentId++;
          }
          continue;
        }

        // Pattern 2: Whisper progress with partial text like "[00:00:01.200 --> 00:00:03.400]  Hello"
        const whisperProgressPattern = /\[(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})\]\s*(.+)/;
        const progressMatch = whisperProgressPattern.exec(trimmedLine);
        
        if (progressMatch) {
          const startMins = parseInt(progressMatch[1]!) * 60 + parseInt(progressMatch[2]!);
          const startTime = startMins + parseInt(progressMatch[3]!) + parseInt(progressMatch[4]!) / 1000;
          
          const endMins = parseInt(progressMatch[5]!) * 60 + parseInt(progressMatch[6]!);
          const endTime = endMins + parseInt(progressMatch[7]!) + parseInt(progressMatch[8]!) / 1000;
          
          const text = progressMatch[9]?.trim();
          
          if (text && text.length > 0) {
            const cleanText = this.cleanText(text);
            
            onTextStream({
              type: 'segment-text',
              segmentId: currentSegmentId,
              text: cleanText,
              startTime,
              endTime,
              isPartial: false,
            });
            currentSegmentId++;
          }
          continue;
        }

        // Pattern 3: Simple timestamp at start "[00:01.200]" followed by text
        const simpleTimestampPattern = /\[(\d{2}):(\d{2})\.(\d{3})\]\s*(.+)/;
        const simpleMatch = simpleTimestampPattern.exec(trimmedLine);
        
        if (simpleMatch) {
          const startTime = this.parseTimestamp(simpleMatch[1]!, simpleMatch[2]!, simpleMatch[3]!);
          const text = simpleMatch[4]?.trim();
          
          if (text && text.length > 0) {
            const cleanText = this.cleanText(text);
            
            onTextStream({
              type: 'segment-text',
              segmentId: currentSegmentId,
              text: cleanText,
              startTime,
              isPartial: true,
            });
            currentSegmentId++;
          }
          continue;
        }

        // Pattern 4: Look for standalone transcribed text without timestamps
        // Only consider lines that look like actual speech (not technical output)
        if (!trimmedLine.includes('whisper') &&
            !trimmedLine.includes('progress') &&
            !trimmedLine.includes('%') &&
            !trimmedLine.includes('model') &&
            !trimmedLine.includes('sampling') &&
            !trimmedLine.toLowerCase().includes('load') &&
            !trimmedLine.includes('system') &&
            trimmedLine.length > 2 &&
            /[a-zA-Z]/.test(trimmedLine)) {
          
          // This looks like actual transcribed text
          const cleanText = this.cleanText(trimmedLine);
          
          onTextStream({
            type: 'segment-text',
            segmentId: currentSegmentId,
            text: cleanText,
            startTime: 0, // Unknown timestamp
            isPartial: true,
          });
          currentSegmentId++;
        }
      }
    } catch (error) {
      // Ignore parsing errors to avoid disrupting transcription
      console.debug('Text stream parsing error:', error);
    }
  }

  /**
   * Parse timestamp from whisper format
   */
  private parseTimestamp(minutes: string, seconds: string, milliseconds: string): number {
    const mins = parseInt(minutes, 10);
    const secs = parseInt(seconds, 10);
    const millis = parseInt(milliseconds, 10);
    return mins * 60 + secs + millis / 1000;
  }

  /**
   * Clean text by removing ANSI color codes and extra whitespace
   */
  private cleanText(text: string): string {
    // Remove ANSI color codes (e.g., \u001b[38;5;71m and \u001b[0m)
    const cleanedText = text
      .replace(/\u001b\[[0-9;]*m/g, '') // Remove ANSI escape codes
      .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
      .trim(); // Remove leading/trailing whitespace
    
    return cleanedText;
  }
}

/**
 * Create WhisperCLI instance with environment configuration
 */
export function createWhisperCLI(): WhisperCLI {
  const executablePath = process.env.WHISPER_EXECUTABLE_PATH;
  const modelPath = process.env.WHISPER_MODEL_PATH;

  if (!executablePath || !modelPath) {
    throw new Error('WHISPER_EXECUTABLE_PATH and WHISPER_MODEL_PATH environment variables are required');
  }

  return new WhisperCLI(executablePath, modelPath);
}

/**
 * Default whisper CLI instance
 */
export const whisperCLI = createWhisperCLI();