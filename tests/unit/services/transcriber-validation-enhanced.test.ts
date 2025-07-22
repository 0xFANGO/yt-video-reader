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

// Mock fs functions
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

describe('Transcriber Enhanced Validation Handling', () => {
  let transcriber: Transcriber;
  const mockWhisperCLI = vi.mocked(whisperCLI);
  const fs = await import('fs');
  const mockExistsSync = vi.mocked(fs.existsSync);

  beforeEach(() => {
    vi.clearAllMocks();
    mockWhisperCLI.validateInstallation.mockResolvedValue({ isValid: true, errors: [] });
    mockExistsSync.mockReturnValue(true); // Mock files exist
    transcriber = new Transcriber();
  });

  describe('Enhanced empty transcription validation (relaxed rules)', () => {
    it('should PASS when text exists but segments are empty', async () => {
      const textOnlyResult: TranscriptionResult = {
        text: 'This is valid text content from transcription.',
        segments: [], // Empty segments - should still pass
        language: 'en',
        duration: 30,
        modelUsed: 'large-v3'
      };

      mockWhisperCLI.transcribeAudio.mockResolvedValue(textOnlyResult);

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

      expect(result.text).toBe('This is valid text content from transcription.');
      expect(result.segments).toHaveLength(0);
      expect(result.duration).toBe(30);
    });

    it('should PASS when segments exist but text is empty/whitespace', async () => {
      const segmentsOnlyResult: TranscriptionResult = {
        text: '   \n  \t  ', // Only whitespace - but segments exist
        segments: [
          { start: 0, end: 2, text: 'Hello' },
          { start: 2, end: 4, text: 'world' }
        ],
        language: 'en',
        duration: 4,
        modelUsed: 'large-v3'
      };

      mockWhisperCLI.transcribeAudio.mockResolvedValue(segmentsOnlyResult);

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

      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].text).toBe('Hello');
      expect(result.segments[1].text).toBe('world');
      expect(result.duration).toBe(4);
    });

    it('should FAIL only when BOTH text and segments are empty', async () => {
      const completelyEmptyResult: TranscriptionResult = {
        text: '', // Empty text
        segments: [], // Empty segments
        language: 'auto',
        duration: 0,
        modelUsed: 'large-v3'
      };

      mockWhisperCLI.transcribeAudio.mockResolvedValue(completelyEmptyResult);

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

    it('should FAIL when both text is whitespace-only AND segments are empty', async () => {
      const bothEmptyResult: TranscriptionResult = {
        text: '   \n  \t  ', // Only whitespace
        segments: [], // Empty segments
        language: 'auto',
        duration: 0,
        modelUsed: 'large-v3'
      };

      mockWhisperCLI.transcribeAudio.mockResolvedValue(bothEmptyResult);

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
  });

  describe('New format validation scenarios', () => {
    it('should handle new Whisper format with valid transcription array', async () => {
      const newFormatResult: TranscriptionResult = {
        text: 'Parsed from new format segments',
        segments: [
          { start: 0, end: 1.5, text: 'Parsed from' },
          { start: 1.5, end: 3.0, text: 'new format' },
          { start: 3.0, end: 4.2, text: 'segments' }
        ],
        language: 'en',
        duration: 4.2,
        modelUsed: 'large'
      };

      mockWhisperCLI.transcribeAudio.mockResolvedValue(newFormatResult);

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

      expect(result.text).toBe('Parsed from new format segments');
      expect(result.segments).toHaveLength(3);
      expect(result.duration).toBe(4.2);
      expect(result.language).toBe('en');
      expect(result.modelUsed).toBe('large');
    });

    it('should handle filtered segments from new format (empty segments removed)', async () => {
      // This simulates the new parser filtering out empty segments
      const filteredSegmentsResult: TranscriptionResult = {
        text: 'Only non-empty segments remain',
        segments: [
          { start: 0.17, end: 1.02, text: 'Only' },
          { start: 1.02, end: 2.44, text: 'non-empty' },
          { start: 2.44, end: 4.28, text: 'segments remain' }
        ],
        language: 'en',
        duration: 4.28,
        modelUsed: 'large'
      };

      mockWhisperCLI.transcribeAudio.mockResolvedValue(filteredSegmentsResult);

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

      expect(result.text).toBe('Only non-empty segments remain');
      expect(result.segments).toHaveLength(3);
      expect(result.segments.every(seg => seg.text.trim().length > 0)).toBe(true);
    });

    it('should handle new format with only text (segments filtered out)', async () => {
      // This could happen if all segments were empty and got filtered out
      const textOnlyFromNewFormat: TranscriptionResult = {
        text: 'Reconstructed text from filtered segments',
        segments: [], // All segments were empty and filtered out
        language: 'en',
        duration: 5.5,
        modelUsed: 'large'
      };

      mockWhisperCLI.transcribeAudio.mockResolvedValue(textOnlyFromNewFormat);

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

      expect(result.text).toBe('Reconstructed text from filtered segments');
      expect(result.segments).toHaveLength(0);
      expect(result.duration).toBe(5.5);
      // Should pass because text is not empty
    });
  });

  describe('Error handling for validation failures', () => {
    it('should provide detailed error information for completely empty results', async () => {
      const completelyEmptyResult: TranscriptionResult = {
        text: '',
        segments: [],
        language: 'auto',
        duration: 0,
        modelUsed: 'large-v3'
      };

      mockWhisperCLI.transcribeAudio.mockResolvedValue(completelyEmptyResult);

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

    it('should handle WhisperCLI errors correctly', async () => {
      const whisperError = new Error('Whisper transcription returned completely empty results - both text and segments are empty. Text length: 0, Segments: 0, Duration: 0s');
      mockWhisperCLI.transcribeAudio.mockRejectedValue(whisperError);

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
      })).rejects.toThrow('Whisper transcription returned completely empty results');
    });
  });

  describe('Backward compatibility validation', () => {
    it('should still work with legacy format results', async () => {
      const legacyFormatResult: TranscriptionResult = {
        text: 'Legacy format still works',
        segments: [
          { start: 0, end: 2, text: 'Legacy format' },
          { start: 2, end: 4, text: 'still works' }
        ],
        language: 'en',
        duration: 4,
        modelUsed: 'large-v3'
      };

      mockWhisperCLI.transcribeAudio.mockResolvedValue(legacyFormatResult);

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

      expect(result.text).toBe('Legacy format still works');
      expect(result.segments).toHaveLength(2);
      expect(result.language).toBe('en');
      expect(result.duration).toBe(4);
      expect(result.modelUsed).toBe('large-v3');
    });
  });
});