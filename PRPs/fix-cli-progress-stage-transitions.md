# CLI Progress Monitor Stage Transitions Fix

## Goal
Fix the CLI progress monitor to display each processing stage (downloading → extracting → separating → transcribing → summarizing) in real-time instead of staying on 'downloading', and eliminate console output flooding by implementing proper progress throttling and stage synchronization.

## Why
- **User Experience**: CLI currently provides poor feedback, staying on "downloading" throughout the entire process
- **Console Spam**: Repeated download percentage lines flood the terminal in compact mode
- **Real-time Feedback**: Users need to see progress through all stages: 下载 → 音视频分离 → 解析字幕 → AI 总结
- **System Integration**: Stage status mismatches prevent proper CLI progress bar advancement
- **Performance**: Unthrottled progress events create unnecessary console output

## What
Create a unified stage transition system that:
1. **Synchronizes stage IDs** between workers and CLI progress monitor
2. **Updates manifest.status** during each stage transition (not just currentStep)
3. **Throttles progress events** to prevent console flooding
4. **Broadcasts stage transitions** as separate events from progress updates
5. **Displays real-time transcription** text streaming during transcribing stage

### Success Criteria
- [ ] CLI shows all 5 stages progressing in sequence: downloading → extracting → separating → transcribing → summarizing
- [ ] Console output shows only key stage changes and throttled progress (no repeated percentage spam)
- [ ] Real-time transcription text streams cleanly during transcribing stage
- [ ] Progress bars advance correctly in TTY mode
- [ ] Compact mode shows clean single-line updates

## All Needed Context

### Documentation & References
```yaml
# MUST READ - Include these in your context window
- file: src/cli/ui/progress.ts
  why: Contains PROCESSING_STAGES array with expected stage IDs ['downloading','extracting','separating','transcribing','summarizing']
  critical: CLI progress monitor expects exact match of these stage IDs in status field

- file: src/types/task.ts  
  why: Defines TaskStatus enum that should match CLI stage expectations
  critical: Status enum is canonical source of truth for stage IDs

- file: src/workers/stage-orchestrator.ts
  why: Handles stage completion but only updates currentStep/progress, NOT status field
  critical: handleStageCompletion() method needs to update manifest.status for CLI sync

- file: src/workers/download-worker.ts
  why: Broadcasts progress events with 'download' stage (not 'downloading') and emits every percentage
  critical: Lines 77-81 cause progress spam, stage ID mismatch

- file: src/workers/audio-stage-worker.ts
  why: Broadcasts with 'audio-processing' stage ID (should be 'extracting'/'separating'/'transcribing')
  critical: Stage transitions within audio processing need separate status updates

- file: src/workers/summarize-worker.ts
  why: Broadcasts with 'summarization' stage ID (should be 'summarizing')
  critical: Final stage completion and status broadcast

- file: src/api/events.ts
  why: Contains broadcastTaskUpdate function and SSE event management
  critical: Event types and throttling patterns for progress vs status events

- url: https://docs.bullmq.io/guide/events
  why: BullMQ progress event patterns and best practices
  critical: Difference between job.updateProgress() and global queue events

- url: https://www.npmjs.com/package/cli-progress
  why: CLI progress bar throttling and update best practices
  critical: Built-in throttling capabilities and update frequency control
```

### Current Codebase Structure
```bash
src/
├── cli/ui/progress.ts              # CLI progress monitor with PROCESSING_STAGES
├── types/task.ts                   # TaskStatus enum (canonical stage IDs)  
├── workers/
│   ├── stage-orchestrator.ts       # Stage coordination (NEEDS STATUS UPDATES)
│   ├── download-worker.ts          # Downloads (STAGE ID MISMATCH + SPAM)
│   ├── audio-stage-worker.ts       # Audio processing (MULTIPLE STAGE IDs)
│   └── summarize-worker.ts         # AI summary (STAGE ID MISMATCH)
├── api/events.ts                   # SSE broadcasts (NEEDS THROTTLING)
└── services/flow-producer.ts       # Flow management
```

### Desired Changes (Files to Modify)
```bash
src/
├── types/task.ts                   # CONFIRM TaskStatus enum matches CLI expectations
├── workers/
│   ├── stage-orchestrator.ts       # ADD manifest.status updates in handleStageCompletion
│   ├── download-worker.ts          # FIX stage ID + ADD progress throttling  
│   ├── audio-stage-worker.ts       # FIX stage transitions (extracting→separating→transcribing)
│   └── summarize-worker.ts         # FIX stage ID (summarization→summarizing)
├── api/events.ts                   # ADD progress throttling, separate status vs progress events
├── cli/ui/progress.ts              # ADD fallback mapping, improve transcription display
└── utils/
    └── progress-throttle.ts        # CREATE throttling utility (NEW FILE)
```

