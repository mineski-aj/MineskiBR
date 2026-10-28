// Player H2H scene — which two players are being compared. Picked from the
// dashboard's Control tab, persisted to player_h2h.json so a restart (or a
// freshly loaded OBS source) comes up on the same matchup.
// Shape: { a: { team, name }, b: { team, name } }
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'player_h2h.json');
const EMPTY = { a: { team: '', name: '' }, b: { team: '', name: '' } };

function clean(p) { return { team: String((p && p.team) || ''), name: String((p && p.name) || '') }; }

function get() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { a: clean(d.a), b: clean(d.b) };
  } catch (e) { return EMPTY; }
}

function set(sel) {
  const out = { a: clean(sel && sel.a), b: clean(sel && sel.b) };
  fs.writeFileSync(FILE, JSON.stringify(out));
  return out;
}

module.exports = { get, set };
