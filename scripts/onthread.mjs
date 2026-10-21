#!/usr/bin/env node
// OnThread entry point.
//   node onthread.mjs hook <start|prompt|stop|expansion>   (called by Claude Code, JSON on stdin)
//   node onthread.mjs cli <topic|list|off|on|status|forget|reset> --session <id> [args]
// Hooks never fail the user's turn: any error is logged and the hook exits 0 silently.
import fs from 'node:fs';
import path from 'node:path';
import { COMMANDS, cmdForget, cmdReset, cmdStatus } from './lib/commands.mjs';
import { HOOKS } from './lib/hooks.mjs';
import { dataDir, isValidId, safeError } from './lib/store.mjs';

const MAX_STDIN = 2 * 1024 * 1024;
const T0 = Date.now();

// Optional timing trace for diagnosing slow hooks: ONTHREAD_TRACE=<file>.
// It records event names and milliseconds only, never any content.
function trace(step) {
  if (!process.env.ONTHREAD_TRACE) return;
  try {
    fs.appendFileSync(process.env.ONTHREAD_TRACE, `${new Date().toISOString()} pid=${process.pid} ${step} +${Date.now() - T0}ms uptime=${Math.round(process.uptime() * 1000)}ms\n`);
  } catch { /* diagnostics only */ }
}
trace(`start ${process.argv[3] || ''}`);
process.on('exit', () => trace('exit'));

function logError(event, err) {
  try {
    const file = path.join(dataDir(), 'onthread-errors.log');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      if (fs.statSync(file).size > 64 * 1024) fs.writeFileSync(file, '');
    } catch { /* new file */ }
    // Never log an arbitrary message: a parser error can quote the hook's input (the prompt).
    const what = err?.safe ? err.message : `${err?.name || 'Error'}${err?.code ? ` ${err.code}` : ''}`;
    fs.appendFileSync(file, `${new Date().toISOString()} ${event}: ${String(what).slice(0, 120)}\n`);
  } catch { /* never fail the user's turn */ }
}

// Claude Code sends one JSON object. Stop reading as soon as it is complete:
// waiting for end-of-stream can cost seconds on a loaded machine, and hooks are
// killed after 5 s.
function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.stdin.pause();
      resolve(raw);
    };
    const timer = setTimeout(done, 1000);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_STDIN) { raw = ''; done(); return; }
      if (raw.trimEnd().endsWith('}')) {
        try { JSON.parse(raw); done(); } catch { /* incomplete, keep reading */ }
      }
    });
    process.stdin.on('end', done);
    process.stdin.on('error', done);
  });
}

async function runHook(event) {
  const handler = HOOKS[event];
  try {
    if (!handler) throw safeError('unknown hook event');
    let input;
    try {
      input = JSON.parse(await readStdin());
      trace('stdin parsed');
    } catch {
      throw safeError('invalid hook input');
    }
    const output = handler(input && typeof input === 'object' ? input : {});
    trace('handler done');
    if (output) await new Promise((resolve) => process.stdout.write(JSON.stringify(output), resolve));
  } catch (err) {
    logError(event, err);
  }
  process.stdin.destroy(); // do not wait for end-of-stream to exit
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
