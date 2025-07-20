import OpenAI from 'openai';
import { promises as fs } from 'fs';
import path from 'path';
import { TranscriptionResult } from '../types/audio.js';

/**
 * Summary options
 */
export interface SummaryOptions {
  transcription: TranscriptionResult;
  outputDir: string;
  language?: string;
  style?: 'detailed'; // Only detailed style supported now
  includeTimestamps?: boolean;
}

/**
 * Timeline segment for deep notes mode
 */
export interface TimelineSegment {
  start: string;  // "00:00" format
  end: string;    // "01:30" format  
  title: string;  // Chinese segment title
}

/**
 * Summary result structure
 */
export interface SummaryResult {
  summary: string;
  highlights: Array<{
    start: number;
    end: number;
    note: string;
  }>;
  topics: string[];
  keyPoints: string[];
  conclusion?: string;
  // Optional new fields for backward compatibility
  timeline?: TimelineSegment[];
  deepNotes?: string; // Markdown content for deep notes
  metadata: {
    totalWords: number;
    processingTime: number;
    model: string;
    language: string;
    style: string;
  };
}

/**
 * Summary error class
 */
export class SummaryError extends Error {
  constructor(message: string, public code: string, public details?: any) {
    super(message);
    this.name = 'SummaryError';
  }
}

/**
 * AI summarization service using OpenAI GPT-4o
 */
