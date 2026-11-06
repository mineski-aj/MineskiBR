// lib/ledTable.js — Grand Finals LED "Table Teams" arrangement.
//
// The Ingame LED scene (html/ledoverlay.html) shows 10 squads on the LED wall,
// 5 down the left panel and 5 down the right, plus 2 featured squads on the
// bottom strip (one per blue panel). The operator picks which squad goes in
// which slot from the dashboard's TABLE TEAMS tab (shown in place of PLAYOFFS
// while the Match Board stage is Grand Finals). Persisted to led_table.json:
//   { order: [10 squad names, '' = empty slot], featured: [2 squad names] }
// order[0..4] = left panel top->bottom, order[5..9] = right panel top->bottom.
// An empty/missing file means "not arranged": the overlay falls back to the
// current standings order (and the top 2 as featured).
const fs   = require('fs');
const path = require('path');

const matchState = require('./matchState');

// One arrangement per stage: Grand Finals keeps led_table.json; the Showmatch
// stage (its own squads, no logos, possibly an odd count) has its own file so
// switching stage never shows the other stage's squads.
function isShowmatch() { return /^show\s*match$/i.test(String((matchState.get() || {}).stage || '').trim()); }
function file() { return path.join(__dirname, '..', isShowmatch() ? 'led_table_showmatch.json' : 'led_table.json'); }
function stageLabel() { return isShowmatch() ? 'Showmatch' : 'Grand Finals'; }

// Grand Finals only: 'standings' (default) = the LED follows the live standings order, top 2 featured,
// refreshed by the overlay's 4s poll; 'table' = use the saved arrangement above. Showmatch ignores it.
// Persisted in led_table_mode.json so every browser (dashboard, vMix) agrees.
const modeFile = path.join(__dirname, '..', 'led_table_mode.json');
function getMode() {
  try { return JSON.parse(fs.readFileSync(modeFile, 'utf8')).mode === 'table' ? 'table' : 'standings'; }
  catch (e) { return 'standings'; }
}
function setMode(m) {
  const mode = m === 'table' ? 'table' : 'standings';
  fs.writeFileSync(modeFile, JSON.stringify({ mode }));
  return mode;
}

function slots(arr, n) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    const name = String((Array.isArray(arr) && arr[i]) == null ? '' : arr[i]).trim();
    const key = name.toLowerCase();
    out.push(name && !seen.has(key) ? name : '');
    if (name) seen.add(key);
  }
  return out;
}

function get() {
  try {
    const d = JSON.parse(fs.readFileSync(file(), 'utf8'));
    return { arranged: true, mode: getMode(), stage: stageLabel(), order: slots(d.order, 10), featured: slots2(d.featured) };
  } catch (e) {
    return { arranged: false, mode: getMode(), stage: stageLabel(), order: slots([], 10), featured: ['', ''] };
  }
}

// Featured squads may repeat a squad that is also in the order, but not each other.
function slots2(arr) { return slots(arr, 2); }

function set(body) {
  const saved = { order: slots(body && body.order, 10), featured: slots2(body && body.featured) };
  fs.writeFileSync(file(), JSON.stringify(saved));
  return Object.assign({ arranged: true, mode: getMode(), stage: stageLabel() }, saved);
}

function reset() {
  try { fs.unlinkSync(file()); } catch (e) { /* already default */ }
  return get();
}

module.exports = { get, set, reset, getMode, setMode };
