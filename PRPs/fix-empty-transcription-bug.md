# Fix Empty Transcription Results Bug

## Problem Statement

### Current Issue
After recent code changes (between commits 290b365 and 1dbd67d), the transcription pipeline completes successfully but generates empty results, causing the AI summarization stage to fail with "subtitle files not found" errors.

### Bug Symptoms
- **Transcription Stage**: Completes without errors and creates all expected files (`subtitle.srt`, `transcription.json`, `transcript.txt`, `words.wts`)
- **File Content**: All transcription output files are empty or contain empty data structures
- **Summarization Stage**: Fails because it correctly detects empty transcription content
- **Example Failed Task**: `data/task_mdc3rvn3_q9g89b/` contains empty files despite "successful" transcription

### Root Cause Analysis
Investigation reveals that the issue is **NOT** in the AI summarizer (which correctly detects empty content), but in the **whisper transcription process** that's generating empty results:

```json
// transcription.json content from failed task
{
  "text": "",
  "segments": [],
  "language": "auto", 
  "duration": 0,
  "modelUsed": "large-v3"
}
```

## Technical Context

### Current Architecture
- **Transcriber Service** (`src/services/transcriber.ts`): Orchestrates transcription process
- **Whisper CLI Wrapper** (`src/utils/whisper-cli.ts`): Handles whisper.cpp command execution
- **Output Parser** (`src/types/audio.ts`): Parses whisper output into structured format
- **File Generation**: Creates SRT, JSON, TXT, and WTS files from parsed results

### Key Code Locations
- `transcriber.ts:88-97` - Main transcription call and result saving
- `whisper-cli.ts:124-139` - Output parsing priority (JSON → TXT → stdout)
- `transcriber.ts:209-246` - `saveTranscriptionResults` method
- `transcriber.ts:251-301` - `validateTimestamps` with fallback logic

### What Changed Recently
The git diff between 290b365..1dbd67d shows changes primarily in:
- AI summarizer (Chinese deep notes feature)
- Workers and flow producers
- **No direct changes to transcription logic**

This suggests the bug is either:
1. A side effect of other changes (environment, dependencies)
2. An existing race condition now exposed
3. A change in whisper CLI behavior or parameters

## Implementation Plan

### Phase 1: Investigation and Debugging 

#### 1.1 Add Comprehensive Debug Logging
**File**: `src/services/transcriber.ts`
```typescript
// In saveTranscriptionResults method (line ~209)
private async saveTranscriptionResults(
  transcription: TranscriptionResult,
  outputDir: string
): Promise<void> {
  // ADD: Debug logging before validation
  console.log('📊 Transcription Debug Stats:');
  console.log(`  Text length: ${transcription.text?.length || 0}`);
  console.log(`  Segments count: ${transcription.segments?.length || 0}`);
  console.log(`  Duration: ${transcription.duration || 0}s`);
  console.log(`  Language: ${transcription.language}`);
  console.log(`  Model: ${transcription.modelUsed}`);
  
  if (!transcription.text?.trim() || transcription.segments.length === 0) {
    console.error('❌ Empty transcription detected before saving!');
    console.error('Raw transcription object:', JSON.stringify(transcription, null, 2));
    throw new TranscriptionError(
      'Empty transcription result - no text or segments found',
      'EMPTY_TRANSCRIPTION',
      { 
        textLength: transcription.text?.length || 0,
        segmentsCount: transcription.segments?.length || 0,
        duration: transcription.duration
      }
    );
  }
  
  // Continue with existing validation...
  const validatedTranscription = this.validateTimestamps(transcription);
  // ... rest of method
}
```

