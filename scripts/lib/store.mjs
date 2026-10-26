// Local registry: one small JSON file per conversation, plus a settings file.
// Writes are atomic (temp file + rename) and serialized per file with a lock file,
// so several conversations can run at the same time without corrupting anything.
import crypto from 'node:crypto';
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
// Node.js has no portable OS lock. Claude Code kills a hook after its 5 s timeout
// (hooks/hooks.json), so a lock older than 8 s is presumed abandoned and recovered.
// Best effort: an owner frozen longer than that (e.g. machine sleep) can later
// overwrite updates made meanwhile; the file itself is never corrupted.
const LOCK_STALE_MS = 8000;
const LOCK_WAIT_MS = 1500;

// Errors whose message is safe to log (it never contains user content).
export function safeError(message) {
  return Object.assign(new Error(message), { safe: true });
}

export function dataDir() {
  return process.env.ONTHREAD_DATA_DIR
    || process.env.CLAUDE_PLUGIN_DATA
    || path.join(os.homedir(), '.claude', 'plugins', 'data', 'onthread-local');
}

// Each reset starts a new registry generation in its own folder. A process keeps
// the generation it started with, so a write that began before a reset can only
// land in the old (discarded) folder, never in the new registry.
const GEN_RE = /^[A-Za-z0-9-]{1,64}$/;
let genCache = null;

function generationPath() {
  return path.join(dataDir(), 'generation.json');
}

function currentGeneration() {
  const dir = dataDir();
  if (genCache?.dir !== dir) {
    let gen = '';
    try {
      const v = JSON.parse(fs.readFileSync(generationPath(), 'utf8'));
      if (GEN_RE.test(v?.generation)) gen = v.generation;
    } catch { /* first generation: plain "conversations" folder */ }
    genCache = { dir, gen };
  }
  return genCache.gen;
}

// Throws if a reset happened since this process captured its generation, so a
// retired generation folder is never recreated or written again.
function assertCurrentGeneration() {
  const captured = currentGeneration();
  let onDisk = '';
  try {
    const v = JSON.parse(fs.readFileSync(generationPath(), 'utf8'));
    if (GEN_RE.test(v?.generation)) onDisk = v.generation;
  } catch { /* no reset ever happened */ }
  if (onDisk !== captured) throw safeError('registry was reset');
}

function conversationsDir() {
  const gen = currentGeneration();
  return path.join(dataDir(), gen ? `conversations-${gen}` : 'conversations');
}

export function isValidId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

