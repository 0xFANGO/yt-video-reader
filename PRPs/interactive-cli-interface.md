# Interactive CLI Interface for YouTube Video Processor

## Goal
Build a comprehensive interactive Command Line Interface (CLI) that provides a user-friendly terminal experience for YouTube video processing with real-time progress monitoring, task management, and intuitive controls. The CLI should connect to the existing tRPC API and provide a seamless alternative to manual curl commands.

## Why
- **User Experience**: Replace complex curl commands with intuitive menu-driven interface
- **Real-time Feedback**: Visual progress bars and live status updates during video processing
- **Task Management**: Easy monitoring and management of multiple concurrent video processing tasks
- **Developer Productivity**: Streamlined workflow for testing and using the video processing system
- **Accessibility**: Lower barrier to entry for non-technical users

## What
A full-featured CLI application that provides:
- Interactive menu system with numbered options
- YouTube URL input with real-time validation
- Live progress bars for each processing stage (download, extract, transcribe, summarize)
- Task status dashboard showing all active/completed tasks
- File browser for accessing generated transcripts and summaries
- Settings configuration for processing options (model, language, priority)
- Error handling with clear, actionable messages

### Success Criteria
- [ ] CLI starts in <2 seconds with welcoming interface
- [ ] Successfully processes videos with real-time progress updates
- [ ] Handles errors gracefully with helpful messages
- [ ] Provides intuitive navigation between all features
- [ ] Connects seamlessly to existing tRPC API
- [ ] Task completion rate >95% with clear user feedback
- [ ] All validation commands pass without errors

## All Needed Context

### Documentation & References
```yaml
# MUST READ - Include these in your context window
- url: https://www.npmjs.com/package/inquirer
  why: Interactive prompts, menu system, input validation patterns
  
- url: https://www.npmjs.com/package/@inquirer/prompts  
  why: New Inquirer API for modern async/await patterns
  
- url: https://www.npmjs.com/package/cli-progress
  why: Progress bar implementation, multi-bar support, customization
  
- url: https://www.npmjs.com/package/chalk
  why: Terminal colors and styling, chaining API
  
- url: https://www.npmjs.com/package/cli-table3
  why: Table formatting for task status displays
  
- url: https://www.npmjs.com/package/log-symbols
  why: Status icons (✓, ✗, ⚠, ℹ) for different log levels
  
- url: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
  why: SSE client implementation for real-time updates
  
- file: src/api/tasks.ts
  why: Existing tRPC API patterns, task creation/status endpoints
  
- file: src/types/api.ts
  why: Type definitions for API requests/responses, Zod schemas
  
- file: src/utils/validation.ts
  why: YouTube URL validation patterns, error handling
  
- file: tests/unit/utils/validation.test.ts
  why: Testing patterns for validation logic
  
- file: package.json
  why: Current dependencies, scripts structure, ES modules setup
```

### Current Codebase Structure
```bash
yt-video-reader/
├── src/
│   ├── api/                    # tRPC routers
│   │   ├── tasks.ts           # Task management endpoints
│   │   ├── events.ts          # SSE event management
│   │   ├── files.ts           # File download endpoints
│   │   └── index.ts           # Main router
│   ├── types/                 # TypeScript definitions
│   │   ├── api.ts             # API request/response types
│   │   ├── task.ts            # Task status and manifest types
│   │   └── audio.ts           # Audio processing types
│   ├── utils/                 # Shared utilities
│   │   ├── validation.ts      # URL validation, sanitization
│   │   ├── file-manager.ts    # File operations
│   │   └── queue-config.ts    # BullMQ configuration
│   └── index.ts               # Server entry point
├── tests/                     # Test files mirroring src/
└── package.json               # Node.js dependencies
```

### Desired Codebase Structure (CLI Addition)
```bash
yt-video-reader/
├── src/
│   ├── cli/                   # NEW: CLI implementation
│   │   ├── index.ts          # CLI entry point and main menu
│   │   ├── client.ts         # tRPC client for API communication
│   │   ├── commands/         # Individual command implementations
│   │   │   ├── process-video.ts    # Video processing workflow
│   │   │   ├── view-tasks.ts       # Task management interface
│   │   │   ├── browse-files.ts     # File browser
│   │   │   └── settings.ts         # Configuration management
│   │   ├── ui/               # User interface components
│   │   │   ├── menu.ts            # Menu system with inquirer
│   │   │   ├── progress.ts        # Progress bars and status
│   │   │   ├── tables.ts          # Task status tables
│   │   │   └── prompts.ts         # Custom input prompts
│   │   └── utils/            # CLI-specific utilities
│   │       ├── sse-client.ts      # Server-sent events client
│   │       ├── formatters.ts      # Output formatting
│   │       └── config.ts          # CLI configuration
│   └── bin/                  # NEW: CLI executable
│       └── yt-cli.ts         # Executable script
├── tests/cli/                # NEW: CLI tests
│   ├── commands/
│   ├── ui/
│   └── utils/
└── package.json              # Updated with CLI dependencies
```

