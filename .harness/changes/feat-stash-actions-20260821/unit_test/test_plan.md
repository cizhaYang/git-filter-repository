# Stash 单元测试计划

## `test/unit/gitCli.test.cjs`

- **happy path**：断言 `stash push -m` 、`stash list --format` 、`stash apply <ref>` 的 argv 顺序和参数保持单个字段，并解析多条包含冒号、中文和 `$PATH` 的描述。
- **edge case**：空 `stash list` 输出返回空数组；NUL 字段不成对时抛出明确解析错误。
- **security/regression**：用户输入中包含空格、Unicode 和 shell 特殊字符时，断言它仍为单个 argv，不进行 shell 解析。

## `test/unit/repositoryActions.test.cjs`

- **happy path**：index、working tree、merge 中任一类 tracked 改动都判断为可 stash。
- **edge case**：仅有 untracked 改动判断为不可 stash，避免与 Git 默认语义不一致。

## `test/unit/extensionManifest.test.cjs`

- **happy path**：断言 ellipsis 命令已注册、使用 `$(ellipsis)`、匹配 changed/pinned 仓库且位于 inline 项末尾。
- **regression**：断言该命令仍在 `changedRepositories` 视图上，不会误挂到 changedFiles。

测试全部使用注入的 Git executor 和纯状态对象，不启动 Extension Host、不执行用户仓库命令。
