name: "Fix Video Processing Concurrency Issues"
description: |

## Purpose
Fix the critical concurrency bottleneck in the YouTube video processing system where tasks are processed sequentially instead of concurrently, causing new download tasks to wait for long video processing tasks to complete.

## Core Principles
1. **Context is King**: Include ALL necessary documentation, examples, and caveats
2. **Validation Loops**: Provide executable tests/lints the AI can run and fix
3. **Information Dense**: Use keywords and patterns from the codebase
4. **Progressive Success**: Start simple, validate, then enhance
5. **Global rules**: Be sure to follow all rules in CLAUDE.md

---

## Goal
Implement true concurrent processing for YouTube video tasks while maintaining memory efficiency for transcription operations and preserving the existing pipeline architecture.

## Why
- **Performance**: Users experience significant delays when multiple videos are being processed
- **Resource Utilization**: System can handle 3-5 concurrent downloads but currently limited to 1 task
- **User Experience**: Long videos block processing of short videos that could complete quickly
- **Scalability**: Current architecture doesn't scale with hardware capabilities

## What
Transform the monolithic video processing pipeline into a concurrent multi-stage workflow using BullMQ Flows while maintaining proper memory management for transcription tasks.

### Success Criteria
- [ ] Multiple video download tasks can run concurrently (3+ simultaneous downloads)
- [ ] Transcription tasks are limited to 2 concurrent operations (memory management)
- [ ] Short videos can complete while long videos are still processing
- [ ] No regression in processing quality or reliability
- [ ] Memory usage stays under 2GB per transcription task
- [ ] Pipeline stages can be monitored independently

## All Needed Context

### Documentation & References
```yaml
# MUST READ - Include these in your context window
- url: https://docs.bullmq.io/guide/flows
  why: BullMQ Flows enable parent-child job relationships for multi-stage pipelines
  
- url: https://docs.bullmq.io/patterns/process-step-jobs
  why: Pattern for breaking jobs into sequential steps with dependencies
  
- file: src/utils/queue-config.ts
  why: Current queue and worker configuration with concurrency settings
  critical: Video processing worker has concurrency=1 causing bottleneck
  
- file: src/workers/video-processor.ts
  why: Current monolithic pipeline implementation that needs to be split
  
- file: src/workers/download-worker.ts
  why: Existing download worker with concurrency=3 that should be utilized
  
- file: src/workers/transcribe-worker.ts
  why: Existing transcribe worker with concurrency=2 for memory management
  
- file: src/workers/summarize-worker.ts
  why: Existing summarization worker with proper concurrency controls
  
- file: src/api/tasks.ts
  why: Current task creation logic that adds to video-processing queue
  critical: Currently routes everything through single-concurrency queue
```

### Current Codebase Analysis

**Root Cause Identified:**
```typescript
// In src/utils/queue-config.ts line 146
createVideoProcessingWorker(processor: any): Worker {
  return new Worker('video-processing', processor, {
    connection: this.redisConnection,
    concurrency: 1,  // ❌ THIS CAUSES THE BOTTLENECK
  });
}

// In src/api/tasks.ts line 54
const videoQueue = queueConfig.createVideoQueue();
await videoQueue.add('process-video', {  // ❌ ALL TASKS GO TO SINGLE QUEUE
  taskId,
  url: link,
  options,
});
```

**Current Flow (PROBLEMATIC):**
```
Task Creation → video-processing queue (concurrency: 1) → Full Pipeline
                     ↓
            Download + Extract + Transcribe + Summarize
                 (All sequential, blocks everything)
```

**Existing Resources (GOOD):**
```typescript
// These workers already exist with proper concurrency:
- Download Worker: concurrency=3
- Transcription Worker: concurrency=2  
- Summarization Worker: concurrency=1
```

