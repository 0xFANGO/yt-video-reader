# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core Principles

**IMPORTANT: You MUST follow these principles in all code changes and PRP generations:**

### KISS (Keep It Simple, Stupid)
- Simplicity should be a key goal in design
- Choose straightforward solutions over complex ones whenever possible
- Simple solutions are easier to understand, maintain, and debug

### YAGNI (You Aren't Gonna Need It)
- Avoid building functionality on speculation
- Implement features only when they are needed, not when you anticipate they might be useful in the future

### Open/Closed Principle
- Software entities should be open for extension but closed for modification
- Design systems so that new functionality can be added with minimal changes to existing code

## Project Overview

**CRITICAL: This is a YouTube video processing system that implements the complete pipeline:**

**Processing Flow:** YouTube URL → Video Download → Audio Extraction → Voice Separation → Transcription → AI Summary

**Core Architecture:**
- **Backend**: Node.js + TypeScript + Express + tRPC
- **Queue System**: BullMQ with Redis for task processing
- **Audio Processing**: yt-dlp-wrap, ffmpeg-static, demucs-wasm
- **Transcription**: smart-whisper (whisper.cpp Node binding)
- **AI Summary**: OpenAI GPT-4o
- **Storage**: Local filesystem with structured task directories

## Package Management & Tooling

**CRITICAL: This project uses npm for Node.js package management.**

### Essential npm Commands

```bash
# Install dependencies from package.json
npm install

# Add a dependency
npm install package-name

# Add a development dependency
npm install --save-dev package-name

# Remove a package
npm uninstall package-name

# Update dependencies
npm update

# Run scripts defined in package.json
npm run dev
npm run build
npm run type-check
npm run test
```

### System Dependencies

**CRITICAL: These system dependencies are required for audio processing:**

```bash
# Required system tools
redis-server                    # For BullMQ task queue
ffmpeg                         # For audio processing (or use ffmpeg-static)

# Verify installations
redis-cli ping                 # Should return PONG
ffmpeg -version               # Should show version info
```

## Project Architecture

**IMPORTANT: This is a tRPC API server with BullMQ worker system for video processing.**

### Current Project Structure

```
/
├── src/                          # TypeScript source code
│   ├── api/                      # tRPC routers and REST endpoints
│   ├── workers/                  # BullMQ job processors
│   ├── services/                 # Business logic (download, transcribe, summarize)
│   ├── utils/                    # Shared utilities and helpers
│   └── types/                    # TypeScript type definitions
├── data/                         # Task output directories
│   └── <taskId>/                 # Individual task files
├── tests/                        # Test files mirroring src structure
├── package.json                  # npm dependencies & scripts
├── tsconfig.json                 # TypeScript configuration
└── CLAUDE.md                     # This implementation guide
```

### Key File Purposes (ALWAYS ADD NEW FILES HERE)

**API Layer:**
- `src/api/tasks.ts` - Task management endpoints (POST /task, GET /task/:id/status)
- `src/api/files.ts` - File download endpoints (GET /task/:id/download/:file)
- `src/api/events.ts` - SSE real-time progress updates

**Workers:**
- `src/workers/video-processor.ts` - Main video processing pipeline
- `src/workers/download-worker.ts` - Video download jobs
- `src/workers/transcribe-worker.ts` - Audio transcription jobs
- `src/workers/summarize-worker.ts` - AI summary generation jobs

**Services:**
- `src/services/youtube-downloader.ts` - yt-dlp-wrap integration
- `src/services/audio-processor.ts` - ffmpeg + demucs audio processing
- `src/services/transcriber.ts` - smart-whisper integration
- `src/services/ai-summarizer.ts` - OpenAI GPT-4o integration

**Types:**
- `src/types/task.ts` - Task status, manifest, and API types
- `src/types/audio.ts` - Audio processing configuration types
- `src/types/api.ts` - tRPC router input/output schemas

## Development Commands

### Core Workflow Commands

