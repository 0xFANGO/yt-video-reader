/**
 * SRT (SubRip) parser utility for extracting timestamps and text from subtitle files
 */

import { TranscriptionSegment } from '../types/audio.js';
import { parseSRTTimestamp } from './time.js';

/**
 * Parse SRT content into transcription segments
 */
export function parseSRTToSegments(srtContent: string): TranscriptionSegment[] {
  const segments: TranscriptionSegment[] = [];
  const srtBlocks = srtContent.split('\n\n').filter(block => block.trim());
  
  for (const block of srtBlocks) {
    const lines = block.split('\n').map(line => line.trim()).filter(line => line);
    
    if (lines.length >= 3) {
      // Skip the sequence number (first line)
      const timeLine = lines[1];
      const textLines = lines.slice(2);
      
      // Parse timestamp line: "00:01:23,456 --> 00:02:34,789"
      if (timeLine) {
        const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
        
        if (timeMatch && timeMatch[1] && timeMatch[2]) {
          const start = parseSRTTimestamp(timeMatch[1]);
          const end = parseSRTTimestamp(timeMatch[2]);
          const text = textLines.join('\n');
          
          // Only add segments with valid timestamps and text
          if (start >= 0 && end > start && text.trim()) {
            segments.push({ 
              start, 
              end, 
              text: text.trim(),
            });
          }
        }
      }
    }
  }
  
  console.log(`SRT parser: extracted ${segments.length} segments from SRT content`);
  return segments;
}

/**
 * Validate if content looks like valid SRT format
 */
export function isValidSRTContent(content: string): boolean {
  // Basic SRT format validation
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length < 3) return false;
  
  // Look for timestamp pattern in the content
  const timestampPattern = /\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/;
  return timestampPattern.test(content);
}

/**
 * Parse time range from SRT timestamp line
 */
export function parseTimeRangeFromSRT(timeLine: string): { start: number; end: number } | null {
  const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
  
  if (timeMatch && timeMatch[1] && timeMatch[2]) {
    const start = parseSRTTimestamp(timeMatch[1]);
    const end = parseSRTTimestamp(timeMatch[2]);
    
    if (start >= 0 && end > start) {
      return { start, end };
    }
  }
  
  return null;
}

/**
 * Extract text content from SRT, ignoring timestamps
 */
export function extractTextFromSRT(srtContent: string): string {
  const segments = parseSRTToSegments(srtContent);
  return segments.map(seg => seg.text).join(' ');
}

/**
 * Validate SRT segments for consistency
 */
export function validateSRTSegments(segments: TranscriptionSegment[]): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    
    if (!segment) continue;
    
    // Check for negative timestamps
    if (segment.start < 0) {
      errors.push(`Segment ${i}: negative start time (${segment.start})`);
    }
    
    if (segment.end < 0) {
      errors.push(`Segment ${i}: negative end time (${segment.end})`);
    }
    
    // Check for invalid time ranges
    if (segment.end <= segment.start) {
      errors.push(`Segment ${i}: end time (${segment.end}) must be greater than start time (${segment.start})`);
    }
    
    // Check for empty text
    if (!segment.text || segment.text.trim().length === 0) {
      warnings.push(`Segment ${i}: empty text content`);
    }
    
    // Check for overlapping segments
    if (i > 0) {
      const prevSegment = segments[i - 1];
      if (prevSegment && segment.start < prevSegment.end) {
        warnings.push(`Segment ${i}: overlaps with previous segment (${segment.start} < ${prevSegment.end})`);
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Repair SRT segments by fixing common issues
 */
export function repairSRTSegments(segments: TranscriptionSegment[]): TranscriptionSegment[] {
  const repairedSegments: TranscriptionSegment[] = [];
  
  for (let i = 0; i < segments.length; i++) {
    const originalSegment = segments[i];
    if (!originalSegment) continue;
    
    const segment = { ...originalSegment };
    
    // Fix negative timestamps
    if (segment.start < 0) {
      segment.start = 0;
    }
    
    if (segment.end < 0) {
      segment.end = segment.start + 1; // Default 1 second duration
    }
    
    // Fix invalid time ranges
    if (segment.end <= segment.start) {
      segment.end = segment.start + 1; // Default 1 second duration
    }
    
    // Fix overlapping segments
    if (i > 0) {
      const prevSegment = repairedSegments[i - 1];
      if (prevSegment && segment.start < prevSegment.end) {
        segment.start = prevSegment.end;
        
        // Ensure end is still after start
        if (segment.end <= segment.start) {
          segment.end = segment.start + 1;
        }
      }
    }
    
    // Skip segments with empty text
    if (segment.text && segment.text.trim().length > 0) {
      repairedSegments.push(segment);
    }
  }
  
  return repairedSegments;
}