# Deep Notes Mode for AI Summarization with Chinese Support

name: "Chinese Deep Notes Mode with Timeline Generation"
description: |
  Extend the AI summarization system to support a new 'detailed' style that generates Chinese "深度笔记" (deep notes) format with automatic timeline segmentation and dedicated markdown file output. This feature will provide structured, comprehensive summaries with time-based navigation for Chinese-speaking users.

---

## Goal
Implement a "deep notes" summarization mode that generates Chinese-language summaries in a specialized format with automatic timeline creation and markdown file output, while maintaining full backward compatibility with existing summarization workflows.

## Why
- **Multilingual Support**: Enable Chinese-language users to get comprehensive summaries in their preferred language
- **Enhanced Content Structure**: Provide detailed notes with logical segmentation for better comprehension
- **Timeline Navigation**: Allow users to quickly navigate through video content using generated timelines
- **Educational Value**: Support the "深度笔记" format commonly used in Chinese educational contexts

## What
When `style: 'detailed'` is selected, the system will:
1. Generate Chinese-language summaries using a specialized three-step format
2. Create automatic timeline segmentation based on content analysis
3. Output a markdown file alongside existing JSON/TXT outputs
4. Maintain full backward compatibility with existing summarization modes

### Success Criteria
- [ ] 'detailed' style generates Chinese 深度笔记 format summaries
- [ ] Timeline array is automatically created with meaningful titles
- [ ] Markdown file is generated alongside existing outputs
- [ ] All existing summarization styles remain unchanged
- [ ] Graceful degradation when new fields are missing
- [ ] All tests pass and types are correct

## All Needed Context

### Documentation & References
```yaml
# MUST READ - Include these in your context window
- file: src/services/ai-summarizer.ts
  lines: 220-432
  why: Current prompt building, response parsing, saveSummary behavior
  
- file: src/workers/summarize-worker.ts  
  why: BullMQ integration patterns, style dispatching logic
  
- file: src/types/audio.ts
  why: TranscriptionSegment structure for timeline generation
  
- file: data/task_mdbfifu9_n50kdy/transcription.json
  why: Real test data with Chinese content (Steve Jobs speech)
  
- url: https://platform.openai.com/docs/guides/structured-outputs
  why: GPT-4 structured JSON output best practices
  
- url: https://www.assemblyai.com/blog/automatically-determine-video-sections-with-ai-using-python
  why: Timeline segmentation techniques
```

### Current System Architecture
```typescript
// Current SummaryResult schema (src/services/ai-summarizer.ts:20-37)
interface SummaryResult {
  summary: string;
  highlights: Array<{start: number; end: number; note: string;}>;
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

// Current style options: 'concise' | 'detailed' | 'bullet-points'
// Current file outputs: summary.json, summary.txt
```

### Current Codebase tree (relevant parts)
```bash
src/
├── services/
│   ├── ai-summarizer.ts          # AISummarizer class with generateSummary
│   └── flow-producer.ts          # BullMQ flow integration
├── workers/
│   └── summarize-worker.ts       # SummarizeWorker with processFlowSummarizationJob
├── types/
│   ├── audio.ts                  # TranscriptionSegment, TranscriptionResult
│   ├── flow.ts                   # SummarizationStageData
│   └── task.ts                   # TaskManifest structure
└── utils/
    └── file-manager.ts           # File operations
    
data/
└── task_mdbfifu9_n50kdy/         # Test data with Chinese content
    ├── transcription.json        # Complete Steve Jobs speech transcription
    ├── summary.json             # Current summary format
    └── summary.txt              # Human-readable summary
```

### Desired Codebase tree with new functionality
```bash
src/
├── services/
│   ├── ai-summarizer.ts          # MODIFIED: Enhanced prompts, schema, validation
│   └── timeline-helper.ts        # NEW: Heuristic timeline construction
├── workers/
│   └── summarize-worker.ts       # MODIFIED: Updated file tracking
└── types/
    └── summary.ts                # NEW: Enhanced summary types
    
data/
└── task_mdbfifu9_n50kdy/         # Test directory for validation
    ├── summary.json             # ENHANCED: With timeline & deepNotes fields
    ├── summary.txt              # UNCHANGED
    └── steve-jobs-stanford.md   # NEW: Deep notes markdown file
```