#### 1.2 Enhanced Whisper CLI Debug Output
**File**: `src/utils/whisper-cli.ts`
```typescript
// In transcribeAudio method (line ~124)
// Parse the output - prioritize JSON file for timestamp extraction
let transcriptionResult: TranscriptionResult;

if (existsSync(jsonOutputPath)) {
  const jsonContent = await fs.readFile(jsonOutputPath, 'utf-8');
  console.log('🔍 JSON output file analysis:');
  console.log(`  File size: ${jsonContent.length} bytes`);
  console.log(`  Content preview: ${jsonContent.substring(0, 500)}...`);
  
  transcriptionResult = parseWhisperOutput(jsonContent);
  console.log('📊 Parsed JSON result stats:');
  console.log(`  Text length: ${transcriptionResult.text?.length || 0}`);
  console.log(`  Segments: ${transcriptionResult.segments?.length || 0}`);
} else if (existsSync(txtOutputPath)) {
  const textContent = await fs.readFile(txtOutputPath, 'utf-8');
  console.log('🔍 TXT output fallback:');
  console.log(`  File size: ${textContent.length} bytes`);
  console.log(`  Content preview: ${textContent.substring(0, 200)}...`);
  
  transcriptionResult = parseWhisperOutput(textContent);
} else {
  console.log('🔍 STDOUT fallback:');
  console.log(`  Output length: ${result.stdout.length} bytes`);
  console.log(`  Content preview: ${result.stdout.substring(0, 200)}...`);
  
  transcriptionResult = parseWhisperOutput(result.stdout);
}
```

#### 1.3 Whisper Command Verification
**File**: `src/utils/whisper-cli.ts`
```typescript
// In transcribeAudio method (line ~110)
try {
  console.log('🎯 Whisper Command Execution:');
  console.log(`  Executable: ${this.executablePath}`);
  console.log(`  Model: ${this.modelPath}`);
  console.log(`  Audio file: ${audioPath}`);
  console.log(`  Output dir: ${outputDir}`);
  console.log(`  Full command: ${this.executablePath} ${args.join(' ')}`);
  
  const result = await this.runWhisperCommand(args, onProgress, onTextStream);
  
  console.log('📤 Whisper Command Results:');
  console.log(`  Exit code: ${result.exitCode}`);
  console.log(`  STDOUT length: ${result.stdout.length}`);
  console.log(`  STDERR length: ${result.stderr.length}`);
  console.log(`  STDOUT preview: ${result.stdout.substring(0, 300)}...`);
  if (result.stderr) {
    console.log(`  STDERR preview: ${result.stderr.substring(0, 300)}...`);
  }
  
  if (result.exitCode !== 0) {
    // ... existing error handling
  }
  // ... continue with parsing
}
```

### Phase 2: Validation and Early Failure

#### 2.1 Create TranscriptionError Class Extension
**File**: `src/services/transcriber.ts`
```typescript
// Add to existing TranscriptionError class (line ~30)
export class TranscriptionError extends Error {
  constructor(message: string, public code: string, public details?: any) {
    super(message);
    this.name = 'TranscriptionError';
  }

  // ADD: Static factory methods for common errors
  static emptyResult(details: { textLength: number; segmentsCount: number; duration: number }): TranscriptionError {
    return new TranscriptionError(
      'Transcription completed but returned empty results',
      'EMPTY_TRANSCRIPTION',
      details
    );
  }

  static parseFailure(rawOutput: string): TranscriptionError {
    return new TranscriptionError(
      'Failed to parse transcription output',
      'PARSE_FAILURE',
      { rawOutputLength: rawOutput.length, preview: rawOutput.substring(0, 200) }
    );
  }
}
```

#### 2.2 Update Whisper CLI with Validation
**File**: `src/utils/whisper-cli.ts`
```typescript
// In transcribeAudio method, after parsing but before return (line ~144)
// Ensure we have the correct model information
transcriptionResult.modelUsed = 'large-v3';

// ADD: Critical validation before returning
if (!transcriptionResult.text?.trim() || transcriptionResult.segments.length === 0) {
  console.error('❌ Whisper CLI returned empty transcription!');
  console.error('Raw whisper stdout:', result.stdout.substring(0, 1000));
  console.error('Raw whisper stderr:', result.stderr.substring(0, 1000));
  console.error('Generated files check:');
  console.error(`  JSON exists: ${existsSync(jsonOutputPath)}`);
  console.error(`  TXT exists: ${existsSync(txtOutputPath)}`);
  
  throw new Error(
    `Whisper transcription returned empty results. ` +
    `Text length: ${transcriptionResult.text?.length || 0}, ` +
    `Segments: ${transcriptionResult.segments.length}, ` +
    `Duration: ${transcriptionResult.duration}s`
  );
}

return transcriptionResult;
```

