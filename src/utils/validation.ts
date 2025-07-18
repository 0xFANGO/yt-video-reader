import { z } from 'zod';
import { statSync } from 'fs';
import path from 'path';

/**
 * YouTube URL validation patterns
 */
const YOUTUBE_URL_PATTERNS = [
  /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
  /^https?:\/\/(www\.)?youtu\.be\/[\w-]+/,
  /^https?:\/\/(www\.)?youtube\.com\/embed\/[\w-]+/,
  /^https?:\/\/(www\.)?youtube\.com\/v\/[\w-]+/,
  /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
];

/**
 * Validate YouTube URL
 */
export function isValidYouTubeUrl(url: string): boolean {
  return YOUTUBE_URL_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Extract video ID from YouTube URL
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /[?&]v=([^&#]*)/,
    /youtu\.be\/([^?]*)/,
    /embed\/([^?]*)/,
    /v\/([^?]*)/,
    /shorts\/([^?]*)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Validate file size
 */
export function validateFileSize(filePath: string, maxSizeGB: number = 5): boolean {
  try {
    const stats = statSync(filePath);
    const maxSizeBytes = maxSizeGB * 1024 * 1024 * 1024; // Convert GB to bytes
    return stats.size <= maxSizeBytes;
  } catch (error) {
    console.error(`Failed to validate file size for ${filePath}:`, error);
    return false;
  }
}

/**
 * Sanitize filename to prevent directory traversal
 */
export function sanitizeFilename(filename: string): string {
  // Remove path separators and dangerous characters
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '') // Remove leading dots
    .substring(0, 255); // Limit length
}

/**
 * Validate file path to prevent directory traversal
 */
export function validateFilePath(filePath: string, allowedBasePath: string): boolean {
  try {
    const resolvedPath = path.resolve(filePath);
    const resolvedBasePath = path.resolve(allowedBasePath);
    
    return resolvedPath.startsWith(resolvedBasePath);
  } catch (error) {
    console.error(`Failed to validate file path ${filePath}:`, error);
    return false;
  }
}

/**
 * Task ID validation schema
 */
export const TaskIdSchema = z.string()
  .min(1, 'Task ID is required')
  .max(100, 'Task ID too long')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Task ID contains invalid characters');

/**
 * YouTube URL validation schema
 */
export const YouTubeUrlSchema = z.string()
  .url('Must be a valid URL')
  .refine(isValidYouTubeUrl, 'Must be a valid YouTube URL');

/**
 * Language code validation schema
 */
export const LanguageCodeSchema = z.string()
  .min(2, 'Language code must be at least 2 characters')
  .max(5, 'Language code must be at most 5 characters')
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Invalid language code format')
  .optional();

/**
 * File size validation schema
 */
export const FileSizeSchema = z.number()
  .positive('File size must be positive')
  .max(5 * 1024 * 1024 * 1024, 'File size exceeds 5GB limit');

/**
 * Priority validation schema
 */
export const PrioritySchema = z.enum(['low', 'normal', 'high'])
  .default('normal');

/**
 * Validate environment variables
 */
export function validateEnvironment(): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Required environment variables
  const requiredVars = [
    'REDIS_URL',
    'OPENAI_API_KEY',
    'STORAGE_PATH',
    'WHISPER_EXECUTABLE_PATH',
    'WHISPER_MODEL_PATH',
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  // Validate whisper executable path
  if (process.env.WHISPER_EXECUTABLE_PATH) {
    try {
      const stats = statSync(process.env.WHISPER_EXECUTABLE_PATH);
      if (!stats.isFile()) {
        errors.push('WHISPER_EXECUTABLE_PATH is not a file');
      }
    } catch (error) {
      errors.push('WHISPER_EXECUTABLE_PATH does not exist');
    }
  }

  // Validate whisper model path
  if (process.env.WHISPER_MODEL_PATH) {
    try {
      const stats = statSync(process.env.WHISPER_MODEL_PATH);
      if (!stats.isFile()) {
        errors.push('WHISPER_MODEL_PATH is not a file');
      }
    } catch (error) {
      errors.push('WHISPER_MODEL_PATH does not exist');
    }
  }

  // Validate numeric environment variables
  const numericVars = [
    'DOWNLOAD_CONCURRENCY',
    'TRANSCRIPTION_CONCURRENCY',
    'CLEANUP_INTERVAL_HOURS',
    'MAX_FILE_SIZE_GB',
  ];

  for (const varName of numericVars) {
    const value = process.env[varName];
    if (value && isNaN(parseInt(value))) {
      errors.push(`${varName} must be a valid number`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate task processing options
 */
export const TaskOptionsSchema = z.object({
  language: LanguageCodeSchema,
  priority: PrioritySchema,
}).optional();

/**
 * Validate file upload
 */
export function validateFileUpload(file: {
  name: string;
  size: number;
  type: string;
}): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate file name
  if (!file.name || file.name.length === 0) {
    errors.push('File name is required');
  } else if (file.name.length > 255) {
    errors.push('File name is too long');
  }

  // Validate file size (5GB limit)
  if (file.size > 5 * 1024 * 1024 * 1024) {
    errors.push('File size exceeds 5GB limit');
  }

  // Validate file type (if needed)
  const allowedTypes = [
    'video/mp4',
    'video/avi',
    'video/mkv',
    'video/mov',
    'video/wmv',
    'video/flv',
    'video/webm',
  ];

  if (file.type && !allowedTypes.includes(file.type)) {
    errors.push(`File type ${file.type} is not supported`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate video duration
 */
export function validateVideoDuration(duration: number): boolean {
  // Maximum 4 hours (14400 seconds)
  const maxDuration = 4 * 60 * 60;
  return duration > 0 && duration <= maxDuration;
}

/**
 * Rate limiting validation
 */
export function validateRateLimit(
  requests: number,
  windowMs: number,
  maxRequests: number
): boolean {
  return requests <= maxRequests;
}

/**
 * Input sanitization for logs
 */
export function sanitizeForLog(input: string): string {
  // Remove potentially sensitive information
  return input
    .replace(/sk-[a-zA-Z0-9]+/g, 'sk-***')
    .replace(/Bearer\s+[a-zA-Z0-9]+/g, 'Bearer ***')
    .replace(/password=[^&\s]+/g, 'password=***')
    .replace(/token=[^&\s]+/g, 'token=***');
}