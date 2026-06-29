import {
  getPetAnimation,
  getPetMetrics,
  normalizePetScale,
  resolvePetPreviewState,
  upsertById
} from "./shared/core.js";

const DEFAULTS = {
  pets: [],
  currentPetId: "",
  models: [],
  currentModelId: "",
  petEnabled: true,
  petScale: 1,
  petPosition: null,
  knowledgeBaseFolder: "codex-pets-knowledge"
};

const PREVIEW_STATES = [
  ["idle", "待机"],
  ["running-right", "右跑"],
  ["running-left", "左跑"],
  ["waving", "挥手"],
  ["jumping", "跳跃"],
  ["failed", "失败"],
  ["waiting", "等待"],
  ["running", "加载"],
  ["review", "审阅"]
];

let settings = { ...DEFAULTS };
let previewFrame = 0;
let previewFrames = Object.fromEntries(PREVIEW_STATES.map(([state]) => [state, 0]));
let selectedPreviewState = "idle";
let editingPetId = "";
let editingModelId = "";

const petJsonInput = document.querySelector("#pet-json");
const petSheetInput = document.querySelector("#pet-sheet");
const addPetButton = document.querySelector("#add-pet");
const cancelPetEditButton = document.querySelector("#cancel-pet-edit");
const petSelect = document.querySelector("#pet-select");
const petList = document.querySelector("#pet-list");
const previewSprite = document.querySelector("#preview-sprite");
const statePreviewList = document.querySelector("#state-preview-list");
const petEnabledState = document.querySelector("#pet-enabled-state");
const togglePetEnabledButton = document.querySelector("#toggle-pet-enabled");
const petScale = document.querySelector("#pet-scale");
const scaleLabel = document.querySelector("#scale-label");
const modelForm = document.querySelector("#model-form");
const modelSubmitButton = document.querySelector("#model-submit");
const cancelModelEditButton = document.querySelector("#cancel-model-edit");
const modelSelect = document.querySelector("#model-select");
const modelList = document.querySelector("#model-list");
const kbFolder = document.querySelector("#kb-folder");
const status = document.querySelector("#status");

load();
window.setInterval(renderPreview, 160);

addPetButton.addEventListener("click", async () => {
  const jsonFile = petJsonInput.files[0];
  const sheetFile = petSheetInput.files[0];
  const wasEditing = Boolean(editingPetId);
  const existingPet = settings.pets.find((item) => item.id === editingPetId);

  if (!editingPetId && (!jsonFile || !sheetFile)) {
    setStatus("请选择 pet.json 和 spritesheet.webp。");
    return;
  }

  const petJson = jsonFile ? JSON.parse(await jsonFile.text()) : existingPet.petJson;
  const spritesheetDataUrl = sheetFile ? await readAsDataUrl(sheetFile) : existingPet.spritesheetDataUrl;
  const id = editingPetId || petJson.id || crypto.randomUUID();
  const pet = {
    id,
    displayName: petJson.displayName || petJson.name || id,
    description: petJson.description || "",
    petJson,
    spritesheetDataUrl
  };

  settings.pets = upsertById(settings.pets, pet);
  settings.currentPetId = id;
  await save();
  resetPetForm();
  setStatus(`${wasEditing ? "已更新" : "已添加"}宠物：${pet.displayName}`);
});

cancelPetEditButton.addEventListener("click", () => {
  resetPetForm();
  setStatus("已取消宠物编辑。");
});

petSelect.addEventListener("change", async () => {
  settings.currentPetId = petSelect.value;
  await save();
});

togglePetEnabledButton.addEventListener("click", async () => {
  settings.petEnabled = settings.petEnabled === false;
  await chrome.runtime.sendMessage({ type: "SET_ENABLED", enabled: settings.petEnabled });
  render();
  setStatus(settings.petEnabled ? "桌宠已全局打开。" : "桌宠已全局关闭。");
});

petScale.addEventListener("input", () => {
  const scale = normalizePetScale(Number(petScale.value) / 100);
  scaleLabel.textContent = `${Math.round(scale * 100)}%`;
});

petScale.addEventListener("change", async () => {
  settings.petScale = normalizePetScale(Number(petScale.value) / 100);
  await save();
  setStatus(`桌宠大小已保存为 ${Math.round(settings.petScale * 100)}%。`);
});

statePreviewList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-state]");
  if (!button) return;
  selectedPreviewState = resolvePetPreviewState(button.dataset.state);
  previewFrame = 0;
  renderPreview();
});

modelForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(modelForm);
  const wasEditing = Boolean(editingModelId);
  const existingModel = settings.models.find((item) => item.id === editingModelId);
  const model = {
    id: editingModelId || crypto.randomUUID(),
    name: String(form.get("name") || "").trim(),
    baseUrl: String(form.get("baseUrl") || "").trim(),
    model: String(form.get("model") || "").trim(),
    apiKey: String(form.get("apiKey") || "").trim() || existingModel?.apiKey || ""
  };

  if (!model.name || !model.baseUrl || !model.model || !model.apiKey) {
    setStatus("模型名称、Base URL、Model 和 API key 都需要填写。");
    return;
  }

  settings.models = upsertById(settings.models, model);
  settings.currentModelId = model.id;
  await save();
  resetModelForm();
  setStatus(`${wasEditing ? "已更新" : "已添加"}模型：${model.name}`);
});

cancelModelEditButton.addEventListener("click", () => {
  resetModelForm();
  setStatus("已取消模型编辑。");
});

modelSelect.addEventListener("change", async () => {
  settings.currentModelId = modelSelect.value;
  await save();
});

kbFolder.addEventListener("change", async () => {
  settings.knowledgeBaseFolder = kbFolder.value.trim() || DEFAULTS.knowledgeBaseFolder;
  await save();
  setStatus("知识库目录已保存。");
});

petList.addEventListener("click", async (event) => {
  const editId = event.target.dataset.editPet;
  if (editId) {
    startPetEdit(editId);
    return;
  }

  const id = event.target.dataset.removePet;
  if (!id) return;
  settings.pets = settings.pets.filter((item) => item.id !== id);
  if (settings.currentPetId === id) {
    settings.currentPetId = settings.pets[0]?.id || "";
  }
  if (editingPetId === id) {
    resetPetForm();
  }
  await save();
});

modelList.addEventListener("click", async (event) => {
  const editId = event.target.dataset.editModel;
  if (editId) {
    startModelEdit(editId);
    return;
  }

  const id = event.target.dataset.removeModel;
  if (!id) return;
  settings.models = settings.models.filter((item) => item.id !== id);
  if (settings.currentModelId === id) {
    settings.currentModelId = settings.models[0]?.id || "";
  }
  if (editingModelId === id) {
    resetModelForm();
  }
  await save();
});

async function load() {
  settings = await chrome.storage.local.get(DEFAULTS);
  render();
}

async function save() {
  await chrome.storage.local.set(settings);
  render();
}

function render() {
  kbFolder.value = settings.knowledgeBaseFolder || DEFAULTS.knowledgeBaseFolder;
  renderPetEnabledButton();
  petScale.value = String(Math.round(normalizePetScale(settings.petScale) * 100));
  scaleLabel.textContent = `${petScale.value}%`;
  renderPetControls();
  renderModelControls();
  renderPreview();
}

function renderPetControls() {
  petSelect.innerHTML = "";
  if (!settings.pets.length) {
    petSelect.append(new Option("还没有导入宠物", ""));
  }
  for (const pet of settings.pets) {
    petSelect.append(new Option(pet.displayName, pet.id, false, pet.id === settings.currentPetId));
  }

  petList.innerHTML = settings.pets
    .map((pet) => {
      const id = escapeHtml(pet.id);
      return `
      <div class="item">
        <span>${escapeHtml(pet.displayName)}</span>
        <div class="item-actions">
          <button class="secondary" type="button" data-edit-pet="${id}">编辑</button>
          <button class="secondary" type="button" data-remove-pet="${id}">删除</button>
        </div>
      </div>
    `;
    })
    .join("");
}

function renderModelControls() {
  modelSelect.innerHTML = "";
  if (!settings.models.length) {
    modelSelect.append(new Option("还没有模型配置", ""));
  }
  for (const model of settings.models) {
    modelSelect.append(new Option(model.name, model.id, false, model.id === settings.currentModelId));
  }

  modelList.innerHTML = settings.models
    .map((model) => {
      const id = escapeHtml(model.id);
      const current = model.id === settings.currentModelId;
      return `
      <div class="item model-item">
        <div class="model-main">
          <div>
            <strong>${escapeHtml(model.name)}</strong>
            ${current ? '<span class="badge">当前</span>' : ""}
          </div>
          <code>${escapeHtml(model.model)}</code>
          <small>${escapeHtml(model.baseUrl)}</small>
        </div>
        <div class="item-actions">
          <button class="secondary" type="button" data-edit-model="${id}">编辑</button>
          <button class="secondary" type="button" data-remove-model="${id}">删除</button>
        </div>
      </div>
    `;
    })
    .join("");
}