### Known Gotchas & Library Quirks
```typescript
// CRITICAL: OpenAI structured outputs with GPT-4o work, but GPT-4.1 may have issues
// Current system uses: model: 'gpt-4o' (ai-summarizer.ts:182)

// CRITICAL: Chinese text segmentation challenges - word boundaries are not spaces
// Use character-based or semantic-based chunking for timeline generation

// GOTCHA: File naming must sanitize Chinese characters for filesystem compatibility
// Use: filename.replace(/[^a-zA-Z0-9.-]/g, '_') pattern from validation

// PATTERN: All file operations use fileManager.getTaskDirectory() pattern
// PATTERN: BullMQ file tracking via manifest.files object
// PATTERN: Progress updates via broadcastTaskUpdate() for CLI sync
```

## Implementation Blueprint

### Enhanced Data Models
```typescript
// NEW: Enhanced summary result with optional Chinese deep notes fields
interface EnhancedSummaryResult extends SummaryResult {
  // Optional new fields for backward compatibility
  timeline?: Array<{
    start: string;  // "00:00" format
    end: string;    // "01:30" format  
    title: string;  // Chinese segment title
  }>;
  deepNotes?: string; // Markdown content for deep notes
}

// Timeline segment for heuristic construction
interface TimelineSegment {
  startTime: number;
  endTime: number;
  text: string;
  title?: string;
}
```

### List of Tasks (Implementation Order)

```yaml
Task 1: Extend system and user prompts for deep notes mode
MODIFY src/services/ai-summarizer.ts:
  - FIND method: buildSystemPrompt (line 222)
  - MODIFY: Add Chinese instructions when style === 'detailed'
  - FIND method: buildUserPrompt (line 257)  
  - MODIFY: Append deep notes format requirements
  - PRESERVE: All existing prompt logic for other styles

Task 2: Update OpenAI JSON schema for new fields
MODIFY src/services/ai-summarizer.ts:
  - FIND method: callOpenAI (line 165)
  - MODIFY: Extend response_format schema with optional timeline/deepNotes
  - PRESERVE: Existing required fields for backward compatibility
  - ADD: Example structure in prompt for correct generation

Task 3: Enhance response validation and formatting
MODIFY src/services/ai-summarizer.ts:
  - FIND method: validateAndFormatResult (line 276)
  - MODIFY: Add validation for timeline and deepNotes fields
  - IMPLEMENT: Graceful degradation when fields missing
  - PRESERVE: Existing validation for required fields

Task 4: Create timeline construction helper utility
CREATE src/utils/timeline-helper.ts:
  - IMPLEMENT: Heuristic segmentation (~1-2 min chunks)
  - PATTERN: Mirror error handling from src/services/ai-summarizer.ts
  - FUNCTION: Group transcription segments into meaningful chunks
  - FALLBACK: Generate "片段 n" titles when model fails

Task 5: Enhance saveSummary method for markdown generation
MODIFY src/services/ai-summarizer.ts:
  - FIND method: saveSummary (line 369)
  - ADD: Markdown file generation when deepNotes present
  - IMPLEMENT: Chinese filename sanitization
  - PATTERN: Follow existing file writing pattern with error handling
  - UPDATE: File tracking for BullMQ integration

Task 6: Update worker file tracking
MODIFY src/workers/summarize-worker.ts:
  - FIND: stageResult.files object (line 153)
  - ADD: Conditional markdown file tracking
  - PRESERVE: Existing JSON and TXT file tracking

Task 7: Add comprehensive tests
CREATE tests/unit/services/ai-summarizer-deep-notes.test.ts:
  - TEST: Chinese prompt generation for detailed style
  - TEST: Timeline validation and fallback
  - TEST: Markdown file generation
  - TEST: Backward compatibility with existing styles
  - PATTERN: Mirror existing test structure from youtube-downloader.test.ts

Task 8: Manual validation with real data
MANUAL TEST:
  - USE: data/task_mdbfifu9_n50kdy/transcription.json
  - RUN: generateSummary with style='detailed'
  - VERIFY: .md file creation and content structure
  - VALIDATE: Chinese character handling in filename
```