```bash
# Setup & Dependencies
npm install                  # Install all dependencies
npm run dev                  # Start development server with hot reload
npm run build               # Build for production
npm run start               # Start production server

# Type Checking & Validation
npm run type-check          # Run TypeScript compiler check
npm run lint                # Run ESLint
npm run lint:fix            # Fix linting issues

# Testing
npm test                    # Run all tests
npm run test:watch          # Run tests in watch mode
npm run test:unit           # Run unit tests only
npm run test:integration    # Run integration tests only

# Queue Management
npm run queue:monitor       # Monitor BullMQ queue status
npm run queue:clear         # Clear failed jobs
npm run queue:drain         # Drain all queues
```

### Environment Configuration

**Environment Variables Setup:**

```bash
# Create .env file for local development
cp .env.example .env

# Required environment variables
NODE_ENV=development
PORT=3000
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=your_openai_key_here
STORAGE_PATH=./data
TEMP_PATH=./tmp

# Optional: Monitoring
SENTRY_DSN=your_sentry_dsn_here
```

## Video Processing Pipeline

**CRITICAL: This system processes videos through a multi-stage pipeline with proper error handling and progress tracking.**

### Processing Stages

**1. Video Download (`src/services/youtube-downloader.ts`):**
```typescript
// Download video using yt-dlp-wrap
const result = await youtubeDl(videoUrl, {
  format: 'mp4',
  output: `${taskDir}/original.%(ext)s`,
});
```

**2. Audio Extraction (`src/services/audio-processor.ts`):**
```typescript
// Extract audio using ffmpeg-static
await ffmpeg()
  .input(`${taskDir}/original.mp4`)
  .output(`${taskDir}/audio.wav`)
  .audioFrequency(16000)
  .audioChannels(1)
  .run();
```

**3. Voice Separation (`src/services/audio-processor.ts`):**
```typescript
// Separate vocals using demucs-wasm
const { vocals, accompaniment } = await demucs.separate(`${taskDir}/audio.wav`);
```

**4. Transcription (`src/services/transcriber.ts`):**
```typescript
// Transcribe using smart-whisper
const result = await whisper.transcribe(`${taskDir}/vocals.wav`, {
  model: 'base', // or 'large' for accuracy
  language: 'auto',
  word_timestamps: true,
});
```

**5. AI Summary (`src/services/ai-summarizer.ts`):**
```typescript
// Generate summary using OpenAI GPT-4o
const summary = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: SUMMARY_PROMPT },
    { role: 'user', content: transcript },
  ],
});
```

### Task State Management

**Task Status Flow:**
```typescript
type TaskStatus = 'pending' | 'downloading' | 'extracting' | 'separating' | 'transcribing' | 'summarizing' | 'completed' | 'failed';

// Manifest structure
interface TaskManifest {
  taskId: string;
  status: TaskStatus;
  currentStep: string;
  progress: number;
  steps: Array<{ name: string; duration: number }>;
  files: Record<string, string>;
  createdAt: string;
  finishedAt?: string;
}
```

## TypeScript Development Standards

**CRITICAL: All code MUST follow TypeScript best practices with Zod validation and proper error handling.**

### Input Validation with Zod

**ALL API inputs MUST be validated using Zod schemas:**

```typescript
import { z } from "zod";

// Task submission schema
const CreateTaskSchema = z.object({
  link: z.string().url().refine(isYouTubeUrl, "Must be a valid YouTube URL"),
  options: z.object({
    whisperModel: z.enum(['base', 'small', 'medium', 'large']).default('base'),
    language: z.string().optional(),
    priority: z.enum(['low', 'normal', 'high']).default('normal'),
  }).optional(),
});

// YouTube URL validation
function isYouTubeUrl(url: string): boolean {
  const youtubeRegex = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/;
  return youtubeRegex.test(url);
}
```

### Error Handling Patterns

**Standardized error responses:**

