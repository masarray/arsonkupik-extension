#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const args = process.argv.slice(2);
if (!args.length) {
  console.error('Usage: node scripts/run-python.mjs <script.py> [arguments]');
  process.exit(2);
}

const candidates = process.platform === 'win32'
  ? [
      { command: 'py', prefix: ['-3'] },
      { command: 'python', prefix: [] },
      { command: 'python3', prefix: [] }
    ]
  : [
      { command: 'python3', prefix: [] },
      { command: 'python', prefix: [] }
    ];

for (const candidate of candidates) {
  const result = spawnSync(candidate.command, [...candidate.prefix, ...args], {
    stdio: 'inherit',
    shell: false
  });
  if (result.error?.code === 'ENOENT') continue;
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

console.error('Python 3 was not found. Install Python 3 and run the command again.');
process.exit(1);
