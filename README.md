# codex-pets-chrome-plugin

<p align="center"><b>简体中文</b> · <a href="README.en.md">English</a></p>

Codex Pets 是一个 Chrome MV3 扩展，用来把 Codex 风格的桌宠放到日常网页里。它支持导入宠物素材、拖拽和记住位置，也可以在你主动点击时调用兼容 OpenAI Chat Completions 的模型来总结页面或生成本地知识笔记。

## 功能

- 导入 Codex 风格的 `pet.json` 与 `spritesheet.webp`。
- 在配置页预览所有支持的动画状态，并选择当前桌宠。
- 在普通网页中显示可拖拽桌宠，并跨页面保留上次位置。
- 通过浏览器工具栏弹窗快速开关桌宠、切换宠物和切换模型。
- 全局调整桌宠大小，范围为 60% 到 180%。
- 将选中文本或当前页面可见文本翻译成中文。
- 打开 Codex，并带入当前页面标题和链接作为交接提示。
- 使用兼容 OpenAI 的聊天接口总结当前页面。
- 生成当前页面的 Markdown 知识笔记，并下载到本地。

## 本地安装

1. 克隆或下载这个仓库。
2. 在 Chrome 打开 `chrome://extensions`。
3. 打开右上角的 **开发者模式**。
4. 点击 **加载已解压的扩展程序**。
5. 选择这个仓库的根目录。
6. 进入扩展配置页，导入桌宠素材，并按需配置模型。

## 宠物素材

每个桌宠需要两个文件：

- `pet.json`：宠物元数据。存在 `displayName` 或 `name` 时会作为显示名称。
- `spritesheet.webp`：桌宠动画图集。

当前图集按 96 × 104 的基础帧尺寸、8 列、9 行来读取：

| 行 | 状态 |
| --- | --- |
| 0 | idle |
| 1 | running-right |
| 2 | running-left |
| 3 | waving |
| 4 | jumping |
| 5 | failed |
| 6 | waiting |
| 7 | running |
| 8 | review |

## 可选模型配置

“总结”和“记忆”功能需要兼容 OpenAI Chat Completions 的接口。你可以在配置页添加模型：

- **名称**：扩展中显示的模型名称。
- **Base URL**：接口地址，例如 `https://api.openai.com/v1`。
- **Model**：模型标识，例如 `gpt-4.1-mini`。
- **API key**：由 Chrome 保存在 `chrome.storage.local` 中。

扩展只会在你点击“总结”或“记忆”这类模型功能时发送页面文本。如果接口返回 HTML，扩展会提示 Base URL 可能填成了网页地址，而不是 API 地址。

## 知识笔记

Chrome 扩展不能静默写入任意本地绝对路径，所以“记忆”功能会通过 `chrome.downloads` 把 Markdown 文件保存到浏览器下载目录下的子目录。

默认目录：

```text
Downloads/codex-pets-knowledge/
```

生成的笔记会包含模型返回的 Markdown 摘要，并始终保留原始页面链接。

## 开发

这个项目没有构建步骤，开发时直接把仓库根目录作为未打包扩展加载到 Chrome。

```bash
npm test
npm run check
```

运行单个测试文件：

```bash
node --test test/core.test.js
```

运行单个测试用例：

```bash
node --test --test-name-pattern "buildChatEndpoint" test/core.test.js
```

`npm run check` 会用 `node --check` 检查扩展脚本语法。
