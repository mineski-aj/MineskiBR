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

const FILE = path.join(__dirname, '..', 'led_table.json');

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
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { arranged: true, order: slots(d.order, 10), featured: slots2(d.featured) };
  } catch (e) {
    return { arranged: false, order: slots([], 10), featured: ['', ''] };
  }
}

// Featured squads may repeat a squad that is also in the order, but not each other.
function slots2(arr) { return slots(arr, 2); }

function set(body) {
  const saved = { order: slots(body && body.order, 10), featured: slots2(body && body.featured) };
  fs.writeFileSync(FILE, JSON.stringify(saved));
  return Object.assign({ arranged: true }, saved);
}

function reset() {
  try { fs.unlinkSync(FILE); } catch (e) { /* already default */ }
  return get();
}

module.exports = { get, set, reset };