### Known Gotchas & Library Quirks
```typescript
// CRITICAL: Project uses ES modules (type: "module" in package.json)
// All imports must use .js extensions even for .ts files
import { something } from './file.js';  // ✓ Correct
import { something } from './file';     // ✗ Fails

// CRITICAL: Inquirer.js v9+ is ESM only, use modern API
import { input, select, confirm } from '@inquirer/prompts';  // ✓ New API
const inquirer = require('inquirer');  // ✗ Old CommonJS pattern

// CRITICAL: tRPC client requires proper initialization with baseURL
const client = createTRPCProxyClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })],
});

// CRITICAL: SSE client in Node.js requires polyfill or fetch API
// Use Node.js built-in fetch (available since v18)
const response = await fetch('http://localhost:3000/api/events/stream');

// CRITICAL: cli-progress requires TTY detection for proper rendering
if (process.stdout.isTTY) {
  // Safe to use progress bars
} else {
  // Fallback to simple text output
}

// CRITICAL: chalk v5+ is ESM only, use import syntax
import chalk from 'chalk';  // ✓ Correct
const chalk = require('chalk');  // ✗ Fails in ESM

// CRITICAL: log-symbols v7+ is ESM only
import logSymbols from 'log-symbols';  // ✓ Correct
```

## Implementation Blueprint

### Data Models and Structure
```typescript
// CLI Configuration types
interface CLIConfig {
  defaultLanguage: string;
  defaultPriority: 'low' | 'normal' | 'high';
  apiBaseUrl: string;
  maxConcurrentTasks: number;
  autoOpenFiles: boolean;
}

// Progress tracking for CLI
interface CLITaskProgress {
  taskId: string;
  status: TaskStatus;
  progress: number;
  currentStep: string;
  startTime: Date;
  eta?: number;
}

// Menu options for main interface
type MenuOption = 'process-video' | 'view-tasks' | 'browse-files' | 'settings' | 'exit';

// File browser item
interface FileItem {
  name: string;
  path: string;
  size: number;
  type: 'transcript' | 'summary' | 'audio' | 'video';
  createdAt: Date;
}
```

### Task List (Implementation Order)

