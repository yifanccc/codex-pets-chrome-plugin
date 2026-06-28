(function () {
  const BASE_FRAME_WIDTH = 96;
  const BASE_FRAME_HEIGHT = 104;
  const ANIMATIONS = {
    idle: { row: 0, durations: [280, 110, 110, 140, 140, 320] },
    "running-right": { row: 1, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
    "running-left": { row: 2, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
    waving: { row: 3, durations: [140, 140, 140, 280] },
    jumping: { row: 4, durations: [140, 140, 140, 140, 280] },
    failed: { row: 5, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
    waiting: { row: 6, durations: [150, 150, 150, 150, 150, 260] },
    running: { row: 7, durations: [120, 120, 120, 120, 120, 220] },
    review: { row: 8, durations: [150, 150, 150, 150, 150, 280] }
  };

  let settings = {};
  let currentPet = null;
  let activeSpritesheetDataUrl = "";
  let petScale = 1;
  let frameWidth = BASE_FRAME_WIDTH;
  let frameHeight = BASE_FRAME_HEIGHT;
  let frame = 0;
  let state = document.readyState === "loading" ? "running" : "idle";
  let x = Math.max(16, window.innerWidth - 132);
  let y = Math.max(16, window.innerHeight - 148);
  let dragging = false;
  let movedDuringDrag = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let lastX = x;
  let dragState = "";
  let panelOpen = false;
  let animationTimer = 0;

  const host = document.createElement("div");
  host.id = "codex-pet-host";
  Object.assign(host.style, {
    all: "initial",
    position: "fixed",
    zIndex: "2147483647",
    left: "0",
    top: "0",
    width: `${BASE_FRAME_WIDTH}px`,
    minHeight: `${BASE_FRAME_HEIGHT}px`,
    pointerEvents: "none"
  });

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <link rel="stylesheet" href="${chrome.runtime.getURL("src/content.css")}">
    <div id="codex-pet-root">
    <div class="codex-pet-sprite" title="Codex Pet"></div>
    <div class="codex-pet-panel" hidden>
      <div class="codex-pet-panel-header">
        <div>
          <strong>Codex Pet</strong>
          <span class="codex-pet-name">未选择宠物</span>
        </div>
        <button type="button" data-action="close-pet" title="关闭弹窗" class="codex-pet-close">×</button>
      </div>
      <div class="codex-pet-actions">
        <button type="button" data-action="translate"><span>译</span><strong>翻译</strong><small>转成中文</small></button>
        <button type="button" data-action="summary"><span>总</span><strong>总结</strong><small>页面要点</small></button>
        <button type="button" data-action="summon"><span>C</span><strong>召唤 Codex</strong><small>复制链接</small></button>
        <button type="button" data-action="remember"><span>记</span><strong>记忆</strong><small>生成摘要</small></button>
      </div>
      <div class="codex-pet-result" role="status" hidden>
        <div class="codex-pet-result-content"></div>
      </div>
      <button type="button" data-action="options" class="codex-pet-link">配置</button>
    </div>
    </div>
  `;

  const root = shadow.querySelector("#codex-pet-root");
  const sprite = shadow.querySelector(".codex-pet-sprite");
  const panel = shadow.querySelector(".codex-pet-panel");
  const petName = shadow.querySelector(".codex-pet-name");
  const closeButton = shadow.querySelector(".codex-pet-close");
  const result = shadow.querySelector(".codex-pet-result");
  const resultContent = shadow.querySelector(".codex-pet-result-content");

  document.documentElement.appendChild(host);
  moveTo(x, y);
  loadSettings();
  scheduleNextFrame();

  window.addEventListener("load", () => setState("idle"), { once: true });
  window.addEventListener("error", () => setState("failed"), true);
  window.addEventListener("unhandledrejection", () => setState("failed"));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      area === "local" &&
      (changes.pets || changes.currentPetId || changes.petEnabled || changes.petScale)
    ) {
      loadSettings();
    }
  });

  sprite.addEventListener("pointerdown", (event) => {
    dragging = true;
    movedDuringDrag = false;
    dragOffsetX = event.clientX - x;
    dragOffsetY = event.clientY - y;
    lastX = x;
    dragState = "";
    sprite.setPointerCapture(event.pointerId);
  });

  sprite.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const nextX = clamp(event.clientX - dragOffsetX, 8, window.innerWidth - frameWidth - 8);
    const nextY = clamp(event.clientY - dragOffsetY, 8, window.innerHeight - frameHeight - 8);
    if (Math.abs(nextX - x) > 2 || Math.abs(nextY - y) > 2) {
      movedDuringDrag = true;
    }
    const nextState = nextX >= lastX ? "running-right" : "running-left";
    if (nextState !== dragState) {
      dragState = nextState;
      setState(nextState);
    }
    lastX = nextX;
    moveTo(nextX, nextY);
  });

  sprite.addEventListener("pointerup", (event) => {
    if (!dragging) {
      return;
    }
    dragging = false;
    dragState = "";
    sprite.releasePointerCapture(event.pointerId);
    setState("idle");
  });

  sprite.addEventListener("click", () => {
    if (dragging || movedDuringDrag) {
      movedDuringDrag = false;
      return;
    }
    panelOpen = !panelOpen;
    panel.hidden = !panelOpen;
    if (panelOpen) {
      setState("waving");
    }
  });

  closeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    closePanel();
  });

  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;

    if (action === "close-pet") {
      closePanel();
      return;
    }

    if (action === "options") {
      await send({ type: "OPEN_OPTIONS" });
      return;
    }

    await runAction(action);
  });

  async function loadSettings() {
    const response = await send({ type: "GET_SETTINGS" });
    settings = response.settings || {};
    currentPet = (settings.pets || []).find((pet) => pet.id === settings.currentPetId) || null;
    petScale = normalizeScale(settings.petScale);
    applyVisibility();
    applyPetAppearance();
    renderPetName();
    moveTo(clamp(x, 8, window.innerWidth - frameWidth - 8), clamp(y, 8, window.innerHeight - frameHeight - 8));
    renderSprite();
    scheduleNextFrame();
  }

  async function runAction(action) {
    try {
      setBusy("处理中...");
      if (action === "translate") {
        const response = await send({ type: "TRANSLATE", text: getSelectedOrPageText() });
        setResult(response.translatedText, { markdown: true });
      }

      if (action === "summary") {
        const response = await send({ type: "SUMMARY", page: getPagePayload() });
        setResult(response.summary, { markdown: true });
      }

      if (action === "summon") {
        const prompt = `请阅读这个页面并继续处理：\n标题：${document.title}\n链接：${location.href}`;
        await writeClipboard(prompt);
        try {
          await send({ type: "SUMMON_CODEX" });
        } catch (error) {
          window.location.href = "codex://";
        }
        setResult("已复制页面提示词，并尝试唤起 Codex。");
      }

      if (action === "remember") {
        const response = await send({ type: "REMEMBER", page: getPagePayload() });
        setResult(`已生成记忆：${response.filename}`);
      }
      setState("idle");
    } catch (error) {
      setState("failed");
      setResult(error.message || String(error));
    }
  }

  function getPagePayload() {
    return {
      title: document.title || "Untitled page",
      url: location.href,
      text: truncate(getVisibleText(), 10000)
    };
  }

  function getSelectedOrPageText() {
    return String(window.getSelection() || "").trim() || truncate(getVisibleText(), 4000);
  }

  function getVisibleText() {
    return String(document.body?.innerText || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n");
  }

  function truncate(text, maxLength) {
    const value = String(text || "").trim();
    return value.length > maxLength ? `${value.slice(0, maxLength - 40).trimEnd()}\n\n[内容已截断]` : value;
  }

  function renderSprite() {
    if (!currentPet?.spritesheetDataUrl) {
      sprite.textContent = "⌁";
      return;
    }
    sprite.textContent = "";
    const animation = getAnimation(state);
    const column = frame % animation.durations.length;
    sprite.style.backgroundPosition = `-${column * frameWidth}px -${animation.row * frameHeight}px`;
  }

  function renderPetName() {
    petName.textContent = currentPet?.displayName || "未选择宠物";
  }

  function applyVisibility() {
    const visible = settings.petEnabled !== false;
    host.hidden = !visible;
    if (!visible) {
      panelOpen = false;
      panel.hidden = true;
      window.clearTimeout(animationTimer);
    } else {
      scheduleNextFrame();
    }
  }

  function applyPetAppearance() {
    const metrics = getMetrics(petScale);
    frameWidth = metrics.frameWidth;
    frameHeight = metrics.frameHeight;

    host.style.width = `${frameWidth}px`;
    root.style.width = `${frameWidth}px`;
    sprite.style.width = `${frameWidth}px`;
    sprite.style.height = `${frameHeight}px`;
    sprite.style.backgroundSize = `${metrics.atlasWidth}px ${metrics.atlasHeight}px`;

    if (currentPet?.spritesheetDataUrl) {
      if (activeSpritesheetDataUrl !== currentPet.spritesheetDataUrl) {
        activeSpritesheetDataUrl = currentPet.spritesheetDataUrl;
        sprite.style.backgroundImage = `url("${activeSpritesheetDataUrl}")`;
      }
    } else {
      activeSpritesheetDataUrl = "";
      sprite.style.backgroundImage = "";
    }
  }

  function setState(nextState) {
    state = nextState;
    frame = 0;
    renderSprite();
    scheduleNextFrame();
  }

  function setBusy(text) {
    setState("running");
    setLoading(text);
  }

  function setLoading(text) {
    result.hidden = false;
    resultContent.className = "codex-pet-result-content codex-pet-loading";
    resultContent.innerHTML = `
      <div class="codex-pet-loader" aria-hidden="true"><span></span><span></span><span></span></div>
      <div>
        <strong>${escapeHtml(text || "处理中...")}</strong>
        <small>正在阅读当前页面，请稍等一下。</small>
      </div>
    `;
  }

  function setResult(text, options = {}) {
    result.hidden = !text;
    resultContent.className = options.markdown
      ? "codex-pet-result-content codex-pet-markdown"
      : "codex-pet-result-content";
    if (options.markdown) {
      resultContent.innerHTML = markdownToSafeHtml(text);
      return;
    }
    resultContent.textContent = text || "";
  }

  function closePanel() {
    panelOpen = false;
    panel.hidden = true;
    setState("idle");
  }

  function moveTo(nextX, nextY) {
    x = nextX;
    y = nextY;
    host.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeScale(scale) {
    const value = Number(scale);
    if (!Number.isFinite(value)) {
      return 1;
    }
    return Math.min(1.8, Math.max(0.6, Math.round(value * 100) / 100));
  }

  function getMetrics(scale) {
    const normalizedScale = normalizeScale(scale);
    const nextFrameWidth = Math.round(BASE_FRAME_WIDTH * normalizedScale);
    const nextFrameHeight = Math.round(BASE_FRAME_HEIGHT * normalizedScale);
    return {
      frameWidth: nextFrameWidth,
      frameHeight: nextFrameHeight,
      atlasWidth: nextFrameWidth * 8,
      atlasHeight: nextFrameHeight * 9
    };
  }

  function getAnimation(nextState) {
    return ANIMATIONS[nextState] || ANIMATIONS.idle;
  }

  function scheduleNextFrame() {
    window.clearTimeout(animationTimer);
    if (settings.petEnabled === false) {
      return;
    }

    const animation = getAnimation(state);
    const duration = animation.durations[frame % animation.durations.length] || 140;
    animationTimer = window.setTimeout(() => {
      frame = (frame + 1) % animation.durations.length;
      renderSprite();
      scheduleNextFrame();
    }, duration);
  }

  async function send(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) {
      throw new Error(response?.error || "扩展消息处理失败。");
    }
    return response;
  }

  async function writeClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const input = document.createElement("textarea");
    input.value = text;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.documentElement.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }

  function markdownToSafeHtml(markdown) {
    const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
    const html = [];
    let inList = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        if (inList) {
          html.push("</ul>");
          inList = false;
        }
        continue;
      }

      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        if (inList) {
          html.push("</ul>");
          inList = false;
        }
        const level = heading[1].length;
        html.push(`<h${level}>${formatInlineMarkdown(heading[2])}</h${level}>`);
        continue;
      }

      const listItem = line.match(/^[-*]\s+(.+)$/);
      if (listItem) {
        if (!inList) {
          html.push("<ul>");
          inList = true;
        }
        html.push(`<li>${formatInlineMarkdown(listItem[1])}</li>`);
        continue;
      }

      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      html.push(`<p>${formatInlineMarkdown(line)}</p>`);
    }

    if (inList) {
      html.push("</ul>");
    }

    return html.join("");
  }

  function formatInlineMarkdown(text) {
    return escapeHtml(text)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
