import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ENTRY = path.join(ROOT, 'scripts', 'onthread.mjs');

export function tempDir(prefix = 'onthread-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function uuid() {
  return crypto.randomUUID();
}

// Runs a hook exactly as Claude Code does: JSON on stdin, JSON (or nothing) on stdout.
export function runHook(event, input, dataDir, extraEnv = {}) {
  const started = process.hrtime.bigint();
  const res = spawnSync(process.execPath, [ENTRY, 'hook', event], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    env: { ...process.env, ONTHREAD_DATA_DIR: dataDir, ...extraEnv },
    encoding: 'utf8',
    timeout: 10000,
  });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  let json = null;
  if (res.stdout) json = JSON.parse(res.stdout);
  return { status: res.status, stdout: res.stdout, stderr: res.stderr, json, ms };
}

export function runHookAsync(event, input, dataDir) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [ENTRY, 'hook', event], {
      env: { ...process.env, ONTHREAD_DATA_DIR: dataDir },
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out }));
    child.stdin.end(JSON.stringify(input));
  });
}

export function runCli(args, dataDir) {
  return spawnSync(process.execPath, [ENTRY, 'cli', ...args], {
    env: { ...process.env, ONTHREAD_DATA_DIR: dataDir },
    encoding: 'utf8',
  });
}

export function context(res) {
  return res.json?.hookSpecificOutput?.additionalContext || '';
}

export function readConv(dataDir, id) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, 'conversations', `${id}.json`), 'utf8'));
}

// Writes a registry entry directly (fixture), as if OnThread had recorded it earlier.
export function seed(dataDir, conv) {
  const dir = path.join(dataDir, 'conversations');
  fs.mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  const full = {
    schemaVersion: 1, title: null, project: null, topic: null, promptsSinceTopic: 5,
    exceptions: [], protection: true, origin: 'startup', createdAt: now, updatedAt: now, lastActiveAt: now,
    ...conv,
  };
  fs.writeFileSync(path.join(dir, `${full.id}.json`), JSON.stringify(full));
  return full;
}

export function topic(text, source = 'auto') {
  return { text, source, setAt: new Date().toISOString() };
}

export function project(dir) {
  return { path: dir, name: path.basename(dir) };
}

function readdir(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}

// Copies of Claude Code bundled with the desktop app, newest version first. Two layouts:
// %APPDATA%\Claude\claude-code\<ver>\<hash>\claude.exe (classic installer) and
// %LOCALAPPDATA%\Claude-Data\<package>\claude-code\<ver>\<hash>\claude.exe (Store / MSIX).
function desktopBuilds() {
  const roots = [];
  if (process.env.APPDATA) roots.push(path.join(process.env.APPDATA, 'Claude', 'claude-code'));
  if (process.env.LOCALAPPDATA) {
    const data = path.join(process.env.LOCALAPPDATA, 'Claude-Data');
    for (const pkg of readdir(data)) roots.push(path.join(data, pkg, 'claude-code'));
  }
  const builds = [];
  for (const root of roots) {
    for (const v of readdir(root).filter((n) => /^\d+\.\d+\.\d+$/.test(n))) {
      for (const sub of readdir(path.join(root, v))) {
        const exe = path.join(root, v, sub, 'claude.exe');
        if (fs.existsSync(exe)) builds.push({ v, exe });
      }
    }
  }
  return builds.sort((a, b) => b.v.localeCompare(a.v, undefined, { numeric: true }));
}

// Claude Code's own binary: $CLAUDE_BIN, else the newest desktop copy, else `claude` on PATH.
export function findClaude() {
  if (process.env.CLAUDE_BIN && fs.existsSync(process.env.CLAUDE_BIN)) return process.env.CLAUDE_BIN;
  const newest = desktopBuilds()[0];
  if (newest) return newest.exe;
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' });
  const first = which.status === 0 && which.stdout.split(/\r?\n/)[0].trim();
  return first || null;
}
