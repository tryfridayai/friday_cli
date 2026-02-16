/**
 * chat/inputLine.js — Bottom-pinned input bar for Friday CLI chat
 *
 * Replaces Node's readline with a custom input line pinned to the bottom
 * of the terminal. Output scrolls above a separator line; the user always
 * types on the last row.
 *
 * Fixes:
 *  - Multi-line paste: pasted text (one data event with newlines) is joined
 *    into a single message instead of discarding all but the first line.
 *  - Input area: output and input no longer intermix — the prompt is always
 *    visible at the bottom of the terminal.
 */

import { PURPLE, RESET, BOLD, DIM } from './ui.js';

const HISTORY_MAX = 50;

/**
 * InputLine — a bottom-pinned input bar using ANSI scroll regions.
 *
 * Layout:
 *   Rows 1..N-2  — scroll region (output)
 *   Row  N-1     — dim separator (─────)
 *   Row  N       — input prompt  (f > ...)
 */
export default class InputLine {
  constructor() {
    this._buf = '';          // current input buffer
    this._cursor = 0;        // cursor position within _buf
    this._history = [];      // command history ring
    this._historyIdx = -1;   // -1 = current input, 0..N-1 = history
    this._savedBuf = '';     // buffer saved when browsing history
    this._submitCb = null;   // onSubmit callback
    this._active = false;    // true when input line is live
    this._paused = false;    // true when paused for selectOption/askSecret
    this._rows = 0;          // terminal rows
    this._cols = 0;          // terminal cols
    this._onData = null;     // stdin data handler ref
    this._onResize = null;   // SIGWINCH handler ref
    this._originalWrite = null; // original process.stdout.write
    this._promptStr = `${PURPLE}f${RESET} ${BOLD}>${RESET} `; // visible prompt
    this._promptLen = 4;     // visible character length of prompt ("f > ")
  }

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Initialize the input line: set up scroll region, separator, input line,
   * patch stdout, and start listening for keystrokes.
   */
  init() {
    if (this._active) return;
    this._active = true;

    this._rows = process.stdout.rows || 24;
    this._cols = process.stdout.columns || 80;

    // Set up scroll region (rows 1 to N-2)
    this._setScrollRegion();

    // Draw separator and input line
    this._drawChrome();

    // Patch stdout.write to keep output in scroll region
    this._patchStdout();

    // Listen for resize
    this._onResize = () => {
      this._rows = process.stdout.rows || 24;
      this._cols = process.stdout.columns || 80;
      this._setScrollRegion();
      this._drawChrome();
      this._renderInput();
    };
    process.stdout.on('resize', this._onResize);

    // Start raw mode keystroke handling
    this._startRawInput();
  }

  /**
   * Tear down: restore scroll region, unpatch stdout, stop raw mode.
   */
  destroy() {
    if (!this._active) return;
    this._active = false;

    this._stopRawInput();

    if (this._onResize) {
      process.stdout.removeListener('resize', this._onResize);
      this._onResize = null;
    }

    this._unpatchStdout();

    // Reset scroll region to full terminal
    this._write(`\x1b[r`);
    // Move cursor to bottom
    this._write(`\x1b[${this._rows};1H`);
    this._write('\n');
  }

  /**
   * Register the submit callback (called when user presses Enter).
   * @param {(line: string) => void} cb
   */
  onSubmit(cb) {
    this._submitCb = cb;
  }

  /**
   * Redraw the input line. Call after output that may have scrolled.
   */
  prompt() {
    if (!this._active || this._paused) return;
    this._renderInput();
  }

  /**
   * Pause input handling (for selectOption / askSecret).
   * Restores normal terminal mode so other raw-mode readers work.
   */
  pause() {
    if (this._paused) return;
    this._paused = true;
    this._stopRawInput();
    // Reset scroll region so selectOption can render anywhere
    this._write(`\x1b[r`);
  }

  /**
   * Resume input handling after pause.
   */
  resume() {
    if (!this._paused) return;
    this._paused = false;

    // Recalculate dimensions in case terminal was resized
    this._rows = process.stdout.rows || 24;
    this._cols = process.stdout.columns || 80;

    this._setScrollRegion();
    this._drawChrome();
    this._startRawInput();
    this._renderInput();
  }

  /**
   * Get the current input buffer contents.
   */
  getLine() {
    return this._buf;
  }

  /**
   * Simulate a close event (for compat with rl.close()).
   */
  close() {
    this.destroy();
    // Exit gracefully
    process.exit(0);
  }

  // ── Scroll region / chrome ─────────────────────────────────────────

