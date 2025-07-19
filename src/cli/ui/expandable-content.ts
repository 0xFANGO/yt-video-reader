import chalk from 'chalk';
import { colors } from '../utils/formatters.js';

/**
 * Expandable content configuration
 */
export interface ExpandableContentConfig {
  maxCollapsedLines: number;
  showLineNumbers: boolean;
  enableKeyboardControls: boolean;
  expandIndicator: string;
  collapseIndicator: string;
  scrollIndicators: boolean;
  wrapText: boolean;
  borderStyle: 'none' | 'simple' | 'double';
}

/**
 * Default expandable content configuration
 */
export const DEFAULT_EXPANDABLE_CONFIG: ExpandableContentConfig = {
  maxCollapsedLines: 3,
  showLineNumbers: false,
  enableKeyboardControls: true,
  expandIndicator: '▼ Press SPACE to expand',
  collapseIndicator: '▲ Press SPACE to collapse',
  scrollIndicators: true,
  wrapText: true,
  borderStyle: 'simple',
};

/**
 * Keyboard control mappings
 */
export interface KeyboardControls {
  expand: string[];
  collapse: string[];
  scrollUp: string[];
  scrollDown: string[];
  pageUp: string[];
  pageDown: string[];
}

/**
 * Default keyboard controls
 */
export const DEFAULT_KEYBOARD_CONTROLS: KeyboardControls = {
  expand: [' ', 'Enter'],
  collapse: [' ', 'Enter'],
  scrollUp: ['ArrowUp', 'k'],
  scrollDown: ['ArrowDown', 'j'],
  pageUp: ['PageUp', 'u'],
  pageDown: ['PageDown', 'd'],
};

/**
 * Expandable content widget for terminal UI
 */
export class ExpandableContent {
  private content: string[] = [];
  private isExpanded = false;
  private scrollPosition = 0;
  private config: ExpandableContentConfig;
  private keyboardControls: KeyboardControls;
  private isActive = false;
  private title: string;

  constructor(
    title: string = '',
    config?: Partial<ExpandableContentConfig>,
    keyboardControls?: Partial<KeyboardControls>
  ) {
    this.title = title;
    this.config = { ...DEFAULT_EXPANDABLE_CONFIG, ...config };
    this.keyboardControls = { ...DEFAULT_KEYBOARD_CONTROLS, ...keyboardControls };
  }

  /**
   * Set content to display
   */
  setContent(content: string[] | string): void {
    if (typeof content === 'string') {
      this.content = this.wrapTextIfNeeded(content.split('\n'));
    } else {
      this.content = this.wrapTextIfNeeded(content);
    }
    
    // Reset scroll position if content changed
    this.scrollPosition = 0;
  }

  /**
   * Add lines to content
   */
  addLines(lines: string[] | string): void {
    const newLines = typeof lines === 'string' ? [lines] : lines;
    const wrappedLines = this.wrapTextIfNeeded(newLines);
    this.content.push(...wrappedLines);
  }

  /**
   * Insert line at specific position
   */
  insertLine(index: number, line: string): void {
    const wrappedLines = this.wrapTextIfNeeded([line]);
    this.content.splice(index, 0, ...wrappedLines);
  }

  /**
   * Update line at specific position
   */
  updateLine(index: number, line: string): void {
    if (index >= 0 && index < this.content.length) {
      const wrappedLines = this.wrapTextIfNeeded([line]);
      this.content.splice(index, 1, ...wrappedLines);
    }
  }

  /**
   * Clear all content
   */
  clear(): void {
    this.content = [];
    this.scrollPosition = 0;
  }

  /**
   * Toggle expand/collapse state
   */
  toggle(): void {
    this.isExpanded = !this.isExpanded;
    
    if (!this.isExpanded) {
      // When collapsing, show the last few lines
      this.scrollPosition = Math.max(0, this.content.length - this.config.maxCollapsedLines);
    }
  }

  /**
   * Expand content
   */
  expand(): void {
    this.isExpanded = true;
  }

  /**
   * Collapse content
   */
  collapse(): void {
    this.isExpanded = false;
    this.scrollPosition = Math.max(0, this.content.length - this.config.maxCollapsedLines);
  }

  /**
   * Scroll up
   */
  scrollUp(lines: number = 1): void {
    this.scrollPosition = Math.max(0, this.scrollPosition - lines);
  }

