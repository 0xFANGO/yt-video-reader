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