// lib/eliminated.js — "Elim Tracker" state: which squads are eliminated.
//
// The operator (dashboard's ELIM TRACKER tab, or the standalone
// /html/elim-tracker.html page handed to a spotter) ticks a squad when it is
// eliminated. ingame.html's team scoreboard and the LED overlay's scoreboard
// poll /api/eliminated and darken those squads' containers. Persisted to
// eliminated_teams.json: { teams: ["SQUAD", ...] } (names, case-insensitive match).
const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'eliminated_teams.json');

function clean(arr) {
  const seen = new Set();
  return (Array.isArray(arr) ? arr : [])
    .map(function (n) { return String(n == null ? '' : n).trim(); })
    .filter(function (n) { const k = n.toLowerCase(); if (!n || seen.has(k)) return false; seen.add(k); return true; });
}

function get() {
  try { return { teams: clean(JSON.parse(fs.readFileSync(FILE, 'utf8')).teams) }; }
  catch (e) { return { teams: [] }; }
}

function write(teams) {
  fs.writeFileSync(FILE, JSON.stringify({ teams: teams }));
  return { teams: teams };
}

// Flip ONE squad (not "replace the whole list") so two people ticking different
// squads at the same moment never overwrite each other.
function setOne(name, eliminated) {
  const n = String(name == null ? '' : name).trim();
  const cur = get().teams;
  if (!n) return { teams: cur };
  const k = n.toLowerCase();
  const rest = cur.filter(function (x) { return x.toLowerCase() !== k; });
  return write(eliminated ? rest.concat(n) : rest);
}

function clear() { return write([]); }

module.exports = { get, setOne, clear };
