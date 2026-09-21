// lib/tallyState.js — the one shared, collaborative tournament state: a list
// of Groups (Group A, Group B, ... eventually a Finals group), each holding
// its own teams/matches/scoring settings. Persisted to tally_state.json,
// broadcast to every connected client over SSE. Fused in from the standalone
// CODMTally app — mirrors this project's own matchState.js pattern: this
// module owns get/mutate/persist/broadcast, routes/tally.js just dispatches
// a single action switch into it.
//
// Deliberately NOT stored here: which group/match tab a given browser is
// currently looking at. That's local UI state per client (see
// html/tally-console.html) so one scorekeeper switching tabs doesn't yank
// everyone else's view around.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const overlayState = require('./state');

const FILE = path.join(__dirname, '..', 'tally_state.json');
const PALETTE = ["#F2A93B","#6E8F4C","#D9584C","#4C8FA0","#B07CC6","#C98449","#5FAE7A","#C9C24C","#E07BA0","#7A8FE0","#E4BA3E","#8FA08D"];

function colorFor(i) { return PALETTE[i % PALETTE.length]; }
function newId() { return crypto.randomUUID(); }

// Every team fields exactly 4 players in CODM:BR — fixed slots, not an
// addable/removable list. New teams get generic placeholders the operator
// renames from the Roster page.
function emptyPlayers() {
  return [1, 2, 3, 4].map(function (n) { return { id: newId(), name: 'Player ' + n }; });
}

function defaultPlacementTable(n) {
  const curve = [10, 6, 5, 4, 3, 2, 1, 1]; // rank1..8, rest are 0
  const table = {};
  for (let r = 1; r <= Math.max(n, 1); r++) table[r] = curve[r - 1] !== undefined ? curve[r - 1] : 0;
  return table;
}

function emptyGroup(name) {
  return {
    id: newId(),
    name: name || 'Group A',
    teams: [],       // {id, name, color, players:[{id,name}] x4}
    // results:{teamId:{kills, placement, playerKills:{playerId:kills}}} — `kills` is
    // the fast, directly-entered team total (source of truth for points); `playerKills`
    // is a separate, optional breakdown for who-got-how-many record-keeping. They are
    // NOT kept in sync on purpose — entering a team total fast shouldn't require
    // filling in a per-player breakdown, and vice versa.
    matches: [],
    settings: { killPoint: 1, placementPoints: defaultPlacementTable(1) },
  };
}

function defaultState() {
  const g = emptyGroup('Group A');
  // liveGroupId/liveMatchId are the OLD manual-scoring system's "what's
  // live" flag — left in place (unused by the Dashboard now) rather than
  // ripped out, same as the rest of that system. liveTallyTab is the
  // CURRENT one: the name of whichever Tally sheet tab (see
  // lib/externalTally.js) is currently live, shown in the sidebar and
  // driving the Dashboard's Match Sheet. Deliberately manual (not
  // auto-derived) so picking a match to review doesn't change what's live.
  return { tournamentName: 'Untitled BR League', groups: [g], liveGroupId: null, liveMatchId: null, liveTallyTab: null };
}

let current = defaultState();

if (fs.existsSync(FILE)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (loaded && Array.isArray(loaded.groups) && loaded.groups.length) current = loaded;
  } catch (e) {
    console.warn('[tally] Could not parse tally_state.json, using defaults');
  }
}

// One-time upgrade for state saved before rosters/per-player kills existed:
// give every team a 4-player roster, and add an empty playerKills breakdown
// to every existing match result. The team-level `kills` number is left as
// the authoritative total EXCEPT when it's missing entirely — which also
// covers state saved by a since-reverted earlier build that deleted `kills`
// and folded it into playerKills; in that one case, kills is recovered as
// the sum of whatever's in playerKills instead of resetting to 0.
function migrateLegacyShape() {
  let changed = false;
  current.groups.forEach(function (g) {
    g.teams.forEach(function (t) {
      if (!Array.isArray(t.players) || t.players.length !== 4) {
        t.players = emptyPlayers();
        changed = true;
      }
    });
  });
  current.groups.forEach(function (g) {
    g.matches.forEach(function (m) {
      g.teams.forEach(function (t) {
        const r = m.results[t.id];
        if (!r) return;
        if (r.playerKills === undefined) r.playerKills = {};
        if (r.kills === undefined) {
          r.kills = Object.values(r.playerKills).reduce(function (sum, k) { return sum + (k || 0); }, 0);
          changed = true;
        }
      });
    });
  });
  if (changed) persist();
}
migrateLegacyShape();

const sseClients = [];

function persist() {
  try { fs.writeFileSync(FILE, JSON.stringify(current, null, 2)); }
  catch (e) { console.warn('[tally] Could not write tally_state.json'); }
}