  _setScrollRegion() {
    const scrollEnd = Math.max(1, this._rows - 2);
    this._write(`\x1b[1;${scrollEnd}r`);
  }

  _drawChrome() {
    const sepRow = this._rows - 1;
    const inputRow = this._rows;

    // Draw separator on row N-1
    this._write(`\x1b[${sepRow};1H`);
    this._write(`\x1b[2K`); // clear line
    this._write(`${DIM}${'─'.repeat(this._cols)}${RESET}`);

    // Clear input row
    this._write(`\x1b[${inputRow};1H`);
    this._write(`\x1b[2K`);
  }

  _renderInput() {
    if (!this._active || this._paused) return;
    const inputRow = this._rows;

    // Save cursor, move to input row, clear it, write prompt + buffer, restore
    this._write('\x1b7');  // save cursor
    this._write(`\x1b[${inputRow};1H`);
    this._write('\x1b[2K'); // clear line

    // Truncate buffer display if wider than terminal
    const maxBufLen = this._cols - this._promptLen - 1;
    let displayBuf = this._buf;
    let displayCursor = this._cursor;

    if (displayBuf.length > maxBufLen) {
      // Show a window around cursor
      const start = Math.max(0, this._cursor - Math.floor(maxBufLen / 2));
      displayBuf = displayBuf.slice(start, start + maxBufLen);
      displayCursor = this._cursor - start;
    }

    this._write(this._promptStr + displayBuf);

    // Position cursor
    const cursorCol = this._promptLen + displayCursor + 1;
    this._write(`\x1b[${inputRow};${cursorCol}H`);
    this._write('\x1b8');  // restore cursor

    // Actually place cursor on input line so it blinks there
    this._write(`\x1b[${inputRow};${cursorCol}H`);
  }

  // ── stdout interception ────────────────────────────────────────────

  _patchStdout() {
    if (this._originalWrite) return; // already patched
    this._originalWrite = process.stdout.write.bind(process.stdout);

    const self = this;
    process.stdout.write = function (data, encoding, callback) {
      if (!self._active || self._paused) {
        return self._originalWrite(data, encoding, callback);
      }

      // Move cursor to end of scroll region and write there
      const scrollEnd = Math.max(1, self._rows - 2);
      self._originalWrite(`\x1b7`);  // save cursor
      self._originalWrite(`\x1b[${scrollEnd};1H`); // go to bottom of scroll region
      self._originalWrite('\n'); // scroll up by one line
      self._originalWrite(`\x1b[${scrollEnd};1H`); // position at bottom of scroll region
      const result = self._originalWrite(data, encoding, callback);

      // Redraw separator and input (they may have been scrolled over)
      self._drawChrome();
      self._renderInput();

      return result;
    };
  }

  _unpatchStdout() {
    if (this._originalWrite) {
      process.stdout.write = this._originalWrite;
      this._originalWrite = null;
    }
  }

  /**
   * Write directly to the terminal, bypassing our stdout patch.
   * Used for drawing chrome / cursor positioning.
   */
  _write(data) {
    const writer = this._originalWrite || process.stdout.write.bind(process.stdout);
    writer(data);
  }

  // ── Raw keystroke handling ─────────────────────────────────────────

  _startRawInput() {
    if (this._onData) return; // already listening

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    this._onData = (data) => this._handleData(data);
    process.stdin.on('data', this._onData);
  }

  _stopRawInput() {
    if (this._onData) {
      process.stdin.removeListener('data', this._onData);
      this._onData = null;
    }
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  }

