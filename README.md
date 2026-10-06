# ScholarTrail · 中文版 V1.4

**照常检索，让 ScholarTrail 记住研究的足迹。**

用于 Google Scholar 的 Chrome / Edge 浏览器扩展。数据保存在当前浏览器，不需要 ScholarTrail 账号或服务器。界面、日期、操作提示和内置错误信息均已中文化，论文标题和你已有的项目、笔记内容保持原样。

## 下载

**[点击下载 V1.4 中文版安装包](https://github.com/yueqing-king/ScholarTrail/raw/refs/heads/main/downloads/ScholarTrail-v1.4.0-zh-CN.zip)**

下载 `ScholarTrail-v1.4.0-zh-CN.zip`，解压后按下面的步骤安装。安装包内包含 `extension/` 和安装说明，无需构建。

也可以点击仓库的 **Code → Download ZIP** 下载完整源码；解压后加载其中的 `extension/` 文件夹即可。

## 更新到 V1.4

如果你已经加载过上一版：将新版 `extension` 文件夹中的文件覆盖到**原来加载的同一个文件夹**，再到浏览器扩展管理页点击 ScholarTrail 的刷新按钮，最后刷新 Scholar 标签页。无需卸载，也不要清除扩展数据，原有项目和笔记会继续保留。

## 3 分钟安装

1. 下载并解压安装包，将 `ScholarTrail` 文件夹放在一个固定的位置。
2. Chrome 地址栏输入 `chrome://extensions`；Edge 输入 `edge://extensions`。
3. 打开右上角的「开发者模式」。
4. 点击「加载已解压的扩展程序」，选择解压目录中的 **`extension` 文件夹**，也就是包含 `manifest.json` 的那一层。不要选择整个压缩包或上一级文件夹。
5. 新开的 ScholarTrail 页面中，创建自己的研究项目，或选择「已有备份？导入研究数据」恢复之前的记录。
6. 打开 Google Scholar，**刷新已打开的 Scholar 页面**。右下角显示当前项目后，正常点击论文标题即可。

不需要安装 Node、Python 或任何开发依赖。不要移动已加载的 `extension` 文件夹；浏览器会持续从这里读取插件。

推荐在浏览器的扩展菜单中固定 ScholarTrail。以后点击图标即可切换当前项目或进入项目列表。

## 已实现

| 功能 | 使用方式 |
|---|---|
| 项目 | 创建、重命名、切换、归档、恢复、删除；删除前会提示 |
| 自动记录 | 点击 Scholar 论文标题或右侧全文链接，保存论文、当前项目、查询词和时间 |
| 再次遇到 | 识别历史论文，显示 `之前点过`；仅出现于结果页不会生成阅读记录 |
| 笔记 | Scholar 结果行直接添加、编辑、删除；也可在项目页中操作 |
| 不相关 | `不相关` 轻微置灰，不隐藏结果；`撤销` 保留点击、笔记和历史 |
| 项目隔离 | 同一篇论文的笔记和不相关判断不会串到另一个项目 |
| 彩色标签 | 在 Scholar 结果页或项目页添加、编辑标签；每个研究项目独立管理标签 |
| 项目列表 | 搜索标题、作者、笔记和标签；组合筛选点击、笔记、不相关、Zotero 状态和具体标签 |
| 发现历史 | 点击 `历史` 查看每次查询词、时间，以及原始 Scholar 搜索页 |
| Zotero | 连接个人在线文献库、检测已收藏条目、打开网页/桌面条目、保存基础文献记录 |
| 备份与恢复 | 导出和导入 JSON，恢复项目、论文、笔记、标签、判断与点击历史；支持旧版备份，不含 Zotero 密钥 |

## 连接 Zotero

这是可选步骤。不连接也能使用点击记录、笔记和排除功能。

1. 进入 ScholarTrail → **设置与连接**。
2. 点击 **创建 API 密钥**，或访问 [Zotero API key 设置](https://www.zotero.org/settings/keys/new)。
3. 创建专用于 ScholarTrail 的 API key，允许读取 **Personal Library**。如果想从 ScholarTrail 添加文献，还需启用写入权限。
4. 填入 Zotero 的**数字 User ID**（不是用户名）和 API key。User ID 可在 [API Keys 页面](https://www.zotero.org/settings/keys) 找到。
5. 点击 **连接文献库**，允许浏览器访问 `api.zotero.org`。

连接后在浏览器运行期间每 15 分钟刷新一次，也可手动点击 **立即刷新**。Zotero 桌面新增文献需要先同步到 Zotero 在线库。未确认的匹配不会显示 `已存入 Zotero`；网络失败时保留已有缓存，并明确显示 `缓存` / 最后检查时间。

打开条目：在项目页点击论文，使用 **在 Zotero 网页中打开** 或 **打开 Zotero 桌面端**。桌面入口需要本机安装 Zotero，浏览器可能询问是否允许打开该应用。

保存条目：项目页 → 论文详情 → **保存文献到 Zotero**。会保存一条基础 journal article 记录，使用页面上能提取的标题、作者、年份、URL 和 DOI。**Google Scholar 元数据可能不完整，保存后请在 Zotero 校对文献类型和作者信息。此功能不下载 PDF，也不替代 Zotero Connector 的完整抓取能力。**

## 从检索到整理

1. 为当前研究创建一个项目，再打开 Google Scholar，按自己的关键词检索。
2. 点开感兴趣的论文，返回结果页时会看到 `✓ 之前点过`。
3. 点 `+ 添加笔记` 记下想法，用彩色标签区分「待精读」「可引用」等状态。
4. 对暂时用不到的结果点 `× 不相关`；需要重新考虑时点 `撤销`，笔记和点击历史都会保留。
5. 换查询词或刷新，再次遇到同一篇论文时，继续之前的判断和笔记。
6. 点击插件图标进入项目页，搜索或筛选已记录的论文，查看每次发现它的时间和检索词。
7. 开始另一个主题时创建并切换项目。同一篇论文在不同项目中可以有不同的笔记、标签和判断。
8. 整理告一段落后，进入「设置与连接」导出研究数据；换浏览器或重新安装时导入备份，接着研究。

## 备份、恢复与迁移

**导出：**进入「设置与连接」→「导出研究数据」，保存得到的 JSON 文件。

**导入：**在首次安装页面选择「已有备份？导入研究数据」，或进入「设置与连接」→「导入研究数据」。选择 ScholarTrail 导出的 JSON 文件，核对预览中的项目、论文记录、笔记、标签和点击历史数量，再点击「确认导入」。取消预览不会修改任何数据。

- 支持此前版本导出的 ScholarTrail JSON 备份，文件最大 20 MB。
- 项目名称、归档状态、论文、笔记、彩色标签、「不相关」判断及检索历史会恢复。在空白安装中也会恢复原来的当前项目。
- 原有内容保留；同名或内容不同的项目另建副本，例如「文献综述（导入）」。相同备份中的已恢复项目会跳过，避免重复添加。
- 如果预览期间发生新的编辑，插件会刷新预览，要求再次确认，保留刚刚新增的内容。
- 每次实际导入前会自动保留一份当前研究数据，可在设置中点击「下载最近一次导入前的备份」。这里只保留最近一次，重要备份请另存到自己的文件夹。
- 备份不包含 Zotero API 密钥、连接设置或在线库缓存。迁移到新的浏览器后，如需 Zotero 功能，请重新连接。

这是通过文件手动迁移；数据不会自动在设备间同步。JSON 中包含自己的检索词和笔记，请保存在合适的位置。

## 当前边界

- 这是本地加载的 MVP，未上架 Chrome Web Store；Safari / Firefox 未适配。
- 支持 manifest 中列出的 16 个 Google Scholar 地区域名，包括 `.com`、`.com.hk`、`.co.uk`、`.de`、`.fr`、`.co.jp` 等。仅在 Scholar 结果页面工作，不跟踪其他网站上的浏览行为。
- 记录普通点击、Ctrl/Cmd 点击与中键点击；浏览器右键菜单中的「在新标签页打开」不会产生页面点击事件，因此不在此版记录范围内。
- DOI、可靠 Scholar / arXiv ID 优先；否则需要标准化标题、作者首字母/姓氏与年份一致。标题相同但信息不足、标识冲突或存在多个同分候选时，宁可不继承旧判断。
- 不支持 Zotero 群组库、笔记/标签/集合双向同步。检测的是个人**在线库**。
- 大型文献库首次连接会逐页读取；分页过程中版本变化会报错并保留原缓存，可稍后重试。MVP 上限为 100,000 条顶层条目。
- 数据保存在当前浏览器配置文件，可通过导出和导入手动迁移，不跨设备自动同步。卸载扩展或清除扩展数据会删除本地记录，请先导出。
- Scholar 页面结构变更可能影响提取；更新扩展后点击浏览器扩展页的刷新按钮，再刷新 Scholar 标签页。
- 已做核心逻辑和真实 Chromium 扩展流程测试；Zotero 写入测试使用模拟 API，交付时没有访问你的实际文献库。首次连接后建议用一条非关键记录完成实际验收。
- 真实 Google Scholar 线上检查遇到 HTTP 429 限流；浏览器流程已使用代表性 Scholar DOM 验证，线上页面兼容性还需要你正常访问时确认。测试脚本位于 `tests/`。

## 隐私与权限

- `storage`：保存项目、文献、笔记、连接设置与缓存。
- `unlimitedStorage`：让长期点击历史与文献缓存不受默认小容量限制。
- `alarms`：在浏览器运行期间定时刷新 Zotero 状态。
- 指定 Scholar 域名：读取搜索结果并添加状态行，不请求全站浏览权限。
- `https://api.zotero.org/*`：仅在用户连接 Zotero 时申请。
- API key 保存在浏览器扩展本地存储中，不是独立加密保险库；内容脚本不能直接读取存储。密钥不会出现在普通界面数据响应、导出文件或请求 URL 中。
- 没有分析追踪、AI 接口或 ScholarTrail 后端。查询词、笔记和项目名不上传到 Zotero；只有手动保存文献时发送文献元数据。

## 源码和验证

无需构建，`extension/` 就是可加载的产物。纯 JavaScript、Manifest V3，不依赖运行时第三方库。

```text
extension/
  manifest.json      浏览器扩展入口
  background.js     串行本地写入、消息校验、Zotero 任务
  content.js/css    Scholar 页面识别、点击记录、状态与笔记
  app.html/js       项目列表、历史、设置
  popup.html/js     当前项目切换
  lib/core.js       状态模型与保守身份匹配
  lib/zotero.js     Zotero API 客户端
  lib/tags-ui.js    彩色标签编辑与展示
  lib/filters.js    项目列表组合筛选
  lib/backup.js      备份校验、恢复计划与冲突保护
  lib/backup-ui.js   文件选择、导入预览与确认
tests/
  core.test.mjs     项目、点击、识别、笔记、隔离、撤销
  zotero.test.mjs   分页、缓存、限流、保存确认
  backup*.test.mjs  备份恢复与后台事务测试
  e2e.mjs          真实 Chromium 中的扩展验收
  backup-e2e.mjs   真实浏览器中的导入、恢复和迁移验收
  scholar-fixture.html   代表性 Scholar DOM 测试页
```

开发者可使用 Node 20+ 运行 `npm test`。浏览器验收需要 Playwright 和它的 Chromium：`node tests/e2e.mjs` 和 `node tests/backup-e2e.mjs`。默认写入 `test-results/`，不会使用日常浏览器配置文件；可通过 `SCHOLARTRAIL_TEST_DIR` 改写输出目录。测试时会清空**该测试配置文件**中的扩展存储，请勿指向个人浏览器目录。

实现参考：[Chrome Content Scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)、[Chrome Storage](https://developer.chrome.com/docs/extensions/reference/api/storage)、[Zotero Web API](https://www.zotero.org/support/dev/web_api/v3/basics)、[Zotero Write Requests](https://www.zotero.org/support/dev/web_api/v3/write_requests)。