function broadcast() {
  const json = JSON.stringify(current);
  sseClients.forEach(function (c) { try { c.write(`data: ${json}\n\n`); } catch (e) {} });
  // Also fan out over the shared /overlay/events stream (named "tally"
  // event) so html/tally-console.html and html/tally-score.html — each
  // meant to be open in several separate tabs/browser-sources at once —
  // can share the ONE real connection every other overlay page already
  // shares (see html/js/overlay-shared-worker.js) instead of each holding
  // its own permanent /tally/events connection.
  overlayState.overlayClients.forEach(function (c) { try { c.write(`event: tally\ndata: ${json}\n\n`); } catch (e) {} });
}

function addClient(res) {
  sseClients.push(res);
  res.write(`data: ${JSON.stringify(current)}\n\n`);
}
function removeClient(res) {
  const i = sseClients.indexOf(res);
  if (i !== -1) sseClients.splice(i, 1);
}

function get() { return current; }

function findGroup(groupId) { return current.groups.find(function (g) { return g.id === groupId; }) || null; }

function syncPlacementTableSize(group) {
  const n = Math.max(group.teams.length, 1);
  const existing = group.settings.placementPoints;
  const fresh = defaultPlacementTable(n);
  for (let r = 1; r <= n; r++) if (existing[r] !== undefined) fresh[r] = existing[r];
  group.settings.placementPoints = fresh;
}

function matchPointsFor(group, kills, placement) {
  const killPts = (kills || 0) * group.settings.killPoint;
  const placePts = placement ? (group.settings.placementPoints[placement] || 0) : 0;
  return killPts + placePts;
}

function rankTeams(group) {
  const rows = group.teams.map(function (team) {
    let totalKills = 0, totalPts = 0, wins = 0, matchesPlayed = 0;
    group.matches.forEach(function (m) {
      const r = m.results[team.id];
      if (!r) return;
      const kills = r.kills || 0;
      const played = (kills > 0) || (r.placement !== "" && r.placement != null);
      if (played) matchesPlayed++;
      totalKills += kills;
      totalPts += matchPointsFor(group, kills, r.placement);
      if (parseInt(r.placement, 10) === 1) wins++;
    });
    return { team, totalKills, totalPts, wins, matchesPlayed };
  });
  rows.sort(function (a, b) {
    return b.totalPts - a.totalPts || b.totalKills - a.totalKills || a.team.name.localeCompare(b.team.name);
  });
  return rows;
}

/* ===== mutations — every one persists + broadcasts ===== */

function setTournamentName(name) {
  current.tournamentName = (name || '').trim() || 'Untitled BR League';
  persist(); broadcast();
}

function addGroup(name) {
  const g = emptyGroup(name || `Group ${current.groups.length + 1}`);
  current.groups.push(g);
  persist(); broadcast();
  return g.id;
}

function removeGroup(groupId) {
  if (current.groups.length <= 1) return; // always keep at least one group
  current.groups = current.groups.filter(function (g) { return g.id !== groupId; });
  if (current.liveGroupId === groupId) { current.liveGroupId = null; current.liveMatchId = null; }
  persist(); broadcast();
}

function renameGroup(groupId, name) {
  const g = findGroup(groupId);
  if (!g) return;
  g.name = (name || '').trim() || g.name;
  persist(); broadcast();
}

// Specialization for BR tournaments: qualify the current top N teams (by the
// group's own live leaderboard) straight into a brand-new group — e.g.
// "Group A" -> "Finals" — without re-typing team names by hand.
function promoteTopTeams(fromGroupId, count, newGroupName) {
  const src = findGroup(fromGroupId);
  if (!src) return null;
  const n = Math.max(1, Math.min(src.teams.length, parseInt(count, 10) || 1));
  const top = rankTeams(src).slice(0, n);
  const g = emptyGroup(newGroupName || `${src.name} Finals`);
  g.teams = top.map(function (row, i) {
    const players = (row.team.players || emptyPlayers()).map(function (p) { return { id: newId(), name: p.name }; });
    return { id: newId(), name: row.team.name, color: colorFor(i), players: players };
  });
  g.settings.killPoint = src.settings.killPoint;
  syncPlacementTableSize(g);
  Object.keys(src.settings.placementPoints).forEach(function (r) {
    if (g.settings.placementPoints[r] !== undefined) g.settings.placementPoints[r] = src.settings.placementPoints[r];
  });
  current.groups.push(g);
  persist(); broadcast();
  return g.id;
}

function addTeam(groupId, name) {
  const g = findGroup(groupId);
  const trimmed = (name || '').trim();
  if (!g || !trimmed) return;
  g.teams.push({ id: newId(), name: trimmed, color: colorFor(g.teams.length), players: emptyPlayers() });
  syncPlacementTableSize(g);
  persist(); broadcast();
}