#### 2.3 Update Summarize Worker Error Handling
**File**: `src/workers/summarize-worker.ts`
```typescript
// In handleSummarizeJob method, add specific empty transcription handling (line ~106)
try {
  // Load transcription data
  const transcriptionData = await this.loadTranscriptionData(transcriptionPath);
  
  // ADD: Validate transcription before processing
  if (!transcriptionData.text?.trim() || transcriptionData.segments.length === 0) {
    console.error(`❌ Task ${taskId}: Empty transcription detected in summarization stage`);
    console.error('Transcription stats:', {
      textLength: transcriptionData.text?.length || 0,
      segmentsCount: transcriptionData.segments?.length || 0,
      duration: transcriptionData.duration
    });
    
    throw new Error(
      'Cannot generate summary: transcription is empty. ' +
      'This indicates a failure in the audio transcription stage.'
    );
  }

  const summaryOptions: SummaryOptions = {
    transcription: transcriptionData,
    // ... rest of options
  };
  // ... continue with summarization
} catch (error) {
  // Enhanced error reporting
  if (error instanceof Error && error.message.includes('transcription is empty')) {
    console.error(`❌ Task ${taskId}: Transcription validation failed`);
    
    // Mark task as failed with specific error
    const stageResult: FlowStageResult = {
      taskId,
      stage: 'summarizing',
      success: false,
      error: 'EMPTY_TRANSCRIPTION',
      errorMessage: 'Transcription stage produced empty results',
      files: {},
      metadata: {
        summarizationFailedAt: new Date().toISOString(),
        failureReason: 'Empty transcription - likely audio processing issue',
        errorDetails: error.message,
      },
    };
    
    await this.markFlowAsFailed(taskId, stageResult, error);
    return;
  }
  
  // ... existing error handling
}
```

### Phase 3: Root Cause Investigation Tools

#### 3.1 Manual Whisper CLI Test Script
**File**: `scripts/debug-whisper.js`
```javascript
#!/usr/bin/env node
import { spawn } from 'child_process';
import { existsSync, promises as fs } from 'fs';
import path from 'path';

const WHISPER_EXECUTABLE = process.env.WHISPER_EXECUTABLE_PATH;
const WHISPER_MODEL = process.env.WHISPER_MODEL_PATH;
const AUDIO_FILE = process.argv[2]; // Pass audio file as argument

if (!AUDIO_FILE || !existsSync(AUDIO_FILE)) {
  console.error('Usage: node scripts/debug-whisper.js <path-to-audio-file>');
  process.exit(1);
}

console.log('🔧 Whisper Debug Test');
console.log(`Executable: ${WHISPER_EXECUTABLE}`);
console.log(`Model: ${WHISPER_MODEL}`);
console.log(`Audio: ${AUDIO_FILE}`);

const outputDir = '/tmp/whisper-debug';
await fs.mkdir(outputDir, { recursive: true });

const args = [
  '-m', WHISPER_MODEL,
  '-f', AUDIO_FILE,
  '-of', path.join(outputDir, 'test'),
  '-l', 'auto',
  '-pp',  // print progress
  '-pc',  // print colors
  '-otxt', // output txt
  '-osrt', // output srt
  '-oj',   // output json
  '-t', '8',
  '-ml', '1',
  '-sow',
  '-wt', '0.01'
];

console.log(`\n🎯 Command: ${WHISPER_EXECUTABLE} ${args.join(' ')}\n`);

const child = spawn(WHISPER_EXECUTABLE, args, { stdio: 'inherit' });

child.on('close', async (code) => {
  console.log(`\n✅ Process exited with code: ${code}`);
  
  // Check output files
  const files = ['test.json', 'test.txt', 'test.srt'];
  for (const file of files) {
    const filePath = path.join(outputDir, file);
    if (existsSync(filePath)) {
      const stats = await fs.stat(filePath);
      const content = await fs.readFile(filePath, 'utf-8');
      console.log(`📄 ${file}: ${stats.size} bytes`);
      console.log(`   Preview: ${content.substring(0, 200)}...`);
    } else {
      console.log(`❌ ${file}: NOT CREATED`);
    }
  }
});
```

