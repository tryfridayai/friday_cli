/**
 * CLI command router
 *
 * Parses argv and dispatches to the appropriate command handler.
 * Keeps things simple — no framework dependency (no commander/yargs).
 */

const COMMANDS = {
  chat: () => import('./commands/chat.js'),
  serve: () => import('./commands/serve.js'),
};

function parseArgs(argv) {
  const result = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
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

function printHelp() {
  console.log(`
friday — AI agent runtime

Usage:
  friday <command> [options]

Commands:
  chat      Interactive conversation with Friday (default)
  serve     Start HTTP/WebSocket server for remote clients

Options:
  --workspace <path>   Working directory for the agent (default: ~/FridayWorkspace)
  --port <port>        Server port for 'serve' command (default: 8787)
  --help, -h           Show this help message

Examples:
  friday                         Start interactive chat
  friday chat --workspace ./myproject
  friday serve --port 3000
`);
}

export async function run(argv) {
  const args = parseArgs(argv);

  if (args.help && args._.length === 0) {
    printHelp();
    process.exit(0);
  }

  const commandName = args._[0] || 'chat';

  if (!COMMANDS[commandName]) {
    console.error(`Unknown command: ${commandName}`);
    console.error(`Run 'friday --help' for usage.`);
    process.exit(1);
  }

  const mod = await COMMANDS[commandName]();
  await mod.default(args);
}
