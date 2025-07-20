#!/usr/bin/env node

/**
 * 测试脚本：验证深度笔记提示词效果
 * 
 * 使用方法：
 * 1. 设置 OPENAI_API_KEY 环境变量
 * 2. 运行: node test-prompt.js
 * 
 * 这个脚本会：
 * 1. 使用现有的史蒂夫·乔布斯演讲转录文本
 * 2. 调用新的深度笔记提示词
 * 3. 生成中文深度笔记和时间轴
 * 4. 保存结果到 test-output/ 目录
 */

import OpenAI from 'openai';
import { promises as fs } from 'fs';
import path from 'path';

// 检查API密钥
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ 请设置 OPENAI_API_KEY 环境变量');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 构建深度笔记提示词（与 ai-summarizer.ts 相同）
function buildSystemPrompt() {
  return `You are a professional video content analyst specializing in creating comprehensive Chinese deep notes from video transcripts.

中文深度笔记格式要求（无论输入语言如何，深度笔记必须用中文输出）：
1. 提供三个层次的分析：内容概要、关键洞察、应用思考
2. 创建时间轴目录，将内容分段（约1-2分钟每段）
3. 识别语言转换、主题变化、PPT切换、停顿等自然分段信号
4. 使用有意义的中文标题描述每个时间段的核心内容
5. 生成完整的深度笔记markdown内容，包含丰富的分析和思考
6. 即使原文是其他语言，所有输出字段都必须用中文

CRITICAL: ALL output fields must be in Chinese, regardless of input language.

Instructions:
- Analyze the provided video transcript carefully
- Focus on the main ideas, key insights, and important information
- Create meaningful timeline segments with Chinese titles
- Generate comprehensive deep notes in markdown format
- Provide timestamps for significant moments
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

function buildUserPrompt(transcript, duration) {
  return `Please analyze this video transcript and generate comprehensive Chinese deep notes.

Video Duration: ${Math.round(duration)} seconds (${Math.round(duration / 60)} minutes)

Transcript:
${transcript}

Please provide a thorough analysis following the Chinese deep notes format specified in the system prompt. Remember: ALL output must be in Chinese, regardless of the transcript language.`;
}

// 格式化时间
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 构建markdown内容（使用highlights作为时间轴）
function buildMarkdownContent(summary, videoTitle = 'Steve Jobs Stanford演讲') {
  let content = `# ${videoTitle}\n\n`;
  
  if (videoTitle) {
    content += `## 原视频标题\n${videoTitle}\n\n`;
  }
  
  // 优先使用highlights作为时间轴，因为它们更有意义
  if (summary.highlights && summary.highlights.length > 0) {
    content += `## 时间轴目录\n\n`;
    summary.highlights.forEach((highlight) => {
      const startTime = formatTime(highlight.start);
      const endTime = formatTime(highlight.end);
      content += `- **${startTime}-${endTime}**: ${highlight.note}\n`;
    });
    content += '\n';
  } else if (summary.timeline && summary.timeline.length > 0) {
    // 后备方案：使用timeline
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

async function testPrompt() {
  console.log('🧪 开始测试深度笔记提示词效果...\n');

  try {
    // 读取现有转录文本
    const transcriptionPath = './data/task_mdbfifu9_n50kdy/transcription.json';
    const transcriptionData = await fs.readFile(transcriptionPath, 'utf-8');
    const transcription = JSON.parse(transcriptionData);
    
    console.log('✅ 已加载转录数据');
    console.log(`📄 转录文本长度: ${transcription.text.length} 字符`);
    console.log(`⏱️  视频时长: ${Math.round(transcription.duration / 60)} 分钟\n`);

    // 构建提示词
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(transcription.text, transcription.duration);
    
    console.log('🔨 构建提示词完成');
    console.log(`📝 系统提示词长度: ${systemPrompt.length} 字符`);
    console.log(`📝 用户提示词长度: ${userPrompt.length} 字符\n`);

    // 调用OpenAI API
    console.log('🤖 正在调用 OpenAI API...');
    console.log('⚙️  配置: GPT-4o, 10000 tokens, temperature=0.3\n');
    
    const startTime = Date.now();
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 10000,
      response_format: { type: 'json_object' },
    });

    const processingTime = Date.now() - startTime;
    console.log(`✅ API 调用完成，耗时: ${processingTime}ms\n`);

    // 解析响应
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI 返回空响应');
    }

    const result = JSON.parse(content);
    
    // 验证结果
    console.log('🔍 验证生成结果:');
    console.log(`✅ 包含summary: ${!!result.summary}`);
    console.log(`✅ 包含highlights (${result.highlights?.length || 0}个): ${!!result.highlights}`);
    console.log(`✅ 包含deepNotes: ${!!result.deepNotes}`);
    console.log(`✅ 包含topics (${result.topics?.length || 0}个): ${!!result.topics}`);
    console.log(`✅ 包含keyPoints (${result.keyPoints?.length || 0}个): ${!!result.keyPoints}`);
    
    // 自动从highlights生成timeline（如果存在）
    if (result.highlights && result.highlights.length > 0) {
      console.log(`✅ 时间轴将自动从highlights生成 (${result.highlights.length}段)`);
    }
    console.log('');

    // 创建输出目录
    const outputDir = './test-output';
    await fs.mkdir(outputDir, { recursive: true });

    // 保存JSON结果
    const jsonPath = path.join(outputDir, 'deep-notes-result.json');
    await fs.writeFile(jsonPath, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`💾 JSON结果已保存到: ${jsonPath}`);

    // 生成和保存markdown
    const markdownContent = buildMarkdownContent(result);
    const markdownPath = path.join(outputDir, 'steve-jobs-stanford-深度笔记.md');
    await fs.writeFile(markdownPath, markdownContent, 'utf-8');
    console.log(`📝 Markdown文件已保存到: ${markdownPath}`);

    // 保存原始提示词（用于调试）
    const promptPath = path.join(outputDir, 'prompts.txt');
    const promptContent = `=== 系统提示词 ===\n${systemPrompt}\n\n=== 用户提示词 ===\n${userPrompt}`;
    await fs.writeFile(promptPath, promptContent, 'utf-8');
    console.log(`🔧 提示词已保存到: ${promptPath}`);

    // 显示预览
    console.log('\n📋 结果预览:');
    console.log('='.repeat(50));
    console.log(`摘要: ${result.summary?.substring(0, 100)}...`);
    console.log(`\nHighlights时间轴 (${result.highlights?.length || 0}段):`);
    result.highlights?.slice(0, 3).forEach(highlight => {
      const startTime = formatTime(highlight.start);
      const endTime = formatTime(highlight.end);
      console.log(`  ${startTime}-${endTime}: ${highlight.note.substring(0, 50)}...`);
    });
    if (result.highlights?.length > 3) {
      console.log(`  ...还有${result.highlights.length - 3}段`);
    }
    console.log(`\n深度笔记长度: ${result.deepNotes?.length || 0} 字符`);
    console.log('='.repeat(50));

    console.log('\n🎉 测试完成！请查看 test-output/ 目录中的文件');
    console.log('\n💡 建议检查:');
    console.log('1. JSON结果的结构是否正确');
    console.log('2. highlights字段是否生成了高质量的时间段总结');
    console.log('3. 中文内容是否准确和有意义');
    console.log('4. 深度笔记是否包含三个层次的分析');
    console.log('5. Markdown时间轴目录是否使用了highlights内容');
    console.log('6. highlights的时间分段是否合理（1-2分钟每段）');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    if (error.response?.data) {
      console.error('API错误详情:', error.response.data);
    }
    process.exit(1);
  }
}

// 执行测试
testPrompt().catch(console.error);