# 思盘

**思盘**是思源里的网盘聚合管理器：支持 25+ 网盘和磁盘挂载、300+ 文件格式预览，联动思阅和思播，把远程文件、媒体、阅读、分享和文档引用放进同一个思源工作流。文件留在网盘，本地空间更轻，资料随时可浏览、可插入、可分享。

## 最近更新

### 0.7.1

#### 优化

- 整理预览模块分类：Open File Viewer 保持轻量，Flyfish File Viewer 改为独立完整的分类能力矩阵。
- 将 `.xmind` 支持归入 Flyfish File Viewer，并为 Office、图表/脑图、电子书、邮件等分类补充更清晰的 Lucide 风格图标。

#### 修复

- 修复未安装或未加载思阅时 PDF/EPUB 无法继续兜底打开的问题，现在可交给预览模块处理。

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

> 详细版本变化请打开[更新日志](https://my.feishu.cn/wiki/Qvjjw63iMiVwBRkMREfcDuWDnrb)。

## 它能做什么

| 能力 | 说明 |
| --- | --- |
| 网盘聚合 | 挂载 115、123Pan、天翼云盘、阿里云盘、百度网盘、夸克/UC、OneDrive、WPS、GitHub Releases、OpenList/AList、WebDAV、S3、本地磁盘、思源工作空间等 |
| 文件管理 | 在 Dock 文件树和顶部文件管理器中浏览、上传、下载、复制、移动、重命名、删除 |
| 预览增强 | 按需安装预览模块，覆盖 Office、PDF、Markdown、代码、文本、压缩包、邮件、工程图、3D/GIS、XMind 等 300+ 格式 |
| 媒体与阅读 | 图片走思源图片查看器，音视频优先联动思播，PDF/EPUB 优先联动思阅；缺少伴侣插件时可由预览模块兜底 |
| 文档引用 | 复制 Markdown 图片、音频、视频、下载链接或 `siyuan://plugins/siyuan-cloud/open?...`，也可通过 `/` 命令把文件链接插入文档 |
| 在线分享 | 生成 `/sd/{id}` 分享链接，适合在可信环境里快速分享文件或目录 |
| 图床/视频文件床 | 网盘文件可作为图片、音频、视频资源链接插入笔记，减少附件进入思源空间 |
| 兼容接口 | 提供 OpenList 风格文件 API、WebDAV 和 S3 兼容能力，方便本机工具、自动化和其它插件接入 |

## 能力总览

思盘已经从单一文件管理入口，逐步收敛成思源内的 OpenList 兼容运行时：

- **挂载与驱动**：接入 115、123Pan、189Cloud、阿里云盘、百度网盘、夸克/UC、OneDrive、WPS、GitHub Releases、S3/Doge、WebDAV、OpenList/AList、本地磁盘和思源工作空间等运行时驱动，并补齐对应驱动说明。
- **文件与传输**：支持列表、详情、链接、上传、下载、复制、移动、删除、重命名、批量下载、Motrix Next 投递、拖拽上传和传输状态提示。
- **预览与播放**：图片、音频、视频、PDF、EPUB、Office、Markdown、代码、压缩包、邮件、工程图、3D/GIS、XMind 等文件可以按原生查看器、思阅/思播或可下载预览模块打开。
- **文档工作流**：支持右键复制链接、拖入文档、`/` 命令插入文件链接；图片、音频、视频可生成可直接预览/播放的 Markdown 或 HTML 片段。
- **分享与权限**：具备 OpenList 风格用户、会话、权限、meta、分享链接、访问控制、密码、过期时间、访问次数限制和公开读取复核。
- **搜索与任务**：提供本地持久搜索索引、索引建立/停止/清空/进度查询，以及任务状态、取消、重试等 OpenList 形态的基础能力。
- **协议与自动化**：提供 `/api/public/api`、`/api/public/routes`、状态能力矩阵、OpenList 风格 FS API、WebDAV、S3 和 companion 插件可消费的 `/p`、`/d` 资源路径。
- **界面与体验**：Dock、文件管理器、工具页、状态页、用户、分享、任务和图标体系持续整理，思源工作空间挂载打开更快，用户自建文件夹、点号文件和文件大小显示更稳定。

## 快速开始

- 打开 Dock 面板，进入 **挂载**。
- 新增一个挂载，选择已经接入运行时的驱动。
- 在 Dock 文件树或顶部文件管理器中浏览文件。
- 右键文件可预览、复制链接、插入文档、分享、下载或管理文件。
- 需要 Office、代码、XMind、压缩包等增强预览时，到 **工具 -> 预览模块** 安装并启用对应模块。

## 文档入口

| 内容 | 入口 |
| --- | --- |
| 版本变化 | [更新日志](https://my.feishu.cn/wiki/Qvjjw63iMiVwBRkMREfcDuWDnrb) |
| API 文档 | [飞书 API](https://my.feishu.cn/wiki/YCDlwD0qJioublkADxOcYVJpnOf) |
| 驱动教程 | [驱动说明](https://my.feishu.cn/wiki/Y1gqwvRmwi9mEGk6AHGcGX4OnTg) |
| OpenList/AList 本地挂载 | [OpenList AList 本地挂载与代理](https://my.feishu.cn/wiki/Np9wwXWi3irGOoknwl0cwK7Sn9c) |
| 百度网盘 | [百度网盘挂载](https://my.feishu.cn/wiki/Gig1wzFKSi0pCbkn1XKcLr8rnvl) |
| Local 本地存储 | [Local 本地存储](https://my.feishu.cn/wiki/Q6s7wW4LRi7CZLkeNZkcbAJjnth) |

Dock/关于页的 API 入口会用预览模块打开正在运行的 `/api/public/api` 实时接口清单；README 中的 API 链接指向飞书文档。

## 已接入运行时驱动

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
- [WPS 云文档](https://my.feishu.cn/wiki/QXhCwMFztiGy16kCIl1cMqZWnLe)
- [Local 本地存储](https://my.feishu.cn/wiki/Q6s7wW4LRi7CZLkeNZkcbAJjnth)
- [思源工作空间](https://my.feishu.cn/wiki/OpSrwXiUniBI7akO94ocSpqTnjc)
- 内置虚拟存储

其它 OpenList 驱动可能保留 metadata/config 参考；没有真实运行时的驱动不会出现在常规挂载列表里。

## 边界

- `/plugin/private/siyuan-cloud/*` 是思源私有路由，不是公网匿名 OpenList 服务。
- `/sd/{id}` 分享链接仍是私有路由链接，外网访问需要你自己准备反代、隧道或其它 bridge。
- 搜索使用本地持久索引，还不是完整 OpenList search backend 矩阵。
- 任务接口已对齐 OpenList 形态，但真实异步队列、取消传播、重试调度和进度上报仍待实现。
- ZIP/tar/tgz 已支持；RAR/7z/ISO 等更复杂压缩格式由预览模块或后续 reader 能力覆盖。
- `/ae` 压缩包内媒体偏向 entry 提取，不等同于普通 `/p` 的可 seek 流式播放。

## 数据与同步

内核数据保存在思源插件存储中：

| 文件 | 内容 |
| --- | --- |
| `config.json` | settings、users、storages、metas、sharings、SSH keys |
| `runtime.json` | 虚拟 FS、tasks、messages、scan、WebDAV locks、S3 multipart 状态 |
| `search-index.json` | 本地搜索索引 |

思源默认会同步 `data/storage/petal/<plugin>`，用户可以通过 `.siyuan/syncignore` 排除。

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
