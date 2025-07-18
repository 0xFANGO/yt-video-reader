import { describe, it, expect } from 'vitest';
import { 
  isValidYouTubeUrl, 
  extractVideoId, 
  validateFileSize,
  validateEnvironment 
} from '../../../src/utils/validation.js';

describe('Validation Utils', () => {
  describe('isValidYouTubeUrl', () => {
    it('should validate correct YouTube URLs', () => {
      const validUrls = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtu.be/dQw4w9WgXcQ',
        'https://www.youtube.com/embed/dQw4w9WgXcQ',
      ];

      validUrls.forEach(url => {
        expect(isValidYouTubeUrl(url)).toBe(true);
      });
    });

    it('should reject invalid URLs', () => {
      const invalidUrls = [
        'https://not-youtube.com/watch?v=test',
        'invalid-url',
        '',
        'https://youtube.com',
        'https://vimeo.com/123456',
      ];

      invalidUrls.forEach(url => {
        expect(isValidYouTubeUrl(url)).toBe(false);
      });
    });
  });

  describe('extractVideoId', () => {
    it('should extract video ID from various YouTube URL formats', () => {
      const testCases = [
        {
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          expected: 'dQw4w9WgXcQ'
        },
        {
          url: 'https://youtu.be/dQw4w9WgXcQ',
          expected: 'dQw4w9WgXcQ'
        },
        {
          url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
          expected: 'dQw4w9WgXcQ'
        }
      ];

      testCases.forEach(({ url, expected }) => {
        expect(extractVideoId(url)).toBe(expected);
      });
    });

    it('should return null for invalid URLs', () => {
      expect(extractVideoId('invalid-url')).toBeNull();
      expect(extractVideoId('https://not-youtube.com/video')).toBeNull();
    });
  });

  describe('validateFileSize', () => {
    it('should handle file size validation', () => {
      // This would need actual file mocking in a real test
      // For now, just test that the function exists and returns boolean
      const result = validateFileSize('/nonexistent/file');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('validateEnvironment', () => {
    it('should validate environment variables', () => {
      const result = validateEnvironment();
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('errors');
      expect(typeof result.isValid).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });
});