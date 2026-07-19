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

const temporaryPatchScripts = fs.readdirSync(path.join(root, 'scripts')).filter((name) => /^apply_v.+_patch\.py$/i.test(name));
const temporaryPatchWorkflows = fs.readdirSync(workflowDir).filter((name) => /^apply-v.+-patch\.ya?ml$/i.test(name));
assert.deepEqual(temporaryPatchScripts, [], `temporary patch scripts remain: ${temporaryPatchScripts.join(', ')}`);
assert.deepEqual(temporaryPatchWorkflows, [], `temporary patch workflows remain: ${temporaryPatchWorkflows.join(', ')}`);

const releaseWorkflow = read('.github/workflows/release.yml');
assert.doesNotMatch(releaseWorkflow, /--clobber/, 'stable release assets must never be overwritten');
assert.match(releaseWorkflow, /git rev-list -n 1 "\$TAG"/, 'release workflow must verify the tag target');
assert.match(releaseWorkflow, /cmp -- "\$asset" "\$tmp_dir\/\$name"/, 'existing release assets must be compared byte-for-byte');

const worker = read('src/background/service-worker.js');
assert.match(worker, /createStateCommandScheduler/);
assert.match(worker, /dispatchBackgroundMessage/);
assert.match(worker, /stateCommandScheduler\.enqueuePatch/);
assert.match(worker, /background-state[\s\S]*sendResponse[\s\S]*return true;/, 'STATE_CHANGED listener must keep the service worker alive until persistence completes');
assert.match(worker, /return \{ ok: true, updatedAt: lastState\.updatedAt \}/);

const listing = read('CHROME_WEB_STORE_LISTING.md');
assert.doesNotMatch(listing, /output-device routing|output routes/i, 'Web Store listing still contains obsolete output-routing claims');
const privacyDisclosure = read('CHROME_WEB_STORE_PRIVACY_DISCLOSURE.md');
assert.match(privacyDisclosure, /### Website content[\s\S]*?\*\*Declare handling: Yes\.\*\*/);
assert.match(privacyDisclosure, /listing does not mention output-device routing or stored output routes/);

console.log(`Release metadata, global state scheduling, immutable assets, and Web Store guidance aligned for v${manifest.version}.`);
