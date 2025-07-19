## FEATURE:

Build a complete YouTube video processing system that transforms YouTube videos into AI-powered summaries with timestamped highlights. The system should handle the full pipeline: **YouTube URL → Video Download → Audio Extraction → Voice Separation → Transcription → AI Summary**.

**Core Requirements:**
- **Single Input**: User submits a YouTube URL
- **Automated Pipeline**: Complete processing without manual intervention
- **Real-time Progress**: Live updates via SSE/WebSocket
- **File Management**: Structured output with downloadable files
- **AI Integration**: OpenAI GPT-4o for intelligent summaries
- **Local Processing**: Whisper.cpp for offline transcription
- **Scalable Architecture**: BullMQ queue system for concurrent processing

**Technical Stack:**
- **Backend**: Node.js + TypeScript + Express + tRPC
- **Queue**: BullMQ with Redis
- **Audio Processing**: yt-dlp-wrap, ffmpeg-static, demucs-wasm
- **Transcription**: smart-whisper (whisper.cpp Node binding)
- **AI Summary**: OpenAI GPT-4o
- **Storage**: Local filesystem with structured directories

**Key Features:**
- Support for videos up to 40+ minutes
- Concurrent processing (3 downloads, 2 transcriptions max)
- Automatic file cleanup after 24 hours
- Error handling and recovery
- Progress tracking with detailed status updates

## EXAMPLES:

The `examples/` folder contains reference implementations demonstrating best practices:

**API Layer Examples:**
- `examples/api/task-router.ts` - tRPC router implementation with Zod validation
- `examples/api/file-handler.ts` - File download and streaming endpoints
- `examples/api/event-stream.ts` - SSE real-time progress updates

**Service Layer Examples:**
- `examples/services/youtube-downloader.ts` - yt-dlp-wrap integration with error handling
- `examples/services/audio-processor.ts` - ffmpeg + demucs audio processing pipeline
- `examples/services/transcriber.ts` - smart-whisper integration with model selection
- `examples/services/ai-summarizer.ts` - OpenAI GPT-4o integration with rate limiting

**Worker Examples:**
- `examples/workers/video-processor.ts` - BullMQ worker for complete pipeline
- `examples/workers/download-worker.ts` - Specialized download processing
- `examples/workers/transcribe-worker.ts` - Audio transcription handling

**Type Definitions:**
- `examples/types/task.ts` - TaskStatus, TaskManifest, and API schemas
- `examples/types/audio.ts` - Audio processing configuration types
- `examples/types/api.ts` - tRPC input/output validation schemas

**Testing Examples:**
- `examples/tests/unit/` - Unit test patterns for services
- `examples/tests/integration/` - API endpoint testing
- `examples/tests/fixtures/` - Mock data and test audio files

**Configuration Examples:**
- `examples/config/bullmq.ts` - Queue configuration with concurrency limits
- `examples/config/whisper.ts` - Whisper model configuration
- `examples/config/openai.ts` - OpenAI client setup with retry logic

These examples demonstrate:
- **Proper error handling** with user-friendly messages
- **TypeScript best practices** with strict typing and Zod validation
- **Modular architecture** with clear separation of concerns
- **Performance optimization** with concurrent processing
- **Security measures** with input validation and file sanitization

## DOCUMENTATION:

