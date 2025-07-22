import { describe, it, expect } from 'vitest';
import { parseWhisperOutput } from '../../../src/types/audio.js';

describe('parseWhisperOutput - New Format Support', () => {
  describe('New transcription array format', () => {
    it('should parse new transcription array format with complete data', () => {
      const newFormatJson = {
        model: { type: "large" },
        params: { language: "auto" },
        result: { language: "en" },
        transcription: [
          {
            timestamps: { from: "00:00:00,000", to: "00:00:01,500" },
            offsets: { from: 0, to: 1500 },
            text: "Hello world"
          },
          {
            timestamps: { from: "00:00:01,500", to: "00:00:03,000" },
            offsets: { from: 1500, to: 3000 },
            text: "This is a test"
          }
        ]
      };

      const result = parseWhisperOutput(JSON.stringify(newFormatJson));
      
      expect(result.text).toBe('Hello world This is a test');
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]).toEqual({
        start: 0,
        end: 1.5,
        text: 'Hello world',
        confidence: undefined
      });
      expect(result.segments[1]).toEqual({
        start: 1.5,
        end: 3.0,
        text: 'This is a test',
        confidence: undefined
      });
      expect(result.duration).toBe(3.0);
      expect(result.language).toBe('en');
      expect(result.modelUsed).toBe('large');
    });

    it('should handle offsets-only format', () => {
      const offsetsOnlyJson = {
        result: { language: "auto" },
        transcription: [
          {
            offsets: { from: 2000, to: 4500 },
            text: "Testing offsets"
          }
        ]
      };

      const result = parseWhisperOutput(JSON.stringify(offsetsOnlyJson));
      
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]).toEqual({
        start: 2.0,
        end: 4.5,
        text: 'Testing offsets',
        confidence: undefined
      });
      expect(result.text).toBe('Testing offsets');
      expect(result.duration).toBe(4.5);
    });

    it('should handle timestamps-only format', () => {
      const timestampsOnlyJson = {
        result: { language: "auto" },
        transcription: [
          {
            timestamps: { from: "00:00:05,250", to: "00:00:07,750" },
            text: "Testing timestamps"
          }
        ]
      };

      const result = parseWhisperOutput(JSON.stringify(timestampsOnlyJson));
      
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]).toEqual({
        start: 5.25,
        end: 7.75,
        text: 'Testing timestamps',
        confidence: undefined
      });
      expect(result.text).toBe('Testing timestamps');
      expect(result.duration).toBe(7.75);
    });

    it('should filter out empty text segments', () => {
      const jsonWithEmptySegments = {
        result: { language: "en" },
        transcription: [
          {
            timestamps: { from: "00:00:00,000", to: "00:00:00,170" },
            offsets: { from: 0, to: 170 },
            text: ""
          },
          {
            timestamps: { from: "00:00:00,170", to: "00:00:01,020" },
            offsets: { from: 170, to: 1020 },
            text: " Tanya"
          },
          {
            timestamps: { from: "00:00:01,020", to: "00:00:02,440" },
            offsets: { from: 1020, to: 2440 },
            text: "   "
          },
          {
            timestamps: { from: "00:00:02,440", to: "00:00:04,280" },
            offsets: { from: 2440, to: 4280 },
            text: "Cushman"
          }
        ]
      };

      const result = parseWhisperOutput(JSON.stringify(jsonWithEmptySegments));
      
      // Should filter out empty and whitespace-only segments
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].text).toBe('Tanya');
      expect(result.segments[1].text).toBe('Cushman');
      expect(result.text).toBe('Tanya Cushman');
      expect(result.duration).toBe(4.28);
    });

    it('should handle confidence values when present', () => {
      const jsonWithConfidence = {
        result: { language: "en" },
        transcription: [
          {
            timestamps: { from: "00:00:00,000", to: "00:00:01,000" },
            offsets: { from: 0, to: 1000 },
            text: "High confidence",
            confidence: 0.95
          },
          {
            timestamps: { from: "00:00:01,000", to: "00:00:02,000" },
            offsets: { from: 1000, to: 2000 },
            text: "Low confidence",
            confidence: 0.45
          }
        ]
      };

      const result = parseWhisperOutput(JSON.stringify(jsonWithConfidence));
      
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].confidence).toBe(0.95);
      expect(result.segments[1].confidence).toBe(0.45);
    });

    it('should handle missing or malformed timestamps gracefully', () => {
      const jsonWithMalformedTimestamps = {
        result: { language: "en" },
        transcription: [
          {
            timestamps: { from: "invalid", to: "00:00:01,000" },
            offsets: { from: 0, to: 1000 },
            text: "Valid text"
          },
          {
            // Missing timestamps and offsets
            text: "Another valid text"
          }
        ]
      };

      const result = parseWhisperOutput(JSON.stringify(jsonWithMalformedTimestamps));
      
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]).toEqual({
        start: 0,      // From offsets
        end: 1,        // From offsets
        text: 'Valid text',
        confidence: undefined
      });
      expect(result.segments[1]).toEqual({
        start: 0,      // Default when no timestamps/offsets
        end: 0,        // Default when no timestamps/offsets
        text: 'Another valid text',
        confidence: undefined
      });
      expect(result.text).toBe('Valid text Another valid text');
    });

    it('should prefer offsets over timestamps when both are present', () => {
      const jsonWithBothFormats = {
        result: { language: "en" },
        transcription: [
          {
            timestamps: { from: "00:00:01,000", to: "00:00:02,000" }, // Should be ignored
            offsets: { from: 500, to: 1500 }, // Should be used
            text: "Testing preference"
          }
        ]
      };

      const result = parseWhisperOutput(JSON.stringify(jsonWithBothFormats));
      
      expect(result.segments[0]).toEqual({
        start: 0.5,    // From offsets: 500ms / 1000
        end: 1.5,      // From offsets: 1500ms / 1000
        text: 'Testing preference',
        confidence: undefined
      });
    });

    it('should handle empty transcription array', () => {
      const jsonWithEmptyArray = {
        result: { language: "en" },
        transcription: []
      };

      const result = parseWhisperOutput(JSON.stringify(jsonWithEmptyArray));
      
      expect(result.segments).toHaveLength(0);
      expect(result.text).toBe('');
      expect(result.duration).toBe(0);
      expect(result.language).toBe('en');
    });

    it('should extract language from various locations', () => {
      // Test result.language priority
      const json1 = {
        result: { language: "fr" },
        params: { language: "en" },
        transcription: [{ text: "Bonjour", offsets: { from: 0, to: 1000 } }]
      };
      expect(parseWhisperOutput(JSON.stringify(json1)).language).toBe('fr');

      // Test fallback to params.language
      const json2 = {
        params: { language: "de" },
        transcription: [{ text: "Hallo", offsets: { from: 0, to: 1000 } }]
      };
      expect(parseWhisperOutput(JSON.stringify(json2)).language).toBe('de');

      // Test fallback to auto
      const json3 = {
        transcription: [{ text: "Hello", offsets: { from: 0, to: 1000 } }]
      };
      expect(parseWhisperOutput(JSON.stringify(json3)).language).toBe('auto');
    });
  });

  describe('Backward compatibility', () => {
    it('should still handle legacy format with text and segments', () => {
      const legacyJson = {
        text: "Hello world from legacy format",
        segments: [
          { start: 0, end: 2.5, text: "Hello world" },
          { start: 2.5, end: 5.0, text: "from legacy format" }
        ],
        language: "en",
        duration: 5.0,
        model: "large-v3"
      };

      const result = parseWhisperOutput(JSON.stringify(legacyJson));
      
      expect(result.text).toBe("Hello world from legacy format");
      expect(result.segments).toHaveLength(2);
      expect(result.language).toBe("en");
      expect(result.duration).toBe(5.0);
      expect(result.modelUsed).toBe("large-v3");
    });

    it('should still handle plain text fallback', () => {
      const plainText = "This is just plain text output from whisper";
      
      const result = parseWhisperOutput(plainText);
      
      expect(result.text).toBe(plainText);
      expect(result.segments).toHaveLength(0);
      expect(result.language).toBe("auto");
      expect(result.duration).toBe(0);
      expect(result.modelUsed).toBe("large-v3");
    });
  });

  describe('Edge cases and error handling', () => {
    it('should throw error for empty input', () => {
      expect(() => parseWhisperOutput('')).toThrow('parseWhisperOutput: empty or null input');
      expect(() => parseWhisperOutput('   ')).toThrow('parseWhisperOutput: empty or null input');
    });

    it('should throw error for null input', () => {
      expect(() => parseWhisperOutput(null as any)).toThrow('parseWhisperOutput: empty or null input');
    });

    it('should handle invalid JSON gracefully by falling back to plain text', () => {
      const invalidJson = '{"invalid": json}';
      
      const result = parseWhisperOutput(invalidJson);
      
      expect(result.text).toBe(invalidJson);
      expect(result.segments).toHaveLength(0);
    });

    it('should throw error when plain text fallback is also empty', () => {
      const emptyJsonLike = '   {"empty": "object"}   ';
      
      // This should fall back to plain text parsing, but the trimmed result is not valid text
      expect(() => parseWhisperOutput('   ')).toThrow('parseWhisperOutput: empty or null input');
    });

    it('should handle complex timestamp formats', () => {
      const jsonWithComplexTimestamps = {
        result: { language: "en" },
        transcription: [
          {
            timestamps: { from: "01:23:45,678", to: "01:23:47,890" },
            text: "Complex timestamp test"
          }
        ]
      };

      const result = parseWhisperOutput(JSON.stringify(jsonWithComplexTimestamps));
      
      // 1*3600 + 23*60 + 45 + 678/1000 = 3600 + 1380 + 45 + 0.678 = 5025.678
      expect(result.segments[0].start).toBeCloseTo(5025.678, 3);
      // 1*3600 + 23*60 + 47 + 890/1000 = 3600 + 1380 + 47 + 0.890 = 5027.890
      expect(result.segments[0].end).toBeCloseTo(5027.890, 3);
    });
  });
});