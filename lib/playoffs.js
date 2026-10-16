// lib/playoffs.js — Playoffs stage map blocks + lobby assignment.
//
// The Playoffs tally sheet has one P/K/TKP/PS block per map, but three of
// the eight broadcast maps (2, 4, 7) are split into TWO lobbies of 10 squads
// each, so the sheet has "Map 2.1" + "Map 2.2", "Map 4.1" + "Map 4.2",
// "Map 7.1" + "Map 7.2" alongside plain "Map 1", "Map 3", ... — 11 blocks
// in all. While Stage = Playoffs the Match Board's "Map N" picker is an
// index into those blocks in sheet order (see mapBlocks), `.1` blocks only
// feature Lobby A's squads and `.2` blocks only Lobby B's. Plain-number
// blocks feature everyone. Which squad is in which lobby is operator-
// editable (Dashboard → PLAYOFFS tab, routes/playoffs.js) and persisted to
// playoffs_lobbies.json; the defaults below are the original seeding.
const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'playoffs_lobbies.json');

const DEFAULT_LOBBIES = {
  lobbyA: ['ADMT PYRITE', 'LEAP UNBOUND', '4KINGS', 'TSG VANGUARD', 'LEAP MAIN',
           'UNBOTHERED TZY', 'LE VALKYRIE CC', 'OKAYFINE WHOCARES', 'PX MALEVOLENT LN', 'AXP VINCERE'],
  lobbyB: ['POISON IVY GIZY', 'GNR ESPORTS LEGACY OMEN', 'AVX DELTA FOC', 'ROYAL GEMINI JA LN', 'M12 sYn MAIN',
           '4K JOKER', 'ADMT MAIN', 'EU CONQUERORS', 'AFX SAINT JA', 'TIRADORES SIKLAB'],
};

function cleanList(list) {
  const seen = new Set();
  const out = [];
  (Array.isArray(list) ? list : []).forEach(function (n) {
    const name = String(n == null ? '' : n).trim();
    const key = name.toLowerCase();
    if (name && !seen.has(key)) { seen.add(key); out.push(name); }
  });
  return out;
}

function getLobbies() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { lobbyA: cleanList(d.lobbyA), lobbyB: cleanList(d.lobbyB) };
  } catch (e) {
    return { lobbyA: DEFAULT_LOBBIES.lobbyA.slice(), lobbyB: DEFAULT_LOBBIES.lobbyB.slice() };
  }
}

// A squad can only be in one lobby — if the same name arrives in both, A wins.
function setLobbies(body) {
  const a = cleanList(body && body.lobbyA);
  const inA = new Set(a.map(function (n) { return n.toLowerCase(); }));
  const b = cleanList(body && body.lobbyB).filter(function (n) { return !inA.has(n.toLowerCase()); });
  fs.writeFileSync(FILE, JSON.stringify({ lobbyA: a, lobbyB: b }));
  return { lobbyA: a, lobbyB: b };
}

function resetLobbies() {
  try { fs.unlinkSync(FILE); } catch (e) { /* already default */ }
  return getLobbies();
}

// The sheet's map blocks in column order: [{ index (1-based = the Match
// Board's "Map N" in Playoffs), label ("2.1"), base (2), sub (1|2|null),
// lobby ('A'|'B'|null), name (the sheet's map-name dropdown, or ''),
// startCol }]. Matches "Map 3" AND "Map 2.1" headers.
function mapBlocks(headerGroups) {
  const out = [];
  let offset = 0;
  (headerGroups || []).forEach(function (g, i) {
    const m = /^Map (\d+)(?:\.(\d+))?$/.exec(g.label);
    if (m) {
      const next = headerGroups[i + 1];
      const hasName = next && g.span === 1 && !/^Map \d+/.test(next.label) && !/^Total/.test(next.label);
      const sub = m[2] ? parseInt(m[2], 10) : null;
      out.push({
        index: out.length + 1,
        label: m[1] + (m[2] ? '.' + m[2] : ''),
        base: parseInt(m[1], 10),
        sub: sub,
        lobby: sub === 1 ? 'A' : sub === 2 ? 'B' : null,
        name: hasName ? String(next.label).trim() : '',
        startCol: offset,
      });
    }
    offset += g.span;
  });
  return out;
}

// Lower-cased squad names allowed on a block, or null for "everyone".
function lobbyTeamSet(block) {
  if (!block || !block.lobby) return null;
  const l = getLobbies();
  return new Set((block.lobby === 'A' ? l.lobbyA : l.lobbyB).map(function (n) { return n.toLowerCase(); }));
}

module.exports = { getLobbies, setLobbies, resetLobbies, mapBlocks, lobbyTeamSet, DEFAULT_LOBBIES };
