# Enhanced CLI Progress Feedback System

## Goal
Implement real-time progress feedback improvements for the YouTube video processing CLI to fix stuck progress indicators and add real-time transcription text streaming with expandable/collapsible display. Specifically address: (1) AI summary progress getting stuck at 80% without completion feedback, and (2) transcription progress lacking real-time subtitle display during Whisper processing.

## Why
- **User Experience**: Eliminate frustrating progress indicators that appear frozen during long-running operations
- **Real-time Feedback**: Provide immediate visual feedback for transcription text as it's generated
- **Process Transparency**: Allow users to see exactly what's happening during AI summarization
- **Information Management**: Enable expand/collapse functionality for long transcription outputs
- **Process Confidence**: Users can verify transcription quality in real-time without waiting for completion

## What
Enhanced CLI progress system with:
- Real-time progress updates during AI summarization (80-100% range)
- Live transcription text streaming as Whisper processes audio
- Expandable/collapsible transcription display for managing long content
- Improved progress completion UI with proper exit handling
- Enhanced SSE event broadcasting for progress updates
- Better error handling and recovery for stuck progress indicators

### Success Criteria
- [ ] AI summary progress updates smoothly from 80% to 100% with completion indicators
- [ ] Real-time transcription text appears as Whisper generates segments
- [ ] Transcription content can be expanded/collapsed when it exceeds terminal height
- [ ] Progress bars properly exit and show completion summary
- [ ] SSE events broadcast granular progress updates for all stages
- [ ] Error states gracefully handle progress recovery
- [ ] Manual testing shows fluid progress without apparent freezing

## All Needed Context

### Documentation & References
```yaml
# MUST READ - Include these in your context window
- url: https://www.npmjs.com/package/cli-progress
  why: Multi-bar progress implementation, custom formatting, event handling

- url: https://www.npmjs.com/package/ink
  why: React-based terminal UI for complex interactive displays
  
- url: https://www.npmjs.com/package/blessed
  why: Terminal UI widgets for expandable content areas
  
- url: https://nodejs.org/api/stream.html
  why: Stream processing for real-time text updates
  
- url: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
  why: SSE client patterns for real-time progress broadcasting
  
- file: src/cli/ui/progress.ts
  why: Current progress implementation, multi-bar setup, SSE integration
  
- file: src/workers/video-processor.ts
  why: Main pipeline orchestrator, progress stage coordination
  
- file: src/services/ai-summarizer.ts
  why: OpenAI API calls without current progress callbacks
  
- file: src/utils/whisper-cli.ts
  why: Progress parsing patterns, stderr processing
  
- file: src/api/events.ts
  why: SSE broadcasting system, connection management
  
- file: src/cli/commands/process-video.ts
  why: Main CLI command flow, progress monitoring usage
```

### Current Codebase Structure
```bash
yt-video-reader/
├── src/
│   ├── cli/                       # CLI implementation
│   │   ├── ui/
│   │   │   ├── progress.ts        # Current progress system
│   │   │   └── menu.ts           # Menu utilities
│   │   ├── commands/
│   │   │   └── process-video.ts   # Main processing command
│   │   └── utils/
│   │       └── sse-client.ts      # SSE client implementation
│   ├── workers/
│   │   ├── video-processor.ts     # Pipeline orchestrator
│   │   ├── transcribe-worker.ts   # Transcription worker
│   │   └── summarize-worker.ts    # AI summary worker
│   ├── services/
│   │   ├── ai-summarizer.ts       # OpenAI integration
│   │   └── transcriber.ts         # Whisper wrapper
│   ├── utils/
│   │   └── whisper-cli.ts         # Whisper CLI wrapper
│   └── api/
│       └── events.ts              # SSE broadcasting
```

