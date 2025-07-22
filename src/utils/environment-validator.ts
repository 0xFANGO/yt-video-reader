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