### Task Implementation Details

#### Task 1: Enhanced Prompt Building
```typescript
// MODIFY buildSystemPrompt method
private buildSystemPrompt(options: { language: string; style: string }): string {
  const { language, style } = options;
  
  let basePrompt = `You are a professional video content analyst...`;
  
  // NEW: Append Chinese deep notes instructions for detailed style
  if (style === 'detailed') {
    basePrompt += `\n\n中文深度笔记格式要求：
1. 提供三个层次的分析：内容概要、关键洞察、应用思考
2. 创建时间轴目录，将内容分段（约1-2分钟每段）
3. 识别语言转换、主题变化、PPT切换等分段信号
4. 使用有意义的中文标题描述每个时间段

Return JSON with this enhanced structure:
{
  "summary": "主要内容概述",
  "highlights": [...],
  "topics": [...],
  "keyPoints": [...],
  "conclusion": "总结",
  "timeline": [
    {"start": "00:00", "end": "01:45", "title": "开场和三个故事介绍"}
  ],
  "deepNotes": "# 深度笔记\\n\\n## 内容概要\\n...\\n## 关键洞察\\n...\\n## 应用思考\\n..."
}`;
  }
  
  return basePrompt;
}
```

#### Task 2: JSON Schema Enhancement
```typescript
// MODIFY callOpenAI method - enhance response format
const response = await this.openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ],
  temperature: 0.3,
  max_tokens: style === 'detailed' ? 4000 : 2000, // More tokens for deep notes
  response_format: { type: 'json_object' },
});
```

#### Task 5: Markdown File Generation
```typescript
// MODIFY saveSummary method
private async saveSummary(summary: SummaryResult, outputDir: string): Promise<void> {
  // Existing JSON and TXT file generation...
  
  // NEW: Generate markdown file for deep notes
  if ('deepNotes' in summary && summary.deepNotes && 'timeline' in summary) {
    const videoTitle = await this.getVideoTitle(outputDir); // Get from manifest
    const fileName = this.sanitizeFilename(videoTitle) + '.md' || 'summary.md';
    const markdownPath = path.join(outputDir, fileName);
    
    const markdownContent = this.buildMarkdownContent(summary, videoTitle);
    await fs.writeFile(markdownPath, markdownContent, 'utf-8');
    
    console.log('Deep notes markdown saved to:', markdownPath);
  }
}

private buildMarkdownContent(summary: any, videoTitle?: string): string {
  let content = `# ${videoTitle || '视频深度笔记'}\n\n`;
  
  if (videoTitle) {
    content += `## 原视频标题\n${videoTitle}\n\n`;
  }
  
  if (summary.timeline && summary.timeline.length > 0) {
    content += `## 时间轴目录\n\n`;
    summary.timeline.forEach((segment: any) => {
      content += `- **${segment.start}-${segment.end}**: ${segment.title}\n`;
    });
    content += '\n';
  }
  
  if (summary.deepNotes) {
    content += summary.deepNotes;
  }
  
  return content;
}

private sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9\u4e00-\u9fff.-]/g, '_');
}
```

### Integration Points
```yaml
FILE_TRACKING:
  - modify: src/workers/summarize-worker.ts (line 153)
  - pattern: "stageResult.files['summary.md'] = `${taskDir}/${fileName}`"
  
BACKWARD_COMPATIBILITY:
  - ensure: All existing callers work unchanged
  - pattern: Optional fields don't break JSON parsing
  - validation: Graceful degradation when fields missing

CHINESE_SUPPORT:
  - encoding: All files use UTF-8 encoding
  - filesystem: Sanitize Chinese characters in filenames
  - content: Preserve Chinese text in markdown content
```

## Validation Loop

### Level 1: Syntax & Style
```bash
# Run these FIRST - fix any errors before proceeding
npm run type-check                    # TypeScript compilation
npm run lint                         # ESLint validation