  /**
   * Scroll down
   */
  scrollDown(lines: number = 1): void {
    const maxScroll = Math.max(0, this.content.length - this.getVisibleLineCount());
    this.scrollPosition = Math.min(maxScroll, this.scrollPosition + lines);
  }

  /**
   * Page up (scroll multiple lines)
   */
  pageUp(): void {
    const pageSize = Math.max(1, this.getVisibleLineCount() - 1);
    this.scrollUp(pageSize);
  }

  /**
   * Page down (scroll multiple lines)
   */
  pageDown(): void {
    const pageSize = Math.max(1, this.getVisibleLineCount() - 1);
    this.scrollDown(pageSize);
  }

  /**
   * Go to top
   */
  goToTop(): void {
    this.scrollPosition = 0;
  }

  /**
   * Go to bottom
   */
  goToBottom(): void {
    const maxScroll = Math.max(0, this.content.length - this.getVisibleLineCount());
    this.scrollPosition = maxScroll;
  }

  /**
   * Render the expandable content
   */
  render(): void {
    if (!process.stdout.isTTY) {
      this.renderSimple();
      return;
    }

    // Clear previous rendering
    this.clearPreviousRender();

    // Render title if provided
    if (this.title) {
      this.renderTitle();
    }

    // Render border top
    this.renderBorder('top');

    // Render content
    const visibleLines = this.getVisibleLines();
    if (visibleLines.length === 0) {
      this.renderEmptyState();
    } else {
      visibleLines.forEach((line, index) => {
        this.renderContentLine(line, this.scrollPosition + index);
      });
    }

    // Render border bottom
    this.renderBorder('bottom');

    // Render controls and status
    this.renderControls();
  }

  /**
   * Simple render for non-TTY environments
   */
  renderSimple(): void {
    if (this.title) {
      console.log(colors.bold(this.title));
    }

    const linesToShow = this.isExpanded 
      ? this.content 
      : this.content.slice(-this.config.maxCollapsedLines);

    linesToShow.forEach(line => {
      console.log(line);
    });

    if (!this.isExpanded && this.content.length > this.config.maxCollapsedLines) {
      console.log(colors.dim(`... ${this.content.length - this.config.maxCollapsedLines} more lines`));
    }
  }

  /**
   * Get visible lines based on current state
   */
  private getVisibleLines(): string[] {
    const visibleCount = this.getVisibleLineCount();
    return this.content.slice(this.scrollPosition, this.scrollPosition + visibleCount);
  }

  /**
   * Get number of visible lines
   */
  private getVisibleLineCount(): number {
    if (this.isExpanded) {
      // In expanded mode, use available terminal height minus UI overhead
      const availableHeight = process.stdout.rows - 10; // Reserve space for UI elements
      return Math.min(availableHeight, this.content.length - this.scrollPosition);
    } else {
      // In collapsed mode, use configured max lines
      return Math.min(this.config.maxCollapsedLines, this.content.length);
    }
  }

  /**
   * Wrap text if needed
   */
  private wrapTextIfNeeded(lines: string[]): string[] {
    if (!this.config.wrapText) {
      return lines;
    }

    const terminalWidth = process.stdout.columns || 80;
    const maxLineWidth = terminalWidth - 4; // Account for borders and padding

    const wrappedLines: string[] = [];
    
    for (const line of lines) {
      if (line.length <= maxLineWidth) {
        wrappedLines.push(line);
      } else {
        // Split long lines
        const chunks = this.splitLine(line, maxLineWidth);
        wrappedLines.push(...chunks);
      }
    }

    return wrappedLines;
  }