#### 3.2 Audio File Validation Utility
**File**: `src/utils/audio-validator.ts`
```typescript
import { promises as fs } from 'fs';
import { spawn } from 'child_process';

export interface AudioValidationResult {
  isValid: boolean;
  duration: number;
  sampleRate: number;
  channels: number;
  format: string;
  errors: string[];
}

export async function validateAudioFile(audioPath: string): Promise<AudioValidationResult> {
  const errors: string[] = [];
  
  try {
    // Check file exists and has content
    const stats = await fs.stat(audioPath);
    if (stats.size === 0) {
      errors.push('Audio file is empty');
    }
    
    // Use ffmpeg to probe audio file details
    const ffprobeResult = await new Promise<string>((resolve, reject) => {
      const process = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        audioPath
      ]);
      
      let output = '';
      process.stdout.on('data', (data) => output += data.toString());
      process.on('close', (code) => {
        if (code === 0) resolve(output);
        else reject(new Error(`ffprobe failed with code ${code}`));
      });
    });
    
    const probeData = JSON.parse(ffprobeResult);
    const audioStream = probeData.streams?.find((s: any) => s.codec_type === 'audio');
    
    if (!audioStream) {
      errors.push('No audio stream found in file');
      return { isValid: false, duration: 0, sampleRate: 0, channels: 0, format: '', errors };
    }
    
    const duration = parseFloat(probeData.format?.duration || '0');
    const sampleRate = parseInt(audioStream.sample_rate || '0');
    const channels = parseInt(audioStream.channels || '0');
    const format = audioStream.codec_name || 'unknown';
    
    // Validation checks
    if (duration === 0) errors.push('Audio duration is zero');
    if (sampleRate < 8000) errors.push(`Sample rate too low: ${sampleRate}Hz`);
    if (channels === 0) errors.push('No audio channels detected');
    
    return {
      isValid: errors.length === 0,
      duration,
      sampleRate,
      channels,
      format,
      errors
    };
    
  } catch (error) {
    errors.push(`Audio validation failed: ${error instanceof Error ? error.message : String(error)}`);
    return { isValid: false, duration: 0, sampleRate: 0, channels: 0, format: '', errors };
  }
}
```

### Phase 4: Testing Implementation

#### 4.1 Unit Tests for Empty Transcription Detection
**File**: `tests/unit/services/transcriber-empty-results.test.ts`
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Transcriber, TranscriptionError } from '../../../src/services/transcriber.js';
import { whisperCLI } from '../../../src/utils/whisper-cli.js';
import { TranscriptionResult } from '../../../src/types/audio.js';

// Mock whisper CLI
vi.mock('../../../src/utils/whisper-cli.js', () => ({
  whisperCLI: {
    validateInstallation: vi.fn(),
    transcribeAudio: vi.fn(),
  },
}));

