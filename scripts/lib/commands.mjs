// The /onthread:* commands. They run inside a hook (or the CLI fallback) and
// return a plain-text result that Claude relays to the user.
import { isConfirmed, labelOf } from './context.mjs';
import { sameProject } from './project.mjs';
import {
  deleteConversation, listConversations, readConversation, readSettings, resetAll,
  updateConversation, updateSettings,
} from './store.mjs';
import { cleanLabel } from './text.mjs';

function shortId(id) {
  return String(id).slice(0, 8);
}

function dateOnly(iso) {
  return String(iso || '').slice(0, 10) || '?';
}

function topicLine(conv) {
  if (!conv?.topic) return 'Topic: not set yet (it is suggested automatically after the first real request).';
  const how = conv.topic.source === 'user' ? 'set by you' : isConfirmed(conv) ? 'detected, confirmed' : 'detected, provisional';
  return `Topic: "${conv.topic.text}" (${how}).`;
}

export function cmdTopic(sessionId, args) {
  const text = cleanLabel(args);
  if (!text) {
    const conv = readConversation(sessionId);
    const prot = conv && conv.protection === false ? ' Protection is OFF for this conversation.' : '';
    return `${topicLine(conv)}${prot} To change it: /onthread:topic <new topic>.`;
  }
  const conv = updateConversation(sessionId, (c) => {
    c.topic = { text, source: 'user', setAt: new Date().toISOString() };
    c.promptsSinceTopic = 0;
  });
  return `Topic updated. ${topicLine(conv)}`;
}

export function cmdList(sessionId) {
  const settings = readSettings();
  const all = listConversations();
  if (!all.length) return 'No conversation recorded yet.';
  const self = all.find((c) => c.id === sessionId) || null;
  const cutoff = Date.now() - settings.inactiveDays * 86400000;
  const groups = new Map();
  for (const c of all) {
    const key = c.project?.name || '(no project)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const lines = [`${all.length} conversation(s) recorded${settings.enabled ? '' : ' — OnThread is paused everywhere'}.`];
  const order = [...groups.keys()].sort((a, b) => {
    const sa = self && groups.get(a).some((c) => sameProject(c.project, self.project));
    const sb = self && groups.get(b).some((c) => sameProject(c.project, self.project));
    return sb - sa || a.localeCompare(b);
  });
  let shown = 0;
  for (const key of order) {
    lines.push(`Project ${key}:`);
    const convs = groups.get(key).sort((a, b) => Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt));
    for (const c of convs) {
      if (shown >= 60) break;
      shown++;
      const flags = [];
      if (c.id === sessionId) flags.push('this conversation');
      if (c.protection === false) flags.push('protection off');
      if (Date.parse(c.lastActiveAt) < cutoff) flags.push('inactive');
      const label = labelOf(c) || '(no title, no topic yet)';
      const topic = c.title && c.topic ? ` — topic "${c.topic.text}"` : '';
      lines.push(`- "${label}"${topic} — last active ${dateOnly(c.lastActiveAt)} — id ${shortId(c.id)}${flags.length ? ` [${flags.join(', ')}]` : ''}`);
    }
  }
  if (all.length > shown) lines.push(`… and ${all.length - shown} more.`);
  return lines.join('\n');
}

export function cmdOff(sessionId, args) {
  if (/^\s*all\s*$/i.test(args || '')) {
    updateSettings((s) => { s.enabled = false; });
    return 'OnThread is now paused in every conversation. Turn it back on with /onthread:on all.';
  }
  updateConversation(sessionId, (c) => { c.protection = false; });
  return 'OnThread protection is now OFF for this conversation only. Turn it back on with /onthread:on.';
}

export function cmdOn(sessionId, args) {
  if (/^\s*all\s*$/i.test(args || '')) {
    updateSettings((s) => { s.enabled = true; });
    return 'OnThread is active again in every conversation (conversations you switched off one by one stay off).';
  }
  const s = readSettings();
  updateConversation(sessionId, (c) => { c.protection = true; });
  return s.enabled
    ? 'OnThread protection is ON for this conversation.'
    : 'Protection is ON for this conversation, but OnThread is paused everywhere: run /onthread:on all.';
}

export function cmdStatus(sessionId) {
  const s = readSettings();
  const conv = sessionId ? readConversation(sessionId) : null;
  const count = listConversations().length;
  return [
    `OnThread is ${s.enabled ? 'active' : 'paused everywhere'}; ${count} conversation(s) recorded; inactive after ${s.inactiveDays} days.`,
    conv ? `This conversation: ${conv.protection === false ? 'protection OFF' : 'protection ON'}. ${topicLine(conv)}` : 'This conversation is not recorded yet.',
  ].join('\n');
}

export function cmdForget(sessionId) {
  return deleteConversation(sessionId)
    ? 'This conversation was removed from the OnThread registry.'
    : 'This conversation was not in the registry.';
}

export function cmdReset() {
  resetAll();
  return 'All OnThread data was deleted (conversations and settings).';
}

export const COMMANDS = { topic: cmdTopic, list: cmdList, off: cmdOff, on: cmdOn };