### Desired Architecture
```
Task Creation → FlowProducer → Concurrent Stages
                    ↓
    ┌─────────────────────────────────────────────┐
    │ Download Stage (concurrency: 3)            │
    │ ├─ Video 1 Download                        │
    │ ├─ Video 2 Download                        │
    │ └─ Video 3 Download                        │
    └─────────────────────────────────────────────┘
                    ↓ (when each completes)
    ┌─────────────────────────────────────────────┐
    │ Audio Processing Stage (concurrency: 2)    │
    │ ├─ Video 1: Extract → Transcribe           │
    │ └─ Video 2: Extract → Transcribe           │
    └─────────────────────────────────────────────┘
                    ↓ (when each completes)
    ┌─────────────────────────────────────────────┐
    │ Summarization Stage (concurrency: 1)       │
    │ └─ AI Summary Generation                    │
    └─────────────────────────────────────────────┘
```

### Known Gotchas of our codebase & Library Quirks
```typescript
// CRITICAL: Memory management for transcription
// Whisper.cpp can use 1-2GB RAM per transcription job
// Current limit: concurrency=2 for transcription worker
transcriptionWorker: { concurrency: 2 }  // Don't increase without monitoring

// CRITICAL: BullMQ Flow parent-child relationships
// Parent job waits for ALL children to complete before proceeding
// Use this for: Download → AudioProcessing → Summarization

// CRITICAL: Progress tracking across flows
// Each stage needs to update the manifest independently
// SSE events must be broadcast from individual workers

// CRITICAL: File path management
// Each stage must know where to find files from previous stage
// Task directory structure must remain consistent
```

## Implementation Blueprint

### Data models and structure

**Enhanced Task Flow Data Types:**
```typescript
// New flow-based task data structures
interface TaskFlowData {
  taskId: string;
  url: string;
  options?: TaskOptions;
  stage: 'download' | 'audio_processing' | 'summarization';
  previousStageResult?: any;
}

interface FlowStageResult {
  taskId: string;
  stage: string;
  success: boolean;
  files: Record<string, string>;
  metadata: any;
  error?: string;
}
```

### List of tasks to be completed to fulfill the PRP in the order they should be completed

```yaml
Task 1 - Create Flow Producer Service:
  CREATE src/services/flow-producer.ts:
    - IMPLEMENT FlowProducer wrapper for video processing flows
    - DEFINE stage dependencies and relationships
    - INCLUDE progress tracking across stages

Task 2 - Create Stage Orchestrator:
  CREATE src/workers/stage-orchestrator.ts:
    - IMPLEMENT logic to coordinate between download, audio, and summarization stages
    - MANAGE file path passing between stages
    - HANDLE stage completion and error propagation

Task 3 - Modify Download Worker for Flow Integration:
  MODIFY src/workers/download-worker.ts:
    - ADD flow completion handling to signal next stage
    - IMPLEMENT result data structure for audio processing stage
    - PRESERVE existing download functionality

Task 4 - Create Audio Processing Stage Worker:
  CREATE src/workers/audio-stage-worker.ts:
    - COMBINE audio extraction and transcription into single stage
    - IMPLEMENT concurrency=2 for memory management
    - USE existing audioProcessor and transcriber services
    - SIGNAL completion to summarization stage

Task 5 - Modify Summarization Worker for Flow Integration:
  MODIFY src/workers/summarize-worker.ts:
    - ADD flow completion handling
    - IMPLEMENT final stage completion notification
    - PRESERVE existing AI summarization functionality

Task 6 - Update Queue Configuration:
  MODIFY src/utils/queue-config.ts:
    - ADD FlowProducer configuration
    - REMOVE or deprecate single video processing worker
    - ENHANCE existing worker configurations for flow integration

Task 7 - Update Task Creation API:
  MODIFY src/api/tasks.ts:
    - REPLACE video-processing queue with FlowProducer
    - IMPLEMENT multi-stage task creation
    - PRESERVE existing API interface

Task 8 - Update Progress Tracking:
  MODIFY src/api/events.ts:
    - ENHANCE SSE to handle multi-stage progress
    - IMPLEMENT stage-specific progress updates
    - ENSURE backward compatibility with existing UI

Task 9 - Integration and Testing:
  CREATE tests/integration/concurrent-processing.test.ts:
    - TEST multiple simultaneous downloads
    - VERIFY memory usage during concurrent transcription
    - VALIDATE stage-to-stage data passing

Task 10 - Performance Monitoring:
  CREATE src/utils/performance-monitor.ts:
    - IMPLEMENT concurrent task monitoring
    - ADD memory usage tracking
    - CREATE alerting for resource limits
```

