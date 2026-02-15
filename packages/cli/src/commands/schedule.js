/**
 * friday schedule — Manage scheduled agents
 *
 * Commands:
 *   friday schedule              List all scheduled agents
 *   friday schedule create       Create a new scheduled agent
 *   friday schedule delete <id>  Delete a scheduled agent
 */

import readline from 'readline';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
let runtimeDir;
try {
  const runtimePkg = require.resolve('friday-runtime/package.json');
  runtimeDir = path.dirname(runtimePkg);
} catch {
  runtimeDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'runtime');
}

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

/**
 * Parse natural language schedule into cron expression.
 */
function parseSchedule(input) {
  const lower = input.toLowerCase().trim();

  // "every X hours"
  const hoursMatch = lower.match(/every\s+(\d+)\s+hours?/);
  if (hoursMatch) {
    const hours = parseInt(hoursMatch[1]);
    return { cron: `0 */${hours} * * *`, humanReadable: `Every ${hours} hours` };
  }

  // "every X minutes"
  const minutesMatch = lower.match(/every\s+(\d+)\s+minutes?/);
  if (minutesMatch) {
    const mins = parseInt(minutesMatch[1]);
    return { cron: `*/${mins} * * * *`, humanReadable: `Every ${mins} minutes` };
  }

  // "every day at Xam/pm" or "daily at X"
  const dailyMatch = lower.match(/(?:every\s+day|daily)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (dailyMatch) {
    let hour = parseInt(dailyMatch[1]);
    const minute = parseInt(dailyMatch[2] || '0');
    const ampm = dailyMatch[3];
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    const timeStr = `${hour}:${minute.toString().padStart(2, '0')}`;
    return { cron: `${minute} ${hour} * * *`, humanReadable: `Every day at ${timeStr}` };
  }

  // "every morning" (9am)
  if (lower.includes('every morning')) {
    return { cron: '0 9 * * *', humanReadable: 'Every morning at 9:00' };
  }

  // "every evening" (6pm)
  if (lower.includes('every evening')) {
    return { cron: '0 18 * * *', humanReadable: 'Every evening at 18:00' };
  }

  // "every hour"
  if (lower === 'every hour' || lower === 'hourly') {
    return { cron: '0 * * * *', humanReadable: 'Every hour' };
  }

  // Day-of-week patterns: "every monday at 9am"
  const dayMatch = lower.match(/every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (dayMatch) {
    const days = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    const day = days[dayMatch[1].toLowerCase()];
    let hour = parseInt(dayMatch[2]);
    const minute = parseInt(dayMatch[3] || '0');
    const ampm = dayMatch[4];
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return {
      cron: `${minute} ${hour} * * ${day}`,
      humanReadable: `Every ${dayMatch[1]} at ${hour}:${minute.toString().padStart(2, '0')}`,
    };
  }

  // "weekdays at Xam"
  const weekdayMatch = lower.match(/weekdays?\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (weekdayMatch) {
    let hour = parseInt(weekdayMatch[1]);
    const minute = parseInt(weekdayMatch[2] || '0');
    const ampm = weekdayMatch[3];
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return {
      cron: `${minute} ${hour} * * 1-5`,
      humanReadable: `Weekdays at ${hour}:${minute.toString().padStart(2, '0')}`,
    };
  }

  // Raw cron expression (5 fields)
  if (/^[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+$/.test(lower)) {
    return { cron: lower, humanReadable: lower };
  }

  return null;
}

export default async function schedule(args) {
  const subcommand = args._[1]; // friday schedule <subcommand>

  const ScheduledAgentStore = (await import(path.join(runtimeDir, 'src', 'scheduled-agents', 'ScheduledAgentStore.js'))).default;
  const store = new ScheduledAgentStore();

  // ── List ────────────────────────────────────────────────────────────
  if (!subcommand || subcommand === 'list') {
    const agents = await store.listAgents('default');

    console.log('');
    if (agents.length === 0) {
      console.log(`  ${DIM}No scheduled agents.${RESET}`);
      console.log(`  Create one with: ${DIM}friday schedule create${RESET}`);
    } else {
      console.log(`  ${BOLD}Scheduled agents:${RESET}`);
      console.log('');
      for (const agent of agents) {
        const status = agent.status === 'active' ? `${GREEN}active${RESET}` : `${DIM}${agent.status}${RESET}`;
        const schedule = agent.schedule?.humanReadable || agent.schedule?.cron || 'unknown';
        const nextRun = agent.nextRunAt ? new Date(agent.nextRunAt).toLocaleString() : 'unknown';
        console.log(`  ${BOLD}${agent.name}${RESET}  ${DIM}(${agent.id})${RESET}`);
        console.log(`    ${schedule}  ·  ${status}  ·  Next: ${nextRun}`);
        if (agent.description) {
          console.log(`    ${DIM}${agent.description}${RESET}`);
        }
        console.log('');
      }
    }
    console.log('');
    return;
  }

  // ── Create ──────────────────────────────────────────────────────────
  if (subcommand === 'create') {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log('');
    console.log(`  ${BOLD}Create a scheduled agent${RESET}`);
    console.log('');

    const name = await ask(rl, '  Name: ');
    if (!name) {
      console.log(`  ${RED}Name is required.${RESET}`);
      rl.close();
      return;
    }

    const instructions = await ask(rl, '  What should this agent do?\n  > ');
    if (!instructions) {
      console.log(`  ${RED}Instructions are required.${RESET}`);
      rl.close();
      return;
    }

    console.log('');
    console.log(`  ${DIM}Examples: "every morning at 9am", "every 3 hours", "every monday at 8am"${RESET}`);
    const scheduleInput = await ask(rl, '  How often? ');

    const parsed = parseSchedule(scheduleInput);
    if (!parsed) {
      console.log(`  ${RED}Could not parse schedule: "${scheduleInput}"${RESET}`);
      console.log(`  ${DIM}Try: "every day at 9am", "every 3 hours", "weekdays at 8am"${RESET}`);
      rl.close();
      return;
    }
    console.log(`  ${DIM}Parsed: ${parsed.humanReadable} (${parsed.cron})${RESET}`);

    console.log('');
    const pluginsInput = await ask(rl, `  Which plugins does it need? ${DIM}(comma-separated, or Enter for none)${RESET}\n  > `);
    const plugins = pluginsInput ? pluginsInput.split(',').map(p => p.trim()).filter(Boolean) : [];

    rl.close();

    try {
      const agent = await store.createAgent('default', {
        name,
        description: instructions.slice(0, 100),
        instructions,
        schedule: {
          cron: parsed.cron,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          humanReadable: parsed.humanReadable,
        },
        mcpServers: plugins.length > 0 ? plugins : ['terminal'],
        permissions: { preAuthorized: true, tools: [] },
      });

      console.log('');
      console.log(`  ${GREEN}Agent created: ${agent.name}${RESET} ${DIM}(${agent.id})${RESET}`);
      console.log(`  ${parsed.humanReadable}`);
      console.log(`  ${DIM}Will take effect next time Friday starts.${RESET}`);
      console.log('');
    } catch (error) {
      console.log(`  ${RED}Failed to create agent: ${error.message}${RESET}`);
    }
    return;
  }

  // ── Delete ──────────────────────────────────────────────────────────
  if (subcommand === 'delete') {
    const agentId = args._[2];
    if (!agentId) {
      console.log(`  ${BOLD}Usage:${RESET} friday schedule delete <agent-id>`);
      return;
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const confirm = await ask(rl, `  Delete agent ${agentId}? (y/N): `);
    rl.close();

    if (confirm.toLowerCase() !== 'y') {
      console.log(`  ${DIM}Cancelled.${RESET}`);
      return;
    }

    try {
      await store.deleteAgent('default', agentId);
      console.log(`  ${GREEN}Agent deleted.${RESET}`);
    } catch (error) {
      console.log(`  ${RED}Failed: ${error.message}${RESET}`);
    }
    return;
  }

  console.log(`  ${RED}Unknown subcommand: ${subcommand}${RESET}`);
  console.log(`  Usage: friday schedule [list|create|delete]`);
}
