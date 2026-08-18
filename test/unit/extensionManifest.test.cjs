const assert = require('node:assert/strict');
const test = require('node:test');
const manifest = require('../../package.json');

test('extension manifest', () => {
  assert.equal(manifest.main, './dist/extension.js');
  assert.equal(manifest.contributes.views.scm[0].id, 'scmRepositoryFilter.changedRepositories');
  assert.equal(manifest.contributes.views.scm[0].name, 'Changed Repositories');
  assert.equal(manifest.contributes.views.scm[1].id, 'scmRepositoryFilter.changedFiles');
  assert.equal(manifest.contributes.views.scm[1].name, 'Changed Files');
  assert.equal(manifest.extensionDependencies?.includes('vscode.git') ?? false, false);
  const refreshViewMenu = manifest.contributes.menus['view/title']
    .find((item) => item.command === 'scmRepositoryFilter.refresh');
  assert.ok(refreshViewMenu);
  assert.match(refreshViewMenu.when, /view == scmRepositoryFilter\.changedRepositories/);
  assert.ok(manifest.contributes.commands.some((command) => command.command === 'scmRepositoryFilter.openChange'));
  assert.ok(manifest.contributes.commands.some((command) => command.command === 'scmRepositoryFilter.openGitGraph'));
  assert.ok(manifest.contributes.commands.some((command) => command.command === 'scmRepositoryFilter.commitStaged'));
  for (const commandId of [
    'scmRepositoryFilter.commitStaged',
    'scmRepositoryFilter.pull',
    'scmRepositoryFilter.push',
    'scmRepositoryFilter.openGitGraph',
  ]) {
    assert.ok(manifest.contributes.commands.some((command) => command.command === commandId));
    const menu = manifest.contributes.menus['view/item/context'].find((item) => item.command === commandId);
    assert.ok(menu);
    assert.match(menu.when, /view == scmRepositoryFilter\.changedRepositories/);
    assert.match(menu.when, /viewItem == changedRepository/);
  }
  // 固定的常驻仓库也要能提交、拉取和推送，而不仅仅是「因改动出现的仓库」。
  for (const commandId of [
    'scmRepositoryFilter.commitStaged',
    'scmRepositoryFilter.pull',
    'scmRepositoryFilter.push',
  ]) {
    const menu = manifest.contributes.menus['view/item/context'].find((item) => item.command === commandId);
    assert.ok(menu, `${commandId} should be present in view/item/context`);
    assert.match(menu.when, /viewItem == pinnedRepository/, `${commandId} should show on pinned repositories`);
  }
  assert.equal(manifest.contributes.menus['view/item/context']
    .find((item) => item.command === 'scmRepositoryFilter.openGitGraph').when,
  'view == scmRepositoryFilter.changedRepositories && viewItem == changedRepository');
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
  assert.equal(manifest.contributes.menus['view/item/context']
    .some((item) => item.command === 'scmRepositoryFilter.commitStaged'
      && item.when.includes('view == scmRepositoryFilter.changedFiles')), false);
  assert.equal(manifest.contributes.menus['view/item/context']
    .some((item) => item.command === 'scmRepositoryFilter.push'
      && item.when.includes('view == scmRepositoryFilter.changedFiles')), false);
  assert.ok(manifest.activationEvents.includes('onView:scmRepositoryFilter.changedRepositories'));
});
