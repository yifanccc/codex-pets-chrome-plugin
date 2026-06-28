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

let settings = { ...DEFAULTS };

const toggleEnabled = document.querySelector("#toggle-enabled");
const petSelect = document.querySelector("#pet-select");
const modelSelect = document.querySelector("#model-select");
const openOptions = document.querySelector("#open-options");
const statePill = document.querySelector("#state-pill");
const status = document.querySelector("#status");

load();

toggleEnabled.addEventListener("click", async () => {
  settings.petEnabled = settings.petEnabled === false;
  await chrome.runtime.sendMessage({ type: "SET_ENABLED", enabled: settings.petEnabled });
  render();
  setStatus(settings.petEnabled ? "桌宠已全局打开。" : "桌宠已全局关闭。");
});

petSelect.addEventListener("change", async () => {
  settings.currentPetId = petSelect.value;
  await save();
  setStatus("当前宠物已切换。");
});

modelSelect.addEventListener("change", async () => {
  settings.currentModelId = modelSelect.value;
  await save();
  setStatus("当前模型已切换。");
});

openOptions.addEventListener("click", async () => {
  await chrome.runtime.openOptionsPage();
  window.close();
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
  renderPower();
  renderSelect(petSelect, settings.pets, settings.currentPetId, "还没有导入宠物", "displayName");
  renderSelect(modelSelect, settings.models, settings.currentModelId, "还没有模型配置", "name");
}

function renderPower() {
  const enabled = settings.petEnabled !== false;
  toggleEnabled.textContent = enabled ? "关闭桌宠" : "打开桌宠";
  statePill.textContent = enabled ? "ON" : "OFF";
  statePill.classList.toggle("is-on", enabled);
}

function renderSelect(select, items, currentId, emptyLabel, labelKey) {
  select.innerHTML = "";
  if (!items.length) {
    select.append(new Option(emptyLabel, ""));
    select.disabled = true;
    return;
  }

  select.disabled = false;
  for (const item of items) {
    select.append(new Option(item[labelKey] || item.id, item.id, false, item.id === currentId));
  }
}

function setStatus(text) {
  status.textContent = text;
}