describe('Transcriber Empty Results Handling', () => {
  let transcriber: Transcriber;
  const mockWhisperCLI = vi.mocked(whisperCLI);

  beforeEach(() => {
    vi.clearAllMocks();
    mockWhisperCLI.validateInstallation.mockResolvedValue({ isValid: true, errors: [] });
    transcriber = new Transcriber();
  });

  describe('Empty transcription detection', () => {
    it('should throw TranscriptionError when text is empty', async () => {
      const emptyResult: TranscriptionResult = {
        text: '',
        segments: [],
        language: 'auto',
        duration: 0,
        modelUsed: 'large-v3'
      };

      mockWhisperCLI.transcribeAudio.mockResolvedValue(emptyResult);

      await expect(transcriber.transcribeAudio({
        audioPath: '/test/audio.wav',
        outputDir: '/test/output',
        config: { model: 'large-v3', language: 'auto' }
      })).rejects.toThrow(TranscriptionError);
    });

    it('should throw TranscriptionError when segments are empty but text exists', async () => {
      const emptySegmentsResult: TranscriptionResult = {
        text: '   \n  \t  ',  // Only whitespace
        segments: [],
        language: 'auto', 
        duration: 60,
        modelUsed: 'large-v3'
      };

      mockWhisperCLI.transcribeAudio.mockResolvedValue(emptySegmentsResult);

      await expect(transcriber.transcribeAudio({
        audioPath: '/test/audio.wav',
        outputDir: '/test/output',
        config: { model: 'large-v3', language: 'auto' }
      })).rejects.toThrow('Empty transcription returned');
    });

    it('should succeed with valid transcription', async () => {
      const validResult: TranscriptionResult = {
        text: 'Hello world, this is a test.',
        segments: [
          { start: 0, end: 2, text: 'Hello world,' },
          { start: 2, end: 5, text: 'this is a test.' }
        ],
        language: 'en',
        duration: 5,
        modelUsed: 'large-v3'
      };

      mockWhisperCLI.transcribeAudio.mockResolvedValue(validResult);

      const result = await transcriber.transcribeAudio({
        audioPath: '/test/audio.wav',
        outputDir: '/test/output',
        config: { model: 'large-v3', language: 'auto' }
      });

      expect(result.text).toBe('Hello world, this is a test.');
      expect(result.segments).toHaveLength(2);
    });
  });

  describe('Validation error details', () => {
    it('should include detailed error information', async () => {
      const emptyResult: TranscriptionResult = {
        text: '',
        segments: [],
        language: 'auto',
        duration: 0,
        modelUsed: 'large-v3'
      };

      mockWhisperCLI.transcribeAudio.mockResolvedValue(emptyResult);

      try {
        await transcriber.transcribeAudio({
          audioPath: '/test/audio.wav',
          outputDir: '/test/output',
          config: { model: 'large-v3', language: 'auto' }
        });
        fail('Should have thrown TranscriptionError');
      } catch (error) {
        expect(error).toBeInstanceOf(TranscriptionError);
        expect(error.code).toBe('EMPTY_TRANSCRIPTION');
        expect(error.details).toEqual({
          textLength: 0,
          segmentsCount: 0,
          duration: 0
        });
      }
    });
  });
});
```

#### 4.2 Integration Test for Full Pipeline
**File**: `tests/integration/transcription-pipeline.test.ts`
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { Transcriber } from '../../src/services/transcriber.js';

// This test requires actual whisper installation
describe('Transcription Pipeline Integration', () => {
  const testOutputDir = '/tmp/transcription-test';
  let transcriber: Transcriber;

  beforeAll(async () => {
    await fs.mkdir(testOutputDir, { recursive: true });
    transcriber = new Transcriber();
  });

  afterAll(async () => {
    await fs.rmdir(testOutputDir, { recursive: true });
  });

  // Requires test audio file - should be added to fixtures
  it.skip('should process real audio file and validate non-empty results', async () => {
    const testAudioPath = path.join(process.cwd(), 'tests/fixtures/test-audio-short.wav');
    
    // Skip if test audio doesn't exist
    try {
      await fs.access(testAudioPath);
    } catch {
      console.log('Skipping integration test - no test audio file');
      return;
    }

    const result = await transcriber.transcribeAudio({
      audioPath: testAudioPath,
      outputDir: testOutputDir,
      config: {
        model: 'large-v3',
        language: 'auto',
        wordTimestamps: true
      }
    });

    // Validate results
    expect(result.text).toBeTruthy();
    expect(result.text.trim().length).toBeGreaterThan(0);
    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.duration).toBeGreaterThan(0);

    // Check output files were created and have content
    const files = ['transcription.json', 'subtitle.srt', 'transcript.txt', 'words.wts'];
    for (const file of files) {
      const filePath = path.join(testOutputDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content.length).toBeGreaterThan(0);
    }
  });
});
```

### Phase 5: Root Cause Fixes

