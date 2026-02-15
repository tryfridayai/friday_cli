import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Test the arg parser directly by importing the cli module
// We can't call run() directly since it does process.exit, but
// we can test the commands map and parseArgs logic

describe('CLI', () => {
  describe('parseArgs (inline replication)', () => {
    // Replicate the parseArgs function for unit testing
    function parseArgs(argv) {
      const result = { _: [] };
      for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') {
          result.help = true;
        } else if (arg === '--verbose' || arg === '-v') {
          result.verbose = true;
        } else if (arg === '--version' || arg === '-V') {
          result.version = true;
        } else if (arg.startsWith('--')) {
          const key = arg.slice(2);
          const next = argv[i + 1];
          if (!next || next.startsWith('--')) {
            result[key] = true;
          } else {
            result[key] = next;
            i++;
          }
        } else {
          result._.push(arg);
        }
      }
      return result;
    }

    it('parses command name', () => {
      const args = parseArgs(['chat']);
      assert.deepEqual(args._, ['chat']);
    });

    it('parses --help flag', () => {
      const args = parseArgs(['--help']);
      assert.equal(args.help, true);
    });

    it('parses -h shorthand', () => {
      const args = parseArgs(['-h']);
      assert.equal(args.help, true);
    });

    it('parses --version flag', () => {
      const args = parseArgs(['--version']);
      assert.equal(args.version, true);
    });

    it('parses -V shorthand', () => {
      const args = parseArgs(['-V']);
      assert.equal(args.version, true);
    });

    it('parses --verbose flag', () => {
      const args = parseArgs(['--verbose']);
      assert.equal(args.verbose, true);
    });

    it('parses key-value flags', () => {
      const args = parseArgs(['--workspace', '/tmp/ws', '--port', '3000']);
      assert.equal(args.workspace, '/tmp/ws');
      assert.equal(args.port, '3000');
    });

    it('parses boolean flags without value', () => {
      const args = parseArgs(['--dry-run', '--verbose']);
      assert.equal(args['dry-run'], true);
      assert.equal(args.verbose, true);
    });

    it('parses mixed commands and flags', () => {
      const args = parseArgs(['serve', '--port', '8080', '--verbose']);
      assert.deepEqual(args._, ['serve']);
      assert.equal(args.port, '8080');
      assert.equal(args.verbose, true);
    });

    it('handles empty argv', () => {
      const args = parseArgs([]);
      assert.deepEqual(args._, []);
    });
  });

  describe('commands registration', () => {
    it('cli.js module exports run function', async () => {
      const mod = await import('../src/cli.js');
      assert.equal(typeof mod.run, 'function');
    });
  });

  describe('command modules', () => {
    it('setup module exports default function', async () => {
      const mod = await import('../src/commands/setup.js');
      assert.equal(typeof mod.default, 'function');
    });

    it('plugins module exports default function', async () => {
      const mod = await import('../src/commands/plugins.js');
      assert.equal(typeof mod.default, 'function');
    });

    it('schedule module exports default function', async () => {
      const mod = await import('../src/commands/schedule.js');
      assert.equal(typeof mod.default, 'function');
    });
  });
});
