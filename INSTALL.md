# ScholarTrail V1.4 安装说明

适用于 Chrome / Edge。无需安装 Node、Python 或其他开发工具。

## 首次安装

1. 解压 `ScholarTrail-v1.4.0-zh-CN.zip`，把解压得到的 `ScholarTrail` 文件夹放在固定位置。
2. Chrome 打开 `chrome://extensions`；Edge 打开 `edge://extensions`。
3. 开启「开发者模式」，点击「加载已解压的扩展程序」。
4. 选择 `ScholarTrail/extension` 文件夹，确认该文件夹内有 `manifest.json`。
5. 在 ScholarTrail 中创建研究项目，再打开或刷新 Google Scholar 页面。
6. 照常点击论文标题即可记录研究足迹；也可添加笔记、彩色标签或标记「不相关」。

安装后请保留文件夹，不要移动或删除；浏览器会持续读取其中的文件。可以在浏览器扩展菜单中固定 ScholarTrail 图标。

## 更新已有版本

先在插件的「设置与连接」中导出研究数据留作备份。把新版 `extension` 文件夹内的文件覆盖到原来加载的同一个文件夹，然后在扩展管理页点击 ScholarTrail 的刷新按钮，再刷新 Google Scholar 页面。

不要卸载旧插件或清除扩展数据。项目、笔记和历史记录保存在当前浏览器配置文件中，卸载会删除这些数据。本版支持导出，暂不支持导入或跨设备同步。

## 可选：连接 Zotero

在「设置与连接」中填写 Zotero 数字 User ID 和专用 API key，连接个人在线文献库。需要保存文献时，还须给密钥开启写入权限。请不要把 API key 上传到 GitHub 或发给他人。

Zotero 桌面端的变更需要先同步到在线库。插件保存的是基础文献元数据，不下载 PDF；保存后请在 Zotero 中校对作者和文献类型。

## 数据与权限

研究项目、笔记、标签和点击记录保存在本地。扩展仅在指定 Google Scholar 域名运行；Zotero 访问权限只在连接时申请。插件没有 ScholarTrail 账号、服务器或分析追踪。

本版通过开发者模式加载，尚未上架 Chrome Web Store；暂不支持 Firefox / Safari。