#### 5.1 Enhanced Output Parsing
**File**: `src/types/audio.ts` - Update `parseWhisperOutput` function
```typescript
// Enhance the parseWhisperOutput function with better validation
export function parseWhisperOutput(output: string): TranscriptionResult {
  // ADD: Input validation
  if (!output || output.trim().length === 0) {
    throw new Error('parseWhisperOutput: empty or null input');
  }

  try {
    // First try to parse as JSON (from whisper --output-json)
    const jsonResult = JSON.parse(output);
    
    // ADD: Validate JSON structure
    if (typeof jsonResult !== 'object' || jsonResult === null) {
      throw new Error('parseWhisperOutput: invalid JSON structure');
    }

    // Extract with validation
    const result: TranscriptionResult = {
      text: jsonResult.text || '',
      segments: Array.isArray(jsonResult.segments) ? jsonResult.segments : [],
      language: jsonResult.language || 'auto',
      duration: typeof jsonResult.duration === 'number' ? jsonResult.duration : 0,
      modelUsed: jsonResult.model || 'large-v3'
    };

    // ADD: Critical validation - if duration is 0 but segments exist, recalculate
    if (result.duration === 0 && result.segments.length > 0) {
      const lastSegment = result.segments[result.segments.length - 1];
      if (lastSegment && lastSegment.end > 0) {
        result.duration = lastSegment.end;
        console.warn('⚠️ Fixed duration from segments:', result.duration);
      }
    }

    return result;
  } catch (jsonError) {
    console.log('📝 JSON parsing failed, trying plain text parsing...');
    
    // Fallback to plain text parsing
    const textResult: TranscriptionResult = {
      text: output.trim(),
      segments: [], // Plain text has no segment info
      language: 'auto',
      duration: 0, // Unknown from plain text
      modelUsed: 'large-v3'
    };

    // ADD: Validate plain text result
    if (!textResult.text || textResult.text.trim().length === 0) {
      throw new Error(
        'parseWhisperOutput: failed to extract any text content. ' +
        `Input length: ${output.length}, preview: ${output.substring(0, 100)}`
      );
    }

    return textResult;
  }
}
```

#### 5.2 Whisper Command Parameter Fix
**File**: `src/utils/whisper-cli.ts`
```typescript
// In transcribeAudio method, review command arguments (line ~90)
// Build whisper command arguments to ensure timestamp extraction
const args = [
  '-m', this.modelPath,
  '-f', audioPath,
  '-of', outputBaseName,
  '-l', config.language || 'auto',
  '-pp',  // print progress
  '-pc',  // print colors
  '-otxt', // output txt
  '-osrt', // output srt  
  '-oj',   // output json - CRITICAL for timestamps
  '-t', '8', // number of threads
  // ADD: Ensure model is properly specified
  '--model', this.modelPath,  // Explicit model flag
  '--language', config.language || 'auto',  // Explicit language flag
];

// REMOVE potentially problematic parameters if they exist
// Review if any parameters were added that might cause empty output

// ADD: Enhanced word timestamps configuration
if (config.wordTimestamps) {
  args.push('-ml', '1');     // max line length for word timestamps
  args.push('-sow');         // split on word - improves timestamp accuracy  
  args.push('-wt', '0.01');  // word timestamp threshold
  // ADD: Ensure word-level timestamps are preserved
  args.push('--print-realtime'); // Enable real-time output
}
```

### Phase 6: Validation Gates

#### 6.1 Pre-commit Validation Script
**File**: `scripts/validate-transcription.sh`
```bash
#!/bin/bash
# Transcription validation script

echo "🔍 Running transcription validation..."

# Type checking
echo "1. Type checking..."
npm run type-check
if [ $? -ne 0 ]; then
  echo "❌ Type check failed"
  exit 1
fi

# Linting
echo "2. Linting..."
npm run lint
if [ $? -ne 0 ]; then
  echo "❌ Lint check failed"
  exit 1
fi

# Unit tests
echo "3. Unit tests..."
npm run test:unit
if [ $? -ne 0 ]; then
  echo "❌ Unit tests failed"
  exit 1
fi

# Integration tests (if available)
echo "4. Integration tests..."
npm run test:integration
if [ $? -ne 0 ]; then
  echo "❌ Integration tests failed" 
  exit 1
fi

echo "✅ All validation checks passed!"
```