**Core Dependencies:**
- [yt-dlp-wrap](https://www.npmjs.com/package/yt-dlp-wrap) - YouTube video downloading
- [ffmpeg-static](https://www.npmjs.com/package/ffmpeg-static) - Audio extraction and conversion
- [demucs-wasm](https://github.com/Saideep07/demucs-wasm) - Voice separation (WebAssembly)
- [smart-whisper](https://github.com/guillaumekln/smart-whisper) - Whisper.cpp Node.js binding
- [BullMQ](https://docs.bullmq.io/) - Redis-based job queue
- [tRPC](https://trpc.io/) - End-to-end type-safe APIs
- [OpenAI API](https://platform.openai.com/docs/models/gpt-4) - GPT-4o for summaries

**System Requirements:**
- Node.js 18+ with TypeScript
- Redis server for BullMQ
- FFmpeg (system installation or ffmpeg-static)
- Sufficient disk space for temporary files

**Whisper.cpp Deployment:**
- Guide: [Whisper.cpp Installation](https://github.com/ggerganov/whisper.cpp)
- Model selection: base (fast), large (accurate)
- Memory requirements: 2GB+ for large model
- Performance: ~25s for 10-minute video on M4 Mini

**OpenAI Integration:**
- GPT-4o API for summary generation
- Rate limiting and exponential backoff
- Token usage monitoring
- Structured prompt engineering

**File Structure Standards:**
```
data/<taskId>/
├── original.mp4        # Downloaded video
├── vocals.wav         # Separated vocals
├── subtitle.srt       # Segment-level subtitles
├── words.wts          # Word-level timestamps
├── summary.json       # AI-generated summary
└── manifest.json      # Task metadata
```

## OTHER CONSIDERATIONS:

**Performance Optimization:**
- Concurrent processing limits to prevent resource exhaustion
- Memory management for large video files
- Efficient audio format conversion (16kHz WAV for Whisper)
- Automatic cleanup of temporary files

**Error Handling:**
- Graceful degradation when services are unavailable
- Retry logic with exponential backoff
- User-friendly error messages without exposing internal details
- Comprehensive logging for debugging

**Security Measures:**
- YouTube URL validation to prevent malicious inputs
- File name sanitization to prevent directory traversal
- File size limits to prevent resource exhaustion
- Rate limiting on API endpoints

**Testing Strategy:**
- Unit tests for each service component
- Integration tests for complete pipeline
- Mock data for reproducible testing
- Performance testing with long audio files (40+ minutes)

**Development Workflow:**
- TypeScript strict mode with comprehensive type checking
- ESLint and Prettier for code quality
- Automated testing with Vitest
- Real-time development with hot reload

**Deployment Considerations:**
- Environment variable management
- Redis configuration for production
- File storage and cleanup policies
- Monitoring and observability setup

**Common Pitfalls to Avoid:**
- Memory leaks in audio processing
- Blocking operations in main thread
- Insufficient error handling in queue workers
- Missing input validation on API endpoints
- Inadequate file cleanup leading to disk space issues

**Key Success Metrics:**
- Processing time: <90 seconds for 10-minute video
- Memory usage: <2GB per transcription job
- Error rate: <1% for valid YouTube URLs
- File cleanup: 100% completion within 24 hours
- API response time: <100ms for status queries

---

## NEW FEATURE REQUEST: Interactive CLI Interface

### FEATURE:

Build an interactive Command Line Interface (CLI) that provides a user-friendly terminal experience for YouTube video processing with real-time progress monitoring and intuitive controls.

**Core Requirements:**
- **Interactive Input**: Terminal-based interface for entering YouTube URLs
- **Real-time Progress**: Live progress bars and status updates
- **Visual Feedback**: Rich text formatting with colors and icons
- **Task Management**: View, monitor, and manage multiple concurrent tasks
- **File Operations**: Easy access to generated files and results
- **Error Handling**: Clear error messages with suggested fixes

**CLI Features:**
1. **Main Menu Interface**: Welcome screen with available options
2. **URL Input**: Prompt for YouTube URL with validation
3. **Progress Monitoring**: Real-time progress bars for each processing stage
4. **Status Dashboard**: Overview of all running/completed tasks
5. **File Browser**: Quick access to transcripts, summaries, and downloads
6. **Settings Panel**: Configure processing options (model, language, quality)

**Technical Implementation:**
- **Framework**: Use [Inquirer.js](https://www.npmjs.com/package/inquirer) for interactive prompts
- **Progress Bars**: [cli-progress](https://www.npmjs.com/package/cli-progress) for visual progress
- **Rich Output**: [chalk](https://www.npmjs.com/package/chalk) for colored terminal output
- **Icons**: [log-symbols](https://www.npmjs.com/package/log-symbols) for status indicators
- **Tables**: [cli-table3](https://www.npmjs.com/package/cli-table3) for data display
- **Real-time Updates**: SSE client to connect to existing API endpoints

### EXAMPLES:

Reference implementations for CLI components:

**CLI Entry Point:**
- `examples/cli/index.ts` - Main CLI application with menu system
- `examples/cli/commands/` - Individual command implementations
- `examples/cli/utils/` - Shared CLI utilities and helpers

**Interactive Components:**
- `examples/cli/prompts/url-input.ts` - YouTube URL input with validation
- `examples/cli/prompts/options-menu.ts` - Processing options selection
- `examples/cli/prompts/task-selector.ts` - Task management interface

**Progress Monitoring:**
- `examples/cli/progress/progress-bar.ts` - Real-time progress visualization
- `examples/cli/progress/status-tracker.ts` - SSE client for live updates
- `examples/cli/progress/multi-task.ts` - Concurrent task monitoring

**Output Formatting:**
- `examples/cli/formatters/table.ts` - Task status tables
- `examples/cli/formatters/summary.ts` - Results summary display
- `examples/cli/formatters/errors.ts` - Error message formatting

**File Management:**
- `examples/cli/files/browser.ts` - File browser interface
- `examples/cli/files/opener.ts` - Auto-open generated files
- `examples/cli/files/export.ts` - Export options menu

### DOCUMENTATION:

**CLI Framework Documentation:**
- [Inquirer.js Guide](https://www.npmjs.com/package/inquirer#documentation) - Interactive prompts
- [cli-progress Documentation](https://www.npmjs.com/package/cli-progress) - Progress bars
- [chalk API](https://www.npmjs.com/package/chalk#api) - Terminal styling
- [Ora Spinner](https://www.npmjs.com/package/ora) - Loading indicators

**Terminal UX Best Practices:**
- Clear navigation with consistent keybindings
- Graceful handling of terminal resize
- Support for different terminal emulators
- Accessibility considerations for screen readers

**CLI Architecture Patterns:**
- Command pattern for individual operations
- State management for multi-step workflows
- Event-driven updates for real-time data
- Modular design for extensible commands

**Integration Points:**
- Connect to existing tRPC API endpoints
- Utilize SSE events for real-time updates
- Leverage existing task management system
- Reuse validation and error handling logic

### CLI USER EXPERIENCE FLOW:

```
┌─────────────────────────────────────────────┐
│  🎬 YouTube Video Processor CLI v1.0        │
│                                             │
│  [1] Process New Video                      │
│  [2] View Active Tasks                      │
│  [3] Browse Completed Tasks                 │
│  [4] Settings                              │
│  [5] Exit                                  │
│                                             │
│  Select an option: _                       │
└─────────────────────────────────────────────┘

→ Option 1 Selected:

┌─────────────────────────────────────────────┐
│  📝 Enter YouTube URL                       │
│                                             │
│  URL: https://youtube.com/watch?v=...       │
│  ✅ Valid YouTube URL detected              │
│                                             │
│  Processing Options:                        │
│  • Model: [Large-v3] (Base/Large)          │
│  • Language: [Auto] (zh/en/auto)           │
│  • Priority: [Normal] (Low/Normal/High)    │
│                                             │
│  [Enter] Start Processing  [Esc] Cancel    │
└─────────────────────────────────────────────┘

→ Processing Started:

┌─────────────────────────────────────────────┐
│  🎬 Processing: "GraphRAG Tutorial"         │
│  Task ID: task_abc123                       │
│                                             │
│  Progress Overview:                         │
│  ██████████████████████████████████ 75%    │
│                                             │
│  Stages:                                    │
│  ✅ Download     ████████████████████ 100%  │
│  ✅ Extract      ████████████████████ 100%  │
│  ✅ Separate     ████████████████████ 100%  │
│  🔄 Transcribe   ███████████████░░░░░ 75%   │
│  ⏳ Summarize    ░░░░░░░░░░░░░░░░░░░░░  0%   │
│                                             │
│  Current: Transcribing audio (3/4 min)     │
│  ETA: 2 minutes remaining                   │
│                                             │
│  [Ctrl+C] Cancel  [Enter] Background       │
└─────────────────────────────────────────────┘

→ Completion:

┌─────────────────────────────────────────────┐
│  ✅ Processing Complete!                    │
│                                             │
│  📄 Generated Files:                        │
│  • transcript.txt (2.1 KB)                 │
│  • subtitle.srt (2.8 KB)                   │
│  • summary.json (1.5 KB)                   │
│  • audio.wav (45.2 MB)                     │
│                                             │
│  📊 Summary Preview:                        │
│  "This video explains GraphRAG, combining  │
│   knowledge graphs with retrieval..."       │
│                                             │
│  [1] Open Files  [2] View Summary          │
│  [3] New Task    [4] Main Menu             │
└─────────────────────────────────────────────┘
```

### OTHER CONSIDERATIONS:

**CLI-Specific Considerations:**

**User Experience:**
- Responsive design that works on various terminal sizes
- Keyboard shortcuts for power users
- Clear visual hierarchy with consistent spacing
- Contextual help available at each step

**Error Handling:**
- Graceful recovery from network interruptions
- Clear error messages with actionable suggestions
- Option to retry failed operations
- Automatic fallback to alternative processing options

**Performance:**
- Non-blocking UI updates during long operations
- Background processing with notification when complete
- Efficient memory usage for terminal rendering
- Minimal CPU overhead for progress updates

**Cross-Platform Compatibility:**
- Support for Windows Command Prompt, PowerShell
- macOS Terminal and iTerm2 compatibility
- Linux terminal emulator support
- Graceful handling of limited terminal capabilities

**Accessibility:**
- Screen reader compatibility
- High contrast mode option
- Keyboard-only navigation
- Clear textual descriptions of visual elements

**Configuration Management:**
- Persistent settings stored in user config file
- Default preferences for common use cases
- Export/import settings functionality
- Environment variable override support

**Integration Features:**
- Auto-open generated files in default applications
- Copy file paths to clipboard
- Share results via email or messaging
- Export to common formats (PDF, DOCX, etc.)

**Development Workflow:**
- Hot reload for CLI development
- Comprehensive testing with terminal mocking
- Cross-platform testing automation
- User acceptance testing with real workflows

**Success Metrics for CLI:**
- Time to complete first video: <2 minutes (including learning)
- User task completion rate: >95%
- Error recovery success rate: >90%
- User satisfaction score: >4.5/5
- CLI startup time: <2 seconds