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
  let panelOpen = false;
  let animationTimer = 0;

  const root = document.createElement("div");
  root.id = "codex-pet-root";
  root.innerHTML = `
    <div class="codex-pet-sprite" title="Codex Pet"></div>
    <div class="codex-pet-panel" hidden>
      <div class="codex-pet-panel-header">
        <div>
          <strong>Codex Pet</strong>
          <span>页面助手</span>
        </div>
        <button type="button" data-action="close-pet" title="关闭桌宠" class="codex-pet-close">×</button>
      </div>
      <div class="codex-pet-actions">
        <button type="button" data-action="translate"><span>译</span><strong>翻译</strong><small>转成中文</small></button>
        <button type="button" data-action="chat"><span>问</span><strong>对话</strong><small>询问页面</small></button>
        <button type="button" data-action="summon"><span>C</span><strong>召唤 Codex</strong><small>复制链接</small></button>
        <button type="button" data-action="remember"><span>记</span><strong>记忆</strong><small>生成摘要</small></button>
      </div>
      <div class="codex-pet-chat" hidden>
        <textarea placeholder="问问宠物这个页面的内容"></textarea>
        <button type="button" data-action="send-chat">发送</button>
      </div>
      <div class="codex-pet-result" role="status"></div>
      <button type="button" data-action="options" class="codex-pet-link">配置</button>
    </div>
  `;

  const sprite = root.querySelector(".codex-pet-sprite");
  const panel = root.querySelector(".codex-pet-panel");
  const result = root.querySelector(".codex-pet-result");
  const chatBox = root.querySelector(".codex-pet-chat");
  const textarea = root.querySelector("textarea");

  document.documentElement.appendChild(root);
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
    sprite.setPointerCapture(event.pointerId);
  });

  sprite.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const nextX = clamp(event.clientX - dragOffsetX, 8, window.innerWidth - frameWidth - 8);
    const nextY = clamp(event.clientY - dragOffsetY, 8, window.innerHeight - frameHeight - 8);
    if (Math.abs(nextX - x) > 2 || Math.abs(nextY - y) > 2) {
      movedDuringDrag = true;
    }
    setState(nextX >= lastX ? "running-right" : "running-left");
    lastX = nextX;
    moveTo(nextX, nextY);
  });

  sprite.addEventListener("pointerup", (event) => {
    if (!dragging) {
      return;
    }
    dragging = false;
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

  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;

    if (action === "close-pet") {
      await send({ type: "SET_ENABLED", enabled: false });
      window.clearTimeout(animationTimer);
      return;
    }

    if (action === "options") {
      await send({ type: "OPEN_OPTIONS" });
      return;
    }

    if (action === "chat") {
      chatBox.hidden = !chatBox.hidden;
      textarea.focus();
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
    moveTo(clamp(x, 8, window.innerWidth - frameWidth - 8), clamp(y, 8, window.innerHeight - frameHeight - 8));
    renderSprite();
    scheduleNextFrame();
  }

  async function runAction(action) {
    try {
      setBusy("处理中...");
      if (action === "translate") {
        await send({ type: "TRANSLATE", text: getSelectedOrPageText() });
        setResult("已打开 Google 翻译。");
      }

      if (action === "send-chat") {
        const response = await send({
          type: "CHAT",
          userText: textarea.value,
          page: getPagePayload()
        });
        setResult(response.answer);
      }

      if (action === "summon") {
        const prompt = `请阅读这个页面并继续对话：\n标题：${document.title}\n链接：${location.href}`;
        await writeClipboard(prompt);
        setResult("已复制到剪贴板，可粘贴到 Codex。");
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

  function applyVisibility() {
    const visible = settings.petEnabled !== false;
    root.hidden = !visible;
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
    setResult(text);
  }

  function setResult(text) {
    result.textContent = text || "";
  }

  function moveTo(nextX, nextY) {
    x = nextX;
    y = nextY;
    root.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
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
})();
