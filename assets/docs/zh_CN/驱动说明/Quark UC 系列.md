# Quark / UC / TV / Open

上游参考：<https://doc.oplist.org/guide/drivers/quark>

本说明适用于 `Quark`、`UC`、`QuarkTV`、`UCTV` 和 `QuarkOpen`。

## 重要说明

- Quark 系列使用基于历史产品的逆向接口，稳定性取决于上游服务，可能随时变化。
- 夸克网盘常见限速问题。普通 Cookie 版 Quark/UC 挂载的代理播放和下载速度，可能受运行思盘的机器带宽影响。
- `QuarkTV` / `UCTV` 主要用于访问和下载。上游 OpenList 驱动不实现管理和上传，本插件也保持这个边界。
- `QuarkOpen` 并不是真正意义上的公开 Open API。除非你能自己维护 AppID 和 SignKey，否则建议使用在线刷新 API。

## 选择驱动

| 驱动 | 适用场景 |
| --- | --- |
| `Quark` | 夸克网盘 Cookie 登录 |
| `UC` | UC 网盘 Cookie 登录 |
| `QuarkTV` | 夸克 TV 扫码/token 登录，仅访问和下载 |
| `UCTV` | UC TV 扫码/token 登录，仅访问和下载 |
| `QuarkOpen` | 带 AppID / SignKey 的 OAuth2 风格 token |

## Quark / UC

### Cookie

1. 用 Chrome 打开 <https://pan.quark.cn> 并登录。
2. 按 <kbd>F12</kbd> 打开开发者工具，进入 <kbd>Network</kbd> 面板，选择任意带 `Cookie` 请求头的请求。
3. 复制完整 `Cookie` 值，填入挂载字段。

建议使用 Chrome 获取 Cookie。其它浏览器复制出的 Cookie 可能仍停留在访客状态，并继续提示登录。

### 根文件夹 ID

- 根目录 ID 是 `0`。
- 如果只想挂载某个子文件夹，进入该文件夹后从浏览器地址栏复制目录 ID。目录越深，目标目录 ID 通常越靠后。

### 播放和下载

- `use_transcoding_address` 默认关闭，保持与 OpenList 一致并优先使用普通下载链接。开启后会优先尝试夸克转码视频链接；如果上游没有返回可用转码地址，会回退普通下载链接。
- `only_list_video_file` 会只列出视频文件和文件夹。
- 本插件沿用 OpenList 的代理边界：需要代理的链接走 `/p/<path>` 和通用流式代理。

## QuarkTV / UCTV

### 添加挂载

1. 新增 `QuarkTV` 或 `UCTV` 挂载，填写挂载路径并保存。
2. 通过挂载验证流程显示或刷新二维码。
3. 使用手机 App 扫码并确认。
4. 保存后端返回的 addition。`refresh_token`、`device_id`、`query_token` 会自动填充。

除非你明确要替换登录态，否则不要手动编辑 `refresh_token`、`device_id` 或 `query_token`。

### 设备数量超限

如果 QuarkTV / UCTV 扫码确认后提示“设备数量超限”，通常表示该账号在上游 TV/OAuth 登录通道中的设备授权名额已满，不是挂载路径或二维码字段填写错误。

处理方法：

1. 在夸克或 UC 手机 App、网页端账号安全/设备管理中退出不再使用的设备，清理旧 TV 登录设备或可疑登录记录。
2. 回到思盘挂载表单，清空当前 QuarkTV / UCTV 挂载里的 `refresh_token`、`query_token` 和 `device_id` 后重新刷新二维码扫码。
3. 如果仍然超限，等待上游设备记录释放后再试，或改用普通 `Quark` / `UC` Cookie 挂载。

### 根文件夹 ID

- 根目录 ID 是 `0`。
- 子文件夹 ID 的获取方式与 Quark/UC 相同：进入目标文件夹后，从网页地址栏复制目录 ID。

### 链接方式

`link_method` 控制 TV 视频链接：

| 值 | 含义 |
| --- | --- |
| `download` | 原始下载链接 |
| `streaming` | 可用时使用转码播放链接 |

### TV 播放清晰度与流畅度

