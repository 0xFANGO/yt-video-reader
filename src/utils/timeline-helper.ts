import { TranscriptionResult, TranscriptionSegment } from '../types/audio.js';

/**
 * Timeline segment for heuristic construction
 */
export interface TimelineSegment {
  startTime: number;
  endTime: number;
  text: string;
  title?: string;
}

/**
 * Timeline construction options
 */
export interface TimelineOptions {
  targetSegmentDuration: number; // Target duration in seconds (60-120s)
  minSegmentDuration: number;    // Minimum duration in seconds (30s)
  maxSegmentDuration: number;    // Maximum duration in seconds (180s)
}

/**
 * Default timeline construction options
 */
export const DEFAULT_TIMELINE_OPTIONS: TimelineOptions = {
  targetSegmentDuration: 90,  // 1.5 minutes
  minSegmentDuration: 30,     // 30 seconds
  maxSegmentDuration: 180,    // 3 minutes
};

/**
 * Timeline helper utility for creating semantic video segments
 */
export class TimelineHelper {
  private options: TimelineOptions;

  constructor(options: Partial<TimelineOptions> = {}) {
    this.options = { ...DEFAULT_TIMELINE_OPTIONS, ...options };
  }

  /**
   * Create timeline segments from transcription using heuristic approach
   */
  createTimelineSegments(transcription: TranscriptionResult): TimelineSegment[] {
    if (!transcription.segments || transcription.segments.length === 0) {
      // Fallback: create single segment from full text
      return [{
        startTime: 0,
        endTime: transcription.duration || 0,
        text: transcription.text,
        title: '片段 1'
      }];
    }

    const segments = this.groupSegmentsByDuration(transcription.segments);
    return this.assignFallbackTitles(segments);
  }

  /**
   * Group transcription segments into meaningful chunks based on duration
   */
  private groupSegmentsByDuration(segments: TranscriptionSegment[]): TimelineSegment[] {
    const timelineSegments: TimelineSegment[] = [];
    let currentSegment: TimelineSegment | null = null;

    for (const segment of segments) {
      if (!currentSegment) {
        // Start new segment
        currentSegment = {
          startTime: segment.start,
          endTime: segment.end,
          text: segment.text,
        };
      } else {
        const currentDuration = currentSegment.endTime - currentSegment.startTime;
        const potentialDuration = segment.end - currentSegment.startTime;

        // Check if we should extend current segment or start new one
        if (this.shouldStartNewSegment(currentDuration, potentialDuration, segment.text)) {
          // Finalize current segment and start new one
          timelineSegments.push(currentSegment);
          currentSegment = {
            startTime: segment.start,
            endTime: segment.end,
            text: segment.text,
          };
        } else {
          // Extend current segment
          currentSegment.endTime = segment.end;
          currentSegment.text += ' ' + segment.text;
        }
      }
    }

    // Add the last segment
    if (currentSegment) {
      timelineSegments.push(currentSegment);
    }

    return timelineSegments;
  }

  /**
   * Determine if we should start a new segment based on heuristics
   */
  private shouldStartNewSegment(
    currentDuration: number,
    potentialDuration: number,
    nextText: string
  ): boolean {
    // Force new segment if we exceed maximum duration
    if (potentialDuration > this.options.maxSegmentDuration) {
      return true;
    }

    // Don't create new segment if we haven't reached minimum duration
    if (currentDuration < this.options.minSegmentDuration) {
      return false;
    }

    // Check for natural break indicators
    if (this.hasNaturalBreak(nextText)) {
      return currentDuration >= this.options.minSegmentDuration;
    }

    // Start new segment if we've reached target duration
    return currentDuration >= this.options.targetSegmentDuration;
  }

