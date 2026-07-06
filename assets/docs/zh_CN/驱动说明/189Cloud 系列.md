# 189Cloud 系列

本教程适用于 `189Cloud`、`189CloudPC` 和 `189CloudTV`，对应天翼云盘网页端、客户端/PC 接口和 TV 接口。上游文档参考：<https://doc.oplist.org/guide/drivers/189>。

## 选择驱动

| 驱动 | 适合场景 | 当前状态 |
| --- | --- | --- |
| `189Cloud` | 账号密码或 cookie 登录，通用网页端入口 | 已接入登录、短信二次验证、列表、下载/播放、基础管理和上传请求基础；不包含家庭云 |
| `189CloudPC` | 希望使用天翼云盘 App 扫码、使用家庭云，或已有 PC token/session | 已接入二维码登录、token 刷新、家庭云 ID 回填、列表、下载/播放和基础管理；上传、CAS/torrent 秒传仍是占位 |
| `189CloudTV` | TV 二维码/token 路径，适合扫码获取 access token 或访问家庭云 | 已接入 TV 二维码登录、session 刷新、家庭云 ID 回填、列表、下载/播放和基础管理；上传仍是占位 |

如果 `189Cloud` 遇到网页验证码或登录风控，优先尝试 `189CloudPC` 的二维码登录。

## 挂载

1. 打开 <kbd>Dock</kbd> -> <kbd>挂载</kbd> -> <kbd>添加挂载</kbd>。
2. 选择 `189Cloud`、`189CloudPC` 或 `189CloudTV`。
3. 挂载路径可填写 `/189`、`/189pc` 或其它不重复路径。
4. `root_folder_id` 默认 `-11`，表示个人云根目录。
5. 保存后在文件树中打开挂载路径。

## 189Cloud

普通 `189Cloud` 可填写 `username` / `password`，也可以直接填写可用的 `cookie`。该驱动对应网页端个人云；需要家庭云时请改用 `189CloudPC` 或 `189CloudTV`。

- 账号密码登录会按 OpenList 流程访问登录页、获取加密配置并提交 RSA 加密后的账号密码。
- 远端要求短信二次验证时，Dock 会显示短信验证表单；提交验证码成功后会把新的 `cookie` 写回挂载配置。
- 文件浏览不会反复自动发送短信。已有 cookie 失效时，会提示回到挂载设置重新验证。
- 上传已接入 `initMultiUpload -> getMultiUploadUrls -> commitMultiUploadFile` 基础流程，但仍建议用真实账号验证大文件后再依赖。

## 189CloudPC

推荐使用二维码登录：

1. `login_type` 选择 `qrcode`。
2. `root_folder_id` 保持 `-11`。
3. 点击验证或保存时，Dock 会显示二维码。
4. 使用天翼云盘 App 扫码并在手机上确认。
5. 再次点击验证或保存，插件会轮询登录状态并写回 `access_token`、`refresh_token`、`sessionKey` 和 `sessionSecret`。

也可以导入已有的 `access_token` / `refresh_token` / session 字段。`username`、`password`、`validate_code` 属于上游 PC 密码登录字段，当前本端主要推荐二维码/token 路径。

访问家庭云时，将 `type` 设为 `family`。如果 `family_id` 留空，插件会在刷新 PC session 后调用上游家庭云列表接口，尽量按登录名或第一个家庭空间自动写回 `family_id`。

## 189CloudTV

`189CloudTV` 不需要预先填写账号密码：

1. 留空 `access_token` 后点击验证或保存。
2. Dock 显示 TV 登录二维码内容。
3. 扫码确认后再次点击验证或保存。
4. 插件会写回 `access_token` 并刷新 `sessionKey` / `sessionSecret`。

## 家庭空间

| 字段 | 说明 |
| --- | --- |
| `type` | `personal` 表示个人云，`family` 表示家庭云 |
| `family_id` | 家庭空间 ID；PC/TV 驱动在可识别时会尝试自动写回 |
| `root_folder_id` | 个人云默认 `-11`；家庭云通常为空或使用具体目录 ID |

家庭云建议使用 `189CloudPC` 或 `189CloudTV`，普通 `189Cloud` 不提供家庭云字段。`root_folder_id=-11` 在家庭云模式下会被归一为空，表示家庭云根目录；如果要挂载家庭云中的某个目录，再填写具体目录 ID。

如果自动回填失败，可按上游文档在天翼云盘手机 H5 家庭云请求中查找 `familyId`，再手动填入 `family_id`。家庭空间为空时，先确认 `type`、`family_id` 和 `root_folder_id` 是否匹配。

## 排查

| 现象 | 处理 |
| --- | --- |
| 普通 189Cloud 提示 cookie 失效 | 回到挂载设置重新登录或更新 cookie |
| 普通 189Cloud 需要短信验证 | 在挂载设置中完成短信验证，不要在文件浏览页反复重试 |
| 189CloudPC 提示等待扫码 | 用天翼云盘 App 扫码后再次点击验证或保存 |
| 189CloudPC 二维码过期 | 重新点击验证生成二维码 |
| PC/TV 缺 session | 重新验证，让插件用 token 刷新 session |
| 家庭空间为空 | 优先使用 `189CloudPC` / `189CloudTV`，再检查 `type`、`family_id` 和 `root_folder_id` |

## 已知限制

- `189CloudPC` 上传、家庭云转存、CAS/torrent 秒传仍未完整迁移。
- `189CloudTV` 上传仍是占位。
- 普通 `189Cloud` 上传链路有 smoke 覆盖，但仍需要真实账号和大文件场景继续验证。
