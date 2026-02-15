/**
 * friday install <plugin> — Install a plugin with guided credential setup
 *
 * Reads the plugin manifest from the catalog, prompts for required
 * credentials, stores them, and registers the plugin as installed.
 */

import readline from 'readline';
import path from 'path';
import { runtimeDir } from '../resolveRuntime.js';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function maskValue(value) {
  if (!value || value.length < 8) return '****';
  return value.slice(0, 4) + '...' + value.slice(-4);
}

export default async function install(args) {
  const pluginId = args._[1]; // friday install <plugin>

  // Lazy-import the PluginManager from the runtime package
  const { PluginManager } = await import(path.join(runtimeDir, 'src', 'plugins', 'PluginManager.js'));
  const pm = new PluginManager();

  // No plugin specified — show available plugins
  if (!pluginId) {
    console.log('');
    console.log(`  ${BOLD}Usage:${RESET} friday install <plugin>`);
    console.log('');
    console.log(`  ${BOLD}Available plugins:${RESET}`);
    console.log('');
    const available = pm.listAvailable();
    const categories = {};
    for (const p of available) {
      if (!categories[p.category]) categories[p.category] = [];
      categories[p.category].push(p);
    }
    for (const [category, plugins] of Object.entries(categories)) {
      console.log(`  ${DIM}${category}${RESET}`);
      for (const p of plugins) {
        const status = p.installed ? `${GREEN}installed${RESET}` : '';
        console.log(`    ${BOLD}${p.id}${RESET}  ${p.description}  ${status}`);
      }
      console.log('');
    }
    console.log(`  Example: ${DIM}friday install github${RESET}`);
    console.log('');
    return;
  }

  // Check if plugin exists in catalog
  const manifest = pm.getPluginManifest(pluginId);
  if (!manifest) {
    console.log('');
    console.log(`  ${RED}Unknown plugin: ${pluginId}${RESET}`);
    console.log(`  Run ${DIM}friday install${RESET} to see available plugins.`);
    console.log('');
    return;
  }

  // Check if already installed
  if (pm.isInstalled(pluginId)) {
    console.log('');
    console.log(`  ${manifest.name} is already installed.`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const reinstall = await ask(rl, `  Reinstall and update credentials? (y/N): `);
    if (reinstall.toLowerCase() !== 'y') {
      rl.close();
      return;
    }
    rl.close();
  }

  const fields = pm.getCredentialFields(pluginId);

  console.log('');
  console.log(`  ${BOLD}Installing ${manifest.name}${RESET}`);
  console.log(`  ${DIM}${manifest.description}${RESET}`);
  console.log('');

  // If no credentials needed (e.g. Vercel with remote-oauth)
  if (fields.length === 0) {
    if (manifest.setup?.note) {
      console.log(`  ${DIM}${manifest.setup.note}${RESET}`);
      console.log('');
    }
    pm.install(pluginId, {});
    console.log(`  ${GREEN}${manifest.name} installed.${RESET}`);
    console.log('');
    return;
  }

  // Prompt for credentials
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const credentials = {};

  if (manifest.setup?.note) {
    console.log(`  ${DIM}${manifest.setup.note}${RESET}`);
    console.log('');
  }

  for (const field of fields) {
    if (field.instructions) {
      console.log(`  ${DIM}${field.instructions}${RESET}`);
    }

    const requiredTag = field.required ? '' : ` ${DIM}(optional)${RESET}`;
    const prompt = `  ${field.label}${requiredTag}: `;
    const value = await ask(rl, prompt);

    if (value) {
      credentials[field.key] = value;
      if (field.type === 'secret') {
        // Clear the line and reprint masked
        process.stdout.write(`\x1b[1A\x1b[2K`);
        console.log(`  ${field.label}${requiredTag}: ${DIM}${maskValue(value)}${RESET}`);
      }
    } else if (field.required) {
      console.log(`  ${YELLOW}Skipped (required). Plugin may not work without this.${RESET}`);
    }
    console.log('');
  }

  rl.close();

  // Install
  pm.install(pluginId, credentials);
  console.log(`  ${GREEN}${manifest.name} installed.${RESET}`);
  console.log(`  The agent can now use ${manifest.name} tools.`);
  console.log('');
}