# Expected: No errors. If errors, READ the error and fix.
```

### Level 2: Unit Tests
```typescript
// CREATE tests/unit/services/ai-summarizer-deep-notes.test.ts
describe('Deep Notes Mode', () => {
  it('should generate Chinese prompts for detailed style', () => {
    const summarizer = new AISummarizer();
    const prompt = summarizer.buildSystemPrompt({
      language: 'Chinese',
      style: 'detailed'
    });
    
    expect(prompt).toContain('中文深度笔记格式要求');
    expect(prompt).toContain('timeline');
    expect(prompt).toContain('deepNotes');
  });

  it('should validate timeline structure correctly', () => {
    const mockResponse = {
      summary: "测试摘要",
      timeline: [
        {start: "00:00", end: "01:30", title: "开场介绍"}
      ],
      deepNotes: "# 深度笔记\n\n## 概要\n测试内容"
    };
    
    const result = summarizer.validateAndFormatResult(mockResponse);
    expect(result.timeline).toBeDefined();
    expect(result.timeline.length).toBe(1);
  });

  it('should generate markdown file with Chinese content', async () => {
    const summary = {
      summary: "测试",
      deepNotes: "# 深度笔记\n\n测试内容",
      timeline: [{start: "00:00", end: "01:00", title: "测试段落"}]
    };
    
    await summarizer.saveSummary(summary, '/tmp/test');
    
    const markdownContent = await fs.readFile('/tmp/test/summary.md', 'utf-8');
    expect(markdownContent).toContain('时间轴目录');
    expect(markdownContent).toContain('测试内容');
  });
});
```

```bash
# Run and iterate until passing:
npm test -- --testNamePattern="Deep Notes"
# If failing: Read error, understand root cause, fix code, re-run
```

### Level 3: Integration Test with Real Data
```bash
# Manual test using existing task data
cd /Users/fengge/coding/yt-video-reader

# Start the server
npm run dev

# Test with existing transcription data
curl -X POST http://localhost:3000/api/tasks/task_mdbfifu9_n50kdy/regenerate-summary \
  -H "Content-Type: application/json" \
  -d '{"style": "detailed", "language": "Chinese"}'

# Expected files in data/task_mdbfifu9_n50kdy/:
# - summary.json (with timeline and deepNotes fields)
# - summary.txt (unchanged)
# - steve-jobs-stanford.md (new markdown file)
```

### Level 4: Backward Compatibility Test
```bash
# Test that existing styles still work
curl -X POST http://localhost:3000/api/tasks/task_mdbfifu9_n50kdy/regenerate-summary \
  -H "Content-Type: application/json" \
  -d '{"style": "concise", "language": "English"}'

# Expected: Only summary.json and summary.txt generated (no .md file)
# Verify: JSON structure unchanged for existing styles
```

## Final Validation Checklist
- [ ] All tests pass: `npm test`
- [ ] No linting errors: `npm run lint`  
- [ ] No type errors: `npm run type-check`
- [ ] Deep notes markdown generated for detailed style
- [ ] Chinese characters handled correctly in filenames
- [ ] Existing styles produce unchanged output
- [ ] BullMQ file tracking includes .md files when present
- [ ] Graceful degradation when timeline/deepNotes missing
- [ ] Real transcription data produces meaningful segmentation

---

## Anti-Patterns to Avoid
- ❌ Don't break existing API contracts - maintain backward compatibility
- ❌ Don't assume Chinese input - validate and handle gracefully
- ❌ Don't hardcode Chinese strings - use the style parameter as trigger
- ❌ Don't ignore filesystem limitations - sanitize filenames properly
- ❌ Don't modify existing validation for other styles
- ❌ Don't skip UTF-8 encoding for Chinese content
- ❌ Don't forget to update file tracking in BullMQ workers

## Confidence Score: 9/10

This PRP provides comprehensive context including:
- Complete current system understanding with specific line numbers
- Real test data with Chinese content available
- Detailed implementation plan with specific file modifications
- Robust validation approach with multiple testing levels
- External research on Chinese NLP challenges and timeline segmentation
- Clear backward compatibility requirements
- Executable validation commands

The high confidence comes from the thorough codebase analysis, availability of real test data, and clear implementation path that builds incrementally on existing patterns.