// A "project" is the git root of the working directory, or the directory itself.
// It only groups conversations; two conversations in one project stay distinct.
import fs from 'node:fs';
import path from 'node:path';

export function projectOf(cwd) {
  if (typeof cwd !== 'string' || !cwd) return null;
  let dir = path.resolve(cwd);
  let root = dir;
  for (let i = 0; i < 40; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) { root = dir; break; }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { path: root, name: path.basename(root) || root };
}

export function sameProject(a, b) {
  if (!a || !b) return false;
  const norm = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  return norm(a.path) === norm(b.path);
}
