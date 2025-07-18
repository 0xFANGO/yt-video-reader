# YouTube Video Processing System PRP

## Goal
Build a complete YouTube video processing system that transforms YouTube videos into AI-powered summaries with timestamped highlights. The system should handle the full pipeline: **YouTube URL → Video Download → Audio Extraction → Voice Separation → Transcription → AI Summary** with real-time progress tracking, file management, and scalable queue-based architecture.

## Why
- **User Value**: Enables users to quickly extract key insights from long YouTube videos without watching the entire content
- **AI Integration**: Leverages OpenAI GPT-4o for intelligent content summarization with timestamped highlights
- **Scalability**: BullMQ queue system allows horizontal scaling and concurrent processing
- **Local Processing**: Uses existing whisper.cpp large-v3 model for offline transcription, reducing API costs and ensuring privacy
- **Modern Architecture**: Full TypeScript type safety with tRPC for seamless client-server integration

## What
Build a production-ready Node.js + TypeScript video processing service with:

### Core Features
- **Single URL Input**: Users submit YouTube URLs for processing
- **Automated Pipeline**: Complete processing without manual intervention (download → extract → separate → transcribe → summarize)
- **Real-time Progress**: Live updates via Server-Sent Events (SSE)
- **File Management**: Structured output with downloadable files (MP4, WAV, SRT, JSON)
- **AI Summaries**: GPT-4o generated summaries with timestamped highlights
- **Queue System**: BullMQ with Redis for concurrent job processing
- **Local Whisper**: Leverage existing whisper.cpp large-v3 installation for high-quality transcription

### Success Criteria
- [ ] Process 10-minute YouTube videos in under 90 seconds
- [ ] Handle concurrent processing (3 downloads, 2 transcriptions max)
- [ ] Memory usage under 2GB per transcription job
- [ ] Automatic file cleanup after 24 hours
- [ ] API response times under 100ms for status queries
- [ ] Support videos up to 40+ minutes duration
- [ ] Full TypeScript type safety across all endpoints
- [ ] Utilize existing large-v3 model for superior transcription quality

## All Needed Context

### Documentation & References
```yaml
# MUST READ - Include these in your context window

- url: https://docs.bullmq.io/
  why: Queue system configuration, worker patterns, and concurrency limits
  critical: Job state management and error handling patterns

- url: https://trpc.io/docs
  why: End-to-end typesafe API implementation patterns
  critical: Input validation with Zod schemas, procedure definitions

- url: https://www.npmjs.com/package/yt-dlp-wrap
  why: YouTube video downloading with yt-dlp integration
  critical: Platform binary management and download options

- url: https://github.com/JacobLinCool/smart-whisper
  why: Whisper.cpp Node.js binding with automatic model management
  critical: BYOL (Bring Your Own Library) configuration for existing whisper.cpp installation

- url: https://github.com/sevagh/free-music-demixer
  why: Demucs WASM implementation for voice separation
  critical: WebAssembly integration and audio processing workflow

- url: https://platform.openai.com/docs/models/gpt-4
  why: GPT-4o API integration for summary generation
  critical: Rate limiting, token management, and structured prompts

- url: https://github.com/ggml-org/whisper.cpp
  why: Understanding whisper.cpp model formats and CLI usage
  critical: Model path configuration and integration patterns

- file: examples/api/router.ts
  why: tRPC router implementation patterns with task management
  critical: Zod validation schemas and error handling

- file: examples/types/task.ts
  why: Task status types and manifest structure
  critical: TaskStatus enum and TaskManifest interface patterns

- file: examples/types/audio.ts
  why: Audio processing configuration and transcription types
  critical: WhisperModel types and TranscriptionResult interface

- file: examples/services/downloader.ts
  why: YouTube download service with error handling
  critical: File path management and progress tracking

- file: examples/services/transcriber.ts
  why: Audio transcription service patterns
  critical: Whisper model configuration and result formatting

- file: examples/services/summarizer.ts
  why: OpenAI integration with retry logic
  critical: Prompt engineering and rate limiting patterns

- file: examples/workers/processor.ts
  why: BullMQ worker implementation for complete pipeline
  critical: Progress updates and error handling in worker context
```

