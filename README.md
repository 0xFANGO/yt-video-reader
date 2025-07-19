# YouTube Video Processor

An AI-powered YouTube video processing system that automatically downloads videos, extracts audio, separates vocals, transcribes content using Whisper.cpp, and generates AI summaries.

## 🎯 Features

- **YouTube Video Download**: Download videos using yt-dlp-wrap
- **Audio Processing**: Extract and process audio with FFmpeg
- **Voice Separation**: Separate vocals from background music using Demucs
- **Transcription**: Local transcription using Whisper.cpp (smart-whisper)
- **AI Summarization**: Generate summaries using OpenAI GPT-4o
- **Real-time Progress**: Track processing progress via Server-Sent Events (SSE)
- **Queue System**: Robust job processing with BullMQ and Redis
- **Type Safety**: Full TypeScript implementation with Zod validation
- **File Management**: Automatic cleanup and structured storage

## 🚀 Quick Start

### Prerequisites

**System Dependencies:**
```bash
# macOS (using Homebrew)
brew install redis ffmpeg

# Ubuntu/Debian
sudo apt install redis-server ffmpeg

# Start Redis
brew services start redis  # macOS
sudo systemctl start redis  # Linux
```

**Verify installations:**
```bash
redis-cli ping          # Should return PONG
ffmpeg -version         # Should show version info
```

### Installation

1. **Clone and install dependencies:**
```bash
git clone <repository-url>
cd yt-video-reader
npm install
```

2. **Configure environment:**
```bash
# Copy and edit environment file
cp .env.example .env

# Required environment variables:
NODE_ENV=development
PORT=3000
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=your_openai_api_key_here
STORAGE_PATH=./data
TEMP_PATH=./tmp
```

3. **Start the development server:**
```bash
npm run dev
```

The server will start on http://localhost:3000 with the following endpoints:
- 📍 **Main API**: http://localhost:3000
- 📊 **Health Check**: http://localhost:3000/health
- 🔧 **API Docs**: http://localhost:3000/api/docs
- 📡 **tRPC Endpoint**: http://localhost:3000/trpc
- 📨 **SSE Events**: http://localhost:3000/api/events/stream

## 📖 API Usage

### Create Video Processing Task

```bash
curl -X POST "http://localhost:3000/trpc/tasks.create" \
  -H "Content-Type: application/json" \
  -d '{"link": "https://www.youtube.com/watch?v=VIDEO_ID"}'
```

**Response:**
```json
{
  "result": {
    "data": {
      "taskId": "task_abc123_def456",
      "status": "pending",
      "message": "Task created and queued for processing"
    }
  }
}
```

### Check Task Status

```bash
curl "http://localhost:3000/trpc/tasks.getStatus?input={\"taskId\":\"task_abc123_def456\"}"
```

**Response:**
```json
{
  "result": {
    "data": {
      "taskId": "task_abc123_def456",
      "status": "transcribing",
      "progress": 75,
      "currentStep": "Transcribing audio with Whisper.cpp",
      "createdAt": "2025-07-19T03:38:55.654Z",
      "files": {
        "original.mp4": "path/to/original.mp4",
        "audio.wav": "path/to/audio.wav",
        "vocals.wav": "path/to/vocals.wav"
      }
    }
  }
}
```

### Download Processed Files

```bash
# Download transcript
curl -o transcript.srt "http://localhost:3000/api/files/download/task_abc123_def456/subtitle.srt"

# Download summary
curl -o summary.json "http://localhost:3000/api/files/download/task_abc123_def456/summary.json"

# Download audio files
curl -o audio.wav "http://localhost:3000/api/files/download/task_abc123_def456/audio.wav"
curl -o vocals.wav "http://localhost:3000/api/files/download/task_abc123_def456/vocals.wav"
```

### Monitor Real-time Progress

```bash
# Connect to Server-Sent Events stream
curl -N "http://localhost:3000/api/events/stream"
```

**Event Format:**
```
data: {"taskId":"task_abc123_def456","status":"downloading","progress":15,"message":"Downloading video..."}

data: {"taskId":"task_abc123_def456","status":"extracting","progress":35,"message":"Extracting audio..."}

data: {"taskId":"task_abc123_def456","status":"completed","progress":100,"message":"Processing complete"}
```

## 🏗️ Processing Pipeline

The system processes videos through these stages:

1. **Download** (10%): Download video from YouTube using yt-dlp
2. **Extract** (25%): Extract audio to 16kHz WAV using FFmpeg
3. **Separate** (45%): Separate vocals from music using Demucs
4. **Transcribe** (75%): Transcribe vocals using Whisper.cpp
5. **Summarize** (90%): Generate AI summary using OpenAI GPT-4o
6. **Complete** (100%): All files ready for download