### Per task pseudocode

```typescript
// Task 1: Flow Producer Service
class VideoProcessingFlowProducer {
  async createVideoProcessingFlow(taskId: string, url: string, options?: TaskOptions) {
    // PATTERN: Use existing FlowProducer from BullMQ
    const flow = await this.flowProducer.add({
      name: 'video-processing',
      data: { taskId, url, options },
      queueName: 'video-processing-orchestrator',
      children: [
        {
          name: 'download',
          data: { taskId, url, options },
          queueName: 'download',
          children: [
            {
              name: 'audio-processing',
              data: { taskId },
              queueName: 'audio-processing',
              children: [
                {
                  name: 'summarization',
                  data: { taskId },
                  queueName: 'summarization'
                }
              ]
            }
          ]
        }
      ]
    });
    
    // CRITICAL: Return flow ID for tracking
    return flow.id;
  }
}

// Task 4: Audio Processing Stage Worker
class AudioStageWorker {
  async processAudioStage(job: Job<TaskFlowData>) {
    const { taskId } = job.data;
    
    // CRITICAL: Get download results from parent job
    const downloadResult = await job.getChildrenValues();
    
    // PATTERN: Use existing audio processor and transcriber
    // 1. Extract audio (using existing audioProcessor)
    const audioResult = await audioProcessor.extractAudio(/*...*/);
    
    // 2. Transcribe (using existing transcriber with memory limits)
    const transcriptionResult = await transcriber.transcribeAudio(/*...*/);
    
    // CRITICAL: Update progress through SSE
    broadcastTaskUpdate(taskId, { stage: 'audio-processing', progress: 100 });
    
    // PATTERN: Return data for next stage
    return { taskId, audioResult, transcriptionResult };
  }
}
```

### Integration Points
```yaml
QUEUE_CONFIGURATION:
  - modify: src/utils/queue-config.ts
  - add: FlowProducer configuration
  - pattern: "createFlowProducer(): FlowProducer"
  
WORKER_MANAGEMENT:
  - modify: src/index.ts startWorkers() method
  - add: Flow-based worker initialization
  - preserve: Existing worker setup patterns

API_ENDPOINTS:
  - modify: src/api/tasks.ts create() method
  - pattern: Replace queue.add() with flowProducer.add()
  - preserve: Existing response format

PROGRESS_TRACKING:
  - modify: src/api/events.ts
  - enhance: Multi-stage progress broadcasting
  - pattern: Stage-specific SSE event types

FILE_MANAGEMENT:
  - preserve: src/utils/file-manager.ts
  - enhance: Stage-aware file operations
  - pattern: Consistent task directory structure
```

## Validation Loop

### Level 1: Syntax & Style
```bash
# Run these FIRST - fix any errors before proceeding
npm run lint                              # ESLint checks
npm run type-check                        # TypeScript compilation
npm run build                             # Ensure build succeeds

# Expected: No errors. If errors, READ the error and fix.
```

