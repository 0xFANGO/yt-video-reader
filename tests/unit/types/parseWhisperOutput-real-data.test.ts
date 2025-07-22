import { describe, it, expect } from 'vitest';
import { parseWhisperOutput } from '../../../src/types/audio.js';
import { readFileSync } from 'fs';
import path from 'path';

describe('parseWhisperOutput - Real Data Test', () => {
  it('should parse the actual failing transcription.json from task_mde25oh9_494zfx', () => {
    // Read the actual failing transcription.json file
    const transcriptionPath = path.join(process.cwd(), 'data/task_mde25oh9_494zfx/transcription.json');
    const jsonContent = readFileSync(transcriptionPath, 'utf-8');
    
    // This should now succeed with our new format support
    const result = parseWhisperOutput(jsonContent);
    
    // Verify the result is valid and not empty
    expect(result).toBeDefined();
    expect(result.text).toBeDefined();
    expect(result.segments).toBeDefined();
    expect(result.language).toBeDefined();
    expect(result.duration).toBeDefined();
    
    // The result should have content (not empty)
    expect(result.text.length > 0 || result.segments.length > 0).toBe(true);
    
    // Log the parsed result for debugging
    console.log('✅ Real data parsing results:');
    console.log(`  Text length: ${result.text.length}`);
    console.log(`  Segments count: ${result.segments.length}`);
    console.log(`  Duration: ${result.duration}s`);
    console.log(`  Language: ${result.language}`);
    console.log(`  Model: ${result.modelUsed}`);
    
    if (result.text.length > 0) {
      console.log(`  Text preview: "${result.text.substring(0, 100)}..."`);
    }
    
    if (result.segments.length > 0) {
      console.log(`  First segment: ${JSON.stringify(result.segments[0])}`);
      console.log(`  Last segment: ${JSON.stringify(result.segments[result.segments.length - 1])}`);
    }
    
    // This test should pass, proving our fix works
    expect(result.text.length > 0 || result.segments.length > 0).toBe(true);
  });

  it('should handle the new format structure correctly', () => {
    const transcriptionPath = path.join(process.cwd(), 'data/task_mde25oh9_494zfx/transcription.json');
    const jsonContent = readFileSync(transcriptionPath, 'utf-8');
    const jsonData = JSON.parse(jsonContent);
    
    // Verify this is indeed the new format
    expect(Array.isArray(jsonData.transcription)).toBe(true);
    expect(jsonData.transcription.length).toBeGreaterThan(0);
    
    // Check the structure of transcription entries
    const firstEntry = jsonData.transcription[0];
    expect(firstEntry).toHaveProperty('timestamps');
    expect(firstEntry).toHaveProperty('offsets');
    expect(firstEntry).toHaveProperty('text');
    
    // Parse it
    const result = parseWhisperOutput(jsonContent);
    
    // Should successfully create segments from the transcription array
    expect(result.segments.length).toBeGreaterThan(0);
    
    // Duration should be calculated from segments
    expect(result.duration).toBeGreaterThan(0);
    
    // Language should be extracted from result.language
    expect(result.language).toBe(jsonData.result?.language || 'auto');
  });
});