### Enhanced Codebase Structure (Additions)
```bash
yt-video-reader/
├── src/
│   ├── cli/
│   │   ├── ui/
│   │   │   ├── progress.ts        # ENHANCED: Real-time progress system
│   │   │   ├── transcription-display.ts  # NEW: Real-time transcription UI
│   │   │   └── expandable-content.ts     # NEW: Collapsible content widget
│   │   ├── utils/
│   │   │   ├── sse-client.ts      # ENHANCED: Granular event handling
│   │   │   └── progress-tracker.ts       # NEW: Advanced progress state management
│   ├── services/
│   │   ├── ai-summarizer.ts       # ENHANCED: Progress callbacks
│   │   └── transcriber.ts         # ENHANCED: Real-time text streaming
│   └── workers/
│       ├── video-processor.ts     # ENHANCED: Granular progress updates
│       ├── transcribe-worker.ts   # ENHANCED: Live text broadcasting
│       └── summarize-worker.ts    # ENHANCED: AI progress tracking
```

### Known Gotchas & Library Quirks
```typescript
// CRITICAL: cli-progress requires manual progress bar stopping
// Current Issue: Progress bars don't exit cleanly after completion
// Solution: Ensure proper cleanup in handleTaskComplete()

// CRITICAL: OpenAI API calls are synchronous without progress callbacks
// Current Issue: No intermediate progress between 80% and 100%
// Solution: Implement chunked processing or estimated progress

// CRITICAL: Whisper stderr output is irregular and buffered
// Current Issue: Progress updates come in bursts, not smoothly
// Solution: Buffer management and text streaming approach

// CRITICAL: SSE events can be lost if client disconnects briefly
// Current Issue: Progress state becomes inconsistent
// Solution: Progress state recovery and event replay
```

## Implementation Blueprint

### Data Models and Structure

Enhanced progress and streaming data models:
```typescript
// Enhanced progress event types
interface EnhancedProgressEvent {
  type: 'progress' | 'text-stream' | 'completion' | 'error';
  stage: 'transcribing' | 'summarizing';
  progress: number;
  data?: {
    text?: string;
    segment?: TranscriptionSegment;
    estimatedTimeRemaining?: number;
    currentStep?: string;
  };
}

// Real-time transcription streaming
interface TranscriptionStreamEvent {
  type: 'segment-start' | 'segment-text' | 'segment-complete';
  segmentId: number;
  text: string;
  startTime: number;
  confidence?: number;
  isPartial: boolean;
}

// Expandable content state
interface ExpandableContentState {
  isExpanded: boolean;
  totalLines: number;
  visibleLines: number;
  scrollPosition: number;
  content: string[];
}
```

### List of Tasks (In Implementation Order)

```yaml
Task 1: Enhance AI Summarizer with Progress Callbacks
MODIFY src/services/ai-summarizer.ts:
  - FIND method: "async generateSummary"
  - INJECT progress callback parameter: "onProgress?: (progress: number, step: string) => void"
  - ADD progress updates for: API call start (85%), response parsing (90%), file saving (95%), completion (100%)
  - PRESERVE existing error handling and retry logic

Task 2: Enhance Summarize Worker with Progress Broadcasting
MODIFY src/workers/summarize-worker.ts:
  - FIND method: "async processSummarizationJob"
  - MODIFY progress updates: Use granular steps instead of single 80% jump
  - ADD SSE broadcasting: Import and use broadcastTaskUpdate from events.ts
  - KEEP existing job.updateProgress() calls

Task 3: Create Real-time Transcription Display Component
CREATE src/cli/ui/transcription-display.ts:
  - MIRROR pattern from: src/cli/ui/progress.ts (SSE client usage)
  - IMPLEMENT real-time text streaming display
  - ADD expand/collapse functionality for long content
  - HANDLE partial vs complete text segments

Task 4: Create Expandable Content Widget
CREATE src/cli/ui/expandable-content.ts:
  - IMPLEMENT terminal-based collapsible content area
  - ADD keyboard controls: space to toggle, arrow keys to scroll
  - HANDLE content overflow and proper text wrapping
  - PROVIDE visual indicators for expand/collapse state

Task 5: Enhance Whisper CLI with Text Streaming
MODIFY src/utils/whisper-cli.ts:
  - FIND method: "async runWhisperCommand"
  - ADD real-time text parsing from stdout (not just progress from stderr)
  - IMPLEMENT text segment broadcasting via new callback
  - PRESERVE existing progress percentage parsing

Task 6: Enhance Progress Monitor with Multi-stream Support
MODIFY src/cli/ui/progress.ts:
  - FIND class: "TaskProgressMonitor"
  - ADD transcription text display integration
  - ENHANCE handleTaskComplete for proper cleanup and exit
  - IMPLEMENT recovery mechanism for stuck progress

Task 7: Enhance Video Processor with Granular Updates
MODIFY src/workers/video-processor.ts:
  - FIND transcription step: "Step 4: Transcribe audio"
  - ADD real-time text streaming callback to transcriber.transcribeAudio()
  - FIND summarization step: "Step 5: Generate AI summary"
  - ADD progress callback to aiSummarizer.generateSummary()
  - PRESERVE existing error handling and task status updates

Task 8: Enhance SSE Broadcasting System
MODIFY src/api/events.ts:
  - FIND function: "broadcastTaskUpdate"
  - ADD support for text-stream event types
  - IMPLEMENT event buffering for rapid updates
  - ADD connection recovery and event replay
```