export class AISummarizer {
  private openai: OpenAI;
  private rateLimitTracker: Map<string, number> = new Map();

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new SummaryError('OpenAI API key not configured', 'API_KEY_MISSING');
    }

    this.openai = new OpenAI({
      apiKey,
      timeout: 60000, // 60 seconds timeout
    });
  }

  /**
   * Generate AI summary from transcription
   */
  async generateSummary(
    options: SummaryOptions,
    onProgress?: (progress: number, step: string) => void
  ): Promise<SummaryResult> {
    const { transcription, outputDir, language = 'Chinese', style = 'detailed', includeTimestamps = true } = options;

    // Validate transcription
    if (!transcription.text || transcription.text.trim().length === 0) {
      throw new SummaryError('Transcription text is empty', 'EMPTY_TRANSCRIPTION');
    }

    // Check rate limits
    await this.checkRateLimit();

    const startTime = Date.now();

    try {
      // Prepare transcript with timestamps if requested
      const formattedTranscript = this.formatTranscript(transcription, includeTimestamps);
      
      // Generate summary using OpenAI
      onProgress?.(85, 'Calling OpenAI API...');
      const summaryResult = await this.callOpenAI(formattedTranscript, {
        language,
        style,
        duration: transcription.duration,
      });

      // Calculate processing time
      const processingTime = Date.now() - startTime;

      // Process and validate response
      onProgress?.(90, 'Processing response...');
      
      // Create final result
      const result: SummaryResult = {
        ...summaryResult,
        metadata: {
          totalWords: transcription.text.split(/\s+/).length,
          processingTime,
          model: 'gpt-4o',
          language,
          style,
        },
      };

      // Save summary to file
      onProgress?.(95, 'Saving summary files...');
      await this.saveSummary(result, outputDir);

      onProgress?.(100, 'Summary completed');
      return result;
    } catch (error) {
      if (error instanceof SummaryError) {
        throw error;
      }

      // Handle OpenAI API errors
      if (error instanceof OpenAI.APIError) {
        if (error.status === 429) {
          throw new SummaryError(
            'Rate limit exceeded. Please try again later.',
            'RATE_LIMIT_EXCEEDED',
            { retryAfter: error.headers?.['retry-after'] }
          );
        }
        
        if (error.status === 400) {
          throw new SummaryError(
            'Invalid request to OpenAI API',
            'INVALID_REQUEST',
            { message: error.message }
          );
        }
        
        if (error.status === 401) {
          throw new SummaryError(
            'Invalid OpenAI API key',
            'INVALID_API_KEY'
          );
        }
      }

      throw new SummaryError(
        `Summary generation failed: ${error instanceof Error ? error.message : String(error)}`,
        'SUMMARY_FAILED',
        error
      );
    }
  }

  /**
   * Call OpenAI API with retry logic
   */
  private async callOpenAI(
    transcript: string,
    options: {
      language: string;
      style: string;
      duration: number;
    }
  ): Promise<Omit<SummaryResult, 'metadata'>> {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        const systemPrompt = this.buildSystemPrompt(options);
        const userPrompt = this.buildUserPrompt(transcript, options);

        const response = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 10000, // High token count for deep notes quality
          response_format: { type: 'json_object' },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('OpenAI returned empty response');
        }

        const parsedResult = JSON.parse(content);
        return this.validateAndFormatResult(parsedResult);
      } catch (error) {
        retryCount++;
        
        if (error instanceof OpenAI.APIError && error.status === 429) {
          // Rate limit hit, exponential backoff
          const backoffTime = Math.pow(2, retryCount) * 1000;
          console.log(`Rate limit hit, retrying in ${backoffTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
        } else if (retryCount >= maxRetries) {
          throw error;
        } else {
          // Other errors, shorter backoff
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Build system prompt for OpenAI
   */
  private buildSystemPrompt(options: { language: string; style: string }): string {
    return `You are a professional video content analyst specializing in creating comprehensive Chinese deep notes from video transcripts.

中文深度笔记格式要求（无论输入语言如何，深度笔记必须用中文输出）：
1. 提供三个层次的分析：内容概要、关键洞察、应用思考
2. 重点生成高质量的highlights，每个highlight就是一个时间段的核心洞察
3. highlights应该涵盖视频的主要时间节点（约1-2分钟每个）
4. 使用有意义的中文描述每个highlight的核心内容
5. 生成完整的深度笔记markdown内容，包含丰富的分析和思考
6. 即使原文是其他语言，所有输出字段都必须用中文

CRITICAL: ALL output fields must be in Chinese, regardless of input language.

Instructions:
- Analyze the provided video transcript carefully
- Focus on creating high-quality highlights that capture key moments with timestamps
- Each highlight should represent a meaningful segment (1-2 minutes) with insightful notes
- Generate comprehensive deep notes in markdown format
- Always return valid JSON format
- Be accurate and factual
- Focus on actionable insights and deep analysis

Return JSON with this structure (注意：timeline字段会自动从highlights生成，无需单独提供):
{
  "summary": "主要内容概述（中文）",
  "highlights": [
    {"start": 0, "end": 105, "note": "开场和核心主题介绍：乔布斯分享三个人生故事的框架"},
    {"start": 105, "end": 210, "note": "第一个故事-连接人生的点：从辍学到学习书法，最终影响Mac设计"},
    {"start": 210, "end": 315, "note": "第二个故事-爱与失落：创立苹果、被解雇、重新开始的人生转折"},
    {"start": 315, "end": 420, "note": "第三个故事-关于死亡：癌症诊断带来的生命思考和Stay hungry, stay foolish"}
  ],
  "topics": ["主题1（中文）", "主题2（中文）", "主题3（中文）"],
  "keyPoints": ["要点1（中文）", "要点2（中文）", "要点3（中文）"],
  "conclusion": "总结（中文）",
  "deepNotes": "# 深度笔记\\n\\n## 内容概要\\n[用2-3段话概述视频的整体内容和核心主题，突出主要观点]\\n\\n## 关键洞察\\n### 核心观点1\\n[深入分析第一个重要观点，包括背景、论证过程、实例]\\n\\n### 核心观点2\\n[深入分析第二个重要观点，挖掘深层含义]\\n\\n### 核心观点3\\n[继续分析其他重要观点，形成完整的知识体系]\\n\\n## 应用思考\\n### 实践启发\\n[如何将这些观点应用到实际生活或工作中]\\n\\n### 深度思考\\n[引发的更深层思考和哲学思辨]\\n\\n### 行动建议\\n[具体的行动建议和实施路径]"
}`;
  }

  /**
   * Build user prompt for OpenAI
   */
  private buildUserPrompt(
    transcript: string,
    options: { language: string; style: string; duration: number }
  ): string {
    const { duration } = options;
    
    return `Please analyze this video transcript and generate comprehensive Chinese deep notes.

Video Duration: ${Math.round(duration)} seconds (${Math.round(duration / 60)} minutes)

Transcript:
${transcript}

Please provide a thorough analysis following the Chinese deep notes format specified in the system prompt. Remember: ALL output must be in Chinese, regardless of the transcript language.`;
  }

  /**
   * Validate and format OpenAI response
   */
  private validateAndFormatResult(parsedResult: any): Omit<SummaryResult, 'metadata'> {
    // Validate required fields
    if (!parsedResult.summary || typeof parsedResult.summary !== 'string') {
      throw new Error('Invalid summary format from OpenAI');
    }

    // Ensure highlights array exists and is properly formatted
    const highlights = Array.isArray(parsedResult.highlights) 
      ? parsedResult.highlights.filter((h: any) => 
          typeof h === 'object' && 
          typeof h.start === 'number' && 
          typeof h.end === 'number' && 
          typeof h.note === 'string'
        )
      : [];

    // Ensure topics array exists
    const topics = Array.isArray(parsedResult.topics) 
      ? parsedResult.topics.filter((t: any) => typeof t === 'string')
      : [];

    // Ensure keyPoints array exists
    const keyPoints = Array.isArray(parsedResult.keyPoints) 
      ? parsedResult.keyPoints.filter((p: any) => typeof p === 'string')
      : [];

    // Generate timeline from highlights (no need for separate timeline field from AI)
    let timeline: TimelineSegment[] | undefined;
    if (highlights.length > 0) {
      timeline = highlights.map((highlight: any) => ({
        start: AISummarizer.formatTimeStatic(highlight.start),
        end: AISummarizer.formatTimeStatic(highlight.end),
        title: highlight.note
      }));
    }

    // Validate deepNotes field (graceful degradation)
    let deepNotes: string | undefined;
    if (parsedResult.deepNotes && typeof parsedResult.deepNotes === 'string') {
      const trimmedNotes = parsedResult.deepNotes.trim();
      if (trimmedNotes.length > 0) {
        deepNotes = trimmedNotes;
      }
    }

    const result: Omit<SummaryResult, 'metadata'> = {
      summary: parsedResult.summary,
      highlights,
      topics,
      keyPoints,
      conclusion: parsedResult.conclusion || undefined,
    };

    // Add optional fields only if they exist
    if (timeline) {
      (result as any).timeline = timeline;
    }
    if (deepNotes) {
      (result as any).deepNotes = deepNotes;
    }

    return result;
  }

  /**
   * Format transcript with timestamps
   */
  private formatTranscript(transcription: TranscriptionResult, includeTimestamps: boolean): string {
    if (!includeTimestamps || !transcription.segments || transcription.segments.length === 0) {
      return transcription.text;
    }

    return transcription.segments
      .map(segment => {
        const startTime = this.formatTime(segment.start);
        const endTime = this.formatTime(segment.end);
        return `[${startTime}-${endTime}] ${segment.text}`;
      })
      .join('\n');
  }

  /**
   * Format time in MM:SS format
   */
  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Static format time method for use in validation
   */
  static formatTimeStatic(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Check rate limits
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const windowMs = 60000; // 1 minute window
    const maxRequests = 50; // Conservative limit

    // Clean old entries
    for (const [key, timestamp] of this.rateLimitTracker.entries()) {
      if (now - timestamp > windowMs) {
        this.rateLimitTracker.delete(key);
      }
    }

    // Check current rate
    const currentRequests = this.rateLimitTracker.size;
    if (currentRequests >= maxRequests) {
      throw new SummaryError(
        'Rate limit exceeded. Please try again later.',
        'RATE_LIMIT_EXCEEDED',
        { currentRequests, maxRequests }
      );
    }

    // Record this request
    this.rateLimitTracker.set(now.toString(), now);
  }

  /**
   * Save summary to file
   */
  private async saveSummary(summary: SummaryResult, outputDir: string): Promise<void> {
    try {
      const summaryPath = path.join(outputDir, 'summary.json');
      await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

      // Also save human-readable version
      const readablePath = path.join(outputDir, 'summary.txt');
      const readableContent = this.formatReadableSummary(summary);
      await fs.writeFile(readablePath, readableContent, 'utf-8');

      // Generate markdown file for deep notes if available
      if (summary.deepNotes && summary.timeline) {
        const videoTitle = await this.getVideoTitle(outputDir);
        const fileName = this.sanitizeFilename(videoTitle || 'summary') + '.md';
        const markdownPath = path.join(outputDir, fileName);
        
        const markdownContent = this.buildMarkdownContent(summary, videoTitle);
        await fs.writeFile(markdownPath, markdownContent, 'utf-8');
        
        console.log('Deep notes markdown saved to:', markdownPath);
      }

      console.log('Summary saved to:', outputDir);
    } catch (error) {
      console.error('Failed to save summary:', error);
      throw new SummaryError(
        `Failed to save summary: ${error instanceof Error ? error.message : String(error)}`,
        'SAVE_FAILED',
        error
      );
    }
  }

  /**
   * Format summary for human reading
   */
  private formatReadableSummary(summary: SummaryResult): string {
    let content = '# Video Summary\n\n';
    
    content += `## Summary\n${summary.summary}\n\n`;
    
    if (summary.keyPoints.length > 0) {
      content += '## Key Points\n';
      summary.keyPoints.forEach(point => {
        content += `- ${point}\n`;
      });
      content += '\n';
    }
    
    if (summary.highlights.length > 0) {
      content += '## Highlights\n';
      summary.highlights.forEach(highlight => {
        const startTime = this.formatTime(highlight.start);
        const endTime = this.formatTime(highlight.end);
        content += `- **${startTime}-${endTime}**: ${highlight.note}\n`;
      });
      content += '\n';
    }
    
    if (summary.topics.length > 0) {
      content += `## Topics Covered\n${summary.topics.join(', ')}\n\n`;
    }
    
    if (summary.conclusion) {
      content += `## Conclusion\n${summary.conclusion}\n\n`;
    }
    
    content += '## Metadata\n';
    content += `- Processing Time: ${summary.metadata.processingTime}ms\n`;
    content += `- Total Words: ${summary.metadata.totalWords}\n`;
    content += `- Model: ${summary.metadata.model}\n`;
    content += `- Language: ${summary.metadata.language}\n`;
    content += `- Style: ${summary.metadata.style}\n`;
    
    return content;
  }

  /**
   * Get video title from manifest
   */
  private async getVideoTitle(outputDir: string): Promise<string | undefined> {
    try {
      const manifestPath = path.join(outputDir, 'manifest.json');
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent);
      return manifest.title || manifest.originalTitle;
    } catch (error) {
      console.warn('Could not read video title from manifest:', error);
      return undefined;
    }
  }

  /**
   * Build markdown content for deep notes
   */
  private buildMarkdownContent(summary: SummaryResult, videoTitle?: string): string {
    let content = `# ${videoTitle || '视频深度笔记'}\n\n`;
    
    if (videoTitle) {
      content += `## 原视频标题\n${videoTitle}\n\n`;
    }
    
    // Use highlights as the primary timeline source since they're more meaningful
    if (summary.highlights && summary.highlights.length > 0) {
      content += `## 时间轴目录\n\n`;
      summary.highlights.forEach((highlight) => {
        const startTime = this.formatTime(highlight.start);
        const endTime = this.formatTime(highlight.end);
        content += `- **${startTime}-${endTime}**: ${highlight.note}\n`;
      });
      content += '\n';
    } else if (summary.timeline && summary.timeline.length > 0) {
      // Fallback to timeline if highlights are not available
      content += `## 时间轴目录\n\n`;
      summary.timeline.forEach((segment) => {
        content += `- **${segment.start}-${segment.end}**: ${segment.title}\n`;
      });
      content += '\n';
    }
    
    if (summary.deepNotes) {
      content += summary.deepNotes;
    }
    
    return content;
  }

  /**
   * Sanitize filename for filesystem compatibility
   */
  private sanitizeFilename(filename: string): string {
    // Allow Chinese characters but remove filesystem-problematic characters
    // eslint-disable-next-line no-control-regex
    return filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').substring(0, 100);
  }

  /**
   * Get summary statistics
   */
  async getSummaryStats(): Promise<{
    totalRequests: number;
    currentRateLimit: number;
    averageProcessingTime: number;
  }> {
    const now = Date.now();
    const windowMs = 60000; // 1 minute window
    
    // Count requests in current window
    const currentRequests = Array.from(this.rateLimitTracker.values())
      .filter(timestamp => now - timestamp < windowMs)
      .length;

    return {
      totalRequests: this.rateLimitTracker.size,
      currentRateLimit: currentRequests,
      averageProcessingTime: 0, // Would need to track this separately
    };
  }
}

/**
 * Default AI summarizer instance
 */
export const aiSummarizer = new AISummarizer();