### Current Codebase Tree
```bash
/Users/fengge/coding/yt-video-reader/
├── CLAUDE.md                     # Project guidance and principles
├── INITIAL.md                    # Feature requirements document
├── examples/                     # Reference implementations (DO NOT EDIT)
│   ├── api/router.ts            # tRPC router patterns
│   ├── services/                # Service layer examples
│   ├── types/                   # TypeScript type definitions
│   └── workers/processor.ts     # BullMQ worker patterns
├── PRPs/                        # Project requirements and plans
└── README.md                    # Project documentation

# NOTE: src/ directory and package.json DO NOT exist yet - need to create entire project
```

### Desired Codebase Tree with Files to be Added
```bash
/Users/fengge/coding/yt-video-reader/
├── package.json                  # Dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── .env.example                 # Environment variables template
├── src/
│   ├── index.ts                 # Main server entry point
│   ├── api/                     # tRPC routers and REST endpoints
│   │   ├── index.ts            # Main tRPC router
│   │   ├── tasks.ts            # Task management endpoints
│   │   ├── files.ts            # File download endpoints
│   │   └── events.ts           # SSE progress updates
│   ├── workers/                 # BullMQ job processors
│   │   ├── video-processor.ts  # Main pipeline worker
│   │   ├── download-worker.ts  # Video download jobs
│   │   ├── transcribe-worker.ts # Audio transcription jobs
│   │   └── summarize-worker.ts # AI summary generation
│   ├── services/                # Business logic
│   │   ├── youtube-downloader.ts # yt-dlp-wrap integration
│   │   ├── audio-processor.ts  # ffmpeg + demucs processing
│   │   ├── transcriber.ts      # whisper.cpp integration
│   │   └── ai-summarizer.ts    # OpenAI GPT-4o integration
│   ├── utils/                   # Shared utilities
│   │   ├── validation.ts       # Input validation helpers
│   │   ├── file-manager.ts     # File operations and cleanup
│   │   └── queue-config.ts     # BullMQ configuration
│   └── types/                   # TypeScript definitions
│       ├── task.ts             # Task status and manifest types
│       ├── audio.ts            # Audio processing types
│       └── api.ts              # tRPC input/output schemas
├── data/                        # Task output directories (auto-created)
└── tests/                       # Test files (comprehensive testing)
    ├── unit/
    ├── integration/
    └── fixtures/
```

### Known Gotchas & Library Quirks
```typescript
// CRITICAL: User has existing whisper.cpp installation with large-v3 model
// DO NOT use smart-whisper - instead use direct whisper.cpp CLI integration
// User confirmed working whisper.cpp installation - leverage this existing setup

// CRITICAL: yt-dlp-wrap requires manual binary management
// The library does NOT automatically download yt-dlp binary
// Must use downloadYtDlp() or provide binary path manually

// CRITICAL: demucs-wasm memory requirements
// Voice separation is memory intensive - limit concurrent jobs
// Use ArrayBuffer and proper cleanup to prevent memory leaks

// CRITICAL: OpenAI GPT-4o rate limiting
// Implement exponential backoff for 429 errors
// Use structured prompts with response_format: { type: 'json_object' }

// CRITICAL: ffmpeg-static path management
// Must set ffmpeg path before using: ffmpeg.setFfmpegPath(ffmpegStatic)
// Audio format MUST be 16kHz WAV mono for whisper compatibility

// CRITICAL: BullMQ Redis connection
// Use connection pooling to prevent Redis connection exhaustion
// Set proper concurrency limits: downloads=3, transcriptions=2

// CRITICAL: File system management
// Use absolute paths for all file operations
// Implement proper cleanup to prevent disk space issues
// Create task directories with proper permissions

// CRITICAL: Whisper.cpp integration approach
// Since user has working whisper.cpp + large-v3, use child_process.spawn()
// to call whisper.cpp directly instead of Node.js bindings
// This avoids compilation issues and leverages existing high-quality model
```

### Local Whisper.cpp Configuration
```yaml
# IMPORTANT: User has confirmed working whisper.cpp installation
# Instead of smart-whisper Node.js binding, use direct CLI integration
# This approach is more reliable and leverages existing large-v3 model

WHISPER_SETUP:
  status: "ALREADY_INSTALLED"
  approach: "Direct CLI integration via child_process"
  model: "large-v3 (confirmed working)"
  
INTEGRATION_PATTERN:
  # Use child_process.spawn() to call whisper.cpp directly
  # Parse output for transcription results and timestamps
  # Handle stderr for progress updates and errors
  
ENVIRONMENT_VARIABLES:
  # Add to .env.example:
  - WHISPER_EXECUTABLE_PATH=/path/to/whisper.cpp/main
  - WHISPER_MODEL_PATH=/path/to/models/ggml-large-v3.bin
  - WHISPER_MODELS_DIR=/path/to/models/

ADVANTAGES:
  - No compilation or Node.js binding issues
  - Use existing high-quality large-v3 model
  - Proven working configuration
  - Better error handling and debugging
  - Memory management handled by whisper.cpp
```