#### 6.2 Environment Validation
**File**: `src/utils/environment-validator.ts`
```typescript
export interface EnvironmentValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export async function validateTranscriptionEnvironment(): Promise<EnvironmentValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required environment variables
  if (!process.env.WHISPER_EXECUTABLE_PATH) {
    errors.push('WHISPER_EXECUTABLE_PATH environment variable not set');
  }
  if (!process.env.WHISPER_MODEL_PATH) {
    errors.push('WHISPER_MODEL_PATH environment variable not set');
  }

  // Check file accessibility
  try {
    const { existsSync } = await import('fs');
    if (process.env.WHISPER_EXECUTABLE_PATH && !existsSync(process.env.WHISPER_EXECUTABLE_PATH)) {
      errors.push(`Whisper executable not found: ${process.env.WHISPER_EXECUTABLE_PATH}`);
    }
    if (process.env.WHISPER_MODEL_PATH && !existsSync(process.env.WHISPER_MODEL_PATH)) {
      errors.push(`Whisper model not found: ${process.env.WHISPER_MODEL_PATH}`);
    }
  } catch (error) {
    warnings.push('Could not validate file accessibility');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}
```

## Testing Strategy

### Unit Tests
- **Empty transcription detection**: Verify error throwing when results are empty
- **Validation logic**: Test TranscriptionError creation and details
- **Output parsing**: Test parseWhisperOutput with various input formats
- **File validation**: Test audio file validation utility

### Integration Tests  
- **Full pipeline**: Test with real audio file (short sample)
- **Error propagation**: Verify errors bubble up correctly through workers
- **File generation**: Confirm all output files are created with content

### Manual Validation
- **Debug script**: Run whisper CLI directly with problem audio files
- **Environment check**: Validate whisper installation and model access
- **Log analysis**: Review detailed debug output during transcription

## Implementation Tasks

### High Priority
1. **Add debug logging** to transcriber.ts and whisper-cli.ts
2. **Implement validation** in saveTranscriptionResults and whisperCLI
3. **Create debug script** for manual whisper testing
4. **Update error handling** in summarize-worker.ts

### Medium Priority  
5. **Write unit tests** for empty transcription detection
6. **Create audio validation utility** 
7. **Review whisper command parameters** for potential issues
8. **Enhance output parsing** with better validation

### Low Priority
9. **Add integration tests** with real audio files
10. **Create environment validation** utility
11. **Document debugging procedures** 
12. **Add pre-commit validation** script

## Expected Outcomes

### Immediate (Phase 1-2)
- **Better visibility** into where transcription is failing
- **Early detection** of empty transcription results
- **Proper error messages** instead of misleading "subtitle files not found"

### Short Term (Phase 3-4)  
- **Root cause identification** through enhanced debugging
- **Comprehensive test coverage** to prevent regression
- **Manual debugging tools** for investigating failures

### Long Term (Phase 5-6)
- **Fixed transcription pipeline** that reliably generates content
- **Robust validation** that catches issues early
- **Automated testing** that ensures transcription quality

## Success Criteria

1. **Zero empty transcription results** for valid audio files
2. **Clear error messages** when transcription genuinely fails
3. **All tests passing** including new validation tests
4. **Debug tools available** for future troubleshooting
5. **Documentation** of transcription requirements and debugging

## Risk Mitigation

- **Backward compatibility**: All changes preserve existing API
- **Graceful degradation**: System fails fast with clear error messages
- **Rollback plan**: Each change can be reverted independently
- **Testing coverage**: Both unit and integration tests prevent regression

---

## Notes for Implementation

- **Whisper Installation**: Ensure whisper.cpp is properly compiled and accessible
- **Model Path**: Verify large-v3 model is downloaded and accessible
- **Environment Variables**: Check WHISPER_EXECUTABLE_PATH and WHISPER_MODEL_PATH
- **Audio Formats**: Test with various audio formats to ensure compatibility
- **Performance**: Monitor transcription time and memory usage during debugging

**Confidence Level: 9/10** - This PRP provides comprehensive investigation tools, validation, and testing to identify and fix the root cause of empty transcription results.