```yaml
Task 1: Setup CLI Dependencies
MODIFY package.json:
  - ADD dependencies: @inquirer/prompts, cli-progress, chalk, cli-table3, log-symbols
  - ADD bin field: {"yt-cli": "dist/bin/yt-cli.js"}
  - ADD scripts: "cli": "tsx src/bin/yt-cli.ts", "build:cli": "tsc && chmod +x dist/bin/yt-cli.js"

Task 2: Create CLI Entry Point  
CREATE src/bin/yt-cli.ts:
  - PATTERN: executable shebang #!/usr/bin/env node
  - IMPORT main CLI function
  - HANDLE process.exit and error catching
  - MIRROR pattern from existing executable scripts

Task 3: Build tRPC Client for CLI
CREATE src/cli/client.ts:
  - PATTERN: Use @trpc/client with httpBatchLink
  - IMPORT types from src/types/api.ts
  - IMPLEMENT connection testing and error handling
  - REUSE existing AppRouter type from src/api/index.ts

Task 4: Create Main Menu System
CREATE src/cli/ui/menu.ts:
  - PATTERN: Use @inquirer/prompts select()
  - IMPLEMENT main menu with 5 options
  - ADD welcome message with chalk styling
  - HANDLE keyboard navigation and exit

Task 5: Implement Video Processing Command
CREATE src/cli/commands/process-video.ts:
  - PATTERN: Use input() for URL, select() for options
  - VALIDATE URL using existing isValidYouTubeUrl()
  - CALL client.tasks.create.mutate()
  - INITIATE progress monitoring

Task 6: Build Progress Monitoring System
CREATE src/cli/ui/progress.ts:
  - PATTERN: Use cli-progress.MultiBar for multiple stages
  - IMPLEMENT SSE client for real-time updates
  - ADD eta calculation and time formatting
  - HANDLE progress bar cleanup on completion

Task 7: Create SSE Client
CREATE src/cli/utils/sse-client.ts:
  - PATTERN: Use fetch() with getReader()
  - IMPLEMENT automatic reconnection logic
  - PARSE event data and emit to progress system
  - HANDLE connection errors gracefully

Task 8: Build Task Management Interface
CREATE src/cli/commands/view-tasks.ts:
  - PATTERN: Use cli-table3 for task status display
  - FETCH task list via client.tasks.getStatus()
  - IMPLEMENT task filtering and sorting
  - ADD task actions (retry, delete, view details)

Task 9: Create File Browser
CREATE src/cli/commands/browse-files.ts:
  - PATTERN: Use inquirer select() for file navigation
  - FETCH file list via client.files.list()
  - IMPLEMENT file preview and download options
  - ADD file type icons with log-symbols

Task 10: Build Settings Management
CREATE src/cli/commands/settings.ts:
  - PATTERN: Use inquirer form-style prompts
  - IMPLEMENT config file persistence (~/.yt-cli-config.json)
  - ADD validation for all settings
  - PROVIDE reset to defaults option

Task 11: Add Output Formatters
CREATE src/cli/utils/formatters.ts:
  - PATTERN: Use chalk for consistent color scheme
  - IMPLEMENT table formatters for different data types
  - ADD error message formatting with log-symbols
  - CREATE time/duration formatting utilities

Task 12: Create CLI Configuration
CREATE src/cli/utils/config.ts:
  - PATTERN: JSON file in user home directory
  - IMPLEMENT load/save/validate config functions
  - ADD environment variable overrides
  - PROVIDE sensible defaults for all options

Task 13: Build Main CLI Orchestrator
CREATE src/cli/index.ts:
  - PATTERN: async main() with proper error handling
  - IMPLEMENT menu loop with command routing
  - ADD signal handlers for graceful shutdown
  - INTEGRATE all command modules

Task 14: Add CLI-Specific Error Handling
MODIFY src/cli/utils/error-handling.ts:
  - PATTERN: Catch and format tRPC errors
  - IMPLEMENT user-friendly error messages
  - ADD troubleshooting suggestions
  - LOG errors for debugging while showing clean UI

Task 15: Create Comprehensive CLI Tests
CREATE tests/cli/ directory:
  - PATTERN: Mock inquirer prompts and tRPC client
  - TEST all command flows and error cases
  - ADD integration tests with mock server
  - VALIDATE CLI configuration handling
```

### Pseudocode for Key Components

```typescript
// Task 13: Main CLI Flow
async function main() {
  // PATTERN: Initialize config and client
  const config = await loadConfig();
  const client = createTRPCClient(config.apiBaseUrl);
  
  // PATTERN: Test connection before starting
  try {
    await client.health.check.query();
  } catch (error) {
    console.error(chalk.red('✗ Cannot connect to server'));
    process.exit(1);
  }
  
  // PATTERN: Main menu loop
  while (true) {
    const choice = await showMainMenu();
    
    switch (choice) {
      case 'process-video':
        await processVideoCommand(client);
        break;
      case 'view-tasks':
        await viewTasksCommand(client);
        break;
      // ... other commands
      case 'exit':
        return;
    }
  }
}

// Task 5: Video Processing with Progress
async function processVideoCommand(client: TRPCClient) {
  // PATTERN: Collect input with validation
  const url = await input({
    message: 'Enter YouTube URL:',
    validate: (input) => isValidYouTubeUrl(input) || 'Invalid YouTube URL'
  });
  
  const options = await collectProcessingOptions();
  
  // PATTERN: Create task and start monitoring
  const { taskId } = await client.tasks.create.mutate({ link: url, options });
  
  console.log(chalk.green(`${logSymbols.success} Task created: ${taskId}`));
  
  // PATTERN: Start progress monitoring
  await monitorTaskProgress(taskId, client);
}

// Task 6: Progress Monitoring
async function monitorTaskProgress(taskId: string, client: TRPCClient) {
  // PATTERN: Multi-stage progress bars
  const multibar = new cliProgress.MultiBar({
    clearOnComplete: false,
    hideCursor: true,
    format: ' {bar} | {percentage}% | {stage} | ETA: {eta}s'
  });
  
  const stages = [
    { name: 'Download', bar: multibar.create(100, 0) },
    { name: 'Extract', bar: multibar.create(100, 0) },
    { name: 'Transcribe', bar: multibar.create(100, 0) },
    { name: 'Summarize', bar: multibar.create(100, 0) }
  ];
  
  // PATTERN: SSE connection for real-time updates  
  const sseClient = new SSEClient(`/api/events/stream?taskId=${taskId}`);
  
  sseClient.on('progress', (data) => {
    // PATTERN: Update appropriate progress bar
    updateProgressBars(stages, data);
  });
  
  sseClient.on('complete', () => {
    multibar.stop();
    showCompletionSummary(taskId, client);
  });
}
```