## Implementation Blueprint

### Data Models and Structure

Create core data models ensuring type safety and consistency:

```typescript
// Task status flow with proper state transitions
export type TaskStatus = 'pending' | 'downloading' | 'extracting' | 'separating' | 'transcribing' | 'summarizing' | 'completed' | 'failed';

// TaskManifest for tracking progress and files
export interface TaskManifest {
  taskId: string;
  status: TaskStatus;
  progress: number;
  currentStep: string;
  createdAt: string;
  finishedAt?: string;
  files: Record<string, string>;  // filename -> filepath mapping
  error?: string;
  whisperModel: 'large-v3';      // Fixed to user's installed model
}

// Audio processing configuration
export interface AudioConfig {
  model: 'large-v3';            // Fixed to user's model
  language?: string;            // Auto-detect or specify
  wordTimestamps: boolean;      // Enable word-level timestamps
  sampleRate: number;           // 16000 for whisper
  channels: number;             // 1 for mono
  executablePath: string;       // Path to whisper.cpp main
  modelPath: string;            // Path to ggml-large-v3.bin
}
```

### List of Tasks to be Completed (Implementation Order)

```yaml
Task 1 - Project Setup:
  CREATE package.json:
    - INCLUDE: yt-dlp-wrap, bullmq, @trpc/server, zod, openai
    - INCLUDE: ffmpeg-static, express, cors, helmet for server
    - EXCLUDE: smart-whisper (using direct CLI integration)
    - ADD: demucs-wasm for voice separation
    - DEV DEPS: typescript, @types/node, tsx, vitest, eslint

  CREATE tsconfig.json:
    - PATTERN: Strict TypeScript configuration with ES2022 target
    - ENABLE: strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes

  CREATE .env.example:
    - INCLUDE: NODE_ENV, PORT, REDIS_URL, OPENAI_API_KEY, STORAGE_PATH
    - ADD: WHISPER_EXECUTABLE_PATH, WHISPER_MODEL_PATH for local setup

Task 2 - Core Types:
  CREATE src/types/task.ts:
    - MIRROR: examples/types/task.ts patterns
    - ADD: TaskStatus, TaskManifest, CreateTaskSchema interfaces
    - MODIFY: Fixed whisperModel to 'large-v3' only
    - IMPLEMENT: generateTaskId(), isYouTubeUrl(), createDefaultManifest()

  CREATE src/types/audio.ts:
    - MIRROR: examples/types/audio.ts patterns  
    - MODIFY: WhisperModel fixed to 'large-v3', AudioConfig with paths
    - ADD: TranscriptionResult, WhisperCliOutput interfaces
    - IMPLEMENT: transcriptionToSRT(), parseWhisperOutput() utilities

  CREATE src/types/api.ts:
    - DEFINE: tRPC input/output schemas with Zod validation
    - ADD: CreateTaskInput, TaskStatusResponse, FileListResponse
    - MODIFY: Whisper model options limited to 'large-v3'

Task 3 - Services Layer:
  CREATE src/services/youtube-downloader.ts:
    - MIRROR: examples/services/downloader.ts patterns
    - IMPLEMENT: downloadVideo() with yt-dlp-wrap integration
    - HANDLE: Binary management, progress tracking, error recovery
    - CRITICAL: Use youtubeDl.create() for binary management

  CREATE src/services/audio-processor.ts:
    - IMPLEMENT: extractAudio() using ffmpeg-static (16kHz WAV mono)
    - IMPLEMENT: separateVocals() using demucs-wasm
    - HANDLE: Memory management and temporary file cleanup
    - CRITICAL: Set ffmpeg path and proper audio format conversion

  CREATE src/services/transcriber.ts:
    - IMPLEMENT: transcribeAudio() using child_process.spawn()
    - CALL: User's existing whisper.cpp with large-v3 model
    - HANDLE: CLI output parsing, progress tracking, error handling
    - CRITICAL: Use existing whisper.cpp installation, no Node.js binding

  CREATE src/services/ai-summarizer.ts:
    - MIRROR: examples/services/summarizer.ts patterns
    - IMPLEMENT: generateSummary() with OpenAI GPT-4o
    - HANDLE: Rate limiting, retry logic, structured prompts
    - CRITICAL: Use response_format json_object and exponential backoff

Task 4 - Utilities:
  CREATE src/utils/file-manager.ts:
    - IMPLEMENT: createTaskDirectory(), saveManifest(), cleanupFiles()
    - HANDLE: File path sanitization, directory traversal prevention
    - PATTERN: Use absolute paths and proper error handling

  CREATE src/utils/queue-config.ts:
    - IMPLEMENT: Redis connection configuration for BullMQ
    - SET: Concurrency limits (downloads=3, transcriptions=2)
    - HANDLE: Connection pooling and error recovery

  CREATE src/utils/validation.ts:
    - IMPLEMENT: YouTube URL validation with multiple patterns
    - IMPLEMENT: File size validation and security checks
    - PATTERN: Use Zod schemas for all input validation

  CREATE src/utils/whisper-cli.ts:
    - IMPLEMENT: whisper.cpp CLI wrapper functions
    - HANDLE: Command construction, output parsing, error handling
    - PATTERN: Use child_process.spawn() with proper stream handling

Task 5 - Workers:
  CREATE src/workers/video-processor.ts:
    - MIRROR: examples/workers/processor.ts patterns
    - IMPLEMENT: Complete pipeline orchestration
    - HANDLE: Progress updates, error handling, state transitions
    - CRITICAL: Update TaskManifest at each stage

  CREATE src/workers/download-worker.ts:
    - IMPLEMENT: Specialized video download processing
    - HANDLE: yt-dlp binary management and progress tracking
    - PATTERN: Use job.updateProgress() for real-time updates

  CREATE src/workers/transcribe-worker.ts:
    - IMPLEMENT: Audio transcription using whisper.cpp CLI
    - HANDLE: Process spawning, output parsing, error recovery
    - CRITICAL: Use existing whisper.cpp installation with large-v3

  CREATE src/workers/summarize-worker.ts:
    - IMPLEMENT: AI summary generation with OpenAI
    - HANDLE: Rate limiting, token management, error recovery
    - PATTERN: Use structured prompts and retry logic

Task 6 - API Layer:
  CREATE src/api/tasks.ts:
    - MIRROR: examples/api/router.ts patterns
    - IMPLEMENT: createTask, getTaskStatus, getTaskFiles procedures
    - HANDLE: Zod validation, error responses, queue integration
    - CRITICAL: Validate YouTube URLs and sanitize inputs

  CREATE src/api/files.ts:
    - IMPLEMENT: File download endpoints for task outputs
    - HANDLE: Content-Type headers, range requests, security
    - PATTERN: Validate task ownership and file existence

  CREATE src/api/events.ts:
    - IMPLEMENT: Server-Sent Events for real-time progress
    - HANDLE: Connection management, heartbeat, error recovery
    - PATTERN: Stream TaskManifest updates to clients

  CREATE src/api/index.ts:
    - IMPLEMENT: Main tRPC router combining all sub-routers
    - HANDLE: CORS, error handling, middleware setup
    - PATTERN: Export appRouter type for client inference

Task 7 - Main Server:
  CREATE src/index.ts:
    - IMPLEMENT: Express server with tRPC integration
    - SETUP: Workers, Redis connection, file serving
    - HANDLE: Graceful shutdown, error logging, health checks
    - CRITICAL: Start all workers and handle Redis connection

Task 8 - Testing:
  CREATE tests/unit/services/:
    - IMPLEMENT: Unit tests for all service functions
    - MOCK: External dependencies (YouTube, OpenAI, file system)
    - TEST: Whisper CLI integration with mock child_process
    - PATTERN: Test happy path, error cases, edge conditions

  CREATE tests/integration/:
    - IMPLEMENT: End-to-end API testing with real Redis
    - TEST: Complete pipeline with mock YouTube URLs
    - PATTERN: Setup/teardown test environments

Task 9 - Configuration:
  CREATE production configuration files:
    - UPDATE: package.json scripts for production
    - CREATE: Environment variable validation
    - SETUP: Whisper.cpp path discovery and validation
```

