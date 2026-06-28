import { getPetMetrics, normalizePetScale } from "./shared/core.js";

const DEFAULTS = {
  pets: [],
  currentPetId: "",
  models: [],
  currentModelId: "",
  petEnabled: true,
  petScale: 1,
  knowledgeBaseFolder: "codex-pets-knowledge"
};

let settings = { ...DEFAULTS };
let previewFrame = 0;

const petJsonInput = document.querySelector("#pet-json");
const petSheetInput = document.querySelector("#pet-sheet");
const addPetButton = document.querySelector("#add-pet");
const petSelect = document.querySelector("#pet-select");
const petList = document.querySelector("#pet-list");
const previewSprite = document.querySelector("#preview-sprite");
const petEnabled = document.querySelector("#pet-enabled");
const petScale = document.querySelector("#pet-scale");
const scaleLabel = document.querySelector("#scale-label");
const modelForm = document.querySelector("#model-form");
const modelSelect = document.querySelector("#model-select");
const modelList = document.querySelector("#model-list");
const kbFolder = document.querySelector("#kb-folder");
const status = document.querySelector("#status");

load();
window.setInterval(renderPreview, 160);

addPetButton.addEventListener("click", async () => {
  const jsonFile = petJsonInput.files[0];
  const sheetFile = petSheetInput.files[0];
  if (!jsonFile || !sheetFile) {
    setStatus("请选择 pet.json 和 spritesheet.webp。");
    return;
  }

  const petJson = JSON.parse(await jsonFile.text());
  const spritesheetDataUrl = await readAsDataUrl(sheetFile);
  const id = petJson.id || crypto.randomUUID();
  const pet = {
    id,
    displayName: petJson.displayName || id,
    description: petJson.description || "",
    petJson,
    spritesheetDataUrl
  };

  settings.pets = [...settings.pets.filter((item) => item.id !== id), pet];
  settings.currentPetId = id;
  await save();
  petJsonInput.value = "";
  petSheetInput.value = "";
  setStatus(`已添加宠物：${pet.displayName}`);
});

petSelect.addEventListener("change", async () => {
  settings.currentPetId = petSelect.value;
  await save();
});

petEnabled.addEventListener("change", async () => {
  settings.petEnabled = petEnabled.checked;
  await save();
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

modelForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(modelForm);
  const model = {
    id: crypto.randomUUID(),
    name: String(form.get("name") || "").trim(),
    baseUrl: String(form.get("baseUrl") || "").trim(),
    model: String(form.get("model") || "").trim(),
    apiKey: String(form.get("apiKey") || "").trim()
  };

  if (!model.name || !model.baseUrl || !model.model || !model.apiKey) {
    setStatus("模型名称、Base URL、Model 和 API key 都需要填写。");
    return;
  }

  settings.models = [...settings.models, model];
  settings.currentModelId = model.id;
  modelForm.reset();
  await save();
  setStatus(`已添加模型：${model.name}`);
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
  const id = event.target.dataset.removePet;
  if (!id) return;
  settings.pets = settings.pets.filter((item) => item.id !== id);
  if (settings.currentPetId === id) {
    settings.currentPetId = settings.pets[0]?.id || "";
  }
  await save();
});

modelList.addEventListener("click", async (event) => {
  const id = event.target.dataset.removeModel;
  if (!id) return;
  settings.models = settings.models.filter((item) => item.id !== id);
  if (settings.currentModelId === id) {
    settings.currentModelId = settings.models[0]?.id || "";
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
  petEnabled.checked = settings.petEnabled !== false;
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
    .map((pet) => `
      <div class="item">
        <span>${escapeHtml(pet.displayName)}</span>
        <button class="secondary" type="button" data-remove-pet="${pet.id}">删除</button>
      </div>
    `)
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
    .map((model) => `
      <div class="item">
        <span>${escapeHtml(model.name)} · ${escapeHtml(model.model)}</span>
        <button class="secondary" type="button" data-remove-model="${model.id}">删除</button>
      </div>
    `)
    .join("");
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
    return;
  }

  previewSprite.textContent = "";
  previewSprite.style.backgroundImage = `url("${pet.spritesheetDataUrl}")`;
  previewSprite.style.backgroundPosition = `-${previewFrame * metrics.frameWidth}px 0`;
  previewFrame = (previewFrame + 1) % 8;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
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
