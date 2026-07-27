const assert = require('node:assert/strict');
const test = require('node:test');
const manifest = require('../../package.json');

test('extension manifest', () => {
  assert.equal(manifest.main, './dist/extension.js');
  assert.equal(manifest.contributes.views.scm[0].id, 'scmRepositoryFilter.changedRepositories');
  assert.equal(manifest.contributes.views.scm[0].name, 'Changed Repositories');
  assert.equal(manifest.contributes.views.scm[1].id, 'scmRepositoryFilter.changedFiles');
  assert.equal(manifest.contributes.views.scm[1].name, 'Changed Files');
  assert.deepEqual(manifest.extensionDependencies, ['vscode.git']);
  assert.ok(manifest.contributes.commands.some((command) => command.command === 'scmRepositoryFilter.openChange'));
  for (const commandId of [
    'scmRepositoryFilter.commitStaged',
    'scmRepositoryFilter.pull',
    'scmRepositoryFilter.push',
  ]) {
    assert.ok(manifest.contributes.commands.some((command) => command.command === commandId));
    const menu = manifest.contributes.menus['view/item/context'].find((item) => item.command === commandId);
    assert.ok(menu);
    assert.match(menu.when, /view == scmRepositoryFilter\.changedRepositories/);
    assert.match(menu.when, /viewItem == changedRepository/);
  }
  for (const commandId of [
    'scmRepositoryFilter.selectRepository',
    'scmRepositoryFilter.stageChange',
    'scmRepositoryFilter.unstageChange',
    'scmRepositoryFilter.discardChange',
    'scmRepositoryFilter.stageAllChanges',
    'scmRepositoryFilter.unstageAllChanges',
  ]) {
    assert.ok(manifest.contributes.commands.some((command) => command.command === commandId));
  }
  for (const commandId of [
    'scmRepositoryFilter.stageChange',
    'scmRepositoryFilter.unstageChange',
    'scmRepositoryFilter.discardChange',
    'scmRepositoryFilter.stageAllChanges',
    'scmRepositoryFilter.unstageAllChanges',
  ]) {
    const menu = manifest.contributes.menus['view/item/context'].find((item) => item.command === commandId);
    assert.ok(menu);
    assert.match(menu.when, /view == scmRepositoryFilter\.changedFiles/);
  }
  assert.ok(manifest.activationEvents.includes('onView:scmRepositoryFilter.changedRepositories'));
});
