import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Transcriber, TranscriptionError } from '../../../src/services/transcriber.js';
import { whisperCLI } from '../../../src/utils/whisper-cli.js';
import { TranscriptionResult } from '../../../src/types/audio.js';

// Mock whisper CLI
vi.mock('../../../src/utils/whisper-cli.js', () => ({
  whisperCLI: {
    validateInstallation: vi.fn(),
    transcribeAudio: vi.fn(),
  },
}));

describe('Transcriber Empty Results Handling', () => {
  let transcriber: Transcriber;
  const mockWhisperCLI = vi.mocked(whisperCLI);

  beforeEach(() => {
    vi.clearAllMocks();
    mockWhisperCLI.validateInstallation.mockResolvedValue({ isValid: true, errors: [] });
    transcriber = new Transcriber();
  });

  describe('Empty transcription detection', () => {
    it('should throw TranscriptionError when text is empty', async () => {
      const emptyResult: TranscriptionResult = {
        text: '',
        segments: [],
        language: 'auto',
        duration: 0,
        modelUsed: 'large-v3'
      };

      mockWhisperCLI.transcribeAudio.mockResolvedValue(emptyResult);

      await expect(transcriber.transcribeAudio({
        audioPath: '/test/audio.wav',
        outputDir: '/test/output',
        config: { 
          model: 'large-v3', 
          language: 'auto',
          wordTimestamps: true,
          sampleRate: 16000,
          channels: 1,
          executablePath: '/test/whisper',
          modelPath: '/test/model.bin'
        }
      })).rejects.toThrow(TranscriptionError);
    });

    it('should throw TranscriptionError when segments are empty but text exists', async () => {
      const emptySegmentsResult: TranscriptionResult = {
        text: '   \n  \t  ',  // Only whitespace
        segments: [],
        language: 'auto', 
        duration: 60,
        modelUsed: 'large-v3'
      };

      mockWhisperCLI.transcribeAudio.mockResolvedValue(emptySegmentsResult);

      await expect(transcriber.transcribeAudio({
        audioPath: '/test/audio.wav',
        outputDir: '/test/output',
        config: { 
          model: 'large-v3', 
          language: 'auto',
          wordTimestamps: true,
          sampleRate: 16000,
          channels: 1,
          executablePath: '/test/whisper',
          modelPath: '/test/model.bin'
        }
      })).rejects.toThrow('Empty transcription returned');
    });

    it('should succeed with valid transcription', async () => {
      const validResult: TranscriptionResult = {
        text: 'Hello world, this is a test.',
        segments: [
          { start: 0, end: 2, text: 'Hello world,' },
          { start: 2, end: 5, text: 'this is a test.' }
        ],
        language: 'en',
        duration: 5,
        modelUsed: 'large-v3'
      };

      mockWhisperCLI.transcribeAudio.mockResolvedValue(validResult);

      const result = await transcriber.transcribeAudio({
        audioPath: '/test/audio.wav',
        outputDir: '/test/output',
        config: { 
          model: 'large-v3', 
          language: 'auto',
          wordTimestamps: true,
          sampleRate: 16000,
          channels: 1,
          executablePath: '/test/whisper',
          modelPath: '/test/model.bin'
        }
      });

      expect(result.text).toBe('Hello world, this is a test.');
      expect(result.segments).toHaveLength(2);
    });
  });

  describe('Validation error details', () => {
    it('should include detailed error information', async () => {
      const emptyResult: TranscriptionResult = {
        text: '',
        segments: [],
        language: 'auto',
        duration: 0,
        modelUsed: 'large-v3'
      };

      mockWhisperCLI.transcribeAudio.mockResolvedValue(emptyResult);

      try {
        await transcriber.transcribeAudio({
          audioPath: '/test/audio.wav',
          outputDir: '/test/output',
          config: { 
            model: 'large-v3', 
            language: 'auto',
            wordTimestamps: true,
            sampleRate: 16000,
            channels: 1,
            executablePath: '/test/whisper',
            modelPath: '/test/model.bin'
          }
        });
        fail('Should have thrown TranscriptionError');
      } catch (error) {
        expect(error).toBeInstanceOf(TranscriptionError);
        expect(error.code).toBe('EMPTY_TRANSCRIPTION');
        expect(error.details).toEqual({
          textLength: 0,
          segmentsCount: 0,
          duration: 0
        });
      }
    });
  });
});