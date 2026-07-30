# 思盘

**思盘**是思源内的 OpenList 兼容文件能力底座。它不启动、不依赖 OpenList Go 后端，而是在思源 kernel 插件里迁移 OpenList 兼容的路由、响应形状、挂载分发、驱动运行时、代理播放、分享、搜索、压缩包、torrent、WebDAV 和 S3 能力。

> [!IMPORTANT]
> 需要 **思源 3.7.0** 或以上版本。

## 最近更新

### 0.7.0

#### 新增

- 新增可下载预览模块：可在工具页安装 `open-file-viewer` 和 Flyfish File Viewer 到 `/data/public/preview-modules`，插件只在需要时加载模块资源。
- 新增通用预览页签，支持 Office、PDF、Markdown、代码、文本、压缩包、邮件、工程图、3D/GIS 等多类格式。
- 新增思源空间 `.sy` 文档原生打开，文件名符合思源文档 ID 时直接打开思源页签。

#### 优化

- 工具页改为入口式子页面，索引、配置、预览模块、外部预览和 Torrent 工具分开管理。
- 统一文件打开逻辑：图片继续用思源图片查看器，音视频优先走思播，其他可预览文件走预览模块。
- 思源空间挂载改用 `/api/file/readDir` 直接读取目录，打开更快，并能显示用户新建文件夹、点号开头文件和正确大小。
- 预览模块样式接入思源主题变量，Dock 和工具页图标统一为 OpenList/Lucide 风格。

#### 移除

- 删除旧的文本预览、压缩包浏览和原生音视频 `Dialog` 兜底，统一交给预览模块处理。

## 它是什么

- **云盘聚合管理器**：浏览、挂载、上传、下载、分享和引用文件。
- **兼容 HTTP 能力层**：给 companion 插件、本机自动化、WebDAV 客户端和 S3 兼容工具调用。
- **思源工作流底座**：把云盘文件接入文档、媒体笔记、阅读、图床、附件、AI 上下文和后续自动化。

