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