  /**
   * Detect natural break indicators in text
   */
  private hasNaturalBreak(text: string): boolean {
    const breakIndicators = [
      // English patterns
      /^(so|now|next|first|second|third|finally|in conclusion|let me|today)/i,
      /^(the (first|second|third|next|final))/i,
      /^(story|point|question|thing|part)/i,
      
      // Chinese patterns
      /^(那么|现在|接下来|首先|其次|第三|最后|让我|今天)/,
      /^(第[一二三四五六七八九十]+个?)/,
      /^(故事|要点|问题|事情|部分)/,
      
      // Universal patterns
      /^(chapter|section|part \d+)/i,
      /^\d+[.、]/,  // Numbered points
    ];

    return breakIndicators.some(pattern => pattern.test(text.trim()));
  }

  /**
   * Assign fallback titles when AI doesn't provide meaningful ones
   */
  private assignFallbackTitles(segments: TimelineSegment[]): TimelineSegment[] {
    return segments.map((segment, index) => {
      if (!segment.title) {
        segment.title = `片段 ${index + 1}`;
      }
      return segment;
    });
  }

  /**
   * Format timeline segments for AI prompt
   */
  formatSegmentsForPrompt(segments: TimelineSegment[]): string {
    return segments.map((segment, index) => {
      const startTime = this.formatTime(segment.startTime);
      const endTime = this.formatTime(segment.endTime);
      const excerpt = segment.text.substring(0, 100) + (segment.text.length > 100 ? '...' : '');
      
      return `${index + 1}. [${startTime}-${endTime}] ${excerpt}`;
    }).join('\n');
  }

  /**
   * Format time in MM:SS format
   */
  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Validate timeline segments from AI response
   */
  validateTimelineSegments(
    aiTimeline: any[],
    originalSegments: TimelineSegment[]
  ): TimelineSegment[] {
    if (!Array.isArray(aiTimeline)) {
      return this.assignFallbackTitles(originalSegments);
    }

    const validatedSegments: TimelineSegment[] = [];

    for (let i = 0; i < originalSegments.length; i++) {
      const original = originalSegments[i];
      if (!original) continue;
      
      const aiSegment = aiTimeline[i];

      if (aiSegment && typeof aiSegment.title === 'string' && aiSegment.title.trim()) {
        validatedSegments.push({
          startTime: original.startTime,
          endTime: original.endTime,
          text: original.text,
          title: aiSegment.title.trim()
        });
      } else {
        validatedSegments.push({
          startTime: original.startTime,
          endTime: original.endTime,
          text: original.text,
          title: `片段 ${i + 1}`
        });
      }
    }

    return validatedSegments;
  }

  /**
   * Convert timeline segments to the format expected by SummaryResult
   */
  convertToSummaryTimeline(segments: TimelineSegment[]): Array<{start: string; end: string; title: string}> {
    return segments.map(segment => ({
      start: this.formatTime(segment.startTime),
      end: this.formatTime(segment.endTime),
      title: segment.title || `片段 ${segments.indexOf(segment) + 1}`
    }));
  }

  /**
   * Analyze content for better segmentation hints
   */
  analyzeContentStructure(text: string): {
    hasNumberedPoints: boolean;
    hasChapters: boolean;
    hasClearTransitions: boolean;
    estimatedSegments: number;
  } {
    const numberedPointsRegex = /^\d+[.、]|第[一二三四五六七八九十]+[个、]?/gm;
    const chapterRegex = /chapter|section|part|章节|第.+章|第.+节/gi;
    const transitionRegex = /so|now|next|那么|现在|接下来|然后|另外/gi;

    const numberedPoints = text.match(numberedPointsRegex) || [];
    const chapters = text.match(chapterRegex) || [];
    const transitions = text.match(transitionRegex) || [];

    const estimatedSegments = Math.max(
      numberedPoints.length,
      chapters.length,
      Math.ceil(transitions.length / 2),
      3 // Minimum 3 segments
    );

    return {
      hasNumberedPoints: numberedPoints.length > 0,
      hasChapters: chapters.length > 0,
      hasClearTransitions: transitions.length > 2,
      estimatedSegments: Math.min(estimatedSegments, 8) // Maximum 8 segments
    };
  }
}

/**
 * Default timeline helper instance
 */
export const timelineHelper = new TimelineHelper();