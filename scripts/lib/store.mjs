// Local registry: one small JSON file per conversation, plus a settings file.
// Writes are atomic (temp file + rename) and serialized per file with a lock file,
// so several conversations can run at the same time without corrupting anything.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SCHEMA_VERSION = 1;

const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  enabled: true,
  inactiveDays: 90,
  maxCandidates: 5,
});

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const LOCK_STALE_MS = 3000;
const LOCK_WAIT_MS = 2000;

export function dataDir() {
  return process.env.ONTHREAD_DATA_DIR
    || process.env.CLAUDE_PLUGIN_DATA
    || path.join(os.homedir(), '.claude', 'plugins', 'data', 'onthread-local');
}

function conversationsDir() {
  return path.join(dataDir(), 'conversations');
}

export function isValidId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

function conversationPath(id) {
  if (!isValidId(id)) throw new Error('invalid conversation id');
  return path.join(conversationsDir(), `${id}.json`);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withLock(file, fn) {
  const lock = `${file}.lock`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const deadline = Date.now() + LOCK_WAIT_MS;
  let fd = null;
  while (fd === null) {
    try {
      fd = fs.openSync(lock, 'wx');
    } catch (err) {
      if (err.code !== 'EEXIST' && err.code !== 'EPERM' && err.code !== 'EACCES') throw err;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS) fs.rmSync(lock, { force: true });
      } catch { /* lock vanished meanwhile */ }
      if (Date.now() > deadline) throw new Error('registry lock timeout');
      sleep(10 + Math.floor(Math.random() * 15));
    }
  }
  try {
    return fn();
  } finally {
    fs.closeSync(fd);
    fs.rmSync(lock, { force: true });
  }
}

function atomicWrite(file, value) {
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (err) {
      // Windows: a reader or an antivirus can hold the target for a moment.
      if (attempt >= 20 || !['EPERM', 'EACCES', 'EBUSY'].includes(err.code)) {
        fs.rmSync(tmp, { force: true });
        throw err;
      }
      sleep(10);
    }
  }
}

function readJson(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { missing: true };
    throw err;
  }
  try {
    return { value: JSON.parse(raw) };
  } catch {
    return { corrupt: true };
  }
}

function quarantine(file) {
  try {
    fs.renameSync(file, `${file}.corrupt-${Date.now()}`);
  } catch { /* best effort */ }
}

function isConversation(value) {
  return value && typeof value === 'object' && isValidId(value.id);
}

export function readConversation(id) {
  const file = conversationPath(id);
  const res = readJson(file);
  if (res.missing) return null;
  if (res.corrupt || !isConversation(res.value)) {
    quarantine(file);
    return null;
  }
  return res.value;
}

export function newConversation(id, now = new Date()) {
  const iso = now.toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    title: null,
    project: null,
    topic: null,
    promptsSinceTopic: 0,
    exceptions: [],
    protection: true,
    origin: 'unknown',
    createdAt: iso,
    updatedAt: iso,
    lastActiveAt: iso,
  };
}

// Read-modify-write under the conversation's lock. `fn` receives the current
// record (or a fresh one) and mutates it; returning false skips the write.
export function updateConversation(id, fn, now = new Date()) {
  const file = conversationPath(id);
  return withLock(file, () => {
    const res = readJson(file);
    let conv = res.value;
    if (res.corrupt || (res.value && !isConversation(res.value))) {
      quarantine(file);
      conv = null;
    }
    conv = conv || newConversation(id, now);
    if (fn(conv) === false) return conv;
    conv.schemaVersion = SCHEMA_VERSION;
    conv.updatedAt = now.toISOString();
    atomicWrite(file, conv);
    return conv;
  });
}

export function deleteConversation(id) {
  const file = conversationPath(id);
  return withLock(file, () => {
    const existed = fs.existsSync(file);
    fs.rmSync(file, { force: true });
    return existed;
  });
}

// All readable conversations. Unreadable or corrupt files are skipped, never fatal.
export function listConversations({ activeWithinDays = null, now = Date.now() } = {}) {
  let names;
  try {
    names = fs.readdirSync(conversationsDir());
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const cutoff = activeWithinDays == null ? null : now - activeWithinDays * 86400000;
  const out = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(conversationsDir(), name);
    try {
      if (cutoff !== null && fs.statSync(file).mtimeMs < cutoff) continue;
      const res = readJson(file);
      if (!res.value || !isConversation(res.value)) continue;
      const last = Date.parse(res.value.lastActiveAt || res.value.updatedAt || 0);
      if (cutoff !== null && !(last >= cutoff)) continue;
      out.push(res.value);
    } catch { /* skip unreadable entry */ }
  }
  return out;
}

export function readSettings() {
  const res = readJson(path.join(dataDir(), 'settings.json'));
  const value = res.value && typeof res.value === 'object' ? res.value : {};
  const s = { ...DEFAULT_SETTINGS, ...value };
  if (typeof s.enabled !== 'boolean') s.enabled = true;
  if (!Number.isFinite(s.inactiveDays) || s.inactiveDays < 1) s.inactiveDays = DEFAULT_SETTINGS.inactiveDays;
  if (!Number.isInteger(s.maxCandidates) || s.maxCandidates < 0 || s.maxCandidates > 20) {
    s.maxCandidates = DEFAULT_SETTINGS.maxCandidates;
  }
  return s;
}

export function updateSettings(fn) {
  const file = path.join(dataDir(), 'settings.json');
  return withLock(file, () => {
    const s = readSettings();
    fn(s);
    s.schemaVersion = SCHEMA_VERSION;
    atomicWrite(file, s);
    return s;
  });
}

export function resetAll() {
  fs.rmSync(conversationsDir(), { recursive: true, force: true });
  fs.rmSync(path.join(dataDir(), 'settings.json'), { force: true });
}