### Per-task Pseudocode

```typescript
// Task 1: AI Summarizer Progress
async function generateSummary(
  options: SummaryOptions, 
  onProgress?: (progress: number, step: string) => void
): Promise<SummaryResult> {
  // PATTERN: Progress callback pattern from transcriber
  onProgress?.(85, 'Calling OpenAI API...');
  
  const response = await this.callOpenAI(formattedTranscript, {...});
  onProgress?.(90, 'Processing response...');
  
  const result = this.validateAndFormatResult(response);
  onProgress?.(95, 'Saving summary files...');
  
  await this.saveSummary(result, outputDir);
  onProgress?.(100, 'Summary completed');
  
  return result;
}

// Task 3: Real-time Transcription Display
class TranscriptionDisplay {
  private content: string[] = [];
  private isExpanded = false;
  
  // PATTERN: SSE client setup from progress.ts
  async setupTextStreaming(taskId: string) {
    this.sseClient.on('text-stream', (data) => {
      this.handleTextUpdate(data);
    });
  }
  
  // CRITICAL: Handle both partial and complete segments
  private handleTextUpdate(segment: TranscriptionStreamEvent) {
    if (segment.isPartial) {
      // Update last line in place
      this.content[this.content.length - 1] = segment.text;
    } else {
      // Add new complete line
      this.content.push(segment.text);
    }
    this.render();
  }
}

// Task 4: Expandable Content Widget
class ExpandableContent {
  // PATTERN: Similar to blessed widget approach
  render() {
    const maxHeight = this.isExpanded ? process.stdout.rows - 10 : 3;
    const visibleContent = this.content.slice(
      this.scrollPosition, 
      this.scrollPosition + maxHeight
    );
    
    // GOTCHA: Clear previous content before re-rendering
    process.stdout.write('\x1b[2J\x1b[H'); // Clear screen
    visibleContent.forEach(line => console.log(line));
    
    if (!this.isExpanded && this.content.length > 3) {
      console.log(chalk.dim('... (press SPACE to expand)'));
    }
  }
}
```

### Integration Points
```yaml
SSE_EVENTS:
  - add to: src/api/events.ts
  - pattern: "broadcastTaskUpdate(taskId, { type: 'text-stream', data: segment })"
  
PROGRESS_CALLBACKS:
  - modify: src/services/ai-summarizer.ts  
  - pattern: "onProgress?.(progress, stepDescription)"
  
CLI_COMMANDS:
  - modify: src/cli/commands/process-video.ts
  - pattern: "const transcriptionDisplay = new TranscriptionDisplay()"
  
WORKER_INTEGRATION:
  - modify: src/workers/video-processor.ts
  - pattern: "await transcriber.transcribeAudio({ ..., onTextStream: callback })"
```