function conversationPath(id) {
  if (!isValidId(id)) throw safeError('invalid conversation id');
  return path.join(conversationsDir(), `${id}.json`);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

function isStale(file) {
  try { return Date.now() - fs.statSync(file).mtimeMs > LOCK_STALE_MS; } catch { return false; }
}

// Removes a dead owner's lock. Recovery is serialized by a second O_EXCL guard
// file, so only one process at a time may remove a lock it does not own, and it
// re-checks staleness under that guard. A live owner never holds a lock that long.
function recoverStale(lock) {
  if (!isStale(lock)) return;
  const guard = `${lock}.recover`;
  let fd;
  try {
    fd = fs.openSync(guard, 'wx');
  } catch {
    if (isStale(guard)) fs.rmSync(guard, { force: true }); // a recoverer died mid-way
    return;
  }
  fs.closeSync(fd);
  try {
    if (isStale(lock)) fs.rmSync(lock, { force: true });
  } finally {
    fs.rmSync(guard, { force: true });
  }
}

function withLock(file, fn) {
  const lock = `${file}.lock`;
  const token = `${process.pid}.${crypto.randomUUID()}`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      const fd = fs.openSync(lock, 'wx');
      try { fs.writeSync(fd, token); } finally { fs.closeSync(fd); }
      break;
    } catch (err) {
      if (err.code !== 'EEXIST' && err.code !== 'EPERM' && err.code !== 'EACCES') throw err;
      recoverStale(lock);
      if (Date.now() > deadline) throw safeError('registry lock timeout');
      sleep(10 + Math.floor(Math.random() * 15));
    }
  }
  try {
    return fn();
  } finally {
    // Only release our own lock, never one that replaced it.
    if (readText(lock) === token) fs.rmSync(lock, { force: true });
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

const isStr = (v) => typeof v === 'string';
const isDate = (v) => isStr(v) && Number.isFinite(Date.parse(v));

// Every field the hooks read must have the expected shape, or the record is ignored.
export function isConversation(v, expectedId = null) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || !isValidId(v.id)) return false;
  if (expectedId !== null && v.id !== expectedId) return false;
  if (v.title !== null && v.title !== undefined && !isStr(v.title)) return false;
  if (v.project !== null && v.project !== undefined
    && !(v.project && isStr(v.project.path) && isStr(v.project.name))) return false;
  if (v.topic !== null && v.topic !== undefined
    && !(v.topic && isStr(v.topic.text) && v.topic.text.length > 0)) return false;
  if (v.exceptions !== undefined && !(Array.isArray(v.exceptions) && v.exceptions.every((e) => e && isStr(e.text)))) return false;
  if (v.protection !== undefined && typeof v.protection !== 'boolean') return false;
  if (v.pendingQuestion !== undefined && v.pendingQuestion !== null
    && !(isStr(v.pendingQuestion.text) && isDate(v.pendingQuestion.at))) return false;
  if (v.pendingAnswer !== undefined && typeof v.pendingAnswer !== 'boolean') return false;
  if (v.promptsSinceTopic !== undefined && !(Number.isInteger(v.promptsSinceTopic) && v.promptsSinceTopic >= 0)) return false;
  if (!isDate(v.lastActiveAt)) return false;
  return true;
}

// Read-only: an unreadable record is reported as absent, never moved.
export function readConversation(id) {
  const res = readJson(conversationPath(id));
  return res.value && isConversation(res.value, id) ? res.value : null;
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
  assertCurrentGeneration();
  return withLock(file, () => {
    const res = readJson(file);
    let conv = res.value;
    if (res.corrupt || (res.value && !isConversation(res.value, id))) {
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
  assertCurrentGeneration();
  return withLock(file, () => {
    const existed = fs.existsSync(file);
    fs.rmSync(file, { force: true });
    return existed;
  });
}

// All valid conversations. Unreadable, corrupt or malformed files are skipped, never fatal.
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
      if (!res.value || !isConversation(res.value, name.slice(0, -'.json'.length))) continue;
      if (cutoff !== null && !(Date.parse(res.value.lastActiveAt) >= cutoff)) continue;
      out.push(res.value);
    } catch { /* skip unreadable entry */ }
  }
  return out;
}

export function readSettings() {
  const res = readJson(path.join(dataDir(), 'settings.json'));
  const value = res.value && typeof res.value === 'object' && !Array.isArray(res.value) ? res.value : {};
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

// Switches to a brand-new, empty registry generation, then deletes every older
// generation folder (including any left behind by a write that raced an earlier
// reset). Publication and cleanup happen under one registry-wide lock, so two
// resets can never delete each other's active generation. Writers still holding
// an older generation can only write into a discarded folder.
export function resetAll() {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  withLock(path.join(dir, 'registry'), () => {
    const gen = crypto.randomUUID();
    atomicWrite(generationPath(), { generation: gen });
    genCache = { dir, gen };
    const settings = path.join(dir, 'settings.json');
    withLock(settings, () => fs.rmSync(settings, { force: true }));
    for (const name of fs.readdirSync(dir)) {
      if ((name === 'conversations' || name.startsWith('conversations-')) && name !== `conversations-${gen}`) {
        fs.rmSync(path.join(dir, name), { recursive: true, force: true });
      }
    }
  });
}