  /**
   * Split a line into chunks
   */
  private splitLine(line: string, maxWidth: number): string[] {
    const words = line.split(' ');
    const chunks: string[] = [];
    let currentChunk = '';

    for (const word of words) {
      if (currentChunk.length + word.length + 1 <= maxWidth) {
        currentChunk += (currentChunk ? ' ' : '') + word;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        currentChunk = word;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks.length > 0 ? chunks : [''];
  }

  /**
   * Clear previous render
   */
  private clearPreviousRender(): void {
    // This would move cursor up and clear lines
    // Implementation depends on terminal capabilities
    // For now, just add some spacing
  }

  /**
   * Render title
   */
  private renderTitle(): void {
    console.log(colors.bold(this.title));
  }

  /**
   * Render border
   */
  private renderBorder(position: 'top' | 'bottom'): void {
    const width = process.stdout.columns || 80;
    
    switch (this.config.borderStyle) {
      case 'simple':
        console.log(colors.dim('─'.repeat(Math.min(width - 2, 50))));
        break;
      case 'double':
        console.log(colors.dim('═'.repeat(Math.min(width - 2, 50))));
        break;
      case 'none':
      default:
        // No border
        break;
    }
  }

  /**
   * Render empty state
   */
  private renderEmptyState(): void {
    console.log(colors.dim('(no content)'));
  }

  /**
   * Render a content line
   */
  private renderContentLine(line: string, lineNumber: number): void {
    let output = '';

    // Line number (if enabled)
    if (this.config.showLineNumbers) {
      const lineNumStr = (lineNumber + 1).toString().padStart(3, ' ');
      output += colors.dim(`${lineNumStr} | `);
    }

    // Content
    output += line;

    console.log(output);
  }

  /**
   * Render controls and status
   */
  private renderControls(): void {
    const controls: string[] = [];

    // Expand/collapse indicator
    if (this.content.length > this.config.maxCollapsedLines) {
      const indicator = this.isExpanded 
        ? this.config.collapseIndicator 
        : this.config.expandIndicator;
      controls.push(colors.dim(indicator));
    }

    // Scroll indicators
    if (this.config.scrollIndicators && this.isExpanded) {
      const totalLines = this.content.length;
      const visibleLines = this.getVisibleLineCount();
      const hiddenAbove = this.scrollPosition;
      const hiddenBelow = totalLines - (this.scrollPosition + visibleLines);

      if (hiddenAbove > 0) {
        controls.push(colors.dim(`↑ ${hiddenAbove} more above`));
      }
      
      if (hiddenBelow > 0) {
        controls.push(colors.dim(`↓ ${hiddenBelow} more below`));
      }

      if (this.config.enableKeyboardControls) {
        controls.push(colors.dim('Use ↑/↓ or j/k to scroll'));
      }
    }

    // Line count
    if (this.content.length > 0) {
      controls.push(colors.dim(`${this.content.length} lines`));
    }

    if (controls.length > 0) {
      console.log(controls.join(' | '));
    }
  }

  /**
   * Handle keyboard input
   */
  handleKeyboard(key: string): boolean {
    if (!this.config.enableKeyboardControls) {
      return false;
    }

    // Toggle expand/collapse
    if (this.keyboardControls.expand.includes(key) && !this.isExpanded) {
      this.expand();
      return true;
    }
    
    if (this.keyboardControls.collapse.includes(key) && this.isExpanded) {
      this.collapse();
      return true;
    }

    // Scrolling (only in expanded mode)
    if (this.isExpanded) {
      if (this.keyboardControls.scrollUp.includes(key)) {
        this.scrollUp();
        return true;
      }
      
      if (this.keyboardControls.scrollDown.includes(key)) {
        this.scrollDown();
        return true;
      }
      
      if (this.keyboardControls.pageUp.includes(key)) {
        this.pageUp();
        return true;
      }
      
      if (this.keyboardControls.pageDown.includes(key)) {
        this.pageDown();
        return true;
      }
    }

    return false;
  }

  /**
   * Get current state
   */
  getState(): {
    isExpanded: boolean;
    scrollPosition: number;
    totalLines: number;
    visibleLines: number;
  } {
    return {
      isExpanded: this.isExpanded,
      scrollPosition: this.scrollPosition,
      totalLines: this.content.length,
      visibleLines: this.getVisibleLineCount(),
    };
  }

  /**
   * Get all content
   */
  getContent(): string[] {
    return [...this.content];
  }

  /**
   * Check if content exceeds collapsed view
   */
  hasMoreContent(): boolean {
    return this.content.length > this.config.maxCollapsedLines;
  }
}

/**
 * Create expandable content widget
 */
export function createExpandableContent(
  title: string = '',
  content: string[] | string = [],
  config?: Partial<ExpandableContentConfig>
): ExpandableContent {
  const widget = new ExpandableContent(title, config);
  widget.setContent(content);
  return widget;
}

/**
 * Helper function to create a simple text viewer
 */
export function createTextViewer(
  title: string,
  text: string,
  options?: {
    maxLines?: number;
    autoExpand?: boolean;
  }
): ExpandableContent {
  const config: Partial<ExpandableContentConfig> = {
    maxCollapsedLines: options?.maxLines || 5,
    showLineNumbers: true,
    borderStyle: 'simple',
  };

  const viewer = new ExpandableContent(title, config);
  viewer.setContent(text);
  
  if (options?.autoExpand) {
    viewer.expand();
  }
  
  return viewer;
}