import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const loadJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const manifest = loadJson('manifest.json');
const pkg = loadJson('package.json');
const release = loadJson('.release/release.json');
const changelog = read('CHANGELOG.md');

assert.equal(pkg.version, manifest.version, 'package and manifest versions differ');
assert.equal(release.version, manifest.version, 'release descriptor and manifest versions differ');
assert.equal(release.tag, `v${manifest.version}`, 'release tag does not match manifest version');
assert.equal(release.title, `ArSonKuPik Extension v${manifest.version}`, 'release title is inconsistent');
assert.equal(typeof release.prerelease, 'boolean', 'release prerelease flag must be boolean');
assert.match(changelog, new RegExp(`^## \\[${manifest.version.replaceAll('.', '\\.') }\\]`, 'm'));

for (const relative of ['README.md', 'docs/index.html', 'docs/id/index.html']) {
  assert.match(read(relative), new RegExp(manifest.version.replaceAll('.', '\\.')), `${relative} does not expose the current version`);
}

const workflowDir = path.join(root, '.github', 'workflows');
for (const filename of fs.readdirSync(workflowDir).filter((name) => /\.ya?ml$/i.test(name))) {
  const relative = path.join('.github', 'workflows', filename);
  const workflow = read(relative);
  for (const match of workflow.matchAll(/^\s*uses:\s*([^@\s]+)@([^\s#]+)(?:\s+#.*)?$/gm)) {
    const [, action, ref] = match;
    if (action.startsWith('./')) continue;
    assert.match(ref, /^[0-9a-f]{40}$/i, `${relative} uses mutable action ref ${action}@${ref}`);
  }
}

assert.equal(fs.existsSync(path.join(root, 'scripts', 'apply_v0_3_105_patch.py')), false, 'temporary patch script must be removed');
assert.equal(fs.existsSync(path.join(workflowDir, 'apply-v0.3.105-patch.yml')), false, 'temporary patch workflow must be removed');
console.log(`Release metadata and immutable workflow pins aligned for v${manifest.version}.`);
