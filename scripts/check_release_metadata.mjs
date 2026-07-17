import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const loadJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const manifest = loadJson('manifest.json');
const pkg = loadJson('package.json');
const release = loadJson('.release/release.json');
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');

assert.equal(pkg.version, manifest.version, 'package and manifest versions differ');
assert.equal(release.version, manifest.version, 'release descriptor and manifest versions differ');
assert.equal(release.tag, `v${manifest.version}`, 'release tag does not match manifest version');
assert.equal(release.title, `ArSonKuPik Extension v${manifest.version}`, 'release title is inconsistent');
assert.equal(typeof release.prerelease, 'boolean', 'release prerelease flag must be boolean');
assert.match(changelog, new RegExp(`^## \\[${manifest.version.replaceAll('.', '\\.') }\\]`, 'm'));
console.log(`Release metadata aligned for v${manifest.version}.`);
