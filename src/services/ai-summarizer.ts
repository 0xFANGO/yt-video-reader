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
  style?: 'concise' | 'detailed' | 'bullet-points';
  includeTimestamps?: boolean;
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
    const { transcription, outputDir, language = 'English', style = 'concise', includeTimestamps = true } = options;

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
          max_tokens: 2000,
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
    const { language, style } = options;
    
    return `You are a professional video content analyst. Your task is to analyze video transcripts and provide comprehensive summaries.

Instructions:
- Analyze the provided video transcript carefully
- Focus on the main ideas, key insights, and important information
- Provide timestamps for significant moments when available
- Use clear, concise language in ${language}
- Follow the ${style} style as requested
- Always return valid JSON format

Return JSON with this exact structure:
{
  "summary": "2-3 sentence overview of the main content",
  "highlights": [
    {"start": 35.2, "end": 48.5, "note": "Key point or insight"}
  ],
  "topics": ["topic1", "topic2", "topic3"],
  "keyPoints": ["point1", "point2", "point3"],
  "conclusion": "Brief conclusion if applicable"
}

Quality requirements:
- Be accurate and factual
- Focus on actionable insights
- Include relevant timestamps
- Maintain professional tone
- Ensure JSON is properly formatted`;
  }

  /**
   * Build user prompt for OpenAI
   */
  private buildUserPrompt(
    transcript: string,
    options: { language: string; style: string; duration: number }
  ): string {
    const { language, style, duration } = options;
    
    return `Please analyze this video transcript and provide a ${style} summary in ${language}.

Video Duration: ${Math.round(duration)} seconds (${Math.round(duration / 60)} minutes)

Transcript:
${transcript}

Please provide a comprehensive analysis following the JSON format specified in the system prompt.`;
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

    return {
      summary: parsedResult.summary,
      highlights,
      topics,
      keyPoints,
      conclusion: parsedResult.conclusion || undefined,
    };
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
      await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

      // Also save human-readable version
      const readablePath = path.join(outputDir, 'summary.txt');
      const readableContent = this.formatReadableSummary(summary);
      await fs.writeFile(readablePath, readableContent);

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