function renderPetEnabledButton() {
  const enabled = settings.petEnabled !== false;
  petEnabledState.textContent = enabled ? "ON" : "OFF";
  petEnabledState.classList.toggle("is-off", !enabled);
  togglePetEnabledButton.textContent = enabled ? "关闭桌宠" : "打开桌宠";
}

function renderPreview() {
  const pet = settings.pets.find((item) => item.id === settings.currentPetId);
  const metrics = getPetMetrics(settings.petScale);
  previewSprite.style.width = `${metrics.frameWidth}px`;
  previewSprite.style.height = `${metrics.frameHeight}px`;
  previewSprite.style.backgroundSize = `${metrics.atlasWidth}px ${metrics.atlasHeight}px`;

  if (!pet?.spritesheetDataUrl) {
    previewSprite.style.backgroundImage = "";
    previewSprite.textContent = "⌁";
    statePreviewList.innerHTML = "";
    return;
  }

  previewSprite.textContent = "";
  selectedPreviewState = resolvePetPreviewState(selectedPreviewState);
  setSpriteFrame(previewSprite, pet, metrics, selectedPreviewState, previewFrame);
  previewFrame = (previewFrame + 1) % getPetAnimation(selectedPreviewState).frameCount;
  renderStatePreviews(pet);
}

function renderStatePreviews(pet) {
  const miniMetrics = getPetMetrics(0.56);
  if (statePreviewList.children.length !== PREVIEW_STATES.length) {
    statePreviewList.innerHTML = PREVIEW_STATES
      .map(
        ([state, label]) => `
        <button class="state-preview" type="button" data-state="${state}" aria-pressed="false">
          <div class="state-sprite"></div>
          <span>${label}</span>
        </button>
      `
      )
      .join("");
  }

  for (const [state] of PREVIEW_STATES) {
    const previewButton = statePreviewList.querySelector(`[data-state="${state}"]`);
    const cell = previewButton.querySelector(".state-sprite");
    const frameIndex = previewFrames[state] || 0;
    const isSelected = state === selectedPreviewState;
    previewButton.classList.toggle("is-selected", isSelected);
    previewButton.setAttribute("aria-pressed", String(isSelected));
    setSpriteFrame(cell, pet, miniMetrics, state, frameIndex);
    previewFrames[state] = (frameIndex + 1) % getPetAnimation(state).frameCount;
  }
}

function setSpriteFrame(element, pet, metrics, state, frameIndex) {
  const animation = getPetAnimation(state);
  const column = frameIndex % animation.frameCount;
  element.style.width = `${metrics.frameWidth}px`;
  element.style.height = `${metrics.frameHeight}px`;
  element.style.backgroundSize = `${metrics.atlasWidth}px ${metrics.atlasHeight}px`;
  element.style.backgroundImage = `url("${pet.spritesheetDataUrl}")`;
  element.style.backgroundPosition = `-${column * metrics.frameWidth}px -${animation.row * metrics.frameHeight}px`;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function startPetEdit(id) {
  const pet = settings.pets.find((item) => item.id === id);
  if (!pet) return;
  editingPetId = id;
  petJsonInput.value = "";
  petSheetInput.value = "";
  addPetButton.textContent = "保存宠物";
  cancelPetEditButton.hidden = false;
  setStatus(`正在编辑宠物：${pet.displayName}，可重新选择文件后保存。`);
}

function resetPetForm() {
  editingPetId = "";
  petJsonInput.value = "";
  petSheetInput.value = "";
  addPetButton.textContent = "添加宠物";
  cancelPetEditButton.hidden = true;
}

function startModelEdit(id) {
  const model = settings.models.find((item) => item.id === id);
  if (!model) return;
  editingModelId = id;
  modelForm.elements.name.value = model.name || "";
  modelForm.elements.baseUrl.value = model.baseUrl || "";
  modelForm.elements.model.value = model.model || "";
  modelForm.elements.apiKey.value = "";
  modelForm.elements.apiKey.placeholder = "API key，留空则保持原 key";
  modelSubmitButton.textContent = "保存模型";
  cancelModelEditButton.hidden = false;
  setStatus(`正在编辑模型：${model.name}`);
}

function resetModelForm() {
  editingModelId = "";
  modelForm.reset();
  modelForm.elements.apiKey.placeholder = "API key";
  modelSubmitButton.textContent = "添加模型";
  cancelModelEditButton.hidden = true;
}

function setStatus(text) {
  status.textContent = text;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
