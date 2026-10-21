#!/usr/bin/env node
// OnThread entry point.
//   node onthread.mjs hook <start|prompt|stop|expansion>   (called by Claude Code, JSON on stdin)
//   node onthread.mjs cli <topic|list|off|on|status|forget|reset> --session <id> [args]
// Hooks never fail the user's turn: any error is logged and the hook exits 0 silently.
import fs from 'node:fs';
import path from 'node:path';
import { COMMANDS, cmdForget, cmdReset, cmdStatus } from './lib/commands.mjs';
import { HOOKS } from './lib/hooks.mjs';
import { dataDir, isValidId } from './lib/store.mjs';

const MAX_STDIN = 2 * 1024 * 1024;

function logError(event, err) {
  try {
    const file = path.join(dataDir(), 'onthread-errors.log');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      if (fs.statSync(file).size > 64 * 1024) fs.writeFileSync(file, '');
    } catch { /* new file */ }
    fs.appendFileSync(file, `${new Date().toISOString()} ${event}: ${String(err?.message || err).slice(0, 300)}\n`);
  } catch { /* never fail the user's turn */ }
}

function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    const done = () => resolve(raw);
    const timer = setTimeout(done, 3000);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_STDIN) { raw = ''; clearTimeout(timer); done(); }
    });
    process.stdin.on('end', () => { clearTimeout(timer); done(); });
    process.stdin.on('error', () => { clearTimeout(timer); done(); });
  });
}

async function runHook(event) {
  const handler = HOOKS[event];
  try {
    if (!handler) throw new Error(`unknown hook "${event}"`);
    const input = JSON.parse(await readStdin());
    const output = handler(input && typeof input === 'object' ? input : {});
    if (output) process.stdout.write(JSON.stringify(output));
  } catch (err) {
    logError(event, err);
  }
  process.exitCode = 0;
}

function runCli(argv) {
  const [cmd, ...rest] = argv;
  let session = null;
  const args = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--session') session = rest[++i];
    else args.push(rest[i]);
  }
  const table = { ...COMMANDS, status: cmdStatus, forget: cmdForget, reset: () => cmdReset() };
  if (!table[cmd]) {
    process.stderr.write('usage: onthread cli <topic|list|off|on|status|forget|reset> --session <id> [args]\n');
    process.exitCode = 2;
    return;
  }
  if (cmd !== 'reset' && cmd !== 'list' && cmd !== 'status' && !isValidId(session)) {
    process.stderr.write('a valid --session <id> is required\n');
    process.exitCode = 2;
    return;
  }
  process.stdout.write(table[cmd](session, args.join(' ')) + '\n');
}

const [mode, ...argv] = process.argv.slice(2);
if (mode === 'hook') await runHook(argv[0]);
else if (mode === 'cli') runCli(argv);
else if (mode !== undefined) {
  process.stderr.write('usage: onthread hook <event> | onthread cli <command>\n');
  process.exitCode = 2;
}