### Known Gotchas & Critical Issues
```typescript
// CRITICAL: Stage ID mismatches prevent CLI progress advancement
// CLI expects: ['downloading','extracting','separating','transcribing','summarizing'] 
// Workers broadcast: ['download', 'audio-processing', 'summarization']

// CRITICAL: manifest.status never changes from 'downloading' during processing
// stage-orchestrator.ts:104-131 only updates currentStep and progress
// CLI progress monitor uses manifest.status to determine active stage

// CRITICAL: DownloadWorker broadcasts every 1% change causing console spam
// download-worker.ts:77-81 emits progress on every onProgress callback
// Compact mode prints new line for each update (progress.ts:509)

// CRITICAL: Audio stage combines 3 CLI stages but only broadcasts 'audio-processing'
// Should transition: status='extracting' → 'separating' → 'transcribing' 
// Currently stays on 'downloading' throughout audio processing

// CRITICAL: cli-progress library has built-in throttling support
// Update frequency should be 100-500ms intervals for optimal UX
// Use process.stdout.write() with \r for clean line overwriting
```

## Implementation Blueprint

### Data Models and Validation
Ensure type safety and stage ID consistency across the entire system.

```typescript
// Confirm TaskStatus enum matches CLI PROCESSING_STAGES exactly
export type TaskStatus = 
  | 'pending' 
  | 'downloading'    // ✓ matches CLI
  | 'extracting'     // ✓ matches CLI  
  | 'separating'     // ✓ matches CLI
  | 'transcribing'   // ✓ matches CLI
  | 'summarizing'    // ✓ matches CLI
  | 'completed' 
  | 'failed';

// Add throttling utility for progress events
interface ProgressThrottleOptions {
  intervalMs: number;
  maxBufferSize: number;
  immediate: boolean;
}
```

### Task List (Implementation Order)

```yaml
Task 1 - Create Progress Throttling Utility:
CREATE src/utils/progress-throttle.ts:
  - IMPLEMENT throttling function with timestamp-based delay control
  - SUPPORT both immediate and buffered progress updates  
  - PATTERN: Follow modern async throttling with configurable intervals
  - INCLUDE options for 100-500ms intervals (best practice)

Task 2 - Fix TaskStatus Enum Validation:
MODIFY src/types/task.ts:
  - VERIFY TaskStatus enum matches CLI PROCESSING_STAGES exactly
  - ENSURE no discrepancies between stage IDs
  - ADD type validation functions if needed

Task 3 - Fix Stage Orchestrator Status Updates:
MODIFY src/workers/stage-orchestrator.ts:
  - FIND handleStageCompletion method (lines 86-157)
  - ADD manifest.status updates for each completed stage
  - PATTERN: switch(completedStage) cases should set status to NEXT stage
  - CRITICAL: download completion sets status='extracting', not just currentStep

Task 4 - Fix Download Worker Stage ID and Throttling:
MODIFY src/workers/download-worker.ts:
  - FIND broadcastTaskUpdate calls (lines 48-81)
  - CHANGE stage: 'download' → stage: 'downloading' (match CLI)
  - ADD progress throttling using new utility (100ms intervals)
  - PRESERVE existing onProgress functionality but throttle broadcasts

Task 5 - Fix Audio Stage Worker Multi-Stage Transitions:
MODIFY src/workers/audio-stage-worker.ts:
  - FIND audio processing steps (lines 66-193)
  - SPLIT into proper stage transitions:
    * Audio extraction: status='extracting', stage='extracting'
    * Voice separation: status='separating', stage='separating'  
    * Transcription: status='transcribing', stage='transcribing'
  - ADD manifest.status updates at each transition
  - THROTTLE progress events but keep text-stream immediate

Task 6 - Fix Summarize Worker Stage ID:
MODIFY src/workers/summarize-worker.ts:
  - FIND broadcastTaskUpdate calls (lines 66-126)
  - CHANGE stage: 'summarization' → stage: 'summarizing' (match CLI)
  - ADD manifest.status='summarizing' at start
  - PRESERVE existing progress patterns

Task 7 - Enhance Events API with Throttling:
MODIFY src/api/events.ts:
  - ADD separate event types: 'progress' vs 'status-change'
  - IMPLEMENT progress event throttling in broadcastTaskUpdate
  - KEEP status-change events immediate (stage transitions)
  - PRESERVE text-stream events as immediate for real-time feedback

Task 8 - Improve CLI Progress Display:
MODIFY src/cli/ui/progress.ts:
  - ADD fallback mapping for old stage IDs (backwards compatibility)
  - IMPROVE displayCompactProgress to overwrite lines cleanly (\r pattern)
  - ENHANCE transcription display to handle throttled text streams
  - REDUCE log noise in compact mode

Task 9 - Integration Testing:
CREATE tests/integration/cli-progress-stages.test.ts:
  - TEST complete stage sequence: downloading → extracting → separating → transcribing → summarizing
  - VERIFY progress throttling prevents console spam
  - VALIDATE real-time transcription streaming
  - ASSERT status updates sync with CLI progress bars
```

