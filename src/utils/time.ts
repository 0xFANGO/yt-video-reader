/**
 * Time utility functions for timestamp conversion and formatting
 */

/**
 * Convert seconds to HH:MM:SS timestamp format
 */
export function secondsToTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * Convert seconds to MM:SS timestamp format (for shorter videos)
 */
export function secondsToShortTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Convert HH:MM:SS or MM:SS timestamp to seconds
 */
export function timestampToSeconds(timestamp: string): number {
  const parts = timestamp.split(':').map(Number);
  if (parts.length === 3 && parts[0] !== undefined && parts[1] !== undefined && parts[2] !== undefined) {
    // HH:MM:SS format
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2 && parts[0] !== undefined && parts[1] !== undefined) {
    // MM:SS format
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

/**
 * Parse SRT timestamp format (HH:MM:SS,mmm) to seconds
 */
export function parseSRTTimestamp(srtTimestamp: string): number {
  // Format: "00:01:23,456" -> 83.456 seconds
  const [time, milliseconds] = srtTimestamp.split(',');
  if (!time) return 0;
  
  const [hours, minutes, seconds] = time.split(':').map(Number);
  if (hours === undefined || minutes === undefined || seconds === undefined) return 0;
  
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  const millis = milliseconds ? Number(milliseconds) / 1000 : 0;
  
  return totalSeconds + millis;
}

/**
 * Convert seconds to SRT timestamp format (HH:MM:SS,mmm)
 */
export function secondsToSRTTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${millis.toString().padStart(3, '0')}`;
}

/**
 * Validate if a timestamp string is in valid format
 */
export function isValidTimestamp(timestamp: string): boolean {
  const patterns = [
    /^\d{1,2}:\d{2}$/,           // MM:SS
    /^\d{1,2}:\d{2}:\d{2}$/,     // HH:MM:SS or MM:MM:SS
    /^\d{2}:\d{2}:\d{2},\d{3}$/, // SRT format HH:MM:SS,mmm
  ];
  
  return patterns.some(pattern => pattern.test(timestamp));
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
}

/**
 * Parse time range string (e.g., "1:30-3:45") to start and end seconds
 */
export function parseTimeRange(timeRange: string): { start: number; end: number } | null {
  const match = timeRange.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–]\s*(\d{1,2}:\d{2}(?::\d{2})?)$/);
  
  if (match && match[1] && match[2]) {
    const start = timestampToSeconds(match[1]);
    const end = timestampToSeconds(match[2]);
    return { start, end };
  }
  
  return null;
}