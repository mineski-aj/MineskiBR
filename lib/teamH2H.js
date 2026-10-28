// Team H2H scene — which two teams are being compared. Picked from the
// dashboard's Control tab, persisted to team_h2h.json so a restart (or a
// freshly loaded OBS source) comes up on the same matchup.
// Shape: { a: "<squad name>", b: "<squad name>" }
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'team_h2h.json');

function get() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { a: String(d.a || ''), b: String(d.b || '') };
  } catch (e) { return { a: '', b: '' }; }
}

function set(sel) {
  const out = { a: String((sel && sel.a) || ''), b: String((sel && sel.b) || '') };
  fs.writeFileSync(FILE, JSON.stringify(out));
  return out;
}

module.exports = { get, set };