## Validation Loop

### Level 1: Syntax & Style
```bash
# Run these FIRST - fix any errors before proceeding
npm run type-check                    # TypeScript compilation
npm run lint                         # ESLint checking
npm run lint:fix                     # Auto-fix linting issues

# Expected: No errors. If errors, READ the error and fix.
```

### Level 2: Unit Tests
```typescript
// CREATE tests/unit/cli/ui/transcription-display.test.ts
describe('TranscriptionDisplay', () => {
  test('handles real-time text updates', () => {
    const display = new TranscriptionDisplay();
    display.handleTextUpdate({
      type: 'segment-text',
      text: 'Hello world',
      isPartial: false
    });
    expect(display.getContent()).toContain('Hello world');
  });

  test('expand/collapse functionality', () => {
    const display = new TranscriptionDisplay();
    // Add content exceeding visible area
    for (let i = 0; i < 10; i++) {
      display.addLine(`Line ${i}`);
    }
    
    display.toggle();
    expect(display.isExpanded).toBe(true);
  });
});

// CREATE tests/unit/services/ai-summarizer.test.ts
describe('AI Summarizer Progress', () => {
  test('calls progress callback during summarization', async () => {
    const progressCalls: Array<{progress: number, step: string}> = [];
    const onProgress = (progress: number, step: string) => {
      progressCalls.push({ progress, step });
    };
    
    await aiSummarizer.generateSummary(mockOptions, onProgress);
    
    expect(progressCalls.length).toBeGreaterThan(3);
    expect(progressCalls[progressCalls.length - 1].progress).toBe(100);
  });
});
```

```bash
# Run and iterate until passing:
npm test -- --testPathPattern="transcription-display|ai-summarizer"
# If failing: Read error, understand root cause, fix code, re-run
```

### Level 3: Integration Test
```bash
# Start the development server
npm run dev

# In another terminal, start CLI and test video processing
npm run cli:dev

# Manual test checklist:
# 1. Select "Process YouTube Video"
# 2. Enter test YouTube URL
# 3. Verify progress moves smoothly through all stages
# 4. During transcription: verify real-time text appears
# 5. During summarization: verify progress updates from 80-100%
# 6. Verify completion UI appears and exits properly
# 7. Test expand/collapse during long transcription

# Expected: Smooth progress updates with no apparent freezing
```

## Final Validation Checklist
- [ ] All tests pass: `npm test`
- [ ] No linting errors: `npm run lint`
- [ ] No type errors: `npm run type-check`
- [ ] Manual CLI test shows fluid progress: process 5-minute video
- [ ] AI summary progress updates smoothly 80→100%
- [ ] Real-time transcription text streams properly
- [ ] Expand/collapse functionality works in terminal
- [ ] Progress bars exit cleanly with completion summary
- [ ] Error recovery works for interrupted progress
- [ ] SSE events broadcast granular updates

---

## Anti-Patterns to Avoid
- ❌ Don't create entirely new progress systems - enhance existing cli-progress implementation
- ❌ Don't block the main thread with heavy text processing - use streaming approaches
- ❌ Don't ignore SSE connection management - handle disconnections gracefully  
- ❌ Don't hardcode terminal dimensions - respect dynamic terminal sizing
- ❌ Don't skip progress cleanup - always stop progress bars properly
- ❌ Don't overwhelm with progress events - implement reasonable throttling
- ❌ Don't break existing CLI functionality - preserve backward compatibility

## Implementation Confidence Score: 8/10

**Reasoning**: This PRP provides comprehensive context about the existing codebase, specific problematic areas, and detailed implementation steps. The patterns from existing code (SSE, progress bars, worker callbacks) are well-documented. The main complexity is around terminal UI management and real-time text streaming, but the step-by-step approach mitigates risk. The validation gates provide clear checkpoints for iterative improvement.