  _handleData(data) {
    const str = data.toString('utf8');

    // Multi-line paste detection: if the chunk contains newline characters,
    // treat the entire chunk as a single pasted input.
    if (str.includes('\n') || str.includes('\r')) {
      // Check if this is just an Enter keypress (single \r or \n)
      if (str === '\r' || str === '\n' || str === '\r\n') {
        this._submit();
        return;
      }

      // Multi-line paste: join all lines into one message
      const joined = str
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map(l => l.trimEnd())
        .filter(l => l.length > 0)
        .join(' ');

      if (joined.length > 0) {
        this._buf = joined;
        this._cursor = joined.length;
        this._renderInput();
        this._submit();
      }
      return;
    }

    // Process individual keystrokes
    let i = 0;
    while (i < str.length) {
      const ch = str[i];
      const code = ch.charCodeAt(0);

      // Ctrl+C
      if (code === 3) {
        if (this._buf.length > 0) {
          // Clear current input
          this._buf = '';
          this._cursor = 0;
          this._historyIdx = -1;
          this._renderInput();
        } else {
          // Exit
          this.destroy();
          process.exit(0);
        }
        i++;
        continue;
      }

      // Ctrl+A — home
      if (code === 1) {
        this._cursor = 0;
        this._renderInput();
        i++;
        continue;
      }

      // Ctrl+E — end
      if (code === 5) {
        this._cursor = this._buf.length;
        this._renderInput();
        i++;
        continue;
      }

      // Ctrl+U — clear line
      if (code === 21) {
        this._buf = '';
        this._cursor = 0;
        this._renderInput();
        i++;
        continue;
      }

      // Ctrl+K — kill to end of line
      if (code === 11) {
        this._buf = this._buf.slice(0, this._cursor);
        this._renderInput();
        i++;
        continue;
      }

      // Ctrl+W — delete word backwards
      if (code === 23) {
        const before = this._buf.slice(0, this._cursor);
        const trimmed = before.replace(/\s+$/, '');
        const lastSpace = trimmed.lastIndexOf(' ');
        const newEnd = lastSpace >= 0 ? lastSpace + 1 : 0;
        this._buf = this._buf.slice(0, newEnd) + this._buf.slice(this._cursor);
        this._cursor = newEnd;
        this._renderInput();
        i++;
        continue;
      }

      // Backspace
      if (code === 127 || code === 8) {
        if (this._cursor > 0) {
          this._buf = this._buf.slice(0, this._cursor - 1) + this._buf.slice(this._cursor);
          this._cursor--;
          this._renderInput();
        }
        i++;
        continue;
      }

      // Escape sequences
      if (code === 0x1b) {
        i++;
        if (i < str.length && str[i] === '[') {
          i++;
          // Collect parameter bytes
          let param = '';
          while (i < str.length && str.charCodeAt(i) >= 0x30 && str.charCodeAt(i) <= 0x3f) {
            param += str[i];
            i++;
          }
          // Final byte
          if (i < str.length) {
            const final = str[i];
            i++;

            switch (final) {
              case 'A': // Up arrow — history previous
                this._historyUp();
                break;
              case 'B': // Down arrow — history next
                this._historyDown();
                break;
              case 'C': // Right arrow
                if (this._cursor < this._buf.length) {
                  this._cursor++;
                  this._renderInput();
                }
                break;
              case 'D': // Left arrow
                if (this._cursor > 0) {
                  this._cursor--;
                  this._renderInput();
                }
                break;
              case 'H': // Home
                this._cursor = 0;
                this._renderInput();
                break;
              case 'F': // End
                this._cursor = this._buf.length;
                this._renderInput();
                break;
              case '~': // Delete (param=3), etc.
                if (param === '3') {
                  // Delete key
                  if (this._cursor < this._buf.length) {
                    this._buf = this._buf.slice(0, this._cursor) + this._buf.slice(this._cursor + 1);
                    this._renderInput();
                  }
                }
                break;
              default:
                break;
            }
          }
        } else if (i < str.length) {
          // Alt+key or other ESC sequences — skip
          i++;
        }
        continue;
      }

      // Skip other control characters
      if (code < 0x20) {
        i++;
        continue;
      }

      // Printable character — insert at cursor
      this._buf = this._buf.slice(0, this._cursor) + ch + this._buf.slice(this._cursor);
      this._cursor++;
      this._renderInput();
      i++;
    }
  }

  // ── History ────────────────────────────────────────────────────────

  _historyUp() {
    if (this._history.length === 0) return;
    if (this._historyIdx === -1) {
      // Save current buffer before browsing history
      this._savedBuf = this._buf;
    }
    if (this._historyIdx < this._history.length - 1) {
      this._historyIdx++;
      this._buf = this._history[this._historyIdx];
      this._cursor = this._buf.length;
      this._renderInput();
    }
  }

  _historyDown() {
    if (this._historyIdx <= -1) return;
    this._historyIdx--;
    if (this._historyIdx === -1) {
      this._buf = this._savedBuf;
    } else {
      this._buf = this._history[this._historyIdx];
    }
    this._cursor = this._buf.length;
    this._renderInput();
  }

  // ── Submit ─────────────────────────────────────────────────────────

  _submit() {
    const line = this._buf.trim();
    this._buf = '';
    this._cursor = 0;
    this._historyIdx = -1;
    this._savedBuf = '';

    if (line.length > 0) {
      // Add to history (most recent first), deduplicate
      if (this._history[0] !== line) {
        this._history.unshift(line);
        if (this._history.length > HISTORY_MAX) {
          this._history.pop();
        }
      }
    }

    this._renderInput();

    if (this._submitCb) {
      this._submitCb(line);
    }
  }
}
