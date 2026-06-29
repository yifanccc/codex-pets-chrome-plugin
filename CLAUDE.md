# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 常用命令

- `npm test` — 运行全部 Node 测试。
- `npm run check` — 使用 `node --check` 检查扩展脚本语法。
- `node --test test/core.test.js` — 运行单个测试文件。
- `node --test --test-name-pattern "buildChatEndpoint" test/core.test.js` — 运行单个测试用例。

本项目没有构建步骤。开发时直接把仓库根目录作为未打包扩展加载到 Chrome。

## 架构概览

这是一个 Chrome Manifest V3 扩展，用于在网页中显示 Codex 风格桌宠。

- `manifest.json` 声明 MV3 权限、content script、background service worker、options page、popup 和标准尺寸图标。
- `src/background.js` 是 service worker，负责扩展消息、`chrome.storage.local` 读写、工具栏状态、翻译/模型请求、打开 Codex 链接和下载知识笔记。
- `src/content.js` 注入到网页，创建 shadow DOM 桌宠浮层，处理拖拽、位置保存、动画、操作面板、页面文本提取和结果展示。
- `src/options.*` 是配置页，负责导入宠物、预览动画状态、选择模型、调整大小、开关桌宠和配置知识笔记下载目录。
- `src/popup.*` 是工具栏弹窗，提供快速开关、宠物选择、模型选择和打开配置页入口。
- `src/shared/core.js` 放纯函数：提示词构造、文件名清理、模型接口地址归一化、宠物动画元数据、尺寸计算、Markdown 安全渲染和响应解析。
- `test/*.test.js` 使用 Node 内置 test runner，覆盖纯函数、manifest 图标引用，以及 HTML/CSS/JS 的静态 UI 约束。

## 注意事项

- 导入的宠物素材、模型配置、API key、桌宠位置、大小和开关状态都存在 `chrome.storage.local`。
- 大模型能力是可选功能，只在用户点击“总结”或“记忆”时调用兼容 OpenAI Chat Completions 的接口。
- 知识笔记通过 `chrome.downloads` 保存到浏览器下载目录下的子目录；Chrome 扩展不能静默写入任意本地绝对路径。
- `assets/icons/icon16.png`、`icon32.png`、`icon48.png`、`icon128.png` 被 `manifest.json` 引用，并由 `test/manifest.test.js` 检查。
- 如果修改动画状态，需要同步 `src/shared/core.js` 的测试和 `src/content.js` 中运行时使用的动画元数据。
- 不要提交生成产物或本地环境文件；`.gitignore` 已排除 `dist/`、`*.crx`、`*.pem`、日志、`node_modules/` 和 `.DS_Store`。
