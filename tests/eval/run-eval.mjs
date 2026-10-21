#!/usr/bin/env node
// Live evaluation of Claude's judgment with OnThread loaded (brief tests 9-17 and 24-26).
// It runs the real Claude Code CLI on the user's own account (no API key, no extra
// service), with the plugin loaded for that run only (--plugin-dir) and a throw-away
// OnThread data directory. Each scenario costs one short Claude Code turn of quota.
//
//   node tests/eval/run-eval.mjs [scenario-id ...]
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findClaude, ROOT } from '../helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(fs.readFileSync(path.join(here, 'scenarios.json'), 'utf8'));
const CLAUDE = findClaude();
if (!CLAUDE) {
  console.error('Claude Code binary not found. Set CLAUDE_BIN.');
  process.exit(2);
}

const ASK_RE = /\?/;
const CONTINUE_RE = /(continu|poursui|on y va|keep going|proceed|go ahead|ici|here|plutôt|rather|dédiée|dedicated|nouvelle conversation|new conversation)/i;

function classify(reply, scenario) {
  const head = reply.slice(0, 600);
  const asks = ASK_RE.test(head) && CONTINUE_RE.test(head) && /(conversation|discussion|thread|session)/i.test(head);
  const mentionOk = !scenario.mention || new RegExp(scenario.mention, 'i').test(head);
  return { asks, mentionOk };
}

function seed(dir, key, id, projectDir, extra = {}) {
  const c = spec.conversations[key];
  const now = new Date().toISOString();
  const rec = {
    schemaVersion: 1, id, title: c.title, project: { path: projectDir, name: path.basename(projectDir) },
    topic: { text: c.topic, source: 'user', setAt: now }, promptsSinceTopic: 5, exceptions: [],
    protection: true, origin: 'startup', createdAt: now, updatedAt: now, lastActiveAt: now, ...extra,
  };
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(rec));
}

function run(scenario) {
  // Long path form: Claude Code asks for approval on Windows 8.3 short names (e.g. ABCDEF~1).
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'onthread-eval-')));
  const data = path.join(base, 'data');
  const convDir = path.join(data, 'conversations');
  const projectDir = path.join(base, 'shop');
  fs.mkdirSync(convDir, { recursive: true });
  fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true });
  const sid = crypto.randomUUID();
  if (scenario.self) {
    seed(convDir, scenario.self, sid, projectDir, {
      exceptions: (scenario.exceptions || []).map((text) => ({ text, at: new Date().toISOString() })),
    });
  }
  for (const key of scenario.others) seed(convDir, key, crypto.randomUUID(), projectDir);

  const started = Date.now();
  const res = spawnSync(CLAUDE, [
    '-p', scenario.prompt,
    '--plugin-dir', ROOT,
    '--session-id', sid,
    '--max-turns', '3',
    '--output-format', 'json',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--tools', 'Read,Glob,Grep',
  ], {
    cwd: projectDir,
    encoding: 'utf8',
    timeout: 240000,
    env: { ...process.env, ONTHREAD_DATA_DIR: data },
  });
  let reply = '';
  try {
    reply = JSON.parse(res.stdout).result || '';
  } catch {
    reply = `(no JSON result) ${String(res.stdout || res.stderr).slice(0, 400)}`;
  }
  const { asks, mentionOk } = classify(reply, scenario);
  let pass;
  let detail = '';
  if (scenario.expect === 'ask') pass = asks && mentionOk;
  else if (scenario.expect === 'proceed') pass = !asks;
  else {
    const rec = JSON.parse(fs.readFileSync(path.join(convDir, `${sid}.json`), 'utf8'));
    pass = Boolean(rec.topic?.text) && !asks;
    detail = rec.topic ? `recorded topic: "${rec.topic.text}"` : 'no topic recorded';
  }
  fs.rmSync(base, { recursive: true, force: true });
  return { id: scenario.id, expect: scenario.expect, pass, asks, detail, seconds: Math.round((Date.now() - started) / 1000), reply };
}

const only = process.argv.slice(2);
const scenarios = spec.scenarios.filter((s) => !only.length || only.includes(s.id));
const version = spawnSync(CLAUDE, ['--version'], { encoding: 'utf8' }).stdout.trim();
const results = [];
for (const s of scenarios) {
  process.stdout.write(`${s.id} … `);
  const r = run(s);
  results.push(r);
  console.log(`${r.pass ? 'PASS' : 'FAIL'} (${r.seconds}s)${r.detail ? ` ${r.detail}` : ''}`);
}

const passed = results.filter((r) => r.pass).length;
const lines = [
  '# OnThread live evaluation',
  '',
  `Date: ${new Date().toISOString().slice(0, 10)} · Claude Code ${version} · ${passed}/${results.length} scenarios as expected.`,
  'Fictional conversations (tests/eval/scenarios.json). The classifier is a simple heuristic; replies are shown in full so you can judge them yourself.',
  '',
  '| Scenario | Expected | Result |',
  '|---|---|---|',
  ...results.map((r) => `| ${r.id} | ${r.expect} | ${r.pass ? 'as expected' : '**not as expected**'}${r.detail ? ` (${r.detail})` : ''} |`),
  '',
  ...results.flatMap((r) => [`## ${r.id}`, '', '```text', r.reply.trim().slice(0, 1500), '```', '']),
];
if (only.length) {
  console.log(`\n${passed}/${results.length} as expected (subset run: docs/EVAL-RESULTS.md not rewritten).`);
} else {
  const out = path.join(ROOT, 'docs', 'EVAL-RESULTS.md');
  fs.writeFileSync(out, lines.join('\n'));
  console.log(`\n${passed}/${results.length} as expected. Report: ${path.relative(ROOT, out)}`);
}
process.exitCode = passed === results.length ? 0 : 1;
