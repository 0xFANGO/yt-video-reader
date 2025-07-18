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