### Detailed Pseudocode

```typescript
// Task 1: Progress Throttling Utility
class ProgressThrottle {
  private lastUpdate = 0;
  private intervalMs: number;
  
  constructor(intervalMs: number = 200) {
    this.intervalMs = intervalMs;
  }
  
  async shouldUpdate(immediate: boolean = false): Promise<boolean> {
    const now = Date.now();
    if (immediate || (now - this.lastUpdate) >= this.intervalMs) {
      this.lastUpdate = now;
      return true;
    }
    return false;
  }
}

// Task 3: Stage Orchestrator Status Updates  
async handleStageCompletion(taskId: string, completedStage: string, stageResult: FlowStageResult) {
  // ... existing code ...
  
  // CRITICAL: Update manifest.status to next stage (not just currentStep)
  switch (completedStage) {
    case 'download':
      manifest.status = 'extracting'; // NEW: Set status for CLI sync
      manifest.currentStep = 'Download completed, starting audio processing';
      break;
    case 'audio-processing':
      manifest.status = 'summarizing'; // NEW: Set status for CLI sync  
      manifest.currentStep = 'Audio processing completed, starting summarization';
      break;
    case 'summarization':
      manifest.status = 'completed';   // Already exists
      break;
  }
  
  // NEW: Broadcast status change event (immediate, not throttled)
  broadcastTaskUpdate(taskId, {
    type: 'status-change',
    data: { status: manifest.status, stage: completedStage, progress: manifest.progress }
  });
}

// Task 4: Download Worker Throttling
async processFlowDownloadJob(job: Job<DownloadStageData>): Promise<FlowStageResult> {
  const progressThrottle = new ProgressThrottle(200); // 200ms throttling
  
  const downloadResult = await youTubeDownloader.downloadVideo(url, {
    onProgress: async (progress) => {
      job.updateProgress(progress);
      
      // THROTTLE progress broadcasts (not every percentage)
      if (await progressThrottle.shouldUpdate()) {
        broadcastTaskUpdate(taskId, {
          type: 'progress',
          data: { 
            stage: 'downloading', // FIXED: was 'download'
            progress, 
            step: `Downloading video... ${Math.round(progress)}%` 
          }
        });
      }
    },
  });
}

// Task 5: Audio Stage Multi-Transitions
async processAudioStage(job: Job<AudioProcessingStageData>): Promise<FlowStageResult> {
  // STAGE 1: Audio Extraction (status='extracting')
  await this.updateManifestStatus(taskId, 'extracting');
  broadcastTaskUpdate(taskId, { type: 'status-change', data: { status: 'extracting' } });
  
  const audioResult = await audioProcessor.extractAudio({
    onProgress: async (progress) => {
      if (await progressThrottle.shouldUpdate()) {
        broadcastTaskUpdate(taskId, {
          type: 'progress', 
          data: { stage: 'extracting', progress, step: `Extracting audio... ${progress}%` }
        });
      }
    }
  });
  
  // STAGE 2: Voice Separation (status='separating')  
  await this.updateManifestStatus(taskId, 'separating');
  broadcastTaskUpdate(taskId, { type: 'status-change', data: { status: 'separating' } });
  
  // STAGE 3: Transcription (status='transcribing')
  await this.updateManifestStatus(taskId, 'transcribing');
  broadcastTaskUpdate(taskId, { type: 'status-change', data: { status: 'transcribing' } });
  
  // Keep text-stream events immediate (no throttling)
  onTextStream: (segment) => {
    broadcastTaskUpdate(taskId, { type: 'text-stream', data: segment });
  }
}
```

### Integration Points
```yaml
SSE EVENTS:
  - add type: 'status-change' for immediate stage transitions
  - keep type: 'progress' for throttled percentage updates  
  - preserve type: 'text-stream' for real-time transcription

PROGRESS MONITORING:
  - throttle interval: 200ms for progress events
  - immediate broadcast: status changes and text streams
  - backwards compatibility: CLI mapping for old stage IDs

MANIFEST UPDATES:
  - status field: updated at stage transitions for CLI sync
  - currentStep field: descriptive messages for user feedback
  - broadcast both: status-change events and manifest updates
```

## Validation Loop