```typescript
// Error response utility
function createApiError(message: string, code: string, details?: any) {
  return {
    error: {
      message,
      code,
      details,
      timestamp: new Date().toISOString(),
    },
  };
}

// Usage in API handlers
try {
  const result = await processVideo(input.link);
  return { success: true, taskId: result.taskId };
} catch (error) {
  if (error instanceof ValidationError) {
    return createApiError("Invalid input", "VALIDATION_ERROR", error.details);
  }
  if (error instanceof ProcessingError) {
    return createApiError("Processing failed", "PROCESSING_ERROR", { step: error.step });
  }
  return createApiError("Internal server error", "INTERNAL_ERROR");
}
```

### JSDoc Documentation

**All functions MUST have JSDoc documentation:**

```typescript
/**
 * Processes a YouTube video through the complete pipeline.
 * 
 * @param videoUrl - Valid YouTube URL
 * @param options - Processing options (model, language, priority)
 * @returns Promise<TaskResult> - Task ID and initial status
 * @throws {ValidationError} When URL is invalid
 * @throws {ProcessingError} When processing fails
 */
async function processVideo(
  videoUrl: string, 
  options?: ProcessingOptions
): Promise<TaskResult> {
  // Implementation
}
```

## Audio Processing Guidelines

**CRITICAL: Audio processing requires specific dependencies and configurations.**

### Dependencies and Configuration

**Required Dependencies:**
- **yt-dlp-wrap**: YouTube video download
- **ffmpeg-static**: Audio extraction and conversion
- **demucs-wasm**: Voice separation (WebAssembly version)
- **smart-whisper**: Whisper.cpp Node.js binding

**Processing Standards:**
- **Audio Format**: Convert to 16kHz WAV mono for whisper compatibility
- **Whisper Model**: Default 'base' for speed, 'large' for accuracy
- **File Naming**: Consistent naming: `original.mp4`, `audio.wav`, `vocals.wav`, `subtitle.srt`

### BullMQ Queue Configuration

**Queue Setup:**
```typescript
import { Queue, Worker } from 'bullmq';

const videoQueue = new Queue('video-processing', {
  connection: { host: 'localhost', port: 6379 },
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

// Concurrency limits
const downloadWorker = new Worker('download', downloadProcessor, {
  connection: { host: 'localhost', port: 6379 },
  concurrency: 3, // Max 3 concurrent downloads
});

const transcribeWorker = new Worker('transcribe', transcribeProcessor, {
  connection: { host: 'localhost', port: 6379 },
  concurrency: 2, // Max 2 concurrent transcriptions
});
```

## API Design Patterns

**CRITICAL: This project uses tRPC for type-safe API endpoints.**

### tRPC Router Structure

**Main Router (`src/api/index.ts`):**
```typescript
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export const appRouter = router({
  createTask: publicProcedure
    .input(CreateTaskSchema)
    .mutation(async ({ input }) => {
      // Implementation
    }),
    
  getTaskStatus: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ input }) => {
      // Implementation
    }),
    
  getTaskFiles: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ input }) => {
      // Implementation
    }),
});
```

### File Structure per Task

**Consistent file organization:**
```
data/
└── <taskId>/
    ├── original.mp4        # Downloaded video
    ├── audio.wav          # Extracted audio
    ├── vocals.wav         # Separated vocals
    ├── accompaniment.wav  # Separated music
    ├── subtitle.srt       # Segment-level subtitles
    ├── words.wts          # Word-level timestamps
    ├── summary.json       # AI-generated summary
    └── manifest.json      # Task metadata
```

## AI Integration Guidelines

**CRITICAL: OpenAI GPT-4o integration requires proper rate limiting and error handling.**

### OpenAI Configuration

**API Usage:**
```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Summary generation with structured prompt
const SUMMARY_PROMPT = `
Analyze this video transcript and provide:
1. A concise summary (2-3 sentences)
2. Key highlights with timestamps
3. Main topics covered

Return JSON format:
{
  "summary": "...",
  "highlights": [
    {"start": 35.2, "end": 48.5, "note": "Key point description"}
  ],
  "topics": ["topic1", "topic2"]
}
`;
```

