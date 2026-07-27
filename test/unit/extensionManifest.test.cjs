const assert = require('node:assert/strict');
const test = require('node:test');
const manifest = require('../../package.json');

test('extension manifest', () => {
  assert.equal(manifest.main, './dist/extension.js');
  assert.equal(manifest.contributes.views.scm[0].id, 'scmRepositoryFilter.changedRepositories');
  assert.equal(manifest.contributes.views.scm[0].name, 'Changed Repositories');
  assert.ok(manifest.activationEvents.includes('onView:scmRepositoryFilter.changedRepositories'));
});
