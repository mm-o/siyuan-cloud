# 思盘

**思盘**是思源内的 OpenList 兼容文件能力底座。它不启动、不依赖 OpenList Go 后端，而是在思源 kernel 插件里迁移 OpenList 兼容的路由、响应形状、挂载分发、驱动运行时、代理播放、分享、搜索、压缩包、torrent、WebDAV 和 S3 能力。

> [!IMPORTANT]
> 需要 **思源 3.7.0** 或以上版本。

## 它是什么

- **云盘聚合管理器**：浏览、挂载、上传、下载、分享和引用文件。
- **兼容 HTTP 能力层**：给 companion 插件、本机自动化、WebDAV 客户端和 S3 兼容工具调用。
- **思源工作流底座**：把云盘文件接入文档、媒体笔记、阅读、图床、附件、AI 上下文和后续自动化。

> [!TIP]
> 详细版本变化请打开插件文档中的 [[更新日志]]。实时路由清单请在 Dock/关于页打开 [[API]]，它直接由正在运行的 `/api/public/api` 生成。

| 内容 | 入口 |
| --- | --- |
| 版本变化 | [[更新日志]] |
| 实时 API | [[API]] |
| 驱动教程 | [[驱动说明]] |
| 百度网盘 | [[百度网盘挂载]] |

---

## 快速开始

> [!TIP]
> 菜单路径可以按 <kbd>Dock</kbd> -> <kbd>挂载</kbd> -> <kbd>新增</kbd> 操作。新增后从 <kbd>Dock 文件树</kbd> 或 <kbd>顶部栏文件管理</kbd> 浏览。

- [ ] 打开 Dock 面板。
- [ ] 新增一个挂载，选择真实可用的运行时驱动。
- [ ] 在文件树中打开文件或目录。
- [ ] 右键复制 Markdown 链接、代理链接、下载链接或分享链接。
- [ ] 需要自动化时调用 [[API]] 中的运行时接口。

## 当前能力一览

| 模块 | 说明 |
| --- | --- |
| 文件管理 | 文件管理 Tab、Dock 文件树、右键菜单 |
| 文件接口 | 列表、详情、链接、上传、复制、移动、删除、重命名 |
| 播放下载 | 统一 `/p`、`/d` 路径，复用思源 kernel `body.proxy` |
| 协议能力 | 用户、权限、meta、分享、任务形态、搜索索引、压缩包、torrent、WebDAV、S3 |
| 文档链接 | Markdown 图片、audio/video 标签、下载链接、`siyuan://plugins/siyuan-cloud/open?...` |
| 本地文件 | Local 通过桌面端 Electron runtime 访问，kernel HTTP 层只保留元数据 |

## 已接入运行时驱动

Dock 当前可见的运行时适配包括：

- OpenList / AList V3
- WebDAV
- S3 / Doge
- 115 Cloud
- OneDrive
- 123Pan
- [[百度网盘挂载]]
- AliyundriveOpen
- 189Cloud / 189CloudPC / 189CloudTV
- Quark / UC / QuarkOpen / QuarkTV / UCTV
- Local 本地存储
- 内置虚拟存储

> [!NOTE]
> 其它 OpenList 驱动可能保留 metadata/config 参考；没有真实运行时的驱动不会出现在常规挂载列表里。

## 常用动作

| 目标 | 操作 |
| --- | --- |
| 浏览云盘 | <kbd>Dock</kbd> 文件树或顶部栏文件管理 |
| 管理文件 | 右键菜单上传、下载、重命名、复制、移动、删除 |
| 放进文档 | 复制 Markdown 图片、音视频标签、下载链接或 `siyuan://` 链接 |
| 分享文件 | 使用分享菜单生成 `/sd/{id}` 私有路由链接 |
| 接入插件 | companion 插件消费 `raw_url`、`/p/<path>`、`/d/<path>` 或 OpenList-compatible HTTP API |

## 边界

> [!WARNING]
> `/plugin/private/siyuan-cloud/*` 是思源私有路由，不是公网匿名 OpenList 服务。

- `/sd/{id}` 分享链接仍是私有路由链接，除非另外设计外部 bridge。
- 搜索使用本地持久索引，还不是完整 OpenList search backend 矩阵。
- 任务接口已对齐 OpenList 形态，但真实异步队列、取消传播、重试调度和进度上报仍待实现。
- ZIP/tar/tgz 已支持；RAR/7z/ISO 需要等 reader、许可证、打包路径和 fixture 都明确后再接入。
- `/ae` 压缩包内媒体偏向 entry 提取，不等同于普通 `/p` 的可 seek 流式播放。
- 离线下载工具和真实 189/189PC CAS rapid-upload 仍需要继续迁移。

## 数据与同步

内核数据保存在思源插件存储中：

| 文件 | 内容 |
| --- | --- |
| `config.json` | settings、users、storages、metas、sharings、SSH keys |
| `runtime.json` | 虚拟 FS、tasks、messages、scan、WebDAV locks、S3 multipart 状态 |
| `search-index.json` | 本地搜索索引 |

> [!NOTE]
> 思源默认会同步 `data/storage/petal/<plugin>`，用户可以通过 `.siyuan/syncignore` 排除。

## 开发

```bash
pnpm install
pnpm test:kernel
pnpm build
```

内核源码位于 `src/kernel/**`。不要手改生成的 `kernel.js`；`pnpm dev` 和 `pnpm build` 会生成到插件输出目录。
