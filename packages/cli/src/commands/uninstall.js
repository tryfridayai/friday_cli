/**
 * friday uninstall <plugin> — Remove an installed plugin
 */

import readline from 'readline';
import path from 'path';
import { runtimeDir } from '../resolveRuntime.js';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

export default async function uninstall(args) {
  const pluginId = args._[1];

  const { PluginManager } = await import(path.join(runtimeDir, 'src', 'plugins', 'PluginManager.js'));
  const pm = new PluginManager();

  if (!pluginId) {
    console.log('');
    console.log(`  ${BOLD}Usage:${RESET} friday uninstall <plugin>`);
    console.log('');
    const installed = pm.listInstalled();
    if (installed.length === 0) {
      console.log(`  No plugins installed.`);
    } else {
      console.log(`  ${BOLD}Installed plugins:${RESET}`);
      for (const p of installed) {
        console.log(`    ${BOLD}${p.id}${RESET}  ${p.name}`);
      }
    }
    console.log('');
    return;
  }

  if (!pm.isInstalled(pluginId)) {
    console.log('');
    console.log(`  ${RED}Plugin '${pluginId}' is not installed.${RESET}`);
    console.log('');
    return;
  }

  const manifest = pm.getPluginManifest(pluginId);
  const name = manifest?.name || pluginId;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const confirm = await ask(rl, `  Uninstall ${name}? (y/N): `);
  rl.close();

  if (confirm.toLowerCase() !== 'y') {
    console.log(`  ${DIM}Cancelled.${RESET}`);
    return;
  }

  pm.uninstall(pluginId);
  console.log('');
  console.log(`  ${GREEN}${name} uninstalled.${RESET}`);
  console.log('');
}