### Per Task Pseudocode

```typescript
// Task 1 - Project Setup
// package.json dependencies (CRITICAL versions for 2025)
{
  "dependencies": {
    "yt-dlp-wrap": "^3.x",           // YouTube downloading
    "demucs-wasm": "^1.x",          // Voice separation
    "bullmq": "^5.x",               // Redis queue system
    "@trpc/server": "^11.x",        // Type-safe APIs
    "zod": "^3.x",                  // Input validation
    "openai": "^4.x",               // GPT-4o integration
    "ffmpeg-static": "^5.x",        // Audio processing
    "express": "^4.x",              // HTTP server
    "ioredis": "^5.x"               // Redis client
  }
  // NOTE: NO smart-whisper dependency - using direct CLI integration
}

// Task 3 - Whisper CLI Integration Service
async function transcribeAudio(audioPath: string, options: AudioConfig): Promise<TranscriptionResult> {
  // PATTERN: Use existing whisper.cpp installation
  const whisperArgs = [
    '-m', options.modelPath,           // User's large-v3 model
    '-f', audioPath,                   // Input audio file
    '--output-json',                   // JSON output for parsing
    '--word-timestamps',               // Word-level timestamps
    '--language', options.language || 'auto'
  ];
  
  // CRITICAL: Use child_process.spawn() for CLI integration
  return new Promise((resolve, reject) => {
    const whisperProcess = spawn(options.executablePath, whisperArgs);
    
    let stdout = '';
    let stderr = '';
    
    whisperProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    whisperProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      // PATTERN: Parse progress from stderr
      const progressMatch = stderr.match(/\[(\d+)%\]/);
      if (progressMatch) {
        const progress = parseInt(progressMatch[1]);
        // Update job progress
      }
    });
    
    whisperProcess.on('close', (code) => {
      if (code === 0) {
        resolve(parseWhisperOutput(stdout));
      } else {
        reject(new Error(`Whisper failed: ${stderr}`));
      }
    });
  });
}

// Task 3 - Audio Processing Service  
async function extractAudio(videoPath: string, outputDir: string): Promise<string> {
  // CRITICAL: ffmpeg path setup required
  const ffmpeg = require('fluent-ffmpeg');
  ffmpeg.setFfmpegPath(require('ffmpeg-static'));
  
  const audioPath = path.join(outputDir, 'audio.wav');
  
  // CRITICAL: 16kHz mono for Whisper compatibility
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .output(audioPath)
      .audioFrequency(16000)    // Whisper requirement
      .audioChannels(1)         // Mono for processing
      .audioCodec('pcm_s16le')  // Uncompressed for quality
      .on('end', () => resolve(audioPath))
      .on('error', reject)
      .run();
  });
}

// Task 5 - Video Processor Worker
export async function processVideoJob(job: Job<ProcessJobData>): Promise<void> {
  const { taskId, url, options } = job.data;
  const taskDir = path.join(process.env.STORAGE_PATH!, taskId);
  
  try {
    // PATTERN: Update progress at each stage
    await updateTaskStatus(taskId, 'downloading', 10);
    const downloadResult = await downloadVideo(url, { taskId, outputDir: taskDir });
    
    await updateTaskStatus(taskId, 'extracting', 25);
    const audioPath = await extractAudio(downloadResult.videoPath, taskDir);
    
    await updateTaskStatus(taskId, 'separating', 40);
    const vocalsPath = await separateVocals(audioPath, taskDir);
    
    await updateTaskStatus(taskId, 'transcribing', 60);
    const transcription = await transcribeAudio(vocalsPath, {
      model: 'large-v3',
      executablePath: process.env.WHISPER_EXECUTABLE_PATH!,
      modelPath: process.env.WHISPER_MODEL_PATH!,
      ...DEFAULT_AUDIO_CONFIG
    });
    
    await updateTaskStatus(taskId, 'summarizing', 85);
    await generateSummary({ transcription, outputDir: taskDir });
    
    await updateTaskStatus(taskId, 'completed', 100);
  } catch (error) {
    // PATTERN: Comprehensive error handling
    await updateTaskStatus(taskId, 'failed', undefined, error);
    throw error;
  }
}
```