### Rate Limiting and Error Handling

**Implementation:**
```typescript
// Exponential backoff for rate limiting
async function generateSummary(transcript: string): Promise<SummaryResult> {
  const maxRetries = 3;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SUMMARY_PROMPT },
          { role: 'user', content: transcript },
        ],
      });
      
      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      if (error.status === 429) {
        // Rate limit hit, exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        retryCount++;
      } else {
        throw error;
      }
    }
  }
  
  throw new Error('Max retries exceeded');
}
```

## Testing Standards

**CRITICAL: All new features MUST have comprehensive tests.**

### Test Structure

**Test organization:**
```
tests/
├── unit/
│   ├── services/
│   │   ├── youtube-downloader.test.ts
│   │   ├── audio-processor.test.ts
│   │   └── transcriber.test.ts
│   └── utils/
│       └── validation.test.ts
├── integration/
│   ├── api/
│   │   └── tasks.test.ts
│   └── workers/
│       └── video-processor.test.ts
└── fixtures/
    ├── sample-video.mp4
    └── sample-transcript.txt
```

### Testing Patterns

**Unit Tests:**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { processVideo } from '../src/services/video-processor';

describe('Video Processing', () => {
  it('should process a valid YouTube URL', async () => {
    const mockUrl = 'https://www.youtube.com/watch?v=test';
    const result = await processVideo(mockUrl);
    
    expect(result.taskId).toBeDefined();
    expect(result.status).toBe('pending');
  });
  
  it('should reject invalid URLs', async () => {
    const invalidUrl = 'https://not-youtube.com/video';
    
    await expect(processVideo(invalidUrl)).rejects.toThrow('Invalid YouTube URL');
  });
  
  it('should handle processing failures gracefully', async () => {
    // Mock service to throw error
    vi.mock('../src/services/youtube-downloader', () => ({
      downloadVideo: vi.fn().mockRejectedValue(new Error('Download failed')),
    }));
    
    const result = await processVideo('https://youtube.com/watch?v=test');
    expect(result.status).toBe('failed');
  });
});
```

## Security and Validation

**CRITICAL: Input validation and security measures are mandatory.**

### Input Validation

**YouTube URL Validation:**
```typescript
function validateYouTubeUrl(url: string): boolean {
  const patterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
    /^https?:\/\/(www\.)?youtu\.be\/[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/embed\/[\w-]+/,
  ];
  
  return patterns.some(pattern => pattern.test(url));
}
```

**File System Security:**
```typescript
// Prevent directory traversal
function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9.-]/g, '_');
}

// Limit file sizes
const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB limit

function validateFileSize(filePath: string): boolean {
  const stats = fs.statSync(filePath);
  return stats.size <= MAX_FILE_SIZE;
}
```

## Performance Expectations

**Processing Benchmarks (M4 Mini 16GB):**
- **10-minute video**: ~90 seconds total processing time
- **Memory usage**: <2GB per transcription job
- **Concurrent jobs**: 3-5 simultaneous tasks
- **File cleanup**: Automatic after 24 hours

**Optimization Priorities:**
1. **Concurrent processing** for different pipeline stages
2. **Memory efficiency** in audio processing
3. **Disk usage management** with automatic cleanup
4. **API response times** <100ms for status queries

## Important Notes

### What NOT to do

- **NEVER** commit secrets or API keys to the repository
- **NEVER** build complex solutions when simple ones will work
- **NEVER** skip input validation with Zod schemas
- **NEVER** process videos from non-YouTube sources without explicit validation

### What TO do

- **ALWAYS** use TypeScript strict mode and proper typing
- **ALWAYS** validate inputs with Zod schemas
- **ALWAYS** follow the core principles (KISS, YAGNI, etc.)
- **ALWAYS** handle errors gracefully with user-friendly messages
- **ALWAYS** clean up temporary files after processing
- **ALWAYS** respect YouTube's terms of service and rate limits