/**
 * friday plugins — List installed and available plugins
 */

import path from 'path';
import { runtimeDir } from '../resolveRuntime.js';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';

export default async function plugins(args) {
  const { PluginManager } = await import(path.join(runtimeDir, 'src', 'plugins', 'PluginManager.js'));
  const pm = new PluginManager();

  const installed = pm.listInstalled();
  const available = pm.listAvailable();

  console.log('');

  // Show installed plugins
  if (installed.length > 0) {
    console.log(`  ${BOLD}Installed:${RESET}`);
    console.log('');
    for (const p of installed) {
      console.log(`    ${GREEN}${p.id}${RESET}  ${p.description}`);
    }
    console.log('');
  } else {
    console.log(`  ${DIM}No plugins installed yet.${RESET}`);
    console.log('');
  }

  // Show available (not installed) plugins
  const notInstalled = available.filter(p => !p.installed);
  if (notInstalled.length > 0) {
    console.log(`  ${BOLD}Available:${RESET}`);
    console.log('');
    const categories = {};
    for (const p of notInstalled) {
      if (!categories[p.category]) categories[p.category] = [];
      categories[p.category].push(p);
    }
    for (const [category, plugins] of Object.entries(categories)) {
      console.log(`  ${DIM}${category}${RESET}`);
      for (const p of plugins) {
        console.log(`    ${BOLD}${p.id}${RESET}  ${p.description}`);
      }
      console.log('');
    }
  }

  console.log(`  Install with: ${DIM}friday install <plugin>${RESET}`);
  console.log('');
}