### Level 2: Unit Tests
```typescript
// CREATE tests/unit/workers/flow-producer.test.ts
describe('VideoProcessingFlowProducer', () => {
  test('creates valid flow structure', async () => {
    const flow = await flowProducer.createVideoProcessingFlow('test-id', 'test-url');
    expect(flow.id).toBeDefined();
    expect(flow.children).toHaveLength(1);
  });
  
  test('handles flow errors gracefully', async () => {
    const invalidUrl = 'invalid-url';
    await expect(flowProducer.createVideoProcessingFlow('test', invalidUrl))
      .rejects.toThrow('Invalid YouTube URL');
  });
});

// CREATE tests/unit/workers/audio-stage-worker.test.ts  
describe('AudioStageWorker', () => {
  test('processes audio stage successfully', async () => {
    const job = createMockJob({ taskId: 'test', downloadResult: mockDownloadResult });
    const result = await audioStageWorker.processAudioStage(job);
    expect(result.transcriptionResult).toBeDefined();
  });
  
  test('handles transcription memory limits', async () => {
    // Mock heavy transcription job
    const job = createMockJob({ taskId: 'heavy', audioSize: '2GB' });
    // Should not exceed memory limits
    const memoryBefore = process.memoryUsage().heapUsed;
    await audioStageWorker.processAudioStage(job);
    const memoryAfter = process.memoryUsage().heapUsed;
    expect(memoryAfter - memoryBefore).toBeLessThan(2_000_000_000); // 2GB
  });
});
```

```bash
# Run and iterate until passing:
npm test -- tests/unit/workers/
# If failing: Read error, understand root cause, fix code, re-run
```

### Level 3: Integration Test
```bash
# Start Redis
redis-server

# Start the application
npm run dev

# Test concurrent processing
curl -X POST http://localhost:3000/trpc/tasks.create \
  -H "Content-Type: application/json" \
  -d '{"link": "https://www.youtube.com/watch?v=video1"}'

curl -X POST http://localhost:3000/trpc/tasks.create \
  -H "Content-Type: application/json" \
  -d '{"link": "https://www.youtube.com/watch?v=video2"}'

# Expected: Both tasks start downloading simultaneously
# Monitor with: curl http://localhost:3000/api/events/stream
```

### Level 4: Concurrency Test
```bash
# CREATE tests/integration/concurrent-processing.test.ts
# Test multiple simultaneous video processing
npm test -- tests/integration/concurrent-processing.test.ts

# Expected: 
# - 3+ downloads can run simultaneously
# - 2 transcription jobs max (memory management)  
# - No blocking between stages
# - Memory usage stays reasonable
```

## Final validation Checklist
- [ ] All tests pass: `npm test`
- [ ] No linting errors: `npm run lint`
- [ ] No type errors: `npm run type-check`
- [ ] Concurrent downloads work: Start 3 downloads, verify all start immediately
- [ ] Memory management works: Monitor transcription memory usage < 2GB per job
- [ ] Progress tracking works: SSE events show stage-specific progress
- [ ] Error handling works: Failed downloads don't block other tasks
- [ ] File consistency: All output files generated correctly
- [ ] Backward compatibility: Existing CLI and API work unchanged

---

## Performance Expectations Post-Fix

**Before (Current):**
- Download Video 1 (10 min): 0-90 seconds
- Download Video 2 (5 min): Waits 90 seconds, then starts
- Total time for 2 videos: ~120 seconds

**After (Target):**
- Download Video 1 (10 min): 0-90 seconds  
- Download Video 2 (5 min): 0-45 seconds (parallel)
- Total time for 2 videos: ~90 seconds (45% improvement)

**Concurrency Targets:**
- Downloads: 3 simultaneous
- Transcriptions: 2 simultaneous (memory limit)
- Summarizations: 1 at a time (API rate limit)

## Anti-Patterns to Avoid
- ❌ Don't increase transcription concurrency beyond 2 without memory monitoring
- ❌ Don't break existing API contracts - maintain backward compatibility
- ❌ Don't skip progress updates - users need real-time feedback
- ❌ Don't ignore error propagation between flow stages
- ❌ Don't hardcode stage timeouts - use configurable values
- ❌ Don't remove existing workers until flow system is validated

## Quality Score: 9/10
**Confidence Level:** High - This PRP provides comprehensive context, clear implementation path, and robust validation gates. The AI agent should be able to implement this successfully in one pass with the detailed architectural guidance and existing code patterns provided.