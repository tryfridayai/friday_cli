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
    console.log(`  ${DIM}Describe what you want in natural language.${RESET}`);
    console.log(`  ${DIM}Examples:${RESET}`);
    console.log(`    ${DIM}"check my emails every morning at 9am"${RESET}`);
    console.log(`    ${DIM}"research AI news every day at 8am using firecrawl"${RESET}`);
    console.log(`    ${DIM}"run tests every 3 hours"${RESET}`);
    console.log('');

    const description = await ask(rl, '  > ');
    if (!description) {
      console.log(`  ${RED}Description is required.${RESET}`);
      rl.close();
      return;
    }

    // Parse schedule from the description
    let parsed = parseSchedule(description);

    // If no schedule detected, ask for it separately
    if (!parsed) {
      console.log(`  ${DIM}Couldn't detect a schedule. When should this run?${RESET}`);
      console.log(`  ${DIM}Examples: "every morning at 9am", "every 3 hours", "weekdays at 8am"${RESET}`);
      const scheduleInput = await ask(rl, '  Schedule: ');
      parsed = parseSchedule(scheduleInput);
      if (!parsed) {
        console.log(`  ${RED}Could not parse schedule: "${scheduleInput}"${RESET}`);
        rl.close();
        return;
      }
    }

    // Extract a name from the description (first few meaningful words)
    const nameFromDesc = description
      .replace(/every\s+(day|morning|evening|hour|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.*$/i, '')
      .replace(/\b(at\s+\d{1,2}(:\d{2})?\s*(am|pm)?)\b/gi, '')
      .replace(/\b(daily|hourly|weekdays?)\b/gi, '')
      .replace(/\bevery\s+\d+\s+(minutes?|hours?)\b/gi, '')
      .replace(/\busing\s+\w+\b/gi, '')
      .trim();
    const name = nameFromDesc.length > 3
      ? nameFromDesc.charAt(0).toUpperCase() + nameFromDesc.slice(1)
      : description.slice(0, 50);

    // Extract plugin names if mentioned (e.g., "using firecrawl")
    const pluginMatch = description.match(/\busing\s+([\w,\s]+?)(?:\s+(?:every|daily|hourly|at)\b|$)/i);
    const plugins = pluginMatch
      ? pluginMatch[1].split(/[,\s]+/).map(p => p.trim()).filter(Boolean)
      : [];

    console.log('');
    console.log(`  ${DIM}Name: ${name}${RESET}`);
    console.log(`  ${DIM}Schedule: ${parsed.humanReadable} (${parsed.cron})${RESET}`);
    console.log(`  ${DIM}Task: ${description}${RESET}`);
    if (plugins.length > 0) {
      console.log(`  ${DIM}Plugins: ${plugins.join(', ')}${RESET}`);
    }
    console.log('');

    const confirm = await ask(rl, `  Create this agent? (Y/n): `);
    rl.close();

    if (confirm.toLowerCase() === 'n') {
      console.log(`  ${DIM}Cancelled.${RESET}`);
      return;
    }

    try {
      const agent = await store.createAgent('default', {
        name,
        description: description.slice(0, 100),
        instructions: description,
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
