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
  const ACTION_HINT_BASE_DELAY_MS = 360;
  const ACTION_HINT_DELAY_MS = ACTION_HINT_BASE_DELAY_MS / 2;

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
  let actionHintTimer = 0;
  let actionHintTarget = null;

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
        <div class="codex-pet-panel-tools">
          <button type="button" data-action="configure" title="打开配置" aria-label="打开配置" class="codex-pet-icon-button">⚙</button>
          <button type="button" data-action="close-pet" title="关闭弹窗" aria-label="关闭弹窗" class="codex-pet-icon-button codex-pet-close">×</button>
        </div>
      </div>
      <div class="codex-pet-actions-wrap">
        <div class="codex-pet-action-hint" role="tooltip" hidden></div>
        <div class="codex-pet-actions">
          <button type="button" data-action="translate" data-hint="把选中文本或页面内容转成中文" aria-label="翻译"><span>翻译</span></button>
          <button type="button" data-action="summary" data-hint="提炼当前页面的主要内容" aria-label="总结"><span>总结</span></button>
          <button type="button" data-action="summon" data-hint="打开 Codex 并带入页面链接" aria-label="召唤 Codex"><span>Codex</span></button>
          <button type="button" data-action="remember" data-hint="整理页面内容并保存到知识库" aria-label="记忆"><span>记忆</span></button>
        </div>
      </div>
      <div class="codex-pet-result" role="status" hidden>
        <button type="button" data-action="toggle-result" class="codex-pet-result-toggle" aria-expanded="true" title="折叠结果">
          <span class="codex-pet-result-title">结果</span>
          <span class="codex-pet-result-summary">点击折叠</span>
          <span class="codex-pet-result-action">折叠</span>
          <span class="codex-pet-result-icon">⌃</span>
        </button>
        <div class="codex-pet-result-content"></div>
      </div>
    </div>
    </div>
  `;

  const root = shadow.querySelector("#codex-pet-root");
  const sprite = shadow.querySelector(".codex-pet-sprite");
  const panel = shadow.querySelector(".codex-pet-panel");
  const petName = shadow.querySelector(".codex-pet-name");
  const closeButton = shadow.querySelector(".codex-pet-close");
  const result = shadow.querySelector(".codex-pet-result");
  const resultTitle = shadow.querySelector(".codex-pet-result-title");
  const resultSummary = shadow.querySelector(".codex-pet-result-summary");
  const resultAction = shadow.querySelector(".codex-pet-result-action");
  const resultToggle = shadow.querySelector(".codex-pet-result-toggle");
  const resultContent = shadow.querySelector(".codex-pet-result-content");
  const actionHint = shadow.querySelector(".codex-pet-action-hint");

  document.documentElement.appendChild(host);
  setPanelOpen(false);
  moveTo(x, y);
  loadSettings();
  scheduleNextFrame();

  window.addEventListener("load", () => setState("idle"), { once: true });
  window.addEventListener("error", () => setState("failed"), true);
  window.addEventListener("unhandledrejection", () => setState("failed"));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      area === "local" &&
      (changes.pets || changes.currentPetId || changes.petEnabled || changes.petScale || changes.petPosition)
    ) {
      loadSettings();
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "PET_VISIBILITY_CHANGED") {
      return;
    }

    settings.petEnabled = Boolean(message.enabled);
    applyVisibility();
    if (settings.petEnabled !== false) {
      renderSprite();
      scheduleNextFrame();
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
    if (movedDuringDrag) {
      savePosition();
    }
  });

  sprite.addEventListener("click", () => {
    if (dragging || movedDuringDrag) {
      movedDuringDrag = false;
      return;
    }
    panelOpen = !panelOpen;
    setPanelOpen(panelOpen);
    if (panelOpen) {
      setState("waving");
    }
  });

  closeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    closePanel();
  });

  root.addEventListener("pointerover", (event) => {
    const button = event.target.closest(".codex-pet-actions button[data-hint]");
    if (!button || button.contains(event.relatedTarget)) return;
    scheduleActionHint(button);
  });

  root.addEventListener("pointerout", (event) => {
    const button = event.target.closest(".codex-pet-actions button[data-hint]");
    if (!button || button.contains(event.relatedTarget)) return;
    hideActionHint();
  });

  root.addEventListener("focusin", (event) => {
    const button = event.target.closest(".codex-pet-actions button[data-hint]");
    if (button) {
      scheduleActionHint(button);
    }
  });

  root.addEventListener("focusout", (event) => {
    const button = event.target.closest(".codex-pet-actions button[data-hint]");
    if (button) {
      hideActionHint();
    }
  });

  result.addEventListener("click", (event) => {
    if (!result.classList.contains("is-collapsed")) return;
    event.stopPropagation();
    setResultCollapsed(false);
  });

  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    hideActionHint();

    if (action === "close-pet") {
      closePanel();
      return;
    }

    if (action === "toggle-result") {
      setResultCollapsed(!result.classList.contains("is-collapsed"));
      return;
    }

    if (action === "configure") {
      await send({ type: "OPEN_OPTIONS" });
      closePanel();
      return;
    }

    await runAction(action);
  });

  async function loadSettings() {
    const response = await send({ type: "GET_SETTINGS" });
    settings = response.settings || {};
    currentPet = (settings.pets || []).find((pet) => pet.id === settings.currentPetId) || null;
    petScale = normalizeScale(settings.petScale);
    applySavedPosition();
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
          await send({
            type: "SUMMON_CODEX",
            prompt,
            originUrl: location.href
          });
        } catch (error) {
          window.location.href = buildCodexUrl(prompt, location.href);
        }
        setResult("已打开 Codex，并把当前页面链接带入输入框。");
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
    setHostVisible(visible);
    if (!visible) {
      setPanelOpen(false);
      window.clearTimeout(animationTimer);
    } else {
      renderSprite();
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
    panel.style.bottom = `${frameHeight + 18}px`;

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

  function applySavedPosition() {
    const position = settings.petPosition;
    if (!position || !Number.isFinite(Number(position.x)) || !Number.isFinite(Number(position.y))) {
      return;
    }

    x = Number(position.x);
    y = Number(position.y);
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
    resultTitle.textContent = "处理中";
    resultSummary.textContent = "正在阅读页面";
    setResultCollapsed(false);
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
    resultTitle.textContent = options.title || "结果";
    resultSummary.textContent = summarizeResultLabel(text);
    setResultCollapsed(false);
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
    setPanelOpen(false);
    setState("idle");
  }

  function setPanelOpen(open) {
    panelOpen = Boolean(open);
    panel.hidden = !panelOpen;
    panel.style.display = panelOpen ? "flex" : "none";
    hideActionHint();
    if (panelOpen) {
      result.hidden = !resultContent.textContent && !resultContent.innerHTML;
    }
  }

  function setResultCollapsed(collapsed) {
    result.classList.toggle("is-collapsed", collapsed);
    resultToggle.setAttribute("aria-expanded", String(!collapsed));
    resultAction.textContent = collapsed ? "展开" : "折叠";
    resultToggle.title = collapsed ? "展开结果" : "折叠结果";
  }

  function summarizeResultLabel(text) {
    const normalized = String(text || "")
      .replace(/[#*_`>\-[\]]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return normalized ? normalized.slice(0, 28) : "点击折叠";
  }

  function scheduleActionHint(button) {
    window.clearTimeout(actionHintTimer);
    actionHintTarget = button;
    actionHint.classList.remove("is-visible");
    actionHint.hidden = true;
    actionHintTimer = window.setTimeout(() => {
      if (actionHintTarget !== button) return;
      actionHint.textContent = button.dataset.hint || "";
      actionHint.hidden = false;
      window.requestAnimationFrame(() => actionHint.classList.add("is-visible"));
    }, ACTION_HINT_DELAY_MS);
  }

  function hideActionHint() {
    window.clearTimeout(actionHintTimer);
    actionHintTarget = null;
    actionHint.classList.remove("is-visible");
    actionHint.hidden = true;
  }

  function setHostVisible(visible) {
    host.hidden = !visible;
    host.style.display = visible ? "block" : "none";
  }

  function moveTo(nextX, nextY) {
    x = nextX;
    y = nextY;
    host.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  async function savePosition() {
    try {
      await chrome.storage.local.set({
        petPosition: {
          x: Math.round(x),
          y: Math.round(y)
        }
      });
    } catch (error) {
      console.warn("Codex Pet failed to save position.", error);
    }
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
    if (settings.petEnabled === false || host.style.display === "none") {
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

  function buildCodexUrl(prompt, originUrl) {
    const params = new URLSearchParams({
      prompt,
      originUrl
    });
    return `codex://new?${params.toString()}`;
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
