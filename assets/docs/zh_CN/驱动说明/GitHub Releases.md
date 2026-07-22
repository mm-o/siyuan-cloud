# GitHub Releases

本说明按 OpenList GitHub Releases 驱动文档和本地 `docs/OpenList-main/drivers/github_releases` 源码整理。上游参考：<https://doc.oplist.org/guide/drivers/github_releases>

这个驱动会把 GitHub 仓库的 Release 资产挂载成只读文件树。它适合下载 release 包、源码压缩包，以及可选显示仓库根目录下的 README / LICENSE 文件。

## 适合场景

- 在思盘中浏览 GitHub Release 资产。
- 把单个仓库挂到挂载根目录，或把多个仓库挂到不同子目录。
- 复制 OpenList 兼容的 release 包下载链接。
- 只显示最新版本，或把所有版本按 tag 目录展开。
- 在 release 资产旁显示 README 和 LICENSE 文件。

## 准备事项

- 一个 `owner/repo` 形式的仓库名，例如 `OpenListTeam/OpenList`。
- 私有仓库或需要更高 API 限额时，准备 GitHub personal access token。
- 如果所在网络直接访问 GitHub 下载较慢，可以准备一个 GitHub 代理地址。

> [!TIP]
> OpenList 官方文档说明，未认证 GitHub API 限额为每小时 60 次，填入 token 后通常为每小时 5000 次。私有仓库和稳定浏览都建议填写 `token`。

## 挂载

1. 打开 <kbd>Dock</kbd> -> <kbd>挂载</kbd>，使用底部的 <kbd>添加</kbd>。
2. 驱动选择 `GitHub Releases`。
3. 填写挂载路径，例如 `/GitHub`。
4. 填写 `repo_structure`。
5. 可选填写 `token`。
6. 可选开启 `show_all_version`、`show_readme` 或 `show_source_code`。
7. 保存后打开文件管理，浏览 `/GitHub`。

| 推荐项 | 值 |
| --- | --- |
| 驱动 | `GitHub Releases` |
| 挂载路径 | `/GitHub` |
| `repo_structure` | `OpenListTeam/OpenList` |
| `show_readme` | `true` |
| `show_source_code` | `false` |
| `show_all_version` | `false` |

## repo_structure

把单个仓库挂在根目录：

```text
OpenListTeam/OpenList
```

这等价于：

```text
/:OpenListTeam/OpenList
```

把多个仓库挂到子目录：

```text
openlist-gh:OpenListTeam/OpenList
frontend-gh:OpenListTeam/OpenList-Frontend
```

前导 `/` 可写可不写，下面两种等价：

```text
/openlist-gh:OpenListTeam/OpenList
openlist-gh:OpenListTeam/OpenList
```

## 字段说明

| 字段 | 说明 |
| --- | --- |
| `repo_structure` | 必填。每行一个仓库。`owner/repo` 表示挂在根目录，`path:owner/repo` 表示挂到指定子目录。 |
| `show_readme` | 显示仓库根目录下的 `README*.md` 和 `LICENSE*` 文件。默认开启。 |
| `token` | GitHub personal access token。私有仓库必填，也建议用于避免 API 限流。 |
| `show_source_code` | 显示每个 release 的 `Source code (zip)` 和 `Source code (tar.gz)`。默认关闭。 |
| `show_all_version` | 显示全部版本，并按 tag 目录展开。默认关闭，此时只显示最新 release 资产。 |
| `gh_proxy` | 可选 GitHub 代理前缀，例如 `https://gh-proxy.com/github.com`。它会改写 `https://github.com` 下载链接。 |

## 版本展示

默认最新版本模式：

```text
/GitHub
  openlist-linux-amd64.tar.gz
  openlist-windows-amd64.zip
  README.md
  LICENSE
```

开启 `show_all_version=true` 后：

```text
/GitHub
  v4.0.0/
    openlist-linux-amd64.tar.gz
    openlist-windows-amd64.zip
  v3.9.0/
    openlist-linux-amd64.tar.gz
    openlist-windows-amd64.zip
```

## GitHub 代理

填写 `gh_proxy` 后，运行时会在 `/api/fs/get` 和 `/api/fs/link` 返回前改写 GitHub 下载链接。

示例：

```text
https://gh-proxy.com/github.com
```

> [!WARNING]
> GitHub 代理通常是第三方服务，可用性、速度、隐私和文件大小限制都取决于所选服务。

## 思盘当前边界

- 已接入 `list`、`get`、`link` 和 `read`。
- 这个驱动是只读驱动，和 OpenList 上游保持一致。新建目录、移动、复制、重命名、删除和上传都不支持。
- 不启用 storage 代理时，`raw_url` 是 GitHub release 资产链接或 `gh_proxy` 改写后的链接。
- 如果在 storage 上启用代理，仍可以通过 `/p/<path>` 代理下载。

## 逐项测试清单

- [ ] <kbd>Dock</kbd> 挂载列表能看到 `/GitHub`。
- [ ] 单行 `owner/repo` 可以列出最新 release 资产。
- [ ] `show_readme=true` 时能看到 README 和 LICENSE 文件。
- [ ] `show_source_code=true` 时能看到 source zip 和 tar.gz。
- [ ] `show_all_version=true` 时能看到 tag 目录。
- [ ] `path:owner/repo` 可以出现在配置的子目录下。
- [ ] `/api/fs/link` 返回 GitHub 资产链接或配置的 `gh_proxy` 链接。
- [ ] 上传或管理操作会明确提示不支持。

## 排查

| 现象 | 处理 |
| --- | --- |
| `invalid repo` | 使用准确的 `owner/repo` 格式，例如 `OpenListTeam/OpenList`。 |
| 列表为空 | 检查仓库是否真的发布过 releases，并且 release 下有 assets。 |
| GitHub API 限流 | 填写 `token`，然后刷新目录。 |
| 私有仓库报错 | 填写有仓库访问权限的 token。 |
| 下载慢 | 填写 `gh_proxy`，或开启 storage 代理后再测试。 |
| README 或 LICENSE 不显示 | 开启 `show_readme`，并确认这些文件在仓库根目录存在。 |
| 没有版本目录 | 开启 `show_all_version`；否则只列最新 release 资产。 |
