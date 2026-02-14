#!/usr/bin/env node

/**
 * friday — CLI entry point
 *
 * Usage:
 *   friday chat [--workspace <path>]    Interactive conversation
 *   friday serve [--port <port>]        Start HTTP/WebSocket server
 *   friday --help                       Show help
 */

import { run } from '../src/cli.js';
run(process.argv.slice(2));