`streaming` 会请求上游 TV 转码播放地址，清晰度候选按 `low`、`normal`、`high`、`super`、`2k`、`4k` 传给上游。当前流程优先取上游返回的第一个可用播放地址，因此更偏向“先能流畅播放”，不保证一定是最高画质。

流畅度通常可以按下面顺序理解：

| 流畅度排名 | 清晰度 | 适用场景 |
| --- | --- | --- |
| 1 | `low` | 最流畅，画质最低，适合网络不稳或快速预览 |
| 2 | `normal` | 普通清晰度，兼顾加载速度 |
| 3 | `high` | 较清晰，对网络要求更高 |
| 4 | `super` | 高清优先，卡顿概率更高 |
| 5 | `2k` | 高码率，适合带宽稳定时使用 |
| 6 | `4k` | 最清晰但最吃带宽，最容易缓冲 |

如果 `streaming` 播放画质偏低但很流畅，这是预期的转码优先策略。想优先原始画质时，把 `link_method` 改为 `download`；但原始下载链接更依赖账号、带宽和上游限速，可能更容易卡顿。

TV 驱动只支持列表、详情、读取和链接。上传、新建目录、重命名、移动、复制、删除都按上游边界不可用。

## QuarkOpen

`QuarkOpen` 至少需要 `refresh_token`。如果保持 `use_online_api` 开启，插件会先通过在线刷新 API 换取 `access_token`。夸克 Open API 实际请求需要公共参数；`app_id` 和 `sign_key` 留空时会使用内置公参，但不会在表单或配置 JSON 中默认明文展示。

> [!IMPORTANT]
> 使用官方在线工具获取 QuarkOpen token 时，务必勾选“使用 OpenList 提供的参数”。勾选后 `app_id` 和 `sign_key` 可留空；只有维护自己的参数时才取消勾选并填写自备值。

| 字段 | 说明 |
| --- | --- |
| `refresh_token` | 通过夸克 OAuth2 风格流程获取的刷新令牌 |
| `access_token` | 可留空；开启在线 API 时会自动刷新 |
| `app_id` | 可留空；留空时使用内置公参，不默认明文展示 |
| `sign_key` | 可留空；留空时使用内置公参，不默认明文展示 |
| `api_url_address` | 在线刷新 API，默认 `https://api.oplist.org/quarkyun/renewapi` |
| `use_online_api` | 除非你维护本地刷新逻辑，否则保持开启 |

OpenList 上游说明该 Open 接口并非真正的官方公开接口，也不提供进一步教程。本插件中，`QuarkOpen` 支持列表、详情、读取、链接、基础管理和上传；复制未暴露。

## 常用字段

| 字段 | 说明 |
| --- | --- |
| `root_folder_id` | 根文件夹 ID，默认 `0` |
| `order_by` / `order_direction` | 排序 |
| `cookie` | Quark/UC Cookie 登录 |
| `refresh_token` | TV/Open 刷新令牌 |
| `use_transcoding_address` | Quark 转码播放链接，默认关闭 |
| `only_list_video_file` | 只显示视频文件和文件夹 |
| `link_method` | TV 链接方式，`download` 或 `streaming` |

## 排查

| 现象 | 处理 |
| --- | --- |
| Cookie 失效或仍是访客 | 使用 Chrome 重新复制 Cookie 并保存挂载 |
| 预览/下载很慢 | 换带宽更好的机器运行，或在适合时使用 TV/Open 路径 |
| Cookie 登录播放 502 | 先关闭 `use_transcoding_address` 后重试；本插件会在转码无可用地址时回退普通下载链接 |
| 只看到视频 | 关闭 `only_list_video_file` |
| TV 二维码状态过期 | 刷新二维码，并保存后端返回的 addition |
| TV 提示设备数量超限 | 到夸克/UC 账号设备管理中退出旧设备，再清空本挂载的 `refresh_token`、`query_token`、`device_id` 后重新扫码 |
| QuarkOpen 提示“公参缺失” | 确认使用的是新版插件；新版会在 `app_id` / `sign_key` 留空时使用内置公参 |
| Open token 失效 | 更新 `refresh_token`，或保持 `use_online_api` 开启 |
| 复制失败 | 本插件未暴露 Quark 系列复制能力 |