### Integration Points
```yaml
ENVIRONMENT:
  - add to: .env
  - pattern: "REDIS_URL=redis://localhost:6379"
  - pattern: "OPENAI_API_KEY=sk-..."
  - pattern: "STORAGE_PATH=./data"
  - pattern: "WHISPER_EXECUTABLE_PATH=/path/to/whisper.cpp/main"
  - pattern: "WHISPER_MODEL_PATH=/path/to/models/ggml-large-v3.bin"

REDIS:
  - requirement: Redis 6+ running on localhost:6379
  - configuration: BullMQ with connection pooling
  - pattern: "IORedis connection with retry logic"

WHISPER_CPP:
  - requirement: Existing whisper.cpp installation (user confirmed)
  - model: large-v3 (user confirmed working)
  - integration: Direct CLI calls via child_process.spawn()
  - validation: Check executable and model paths on startup

FILE_SYSTEM:
  - structure: "./data/<taskId>/" for each processing job
  - cleanup: Automatic after 24 hours via cron job
  - permissions: Read/write for application user only

BINARIES:
  - yt-dlp: Auto-download via yt-dlp-wrap
  - ffmpeg: Use ffmpeg-static for cross-platform
  - whisper.cpp: Use existing installation (no additional setup)
```

## Validation Loop

