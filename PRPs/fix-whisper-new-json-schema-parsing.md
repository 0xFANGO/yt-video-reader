# PRP: Fix Whisper Transcription Bug - Support New JSON Schema Format

## Problem Statement

**Critical Bug**: The system fails during transcription processing with the error "Whisper transcription returned empty results. Text length: 0, Segments: 0, Duration: 0s", even though the generated `transcription.json` file contains complete subtitle information. This occurs because the current parsing logic only handles the legacy Whisper-cpp JSON format, but newer versions use a different schema.

## Root Cause Analysis

### Current Implementation Issues

1. **Legacy Format Assumption**: The `parseWhisperOutput` function in `src/types/audio.ts:107-192` expects this structure:
```json
{
  "text": "full transcript",
  "segments": [...],
  "duration": 123.45,
  "language": "en"
}
```

2. **New Format Reality**: Modern Whisper-cpp (≥v1.6) outputs this structure:
```json
{
  "model": {...},
  "params": {...},
  "result": {"language": "en"},
  "transcription": [
    {
      "timestamps": {"from": "00:00:00,000", "to": "00:00:00,170"},
      "offsets": {"from": 0, "to": 170},
      "text": "actual content"
    }
  ]
}
```

3. **Overly Strict Validation**: `src/utils/whisper-cli.ts:170` throws when EITHER `text` OR `segments` is empty, but should only fail when BOTH are empty.

### Failure Point

The parsing fails at `src/types/audio.ts:115-129` where it looks for `jsonResult.text` and `jsonResult.segments`, but these don't exist in the new format. The function then falls back to plain text parsing, which also fails because the input is valid JSON (not plain text).

## Solution Design

### Core Implementation Strategy

1. **Multi-Format Parser**: Enhance `parseWhisperOutput` to handle both legacy and new schemas
2. **Robust Timestamp Conversion**: Support both `offsets` (milliseconds) and `timestamps` (HH:MM:SS,mmm) formats
3. **Relaxed Validation**: Only fail when both text AND segments are truly empty
4. **Comprehensive Testing**: Cover all format variations and edge cases

### Technical Approach

```typescript
// New parsing branch in parseWhisperOutput
if (Array.isArray(jsonResult.transcription)) {
  // Handle new format: {transcription: [...]}
  const segments = jsonResult.transcription.map((item: any) => {
    const start = convertToSeconds(item.offsets?.from, item.timestamps?.from);
    const end = convertToSeconds(item.offsets?.to, item.timestamps?.to);
    return { start, end, text: item.text?.trim() || '' };
  }).filter(seg => seg.text); // Remove empty segments
  
  const text = segments.map(seg => seg.text).join(' ').trim();
  const duration = segments.length > 0 ? segments[segments.length - 1].end : 0;
  
  return {
    text,
    segments,
    language: jsonResult.result?.language || 'auto',
    duration,
    modelUsed: 'large-v3'
  };
}
```

## Implementation Plan

### Phase 1: Core Parser Enhancement
**File**: `src/types/audio.ts`

1. **Add New Format Detection** (lines 115-121):
   - Detect `json.transcription` array
   - Branch to new parsing logic

2. **Implement Timestamp Conversion**:
```typescript
function convertToSeconds(offsetMs?: number, timestamp?: string): number {
  if (typeof offsetMs === 'number') {
    return offsetMs / 1000;
  }
  if (typeof timestamp === 'string') {
    // Parse "HH:MM:SS,mmm" format
    const match = timestamp.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
    if (match) {
      const [, h, m, s, ms] = match;
      return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
    }
  }
  return 0;
}
```

3. **Build Segments Array**:
   - Convert transcription entries to `TranscriptionSegment[]`
   - Filter out empty text segments
   - Ensure timestamps are valid numbers

4. **Aggregate Full Text**:
   - Join segment texts with single space
   - Trim whitespace from final result

### Phase 2: Validation Logic Fix
**File**: `src/utils/whisper-cli.ts`

**Change Line 170** from:
```typescript
if (!transcriptionResult.text?.trim() || transcriptionResult.segments.length === 0) {
```

**To**:
```typescript
if (!transcriptionResult.text?.trim() && transcriptionResult.segments.length === 0) {
```

**Update Error Message** to reflect both conditions must be true.

