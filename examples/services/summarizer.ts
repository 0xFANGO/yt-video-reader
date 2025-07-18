import OpenAI from 'openai';
import { promises as fs } from 'fs';
import path from 'path';
import { TranscriptionResult } from '../types/audio';

/**
 * AI总结服务示例
 */

export interface SummaryOptions {
  transcription: TranscriptionResult;
  outputDir: string;
  language?: string;
}

export interface SummaryResult {
  summary: string;
  highlights: Array<{
    start: number;
    end: number;
    note: string;
  }>;
  topics: string[];
}

export class SummaryError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'SummaryError';
  }
}

/**
 * 生成AI总结
 */
export async function generateSummary(options: SummaryOptions): Promise<SummaryResult> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    const prompt = buildPrompt(options.transcription, options.language);
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: getSystemPrompt() },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI返回空内容');
    }

    const summary = JSON.parse(content);
    
    // 保存总结
    await saveSummary(summary, options.outputDir);

    return summary;
  } catch (error) {
    throw new SummaryError(
      `总结生成失败: ${error instanceof Error ? error.message : String(error)}`,
      'SUMMARY_FAILED'
    );
  }
}

/**
 * 构建提示词
 */
function buildPrompt(transcription: TranscriptionResult, language?: string): string {
  const transcript = transcription.segments
    .map(segment => `[${formatTime(segment.start)}-${formatTime(segment.end)}] ${segment.text}`)
    .join('\n');

  return `
请分析以下视频转录内容并提供总结：

视频时长: ${transcription.duration}秒
语言: ${transcription.language}

转录内容:
${transcript}

请用${language || '中文'}提供JSON格式的总结，包含：
{
  "summary": "2-3句话的简洁总结",
  "highlights": [
    {"start": 35.2, "end": 48.5, "note": "关键点描述"}
  ],
  "topics": ["主题1", "主题2"]
}
  `;
}

/**
 * 格式化时间
 */
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 系统提示词
 */
function getSystemPrompt(): string {
  return `你是一个专业的视频内容分析师。请分析视频转录内容，提供准确的总结和关键时间点。
- 专注于主要信息和要点
- 时间戳必须准确
- 使用清晰简洁的语言
- 必须返回有效的JSON格式`;
}

/**
 * 保存总结
 */
async function saveSummary(summary: SummaryResult, outputDir: string): Promise<void> {
  const summaryPath = path.join(outputDir, 'summary.json');
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
}