### Integration Points
```yaml
API_INTEGRATION:
  - endpoint: "http://localhost:3000/trpc"
  - client: "@trpc/client with httpBatchLink"
  - types: "Reuse AppRouter from src/api/index.ts"
  
SSE_INTEGRATION:
  - endpoint: "http://localhost:3000/api/events/stream"
  - pattern: "Use fetch() with getReader() for Node.js compatibility"
  - events: "Subscribe to task progress updates"
  
FILE_SYSTEM:
  - config: "~/.yt-cli-config.json for user preferences"
  - logs: "Optional debug logging to ~/.yt-cli-logs/"
  
VALIDATION:
  - reuse: "src/utils/validation.ts for URL validation"
  - pattern: "Zod schemas for CLI input validation"
  
ERROR_HANDLING:
  - pattern: "Wrap tRPC errors with user-friendly messages"
  - fallback: "Graceful degradation when server unavailable"
```

## Validation Loop

### Level 1: Syntax & Style
```bash
# Run these FIRST - fix any errors before proceeding
npm run type-check           # TypeScript compilation
npm run lint                 # ESLint checking
npm run lint:fix             # Auto-fix linting issues

# Expected: No errors. If errors, READ the error and fix.
```

### Level 2: Unit Tests
```typescript
// CREATE tests/cli/ui/menu.test.ts
import { describe, it, expect, vi } from 'vitest';
import { showMainMenu } from '../../../src/cli/ui/menu.js';

describe('CLI Menu', () => {
  it('should display all menu options', async () => {
    const mockSelect = vi.fn().mockResolvedValue('process-video');
    
    const result = await showMainMenu();
    expect(result).toBe('process-video');
  });
  
  it('should handle exit option', async () => {
    const mockSelect = vi.fn().mockResolvedValue('exit');
    
    const result = await showMainMenu();
    expect(result).toBe('exit');
  });
});

// CREATE tests/cli/utils/sse-client.test.ts  
describe('SSE Client', () => {
  it('should parse progress events correctly', () => {
    const client = new SSEClient('mock-url');
    const mockData = 'data: {"type":"progress","taskId":"123","progress":50}\n\n';
    
    const parsed = client.parseEventData(mockData);
    expect(parsed.progress).toBe(50);
  });
  
  it('should handle connection errors gracefully', async () => {
    // Test reconnection logic
  });
});
```

```bash
# Run and iterate until passing:
npm run test:unit
# If failing: Read error, understand root cause, fix code, re-run
```

### Level 3: Integration Test
```bash
# Start the server in one terminal
npm run dev

# Test CLI in another terminal  
npm run cli

# Manual testing checklist:
# 1. Menu navigation works
# 2. Video processing shows progress
# 3. Task management displays correctly
# 4. Error handling works
# 5. Settings persist correctly
```

## Final Validation Checklist
- [ ] All tests pass: `npm run test`
- [ ] No linting errors: `npm run lint`
- [ ] No type errors: `npm run type-check`
- [ ] CLI executable works: `npm run cli`
- [ ] Can process a test video end-to-end
- [ ] Progress bars update in real-time
- [ ] Error messages are clear and helpful
- [ ] Settings save and load correctly
- [ ] All menu options function properly

## Anti-Patterns to Avoid
- ❌ Don't use CommonJS require() syntax - project uses ES modules
- ❌ Don't skip .js extensions in imports - required for ES modules
- ❌ Don't block the main thread with synchronous operations
- ❌ Don't ignore TTY detection for progress bars
- ❌ Don't hardcode server URLs - use configuration
- ❌ Don't catch all errors silently - provide user feedback
- ❌ Don't create new validation patterns - reuse existing ones
- ❌ Don't mock API calls in unit tests just to pass - test real behavior

---

**Confidence Score: 9/10**

This PRP provides comprehensive context, follows existing patterns, includes all necessary documentation references, and provides executable validation steps. The implementation should succeed in one pass due to the detailed blueprints and integration with existing codebase patterns.