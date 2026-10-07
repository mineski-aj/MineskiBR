// Eliminations/Map overlay (Fullscreen.html's 'elimsmap' scene) — which map
// the top-5 players are ranked on. A single value picked from the
// dashboard's Control tab, persisted to elims_map.json so a restart (or a
// freshly loaded OBS source) comes up on the same map.
const fs = require('fs');
const path = require('path');

// One saved pick per scene key ('elims_map' = Eliminations/Map, 'team_map_elims'
// = Team Map Elims) so the two scenes' map pickers are independent.
function fileFor(key) { return path.join(__dirname, '..', (key || 'elims_map') + '.json'); }
// Same fixed pool as Match Board's BR_MAP_NAMES. The sheet's own map
// dropdown may say "Rebirth" where this says "Rebirth Island" —
// mapKey() below makes the two compare equal.
const ELIMS_MAPS = ['Isolated', 'Blackout', 'Alcatraz', 'Krai', 'Rebirth Island'];

function mapKey(name) {
  return String(name || '').toLowerCase().replace(/\bisland\b/g, '').replace(/\s+/g, ' ').trim();
}

function get(key) {
  try {
    const m = JSON.parse(fs.readFileSync(fileFor(key), 'utf8')).map;
    if (ELIMS_MAPS.indexOf(m) !== -1) return m;
  } catch (e) { /* no file yet */ }
  return ELIMS_MAPS[0];
}

function set(map, key) {
  if (ELIMS_MAPS.indexOf(map) === -1) return null;
  fs.writeFileSync(fileFor(key), JSON.stringify({ map: map }));
  return map;
}

module.exports = { ELIMS_MAPS, mapKey, get, set };
