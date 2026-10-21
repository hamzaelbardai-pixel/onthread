// Group D: packaging and installation (brief tests 29-31, 33, 34).
// Uses Claude Code's own CLI with an isolated CLAUDE_CONFIG_DIR: the user's real
// configuration is never touched. Skipped when no Claude Code binary is found (e.g. CI).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findClaude, ROOT, tempDir } from './helpers.mjs';

const CLAUDE = findClaude();
const skip = CLAUDE ? false : 'Claude Code binary not found (set CLAUDE_BIN)';

function claude(args, configDir) {
  const res = spawnSync(CLAUDE, args, {
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, ...(configDir ? { CLAUDE_CONFIG_DIR: configDir } : {}) },
  });
  return { code: res.status, out: `${res.stdout || ''}${res.stderr || ''}` };
}

function hashTree(dir) {
  const h = crypto.createHash('sha256');
  const walk = (d) => {
    for (const name of fs.readdirSync(d).sort()) {
      if (name === '.git' || name === 'node_modules') continue;
      const p = path.join(d, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else h.update(name).update(fs.readFileSync(p));
    }
  };
  walk(dir);
  return h.digest('hex');
}

test('D29 plugin manifest and components pass strict validation', { skip }, () => {
  for (const target of ['.claude-plugin/plugin.json', 'skills']) {
    const res = claude(['plugin', 'validate', path.join(ROOT, target), '--strict']);
    assert.equal(res.code, 0, res.out);
  }
});

test('D30 marketplace manifest passes strict validation', { skip }, () => {
  const res = claude(['plugin', 'validate', ROOT, '--strict']);
  assert.equal(res.code, 0, res.out);
  assert.match(res.out, /marketplace/i);
});

test('D31/D33 install from the local marketplace, then uninstall without side effects', { skip }, () => {
  const cfg = path.join(tempDir('onthread-cfg-'), 'claude');
  fs.mkdirSync(cfg, { recursive: true });
  const before = hashTree(ROOT);

  let res = claude(['plugin', 'marketplace', 'add', ROOT], cfg);
  assert.equal(res.code, 0, res.out);
  res = claude(['plugin', 'install', 'onthread@onthread', '-y'], cfg);
  assert.equal(res.code, 0, res.out);
  const listed = JSON.parse(claude(['plugin', 'list', '--json'], cfg).out);
  const entry = listed.find((p) => p.id === 'onthread@onthread');
  assert.ok(entry?.enabled, 'plugin installed and enabled');

  res = claude(['plugin', 'uninstall', 'onthread@onthread', '-y'], cfg);
  assert.equal(res.code, 0, res.out);
  assert.deepEqual(JSON.parse(claude(['plugin', 'list', '--json'], cfg).out), []);
  assert.equal(hashTree(ROOT), before, 'repository files unchanged');
  const settings = JSON.parse(fs.readFileSync(path.join(cfg, 'settings.json'), 'utf8'));
  assert.ok(!Object.keys(settings.enabledPlugins || {}).includes('onthread@onthread'));
});

test('D34 no network, no telemetry, no extra service: runtime code uses only local modules', () => {
  const dir = path.join(ROOT, 'scripts');
  const files = [];
  const walk = (d) => fs.readdirSync(d).forEach((n) => {
    const p = path.join(d, n);
    if (fs.statSync(p).isDirectory()) walk(p); else if (n.endsWith('.mjs')) files.push(p);
  });
  walk(dir);
  const allowed = new Set(['node:fs', 'node:os', 'node:path']);
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
      assert.ok(m[1].startsWith('./') || allowed.has(m[1]), `${path.basename(f)} imports ${m[1]}`);
    }
    assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|child_process|require\(/, path.basename(f));
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'node_modules')), false);
  assert.ok(os.platform());
});
