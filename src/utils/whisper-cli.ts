import { spawn, ChildProcess } from 'child_process';
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
    onProgress?: (progress: number) => void
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
    const srtOutputPath = `${outputBaseName}.srt`;
    const txtOutputPath = `${outputBaseName}.txt`;

    // Build whisper command arguments
    const args = [
      '-m', this.modelPath,
      '-f', audioPath,
      '-of', outputBaseName,
      '--output-json',
      '--output-srt',
      '--output-txt',
      '--print-progress',
      '--print-special',
      '--language', config.language || 'auto',
    ];

    // Add word timestamps if enabled
    if (config.wordTimestamps) {
      args.push('--word-timestamps');
    }

    try {
      const result = await this.runWhisperCommand(args, onProgress);
      
      if (result.exitCode !== 0) {
        throw new Error(`Whisper transcription failed: ${result.stderr}`);
      }

      // Parse the JSON output
      let transcriptionResult: TranscriptionResult;
      
      if (existsSync(jsonOutputPath)) {
        const jsonContent = await fs.readFile(jsonOutputPath, 'utf-8');
        transcriptionResult = parseWhisperOutput(jsonContent);
      } else {
        // Fallback to text output if JSON is not available
        const textContent = existsSync(txtOutputPath) 
          ? await fs.readFile(txtOutputPath, 'utf-8')
          : result.stdout;
        
        transcriptionResult = parseWhisperOutput(textContent);
      }

      // Ensure we have the correct model information
      transcriptionResult.modelUsed = 'large-v3';

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
    onProgress?: (progress: number) => void
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    return new Promise((resolve, reject) => {
      const process = spawn(this.executablePath, args);
      
      let stdout = '';
      let stderr = '';
      
      process.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        
        // Parse progress from stdout
        if (onProgress) {
          const progressMatch = chunk.match(/progress\s*=\s*(\d+)%/);
          if (progressMatch) {
            const progress = parseInt(progressMatch[1]);
            onProgress(progress);
          }
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
      
      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error('Whisper process timed out'));
      }, 30 * 60 * 1000); // 30 minutes timeout
      
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