### Level 1: Syntax & Style
```bash
# Run these FIRST - fix any errors before proceeding
npm run type-check     # TypeScript compilation check
npm run lint           # ESLint validation
npm run lint:fix       # Auto-fix linting issues

# Expected: No errors. If errors, READ the error message and fix.
```

### Level 2: Unit Tests
```typescript
// CREATE tests/unit/progress-throttle.test.ts
describe('ProgressThrottle', () => {
  it('should allow immediate updates initially', async () => {
    const throttle = new ProgressThrottle(200);
    expect(await throttle.shouldUpdate()).toBe(true);
  });
  
  it('should throttle rapid updates within interval', async () => {
    const throttle = new ProgressThrottle(200);
    await throttle.shouldUpdate(); // First update
    expect(await throttle.shouldUpdate()).toBe(false); // Too soon
  });
  
  it('should allow updates after interval passes', async () => {
    const throttle = new ProgressThrottle(100);
    await throttle.shouldUpdate();
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(await throttle.shouldUpdate()).toBe(true);
  });
});

// CREATE tests/unit/stage-transitions.test.ts  
describe('Stage Transitions', () => {
  it('should update manifest status on stage completion', async () => {
    const orchestrator = new StageOrchestrator();
    const mockManifest = createDefaultManifest('test-task');
    
    await orchestrator.handleStageCompletion('test-task', 'download', mockStageResult);
    
    const updatedManifest = await fileManager.loadManifest('test-task');
    expect(updatedManifest.status).toBe('extracting'); // Status updated
  });
  
  it('should broadcast status-change events on transitions', async () => {
    const broadcastSpy = jest.spyOn(events, 'broadcastTaskUpdate');
    
    await orchestrator.handleStageCompletion('test-task', 'download', mockStageResult);
    
    expect(broadcastSpy).toHaveBeenCalledWith('test-task', {
      type: 'status-change',
      data: expect.objectContaining({ status: 'extracting' })
    });
  });
});
```

```bash
# Run and iterate until passing:
npm test -- --testPathPattern=progress-throttle
npm test -- --testPathPattern=stage-transitions
# If failing: Read error, understand root cause, fix code, re-run
```

### Level 3: Integration Test
```bash
# Start the development server
npm run dev

# Test complete video processing flow in another terminal
curl -X POST http://localhost:3000/api/tasks/create \
  -H "Content-Type: application/json" \
  -d '{"link": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'

# Monitor CLI output for:
# 1. Stage progression: downloading → extracting → separating → transcribing → summarizing
# 2. No repeated download percentage spam  
# 3. Real-time transcription text during transcribing stage
# 4. Clean compact mode output (single line updates)
```

### Level 4: CLI Integration Test
```bash
# Test CLI interface directly
npm run cli -- process "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

# Expected behavior:
# ✓ Progress bars advance through all 5 stages
# ✓ No console spam (throttled progress updates)
# ✓ Transcription text streams in real-time
# ✓ Stage transitions are clearly visible
# ✓ Compact mode shows clean single-line updates
```

## Final Validation Checklist
- [ ] All tests pass: `npm test`
- [ ] No type errors: `npm run type-check`  
- [ ] No linting errors: `npm run lint`
- [ ] CLI shows all 5 stages progressing in sequence
- [ ] Console output is clean (no repeated percentage spam)
- [ ] Real-time transcription streams during transcribing stage
- [ ] Progress throttling limits updates to ~5 per second
- [ ] Status changes broadcast immediately (not throttled)
- [ ] Backwards compatibility maintained for existing behavior
- [ ] TTY progress bars advance correctly
- [ ] Compact mode shows single-line updates

---

## Anti-Patterns to Avoid
- ❌ Don't break existing SSE event structure - add new event types
- ❌ Don't throttle status-change events - only progress events  
- ❌ Don't throttle text-stream events - keep real-time transcription
- ❌ Don't change TaskStatus enum values - must match CLI exactly
- ❌ Don't remove backwards compatibility - add fallback mapping
- ❌ Don't over-throttle - 100-500ms intervals for good UX
- ❌ Don't ignore manifest.status field - CLI depends on it for stage sync

## Success Score: 9/10
This PRP provides comprehensive context with:
- ✅ Complete codebase analysis with specific file references
- ✅ External best practices research and documentation URLs  
- ✅ Detailed technical root cause analysis (stage ID mismatches)
- ✅ Step-by-step implementation tasks with specific line number guidance
- ✅ Comprehensive validation loops with executable commands
- ✅ Critical gotchas and anti-patterns clearly documented
- ✅ Backwards compatibility considerations
- ✅ Performance optimization patterns (throttling best practices)

The implementation should succeed in one pass due to the depth of context and specific technical guidance provided.