## 📁 File Structure

Each task creates a structured directory:

```
data/
└── task_abc123_def456/
    ├── original.mp4        # Downloaded video
    ├── audio.wav          # Extracted audio (16kHz mono)
    ├── vocals.wav         # Separated vocals
    ├── accompaniment.wav  # Separated music
    ├── subtitle.srt       # Transcript with timestamps
    ├── words.wts          # Word-level timestamps
    ├── summary.json       # AI-generated summary
    └── manifest.json      # Task metadata
```

## 🔧 Development Commands

```bash
# Development
npm run dev                 # Start development server
npm run build              # Build for production
npm run start              # Start production server

# Type Checking & Linting
npm run type-check         # Run TypeScript compiler
npm run lint               # Run ESLint
npm run lint:fix           # Fix linting issues

# Testing
npm test                   # Run all tests
npm run test:watch         # Run tests in watch mode
npm run test:unit          # Run unit tests only
npm run test:integration   # Run integration tests only

# Queue Management
npm run queue:monitor      # Monitor BullMQ queues
npm run queue:clear        # Clear failed jobs
npm run queue:drain        # Drain all queues
```

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3000` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `OPENAI_API_KEY` | OpenAI API key | Required |
| `STORAGE_PATH` | Task storage directory | `./data` |
| `TEMP_PATH` | Temporary files directory | `./tmp` |
| `MAX_FILE_SIZE_MB` | Maximum file size limit | `1000` |
| `MAX_DURATION_HOURS` | Maximum video duration | `4` |
| `DOWNLOAD_CONCURRENCY` | Concurrent downloads | `3` |
| `TRANSCRIPTION_CONCURRENCY` | Concurrent transcriptions | `2` |
| `CLEANUP_INTERVAL_HOURS` | File cleanup interval | `24` |

### Whisper Configuration

```bash
# Optional: Custom Whisper.cpp installation
WHISPER_EXECUTABLE_PATH=/path/to/whisper-cpp
WHISPER_MODEL_PATH=/path/to/model.bin
```

### Processing Options

When creating tasks, you can specify options:

```bash
curl -X POST "http://localhost:3000/trpc/tasks.create" \
  -H "Content-Type: application/json" \
  -d '{
    "link": "https://www.youtube.com/watch?v=VIDEO_ID",
    "options": {
      "whisperModel": "large",
      "language": "en",
      "priority": "high"
    }
  }'
```

**Available Options:**
- `whisperModel`: `base`, `small`, `medium`, `large` (default: `base`)
- `language`: Language code (default: auto-detect)
- `priority`: `low`, `normal`, `high` (default: `normal`)

## 🐛 Troubleshooting

### Common Issues

**Redis Connection Error:**
```bash
# Check Redis status
redis-cli ping

# Start Redis if not running
brew services start redis  # macOS
sudo systemctl start redis  # Linux
```

**FFmpeg Not Found:**
```bash
# Install FFmpeg
brew install ffmpeg  # macOS
sudo apt install ffmpeg  # Ubuntu/Debian

# Verify installation
ffmpeg -version
```

**YouTube Download Fails:**
```bash
# Update yt-dlp
npm update yt-dlp-wrap

# Check video URL accessibility
curl -I "https://www.youtube.com/watch?v=VIDEO_ID"
```

**Whisper.cpp Issues:**
```bash
# The system uses smart-whisper (automatic installation)
# If issues persist, check logs in the console output
```

### Performance Tips

**For Large Videos:**
- Use `whisperModel: "base"` for faster processing
- Set appropriate `MAX_FILE_SIZE_MB` limit
- Monitor memory usage during transcription

**For High Throughput:**
- Increase `DOWNLOAD_CONCURRENCY` and `TRANSCRIPTION_CONCURRENCY`
- Use Redis cluster for better queue performance
- Consider GPU acceleration for Whisper.cpp

### Logs and Monitoring

```bash
# View real-time logs
npm run dev

# Monitor queue status
npm run queue:monitor

# Check system health
curl http://localhost:3000/health
```

## 🏗️ Architecture

- **Backend**: Node.js + TypeScript + Express + tRPC
- **Queue System**: BullMQ with Redis
- **Audio Processing**: yt-dlp-wrap, ffmpeg-static, demucs-wasm
- **Transcription**: smart-whisper (whisper.cpp Node binding)
- **AI Summary**: OpenAI GPT-4o
- **Storage**: Local filesystem with structured directories
- **Real-time Updates**: Server-Sent Events (SSE)

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite: `npm test`
6. Submit a pull request

For detailed development guidelines, see `CLAUDE.md`.