function removeTeam(groupId, teamId) {
  const g = findGroup(groupId);
  if (!g) return;
  g.teams = g.teams.filter(function (t) { return t.id !== teamId; });
  g.matches.forEach(function (m) { delete m.results[teamId]; });
  syncPlacementTableSize(g);
  persist(); broadcast();
}

function updatePlayerName(groupId, teamId, playerId, name) {
  const g = findGroup(groupId);
  if (!g) return;
  const team = g.teams.find(function (t) { return t.id === teamId; });
  if (!team) return;
  const player = (team.players || []).find(function (p) { return p.id === playerId; });
  if (!player) return;
  player.name = (name || '').trim() || player.name;
  persist(); broadcast();
}

function addMatch(groupId) {
  const g = findGroup(groupId);
  if (!g) return null;
  const results = {};
  g.teams.forEach(function (t) { results[t.id] = { kills: 0, placement: "", playerKills: {} }; });
  const match = { id: newId(), label: `Match ${g.matches.length + 1}`, results };
  g.matches.push(match);
  persist(); broadcast();
  return match.id;
}

function removeMatch(groupId, matchId) {
  const g = findGroup(groupId);
  if (!g) return;
  g.matches = g.matches.filter(function (m) { return m.id !== matchId; });
  if (current.liveGroupId === groupId && current.liveMatchId === matchId) current.liveMatchId = null;
  persist(); broadcast();
}

// The shared "what's actually being played right now" flag — separate from
// any browser's local view of which group/match it happens to be looking
// at. Manual and sticky: it only changes when an operator explicitly marks
// a match live, so reviewing an earlier match sheet never disturbs it.
function setLive(groupId, matchId) {
  const g = findGroup(groupId);
  if (!g) return;
  if (matchId && !g.matches.find(function (m) { return m.id === matchId; })) return;
  current.liveGroupId = groupId;
  current.liveMatchId = matchId || null;
  persist(); broadcast();
}

// The Tally-tab equivalent of setLive() above — no validation against
// lib/externalTally.js's current sheet list on purpose, to keep this
// module decoupled from that one. The client only ever offers real tab
// names to pick from, and gracefully shows "not found" if the live tab
// gets renamed/removed out from under it.
function setLiveTallyTab(tabName) {
  current.liveTallyTab = (tabName || '').trim() || null;
  persist(); broadcast();
}

function updateKills(groupId, matchId, teamId, value) {
  const g = findGroup(groupId);
  if (!g) return;
  const match = g.matches.find(function (m) { return m.id === matchId; });
  if (!match) return;
  if (!match.results[teamId]) match.results[teamId] = { kills: 0, placement: "", playerKills: {} };
  match.results[teamId].kills = value === '' ? 0 : Math.max(0, parseInt(value, 10) || 0);
  persist(); broadcast();
}

function updatePlacement(groupId, matchId, teamId, value) {
  const g = findGroup(groupId);
  if (!g) return;
  const match = g.matches.find(function (m) { return m.id === matchId; });
  if (!match) return;
  if (!match.results[teamId]) match.results[teamId] = { kills: 0, placement: "", playerKills: {} };
  match.results[teamId].placement = value;
  persist(); broadcast();
}

// Optional, independent record of who got how many kills — does NOT feed
// into `kills` (the fast team-total field above) or points math. Lets a
// scorekeeper tally the team total quickly and only fill this in "if ever".
function updatePlayerKills(groupId, matchId, teamId, playerId, value) {
  const g = findGroup(groupId);
  if (!g) return;
  const match = g.matches.find(function (m) { return m.id === matchId; });
  if (!match) return;
  if (!match.results[teamId]) match.results[teamId] = { kills: 0, placement: "", playerKills: {} };
  if (!match.results[teamId].playerKills) match.results[teamId].playerKills = {};
  match.results[teamId].playerKills[playerId] = value === '' ? 0 : Math.max(0, parseInt(value, 10) || 0);
  persist(); broadcast();
}

function updateKillPoint(groupId, value) {
  const g = findGroup(groupId);
  if (!g) return;
  g.settings.killPoint = parseFloat(value) || 0;
  persist(); broadcast();
}

function updatePlacementPoint(groupId, rank, value) {
  const g = findGroup(groupId);
  if (!g) return;
  g.settings.placementPoints[rank] = parseFloat(value) || 0;
  persist(); broadcast();
}

function importState(data) {
  if (!data || !Array.isArray(data.groups) || !data.groups.length) return false;
  current = data;
  persist(); broadcast();
  return true;
}

module.exports = {
  get, addClient, removeClient,
  setTournamentName,
  addGroup, removeGroup, renameGroup, promoteTopTeams, setLive, setLiveTallyTab,
  addTeam, removeTeam, updatePlayerName,
  addMatch, removeMatch, updateKills, updatePlacement, updatePlayerKills,
  updateKillPoint, updatePlacementPoint,
  importState,
};