> [!TIP]
> 详细版本变化请打开[更新日志](https://my.feishu.cn/wiki/Qvjjw63iMiVwBRkMREfcDuWDnrb)。API 文档可以查看[飞书 API](https://my.feishu.cn/wiki/YCDlwD0qJioublkADxOcYVJpnOf)；Dock/关于页的 API 入口会用预览模块打开正在运行的插件实时生成的 `/api/public/api`。

| 内容 | 入口 |
| --- | --- |
| 版本变化 | [更新日志](https://my.feishu.cn/wiki/Qvjjw63iMiVwBRkMREfcDuWDnrb) |
| 实时 API | [飞书 API](https://my.feishu.cn/wiki/YCDlwD0qJioublkADxOcYVJpnOf) |
| 驱动教程 | [驱动说明](https://my.feishu.cn/wiki/Y1gqwvRmwi9mEGk6AHGcGX4OnTg) |
| OpenList/AList 本地挂载 | [OpenList AList 本地挂载与代理](https://my.feishu.cn/wiki/Np9wwXWi3irGOoknwl0cwK7Sn9c) |
| 百度网盘 | [百度网盘挂载](https://my.feishu.cn/wiki/Gig1wzFKSi0pCbkn1XKcLr8rnvl) |
| Local 本地存储 | [Local 本地存储](https://my.feishu.cn/wiki/Q6s7wW4LRi7CZLkeNZkcbAJjnth) |

---

## 快速开始

> [!TIP]
> 菜单路径可以按 <kbd>Dock</kbd> -> <kbd>挂载</kbd> -> <kbd>新增</kbd> 操作。新增后从 <kbd>Dock 文件树</kbd> 或 <kbd>顶部栏文件管理</kbd> 浏览。

- [ ] 打开 Dock 面板。
- [ ] 新增一个挂载，选择真实可用的运行时驱动。
- [ ] 在文件树中打开文件或目录。
- [ ] 右键复制 Markdown 链接、代理链接、下载链接或分享链接。
- [ ] 需要自动化时查看[飞书 API](https://my.feishu.cn/wiki/YCDlwD0qJioublkADxOcYVJpnOf)，或在 Dock/关于页打开实时 `/api/public/api`。

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

- [OpenList 兼容挂载](https://my.feishu.cn/wiki/UHWbwHFeGiXjGkkTW92cFxynnm3)
- [OpenList AList 本地挂载与代理](https://my.feishu.cn/wiki/Np9wwXWi3irGOoknwl0cwK7Sn9c)
- [WebDAV 挂载](https://my.feishu.cn/wiki/JJ4Pw3NRVi19AekGbY8cWFNcnmg)
- [S3 兼容存储](https://my.feishu.cn/wiki/AlvawbjIuiU22mkDAfLcGdbSnKc)
- [DogeCloud 挂载](https://my.feishu.cn/wiki/DUcmwbwxniEOLVkuUVUchknFnmb)
- [115 Cloud 挂载](https://my.feishu.cn/wiki/XxXqwvlBcip8JJkdH8lcz2vpnuf)
- [115 Open 挂载](https://my.feishu.cn/wiki/SEo2wAbOpi8TTukfLx4cnCw6nre)
- [115 Share 挂载](https://my.feishu.cn/wiki/TY0FwQyeii2ql4kevuaccuFIn49)
- [OneDrive 挂载](https://my.feishu.cn/wiki/MRpFwCZcQiOpVUkPjjCcdOAvnB2)
- [123Pan 挂载](https://my.feishu.cn/wiki/IY7FwsKh7i0WU3kd0OLcoJIcnzd)
- [百度网盘挂载](https://my.feishu.cn/wiki/Gig1wzFKSi0pCbkn1XKcLr8rnvl)
- [GitHub Releases](https://my.feishu.cn/wiki/VFiCwOcoOiHKE0kLBJocS3vinIf)
- [阿里云盘开放平台](https://my.feishu.cn/wiki/LQRHwC0BciZFjmkoA7ycwNTknre)
- [189Cloud 系列](https://my.feishu.cn/wiki/HBCiwsGnPiEJAvkRD65cjYxLnPg)
- [Quark UC 系列](https://my.feishu.cn/wiki/Gx06wqy5xiyH6jkENAxcDOxrn5F)
- [Local 本地存储](https://my.feishu.cn/wiki/Q6s7wW4LRi7CZLkeNZkcbAJjnth)
- [思源工作空间](https://my.feishu.cn/wiki/OpSrwXiUniBI7akO94ocSpqTnjc)
- 内置虚拟存储

> [!NOTE]
> 其它 OpenList 驱动可能保留 metadata/config 参考；没有真实运行时的驱动不会出现在常规挂载列表里。

## 常用动作

| 目标 | 操作 |
| --- | --- |
| 浏览云盘 | <kbd>Dock</kbd> 文件树或顶部栏文件管理 |
| 管理文件 | 右键菜单上传、下载、重命名、复制、移动、删除 |
| 管理用户 | 内置 `admin` 和 `guest` 用户跟随 OpenList 行为不可删除，Dock 用户管理不会为这两个用户显示删除按钮 |
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

## 致谢与许可

本项目以 MIT 许可证发布，并感谢这些上游项目：

- [OpenList](https://github.com/OpenListTeam/OpenList)：兼容路由、响应形状和驱动行为的重要参考；OpenList 主项目为 AGPL-3.0，OpenList Frontend 为 MIT。
- [open-file-viewer](https://github.com/xushanpei/open-file-viewer)：可选预览模块，MIT。
- [Flyfish File Viewer](https://github.com/flyfish-dev/file-viewer)：可选 Office 预览模块，Apache-2.0；其按需加载的 worker、WASM、字体和 vendor 资产保留各自随包许可证。
- [SiYuan plugin sample](https://github.com/siyuan-note/plugin-sample) 和思源插件生态中的 Monaco 编辑器类项目：插件结构、页签打开和编辑器集成参考，按各自上游许可证保留声明。
- [zip.js](https://github.com/gildas-lormeau/zip.js)：压缩包能力参考与开发依赖，BSD-3-Clause。

## 开发

```bash
pnpm install
pnpm test:kernel
pnpm build
```

内核源码位于 `src/kernel/**`。不要手改生成的 `kernel.js`；`pnpm dev` 和 `pnpm build` 会生成到插件输出目录。