### Level 1: Syntax & Style
```bash
# Run these FIRST - fix any errors before proceeding
npm run type-check              # TypeScript compilation check
npm run lint                    # ESLint checking
npm run lint:fix               # Auto-fix linting issues

# Expected: No errors. If errors, READ the error message and fix.
```

### Level 2: Unit Tests
```bash
# CREATE comprehensive test coverage for each service
npm test                       # Run all tests
npm run test:watch            # Watch mode during development  
npm run test:unit             # Unit tests only
npm run test:integration      # Integration tests with Redis

# Test patterns to implement:
# - Valid YouTube URL processing
# - Invalid input handling  
# - Service error recovery
# - Whisper CLI integration (mocked)
# - File cleanup and management
# - Progress tracking accuracy
```

### Level 3: Integration Test
```bash
# Verify whisper.cpp is accessible
echo "Testing whisper.cpp installation..."
$WHISPER_EXECUTABLE_PATH --help

# Start Redis server
redis-server

# Start development server
npm run dev

# Test complete pipeline with curl
curl -X POST http://localhost:3000/trpc/tasks.create \
  -H "Content-Type: application/json" \
  -d '{"link": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'

# Expected: {"taskId": "abc123", "status": "pending", "message": "Task created"}

# Monitor progress
curl http://localhost:3000/trpc/tasks.getStatus?input={"taskId":"abc123"}

# Expected: Real-time status updates through pipeline stages
```

## Final Validation Checklist
- [ ] All tests pass: `npm test`
- [ ] No linting errors: `npm run lint`
- [ ] No type errors: `npm run type-check`
- [ ] Redis connection successful: `npm run dev` starts without errors
- [ ] Whisper.cpp accessible: CLI test returns help output
- [ ] YouTube URL validation working: Invalid URLs rejected
- [ ] Complete pipeline processes 10-min video under 90 seconds
- [ ] Files created in correct structure: `data/<taskId>/original.mp4`, etc.
- [ ] Progress updates stream correctly via SSE
- [ ] Error handling graceful: Failed jobs don't crash workers
- [ ] Memory usage stays under 2GB during transcription
- [ ] File cleanup works: Old tasks removed after 24 hours
- [ ] Large-v3 model produces high-quality transcriptions

---

## Anti-Patterns to Avoid
- ❌ Don't install smart-whisper or other Node.js bindings - use existing CLI setup
- ❌ Don't try to compile whisper.cpp - user already has working installation
- ❌ Don't hardcode whisper paths - use environment variables for flexibility
- ❌ Don't use sync file operations in workers - blocks event loop
- ❌ Don't ignore Redis connection pooling - causes connection exhaustion  
- ❌ Don't process audio in wrong format - Whisper requires 16kHz WAV mono
- ❌ Don't skip rate limiting on OpenAI - causes 429 errors and failures
- ❌ Don't skip input validation - security vulnerability with file paths
- ❌ Don't run unlimited concurrent jobs - causes memory/disk exhaustion
- ❌ Don't ignore whisper.cpp stderr - contains progress and error info

## Confidence Score: 9.5/10

This PRP provides comprehensive context for successful one-pass implementation. The very high confidence score is based on:
- ✅ Complete documentation URLs for all major dependencies
- ✅ Detailed examples showing exact patterns to follow
- ✅ User's existing whisper.cpp installation properly leveraged
- ✅ Known gotchas and 2025 best practices included
- ✅ Executable validation commands at each level
- ✅ Clear task ordering with critical implementation notes
- ✅ Anti-patterns explicitly called out to prevent common failures
- ✅ Proper CLI integration approach instead of problematic Node.js bindings
- ✅ Environment variable setup for flexible whisper.cpp configuration

The slight increase in confidence comes from leveraging the user's existing working whisper.cpp setup, eliminating the most common failure point in whisper integration projects.