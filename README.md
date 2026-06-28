# codex-pets-on-chrome

Chrome MV3 extension that lets a Codex-compatible pet accompany normal web browsing.

## Features

- Import a Codex pet with `pet.json` and `spritesheet.webp`.
- Preview and choose the active pet in the extension options page.
- Show the pet in the bottom-right corner of every normal page.
- Open the Chrome toolbar popup to toggle the pet, choose a pet, and choose a model.
- Adjust the pet size globally from 60% to 180%.
- Use Codex pet atlas states for idle, running, failed, waving, and drag direction.
- Open Google Translate for selected text or page text.
- Summarize the current page with the configured OpenAI-compatible model.
- Copy a Codex handoff prompt containing the page title and URL.
- Generate a local knowledge note through the model, with a required model-produced file title and Markdown summary.

## Model Config

The model endpoint is OpenAI-compatible:

- `Base URL`: for example `https://api.openai.com/v1`
- `API key`: stored in `chrome.storage.local`
- `Model`: for example `gpt-4.1-mini`

If the model URL returns HTML, the extension reports that the Base URL is probably a webpage address rather than an OpenAI-compatible API endpoint.

The memory prompt requires the model to return JSON only:

```json
{
  "title": "中文文件标题",
  "markdown": "# Markdown 摘要"
}
```

The extension validates both fields, sanitizes `title` into a filename, and always writes the original URL into the Markdown file.

## Knowledge Notes

Chrome extensions cannot silently write to an arbitrary local absolute path. This MVP saves notes through `chrome.downloads` into a configurable subfolder under the browser download directory.

Example output:

```text
Downloads/codex-pets-knowledge/2026-06-28-页面摘要.md
```

## Load Locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select this folder: `/Users/caoyifan/projects/codex-pets-chrome-plugin`.
5. Open the extension details page and click "Extension options" to import a pet and configure a model.
6. Click the toolbar icon to open the quick popup for global display, pet, and model selection.

## Development

```bash
npm test
npm run check
```
