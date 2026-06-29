# codex-pets-chrome-plugin

<p align="center"><a href="README.md">简体中文</a> · <b>English</b></p>

Codex Pets is a Chrome MV3 extension that adds a draggable Codex-style pet to normal web pages. It can import pet assets, remember the pet position, and optionally use an OpenAI-compatible chat completion endpoint to summarize or remember pages when you trigger those actions.

## Features

- Import pets from `pet.json` and `spritesheet.webp`.
- Preview supported animation states and choose the active pet.
- Show a draggable pet on web pages and keep its last position across pages.
- Toggle the pet, switch pets, and switch models from the toolbar popup.
- Adjust pet size globally from 60% to 180%.
- Translate selected text, or visible page text, into Chinese.
- Open Codex with a handoff prompt containing the current page title and URL.
- Summarize the current page with an OpenAI-compatible chat completion endpoint.
- Generate a Markdown knowledge note for the current page and download it locally.

## Local install

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the repository root folder.
6. Open the extension options page to import a pet and configure optional models.

## Pet assets

Each pet needs two files:

- `pet.json`: pet metadata. `displayName` or `name` is used as the visible name when present.
- `spritesheet.webp`: pet animation atlas.

The current atlas layout uses 96 × 104 base frames, 8 columns, and 9 rows:

| Row | State |
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

## Optional model configuration

Summarize and remember features require an OpenAI-compatible Chat Completions endpoint. Add models from the options page:

- **Name**: display name in the extension.
- **Base URL**: API address, for example `https://api.openai.com/v1`.
- **Model**: model identifier, for example `gpt-4.1-mini`.
- **API key**: stored by Chrome in `chrome.storage.local`.

The extension sends page text only when you click model-powered actions such as summarize or remember. If the endpoint returns HTML, the extension will report that the Base URL may be a web page instead of an API address.

## Knowledge notes

Chrome extensions cannot silently write to arbitrary local absolute paths. The remember action uses `chrome.downloads` to save Markdown files under a subfolder of the browser downloads directory.

Default folder:

```text
Downloads/codex-pets-knowledge/
```

Generated notes include the model-produced Markdown summary and always keep the original page URL.

## Development

There is no build step. Load the repository root directly as an unpacked Chrome extension.

```bash
npm test
npm run check
```

Run one test file:

```bash
node --test test/core.test.js
```

Run one named test:

```bash
node --test --test-name-pattern "buildChatEndpoint" test/core.test.js
```

`npm run check` syntax-checks extension scripts with `node --check`.
