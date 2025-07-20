import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AISummarizer, SummaryResult, TimelineSegment } from '../../../src/services/ai-summarizer.js';
import { TranscriptionResult } from '../../../src/types/audio.js';
import { promises as fs } from 'fs';
import path from 'path';

// Mock OpenAI
vi.mock('openai', () => {
  return {
    default: vi.fn(() => ({
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    })),
    APIError: class APIError extends Error {
      constructor(message: string, public status: number, public headers?: any) {
        super(message);
      }
    },
  };
});

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    promises: {
      writeFile: vi.fn(),
      readFile: vi.fn(),
    },
  };
});

describe('Deep Notes Mode', () => {
  let summarizer: AISummarizer;
  let mockOpenAI: any;

  // Sample transcription data
  const sampleTranscription: TranscriptionResult = {
    text: 'This is a sample transcript about Chinese philosophy and technology.',
    segments: [
      { start: 0, end: 30, text: 'Introduction to the topic' },
      { start: 30, end: 90, text: 'First main point about philosophy' },
      { start: 90, end: 150, text: 'Second point about technology' },
    ],
    language: 'auto',
    duration: 150,
    modelUsed: 'large-v3',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Set up environment variable
    process.env.OPENAI_API_KEY = 'test-api-key';
    
    // Create summarizer instance
    summarizer = new AISummarizer();
    
    // Get the mocked OpenAI instance
    const OpenAI = vi.mocked(await import('openai')).default;
    mockOpenAI = new OpenAI();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('buildSystemPrompt', () => {
    it('should generate Chinese prompts for detailed style', () => {
      // Access private method for testing
      const buildSystemPrompt = (summarizer as any).buildSystemPrompt.bind(summarizer);
      
      const prompt = buildSystemPrompt({
        language: 'Chinese',
        style: 'detailed'
      });
      
      expect(prompt).toContain('中文深度笔记格式要求');
      expect(prompt).toContain('timeline');
      expect(prompt).toContain('deepNotes');
      expect(prompt).toContain('时间轴目录');
      expect(prompt).toContain('深度笔记');
    });

    it('should always include Chinese instructions since detailed is the only style', () => {
      const buildSystemPrompt = (summarizer as any).buildSystemPrompt.bind(summarizer);
      
      const prompt = buildSystemPrompt({
        language: 'English',
        style: 'detailed'
      });
      
      expect(prompt).toContain('中文深度笔记格式要求');
      expect(prompt).toContain('timeline');
      expect(prompt).toContain('deepNotes');
    });
  });

  describe('validateAndFormatResult', () => {
    it('should validate timeline structure correctly', () => {
      const validateAndFormatResult = (summarizer as any).validateAndFormatResult.bind(summarizer);
      
      const mockResponse = {
        summary: '测试摘要',
        highlights: [{ start: 10, end: 20, note: 'Test highlight' }],
        topics: ['topic1', 'topic2'],
        keyPoints: ['point1', 'point2'],
        conclusion: '测试结论',
        timeline: [
          { start: '00:00', end: '01:30', title: '开场介绍' },
          { start: '01:30', end: '03:00', title: '主要内容' }
        ],
        deepNotes: '# 深度笔记\n\n## 概要\n测试内容\n\n## 洞察\n深入分析'
      };
      
      const result = validateAndFormatResult(mockResponse);
      
      expect(result.timeline).toBeDefined();
      expect(result.timeline).toHaveLength(2);
      expect(result.timeline![0].title).toBe('开场介绍');
      expect(result.deepNotes).toBeDefined();
      expect(result.deepNotes).toContain('深度笔记');
    });

    it('should handle invalid timeline data gracefully', () => {
      const validateAndFormatResult = (summarizer as any).validateAndFormatResult.bind(summarizer);
      
      const mockResponse = {
        summary: '测试摘要',
        highlights: [],
        topics: [],
        keyPoints: [],
        timeline: [
          { start: '00:00', end: '01:30' }, // Missing title
          { start: 123, end: 456, title: 'Invalid format' }, // Wrong types
          null, // Invalid item
        ],
        deepNotes: '   \n\n   ' // Empty after trim
      };
      
      const result = validateAndFormatResult(mockResponse);
      
      expect(result.timeline).toBeUndefined(); // Should be filtered out
      expect(result.deepNotes).toBeUndefined(); // Should be undefined due to empty content
    });

    it('should work without optional fields for backward compatibility', () => {
      const validateAndFormatResult = (summarizer as any).validateAndFormatResult.bind(summarizer);
      
      const mockResponse = {
        summary: 'Basic summary',
        highlights: [],
        topics: ['topic1'],
        keyPoints: ['point1'],
        conclusion: 'Basic conclusion'
        // No timeline or deepNotes fields
      };
      
      const result = validateAndFormatResult(mockResponse);
      
      expect(result.summary).toBe('Basic summary');
      expect(result.timeline).toBeUndefined();
      expect(result.deepNotes).toBeUndefined();
      expect(result.topics).toEqual(['topic1']);
    });
  });

  describe('buildMarkdownContent', () => {
    it('should generate markdown with Chinese content', () => {
      const buildMarkdownContent = (summarizer as any).buildMarkdownContent.bind(summarizer);
      
      const summary: Partial<SummaryResult> = {
        timeline: [
          { start: '00:00', end: '01:00', title: '测试段落1' },
          { start: '01:00', end: '02:00', title: '测试段落2' }
        ] as TimelineSegment[],
        deepNotes: '# 深度笔记\n\n## 内容概要\n测试内容\n\n## 关键洞察\n深入分析'
      };
      
      const videoTitle = 'Steve Jobs Stanford演讲';
      const markdownContent = buildMarkdownContent(summary, videoTitle);
      
      expect(markdownContent).toContain('# Steve Jobs Stanford演讲');
      expect(markdownContent).toContain('## 原视频标题');
      expect(markdownContent).toContain('## 时间轴目录');
      expect(markdownContent).toContain('**00:00-01:00**: 测试段落1');
      expect(markdownContent).toContain('深度笔记');
      expect(markdownContent).toContain('关键洞察');
    });

    it('should handle missing video title gracefully', () => {
      const buildMarkdownContent = (summarizer as any).buildMarkdownContent.bind(summarizer);
      
      const summary: Partial<SummaryResult> = {
        deepNotes: '# 深度笔记\n\n## 测试内容'
      };
      
      const markdownContent = buildMarkdownContent(summary);
      
      expect(markdownContent).toContain('# 视频深度笔记');
      expect(markdownContent).not.toContain('## 原视频标题');
      expect(markdownContent).toContain('深度笔记');
    });
  });

  describe('sanitizeFilename', () => {
    it('should sanitize Chinese filenames correctly', () => {
      const sanitizeFilename = (summarizer as any).sanitizeFilename.bind(summarizer);
      
      const testCases = [
        { input: 'Steve Jobs Stanford演讲', expected: 'Steve Jobs Stanford演讲' },
        { input: '文件名包含/\\:*?"<>|字符', expected: '文件名包含_______字符' },
        { input: '很长的中文文件名'.repeat(10), expected: '很长的中文文件名'.repeat(10).substring(0, 100) },
      ];
      
      testCases.forEach(({ input, expected }) => {
        const result = sanitizeFilename(input);
        expect(result).toBe(expected);
        expect(result.length).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('saveSummary with markdown generation', () => {
    it('should generate markdown file when deepNotes and timeline present', async () => {
      const mockWriteFile = vi.mocked(fs.writeFile);
      const mockReadFile = vi.mocked(fs.readFile);
      
      // Mock manifest file read
      mockReadFile.mockResolvedValue(JSON.stringify({
        title: 'Steve Jobs Stanford演讲',
        taskId: 'test-task'
      }));
      
      const summary: SummaryResult = {
        summary: '测试摘要',
        highlights: [],
        topics: [],
        keyPoints: [],
        timeline: [
          { start: '00:00', end: '01:30', title: '开场介绍' }
        ],
        deepNotes: '# 深度笔记\n\n## 内容概要\n测试内容',
        metadata: {
          totalWords: 100,
          processingTime: 1000,
          model: 'gpt-4o',
          language: 'Chinese',
          style: 'detailed',
        },
      };
      
      const saveSummary = (summarizer as any).saveSummary.bind(summarizer);
      await saveSummary(summary, '/test/output/dir');
      
      // Should write 3 files: JSON, TXT, and MD
      expect(mockWriteFile).toHaveBeenCalledTimes(3);
      
      // Check markdown file was written
      const markdownCall = mockWriteFile.mock.calls.find(call => 
        call[0].toString().endsWith('.md')
      );
      expect(markdownCall).toBeDefined();
      expect(markdownCall![0]).toContain('Steve Jobs Stanford演讲.md');
      expect(markdownCall![1]).toContain('深度笔记');
      expect(markdownCall![1]).toContain('时间轴目录');
    });

    it('should not generate markdown file when deepNotes missing', async () => {
      const mockWriteFile = vi.mocked(fs.writeFile);
      
      const summary: SummaryResult = {
        summary: '测试摘要',
        highlights: [],
        topics: [],
        keyPoints: [],
        // No timeline or deepNotes
        metadata: {
          totalWords: 100,
          processingTime: 1000,
          model: 'gpt-4o',
          language: 'Chinese',
          style: 'detailed',
        },
      };
      
      const saveSummary = (summarizer as any).saveSummary.bind(summarizer);
      await saveSummary(summary, '/test/output/dir');
      
      // Should only write 2 files: JSON and TXT
      expect(mockWriteFile).toHaveBeenCalledTimes(2);
      
      // Check no markdown file was written
      const markdownCall = mockWriteFile.mock.calls.find(call => 
        call[0].toString().endsWith('.md')
      );
      expect(markdownCall).toBeUndefined();
    });
  });

  describe('Token allocation for detailed style', () => {
    it('should use more tokens for detailed style', async () => {
      // Mock OpenAI response
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: '测试摘要',
                highlights: [],
                topics: [],
                keyPoints: [],
                timeline: [{ start: '00:00', end: '01:00', title: '测试' }],
                deepNotes: '# 深度笔记\n\n测试内容'
              })
            }
          }
        ]
      });
      
      // Test detailed style
      await summarizer.generateSummary({
        transcription: sampleTranscription,
        outputDir: '/tmp/test',
        language: 'Chinese',
        style: 'detailed',
        includeTimestamps: true,
      });
      
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 10000, // Should use 10000 for detailed style
        })
      );
      
      // Test concise style
      vi.clearAllMocks();
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Basic summary',
                highlights: [],
                topics: [],
                keyPoints: []
              })
            }
          }
        ]
      });
      
      await summarizer.generateSummary({
        transcription: sampleTranscription,
        outputDir: '/tmp/test',
        language: 'Chinese',
        style: 'detailed',
        includeTimestamps: true,
      });
      
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 2000, // Should use 2000 for other styles
        })
      );
    });
  });
});