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
 *
 * How it works:
 *  - ANSI scroll region confines output to rows 1..N-2
 *  - Row N-1: dim separator line
 *  - Row N: input prompt with editable text
 *  - stdout is patched: writes are redirected into the scroll region using
 *    SCO cursor save/restore (\x1b[s / \x1b[u) to track the output position,
 *    then cursor jumps back to the input line.
 *  - The scroll region handles line wrapping and scrolling natively —
 *    no explicit \n is injected per write.
 */

import { PURPLE, RESET, BOLD, DIM } from './ui.js';

const HISTORY_MAX = 50;

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

  init() {
    if (this._active) return;
    this._active = true;

    this._rows = process.stdout.rows || 24;
    this._cols = process.stdout.columns || 80;

    // Set scroll region (rows 1..N-2) — output is confined here
    this._setScrollRegion();

    // Draw separator and clear input row
    this._drawChrome();

    // Position output cursor at bottom of scroll region and save it
    // using SCO save (\x1b[s). The patched stdout will restore/save
    // this position on every write so the output cursor tracks correctly.
    const scrollEnd = Math.max(1, this._rows - 2);
    this._writeRaw(`\x1b[${scrollEnd};1H`);
    this._writeRaw('\x1b[s');  // SCO save — output cursor position

    // Patch stdout.write to redirect output into the scroll region
    this._patchStdout();

    // Listen for terminal resize
    this._onResize = () => {
      this._rows = process.stdout.rows || 24;
      this._cols = process.stdout.columns || 80;
      this._setScrollRegion();
      this._drawChrome();
      // Re-save output cursor at bottom of new scroll region
      const end = Math.max(1, this._rows - 2);
      this._writeRaw(`\x1b[${end};1H`);
      this._writeRaw('\x1b[s');
      this._renderInput();
    };
    process.stdout.on('resize', this._onResize);

    // Start raw-mode keystroke handling
    this._startRawInput();
  }

  destroy() {
    if (!this._active) return;
    this._active = false;

    this._stopRawInput();

    if (this._onResize) {
      process.stdout.removeListener('resize', this._onResize);
      this._onResize = null;
    }

    this._unpatchStdout();

    // Reset scroll region to full terminal and move cursor to bottom
    this._writeRaw('\x1b[r');
    this._writeRaw(`\x1b[${this._rows};1H\n`);
  }

  onSubmit(cb) {
    this._submitCb = cb;
  }

  prompt() {
    if (!this._active || this._paused) return;
    this._renderInput();
  }

  pause() {
    if (this._paused) return;
    this._paused = true;
    this._stopRawInput();
    // Reset scroll region so selectOption / askSecret can render anywhere
    this._writeRaw('\x1b[r');
  }

  resume() {
    if (!this._paused) return;
    this._paused = false;

    this._rows = process.stdout.rows || 24;
    this._cols = process.stdout.columns || 80;

    this._setScrollRegion();
    this._drawChrome();

    // Re-save output cursor at bottom of scroll region
    const scrollEnd = Math.max(1, this._rows - 2);
    this._writeRaw(`\x1b[${scrollEnd};1H`);
    this._writeRaw('\x1b[s');

    this._startRawInput();
    this._renderInput();
  }

  getLine() {
    return this._buf;
  }

  close() {
    this.destroy();
    process.exit(0);
  }

  // ── Scroll region / chrome ─────────────────────────────────────────

  _setScrollRegion() {
    const scrollEnd = Math.max(1, this._rows - 2);
    this._writeRaw(`\x1b[1;${scrollEnd}r`);
  }

  /**
   * Draw the separator line on row N-1 and clear the input row N.
   * These rows are OUTSIDE the scroll region, so scrolling never touches them.
   * Only needs to be called on init, resize, and resume — not on every write.
   */
  _drawChrome() {
    const sepRow = this._rows - 1;
    const inputRow = this._rows;

    this._writeRaw(`\x1b[${sepRow};1H\x1b[2K`);
    this._writeRaw(`${DIM}${'─'.repeat(this._cols)}${RESET}`);
    this._writeRaw(`\x1b[${inputRow};1H\x1b[2K`);
  }

  /**
   * Render the input prompt and buffer on row N, then place the cursor there.
   * Uses absolute positioning only — does not disturb the SCO-saved output cursor.
   */
  _renderInput() {
    if (!this._active || this._paused) return;
    const inputRow = this._rows;

    // Clear input row and draw prompt + buffer
    this._writeRaw(`\x1b[${inputRow};1H\x1b[2K`);

    const maxBufLen = this._cols - this._promptLen - 1;
    let displayBuf = this._buf;
    let displayCursor = this._cursor;

    if (displayBuf.length > maxBufLen) {
      const start = Math.max(0, this._cursor - Math.floor(maxBufLen / 2));
      displayBuf = displayBuf.slice(start, start + maxBufLen);
      displayCursor = this._cursor - start;
    }

    this._writeRaw(this._promptStr + displayBuf);

    // Place visible cursor on input line
    const cursorCol = this._promptLen + displayCursor + 1;
    this._writeRaw(`\x1b[${inputRow};${cursorCol}H`);
  }

  // ── stdout interception ────────────────────────────────────────────

  /**
   * Patch process.stdout.write so that ALL output is redirected into the
   * scroll region while the visible cursor stays on the input line.
   *
   * Uses SCO save/restore (\x1b[s / \x1b[u) to track the output cursor
   * position inside the scroll region across writes. This allows:
   *  - Spinner: writes \r to overwrite in place → cursor stays on same row
   *  - Streaming: partial writes accumulate on same row
   *  - console.log: trailing \n causes the scroll region to scroll naturally
   */
  _patchStdout() {
    if (this._originalWrite) return;
    this._originalWrite = process.stdout.write.bind(process.stdout);

    const self = this;
    process.stdout.write = function (data, encoding, callback) {
      if (!self._active || self._paused) {
        return self._originalWrite(data, encoding, callback);
      }

      // Restore the output cursor in the scroll region (SCO restore)
      self._originalWrite('\x1b[u');

      // Write the data at the output cursor position
      const result = self._originalWrite(data, encoding, callback);

      // Save the new output cursor position (SCO save)
      self._originalWrite('\x1b[s');

      // Move visible cursor back to the input line
      const cursorCol = self._promptLen + self._cursor + 1;
      self._originalWrite(`\x1b[${self._rows};${cursorCol}H`);

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
   * Write directly to the terminal, bypassing the stdout patch.
   * Used for chrome drawing and cursor positioning.
   */
  _writeRaw(data) {
    const writer = this._originalWrite || process.stdout.write.bind(process.stdout);
    writer(data);
  }

  // ── Raw keystroke handling ─────────────────────────────────────────

  _startRawInput() {
    if (this._onData) return;

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

    // Multi-line paste detection: pasted text arrives as one data event
    // with embedded newline characters.
    if (str.includes('\n') || str.includes('\r')) {
      // Single Enter keypress
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
          this._buf = '';
          this._cursor = 0;
          this._historyIdx = -1;
          this._renderInput();
        } else {
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
          let param = '';
          while (i < str.length && str.charCodeAt(i) >= 0x30 && str.charCodeAt(i) <= 0x3f) {
            param += str[i];
            i++;
          }
          if (i < str.length) {
            const final = str[i];
            i++;

            switch (final) {
              case 'A': this._historyUp(); break;
              case 'B': this._historyDown(); break;
              case 'C':
                if (this._cursor < this._buf.length) {
                  this._cursor++;
                  this._renderInput();
                }
                break;
              case 'D':
                if (this._cursor > 0) {
                  this._cursor--;
                  this._renderInput();
                }
                break;
              case 'H':
                this._cursor = 0;
                this._renderInput();
                break;
              case 'F':
                this._cursor = this._buf.length;
                this._renderInput();
                break;
              case '~':
                if (param === '3' && this._cursor < this._buf.length) {
                  this._buf = this._buf.slice(0, this._cursor) + this._buf.slice(this._cursor + 1);
                  this._renderInput();
                }
                break;
              default: break;
            }
          }
        } else if (i < str.length) {
          i++; // skip Alt+key / other ESC sequences
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