### Phase 3: Comprehensive Testing
**File**: `tests/unit/types/parseWhisperOutput-new-format.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { parseWhisperOutput } from '../../../src/types/audio.js';

describe('parseWhisperOutput - New Format Support', () => {
  it('should parse new transcription array format', () => {
    const newFormatJson = {
      model: { type: "large" },
      params: { language: "auto" },
      result: { language: "en" },
      transcription: [
        {
          timestamps: { from: "00:00:00,000", to: "00:00:01,500" },
          offsets: { from: 0, to: 1500 },
          text: "Hello world"
        },
        {
          timestamps: { from: "00:00:01,500", to: "00:00:03,000" },
          offsets: { from: 1500, to: 3000 },
          text: "This is a test"
        }
      ]
    };

    const result = parseWhisperOutput(JSON.stringify(newFormatJson));
    
    expect(result.text).toBe('Hello world This is a test');
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toEqual({
      start: 0,
      end: 1.5,
      text: 'Hello world'
    });
    expect(result.duration).toBe(3.0);
    expect(result.language).toBe('en');
  });

  it('should handle offsets-only format', () => {
    const offsetsOnlyJson = {
      transcription: [
        {
          offsets: { from: 2000, to: 4500 },
          text: "Testing offsets"
        }
      ]
    };

    const result = parseWhisperOutput(JSON.stringify(offsetsOnlyJson));
    
    expect(result.segments[0]).toEqual({
      start: 2.0,
      end: 4.5,
      text: 'Testing offsets'
    });
  });

  it('should handle timestamps-only format', () => {
    const timestampsOnlyJson = {
      transcription: [
        {
          timestamps: { from: "00:00:05,250", to: "00:00:07,750" },
          text: "Testing timestamps"
        }
      ]
    };

    const result = parseWhisperOutput(JSON.stringify(timestampsOnlyJson));
    
    expect(result.segments[0]).toEqual({
      start: 5.25,
      end: 7.75,
      text: 'Testing timestamps'
    });
  });
});
```

### Phase 4: Enhanced Validation Tests
**File**: `tests/unit/services/transcriber-validation-enhanced.test.ts`

Test scenarios:
- Valid text with empty segments (should pass)
- Empty text with valid segments (should pass)  
- Both empty (should fail)
- New format with complete data (should pass)

### Phase 5: Integration Validation

1. **Type Checking**: `npm run type-check`
2. **Linting**: `npm run lint`
3. **Unit Tests**: `npm run test:unit`
4. **Integration Tests**: `npm run test:integration`

## Risk Mitigation

### Backward Compatibility
- **Preserve Legacy Support**: Keep existing parsing logic for old format
- **Graceful Fallback**: Maintain plain-text parsing as final fallback
- **Progressive Enhancement**: New format detection doesn't break existing flows

### Error Handling
- **Robust Timestamp Parsing**: Handle malformed timestamp strings gracefully
- **Empty Segment Filtering**: Remove segments with no text content
- **Zero Duration Handling**: Calculate duration from segments when missing

### Testing Coverage
- **Format Variations**: Test all timestamp format combinations
- **Edge Cases**: Empty arrays, malformed JSON, missing fields
- **Real Data**: Use fixture from actual failing task

## Success Criteria

### Functional Requirements
✅ Parse new Whisper-cpp JSON format with `transcription` array  
✅ Convert both `offsets` and `timestamps` to seconds correctly  
✅ Build valid `TranscriptionResult` with text, segments, and duration  
✅ Maintain backward compatibility with legacy format  
✅ Pass validation when text OR segments exist (not requiring both)  

### Quality Gates
✅ All existing tests continue to pass  
✅ New tests achieve >95% coverage for parsing logic  
✅ TypeScript compilation succeeds without errors  
✅ ESLint passes with no violations  
✅ Integration test with real transcription.json succeeds  

### Performance Requirements
✅ Parsing performance remains sub-100ms for typical files  
✅ Memory usage stays within existing bounds  
✅ No regression in transcription pipeline throughput  

## Implementation Context

### Key Files and Locations
- **Parser Logic**: `src/types/audio.ts:107-192` (parseWhisperOutput function)
- **Validation Logic**: `src/utils/whisper-cli.ts:170` (empty result check)  
- **Type Definitions**: `src/types/audio.ts:22-40` (TranscriptionSegment, TranscriptionResult)
- **Test Fixtures**: `tests/fixtures/` (add new-format examples)
- **Existing Tests**: `tests/unit/services/transcriber-empty-results.test.ts`

### Testing Framework
- **Test Runner**: Vitest (`npm run test`)
- **Mocking**: `vi.mock()` for whisperCLI
- **Assertions**: Standard Jest/Vitest matchers (`expect().toBe()`)
- **Setup**: `tests/setup.ts` handles environment configuration

### Dependencies and References
- **Whisper.cpp Documentation**: https://github.com/ggerganov/whisper.cpp/issues/2571
- **JSON Format Examples**: Real transcription.json from `/Users/fengge/coding/yt-video-reader/data/task_mde25oh9_494zfx/transcription.json`
- **Remotion Transcribe Docs**: https://www.remotion.dev/docs/install-whisper-cpp/transcribe

### Validation Commands
```bash
# Full validation pipeline
npm run type-check    # TypeScript validation
npm run lint         # ESLint validation  
npm run test:unit    # Unit test validation
npm run test        # Full test suite

# Specific test runs
npm run test tests/unit/types/parseWhisperOutput-new-format.test.ts
npm run test tests/unit/services/transcriber-empty-results.test.ts
```

## Confidence Assessment

**Implementation Confidence: 9/10**

**High Confidence Factors**:
- Clear root cause identified with specific failing lines
- Real failing data available for testing (transcription.json)  
- Well-established testing patterns in codebase
- Backward compatibility preserved through additive changes
- Comprehensive validation pipeline exists

**Risk Factors**:
- Timestamp format variations might have edge cases
- Integration with broader pipeline needs validation

This PRP provides comprehensive context for a single-pass implementation success using Claude Code, with specific file locations, real code examples, and executable validation steps.