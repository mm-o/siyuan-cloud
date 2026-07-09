# WPS 云文档

本说明按 OpenList WPS 驱动文档和本地 `docs/OpenList-main/drivers/wps` 源码整理。上游参考：<https://doc.oplist.org/guide/drivers/wps>

> [!WARNING]
> WPS 驱动基于历史网页接口逆向而来，OpenList 官方文档也提示项目组不会主动维护该接口。若 WPS 网页端接口变更，挂载可能需要重新适配。

## 适合场景

- 在思盘中浏览 WPS 云文档/金山文档目录。
- 通过 `/p/<path>` 代理下载或播放可下载文件。
- 使用 OpenList 兼容 API 管理 WPS 文件：新建目录、移动、复制、重命名、删除。

## 官方网站

- 金山文档个人版：<https://www.kdocs.cn/>
- WPS 365 商业/企业/教育版：<https://365.kdocs.cn/>

## 获取 Cookie

建议使用新的浏览器环境或无痕窗口获取 Cookie，避免 Cookie 中混入其它账号会话。一个 WPS 会话通常只能同时登录一个账号。

1. 打开新的浏览器环境或无痕窗口。
2. 访问对应的 WPS 云文档网站并登录。
3. 打开开发者工具，进入 Network/网络 面板。
4. 刷新页面，搜索 `islogin` 请求。
5. 打开请求详情，在 Headers 中复制完整 `Cookie`。
6. 如果需要自定义 UA，也复制同一次请求里的 `User-Agent`。

## 挂载

1. 打开 <kbd>Dock</kbd> -> <kbd>挂载</kbd>，使用底部的 <kbd>添加</kbd>。
2. 驱动选择 `WPS`。
3. 填写挂载路径，例如 `/WPS`。
4. 填写 `cookie`。
5. `mode` 按账号类型选择：个人版选 `Personal`，WPS 365 企业/教育账号选 `Business`。
6. `root_folder_path` 通常保持 `/`；只挂载某个群组或子目录时填写 WPS 内真实路径。
7. 保存后打开文件管理，浏览 `/WPS`。

| 推荐项 | 值 |
| --- | --- |
| 驱动 | `WPS` |
| 挂载路径 | `/WPS` |
| `root_folder_path` | `/` |
| `mode` | `Personal` 或 `Business` |

## 字段说明

| 字段 | 说明 |
| --- | --- |
| `cookie` | 必填。WPS 网页端登录后的 Cookie。 |
| `mode` | API 模式，`Personal` 为金山文档个人版，`Business` 为 WPS 365 商业/企业/教育版。 |
| `root_folder_path` | 上游根目录路径，默认 `/`。WPS 根目录会先列出群组/空间名称，子目录路径按显示名称继续填写。 |
| `custom_ua` | 可选。自定义请求 User-Agent，建议从获取 Cookie 的同一次请求复制。 |

## 思盘当前边界

- 已接入登录校验、根目录/群组目录列表、文件信息、下载链接、读取代理、新建目录、移动、复制、重命名、删除和容量详情。
- 下载/播放仍走统一的 `driver read -> /p -> common proxy -> body.proxy` 路径。
- 上传链路在 OpenList Go 后端中是流式处理；当前思源 JS kernel 的 base64 上传会阻塞思源运行环境，因此 WPS 上传暂不启用。

## 逐项测试清单

- [ ] <kbd>Dock</kbd> 挂载列表能看到 `/WPS`。
- [ ] 文件管理能列出 WPS 根目录下的群组/空间。
- [ ] `root_folder_path` 改成群组或子目录后，只显示该目录内容。
- [ ] 普通文件可以打开或下载。
- [ ] `raw_url` 在开启代理时返回 `/plugin/private/siyuan-cloud/p/...`。
- [ ] 可以新建目录、重命名、移动、复制和删除测试文件夹。
- [ ] 容量详情能返回总量、已用和剩余空间。

## 排查

| 现象 | 处理 |
| --- | --- |
| 提示 `cookie is empty` | 检查挂载配置是否填写完整 Cookie。 |
| 登录校验失败 | 重新在新浏览器环境或无痕窗口获取 Cookie，并确认同一会话没有切换账号。 |
| Business 模式提示 company id 为空 | 确认账号是 WPS 365 商业/企业/教育账号，并从 `365.kdocs.cn` 登录后重新获取 Cookie。 |
| 根目录为空 | 检查 `mode` 是否与账号类型匹配，或 `root_folder_path` 中的群组/目录名称是否真实存在。 |
| 文件不能下载 | WPS 侧可能没有下载权限；商业空间还要检查文件 ACL。 |
| 上传失败 | 当前思源 JS kernel 运行环境暂不启用 WPS 上传，避免 base64 解码、校验和转发上传阻塞思源。 |
