import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const legacyFragments = [
  'masarray/' + 'ArSonKuPik',
  'masarray.github.io/' + 'ArSonKuPik'
];
const textExtensions = new Set(['.md', '.html', '.js', '.mjs', '.json', '.xml', '.txt', '.yml', '.yaml', '.py']);
const ignoredDirectories = new Set(['.git', 'dist', 'node_modules']);
const failures = [];

function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      scan(absolute);
      continue;
    }
    if (!entry.isFile() || !textExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const text = fs.readFileSync(absolute, 'utf8');
    for (const fragment of legacyFragments) {
      if (text.includes(fragment)) {
        failures.push(`${path.relative(root, absolute)} contains legacy repository identity: ${fragment}`);
      }
    }
  }
}

scan(root);

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Repository identity check passed.');
