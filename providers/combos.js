const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'combos.json');

let combos = [];
let autoSequence = [];
let loaded = false;
let cachedMtime = -1;

function loadCombos() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      combos = [];
      autoSequence = [];
      if (!loaded) saveCombos();
      loaded = true;
      cachedMtime = -1;
      return;
    }
    const stat = fs.statSync(CONFIG_PATH);
    if (loaded && stat.mtimeMs === cachedMtime) return;
    const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    combos = Array.isArray(data.combos) ? data.combos : (Array.isArray(data) ? data : []);
    autoSequence = Array.isArray(data.autoSequence) ? data.autoSequence : [];
    cachedMtime = stat.mtimeMs;
    loaded = true;
  } catch (err) {
    console.error('[Combos Config] Error loading config:', err.message);
    if (!loaded) {
      combos = [];
      autoSequence = [];
      loaded = true;
    }
  }
}

function saveCombos() {
  try {
    const payload = JSON.stringify({ combos, autoSequence }, null, 2);
    // Atomic write: a crash mid-write must never corrupt the config file.
    const tmpPath = CONFIG_PATH + '.tmp';
    fs.writeFileSync(tmpPath, payload, 'utf8');
    fs.renameSync(tmpPath, CONFIG_PATH);
    cachedMtime = fs.statSync(CONFIG_PATH).mtimeMs;
    loaded = true;
  } catch (err) {
    console.error('[Combos Config] Error saving config:', err.message);
  }
}

function getCombos() {
  loadCombos();
  return combos;
}

// Returns the saved sequence; may be empty. The caller (providers/auto.js)
// decides what the default order is, which keeps this module dependency-free.
function getAutoSequence() {
  loadCombos();
  return autoSequence;
}

function setAutoSequence(sequence = []) {
  loadCombos();
  autoSequence = Array.isArray(sequence) ? sequence.filter(Boolean) : [];
  saveCombos();
  return autoSequence;
}

function saveCombo({ id, name, sequence = [] }) {
  loadCombos();
  const comboId = (id || name || 'combo-' + Date.now()).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const cleanSequence = Array.isArray(sequence) ? sequence.filter(Boolean) : [];

  const idx = combos.findIndex(c => c.id === comboId);
  const createdAt = idx !== -1 ? combos[idx].createdAt : new Date().toISOString();
  const comboObj = {
    id: comboId,
    name: name || comboId,
    sequence: cleanSequence,
    createdAt,
    updatedAt: new Date().toISOString()
  };

  if (idx !== -1) combos[idx] = comboObj;
  else combos.push(comboObj);

  saveCombos();
  return comboObj;
}

function removeCombo(id) {
  loadCombos();
  const before = combos.length;
  combos = combos.filter(c => c.id !== id);
  if (combos.length === before) return { success: false, error: 'Combo not found' };
  saveCombos();
  return { success: true };
}

function getComboById(id) {
  loadCombos();
  const cleanId = (id || '').toLowerCase().replace(/^combo\//, '');
  return combos.find(c => c.id === cleanId);
}

function getModels() {
  loadCombos();
  return combos.map(c => ({
    id: `combo/${c.id}`,
    object: 'model',
    created: 1,
    owned_by: 'combo',
    provider: 'combo',
    meta: {
      name: `Combo: ${c.name} (${c.sequence ? c.sequence.length : 0} models)`,
      sequence: c.sequence
    }
  }));
}

loadCombos();

module.exports = {
  getCombos,
  saveCombo,
  removeCombo,
  getComboById,
  getModels,
  getAutoSequence,
  setAutoSequence
};
