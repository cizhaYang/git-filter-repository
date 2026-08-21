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
  assert.ok(manifest.contributes.commands.some(
    (command) => command.command === 'scmRepositoryFilter.manageRepositoryHistory'));
  const historyViewMenu = manifest.contributes.menus['view/title']
    .find((item) => item.command === 'scmRepositoryFilter.manageRepositoryHistory');
  assert.ok(historyViewMenu);
  assert.match(historyViewMenu.when, /view == scmRepositoryFilter\.changedRepositories/);
  assert.equal(historyViewMenu.group, 'navigation');
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
  'view == scmRepositoryFilter.changedRepositories && (viewItem == changedRepository || viewItem == pinnedRepository)');
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
  // 切换分支命令：命令已注册，且内联按钮同时出现在有改动与固定仓库上，排在 commit 之前。
  assert.ok(manifest.contributes.commands.some((command) => command.command === 'scmRepositoryFilter.switchBranch'));
  const switchMenu = manifest.contributes.menus['view/item/context']
    .find((item) => item.command === 'scmRepositoryFilter.switchBranch');
  assert.ok(switchMenu, 'switchBranch should be present in view/item/context');
  assert.match(switchMenu.when, /view == scmRepositoryFilter\.changedRepositories/);
  assert.match(switchMenu.when, /viewItem == changedRepository/);
  assert.match(switchMenu.when, /viewItem == pinnedRepository/);
  assert.equal(switchMenu.group, 'inline');
  // switchBranch 的 inline 按钮排在 commit 之前（数组顺序决定按钮从左到右）。
  const inlineItems = manifest.contributes.menus['view/item/context']
    .filter((item) => item.when?.includes('scmRepositoryFilter.changedRepositories') && item.group === 'inline');
  const switchIndex = inlineItems.findIndex((item) => item.command === 'scmRepositoryFilter.switchBranch');
  const commitIndex = inlineItems.findIndex((item) => item.command === 'scmRepositoryFilter.commitStaged');
  assert.ok(switchIndex >= 0 && commitIndex >= 0 && switchIndex < commitIndex,
    'switchBranch inline button should precede commit');

  const moreCommand = manifest.contributes.commands.find(
    (command) => command.command === 'scmRepositoryFilter.repositoryMoreActions');
  assert.ok(moreCommand);
  assert.equal(moreCommand.icon, '$(ellipsis)');
  const moreMenu = manifest.contributes.menus['view/item/context']
    .find((item) => item.command === 'scmRepositoryFilter.repositoryMoreActions');
  assert.ok(moreMenu);
  assert.match(moreMenu.when, /view == scmRepositoryFilter\.changedRepositories/);
  assert.match(moreMenu.when, /viewItem == changedRepository/);
  assert.match(moreMenu.when, /viewItem == pinnedRepository/);
  assert.equal(moreMenu.group, 'inline@999');
  const allRepositoryInlineItems = manifest.contributes.menus['view/item/context']
    .filter((item) => item.when?.includes('scmRepositoryFilter.changedRepositories')
      && item.group?.startsWith('inline'));
  const inlineOrder = (item) => Number(item.group.split('@')[1] ?? 0);
  assert.ok(allRepositoryInlineItems
    .filter((item) => item !== moreMenu)
    .every((item) => inlineOrder(item) < inlineOrder(moreMenu)));

  assert.ok(manifest.activationEvents.includes('onView:scmRepositoryFilter.changedRepositories'));
});
