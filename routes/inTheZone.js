// routes/inTheZone.js — Grand Finals "In The Zone" state (see lib/inTheZone.js).
//
// GET  /api/in-the-zone — { teams, zone, threshold, stage }: teams = every squad on the
//                         Grand Finals tally sheet (the Showmatch sheet when the
//                         selected stage is Showmatch) in sheet order (name, region,
//                         current total score), zone = the squads flagged
//                         "In The Zone", won = the subset that won via ZOWNED!, threshold = the score needed to reach it.
// POST /api/in-the-zone — { zone:[...], won:[...], threshold:number|null } to save.
const express = require('express');
const router = express.Router();
const externalTally = require('../lib/externalTally');
const tallyRoster = require('../lib/tallyRoster');
const inTheZone = require('../lib/inTheZone');
const matchState = require('../lib/matchState');

const GF_SHEET_RE = /^grand\s*finals$/i;
const SHOWMATCH_RE = /^show\s*match$/i;

// The squads shown follow the selected stage (Match Board's stage): Showmatch
// lists the Showmatch tally tab's squads, everything else the Grand Finals tab.
function stageSheetRe() {
  return SHOWMATCH_RE.test(String(matchState.get().stage || '').trim()) ? SHOWMATCH_RE : GF_SHEET_RE;
}

// The In The Zone tab's row order (and so what /zoned1../zoned10 mean: 1 = first row). Grand Finals squads are listed in
// this fixed order instead of the tally sheet's; a squad not named here (a new/renamed team, or the Showmatch squads)
// follows after, in sheet order, so nothing ever disappears from the list. Names are matched case-insensitively.
const GF_ORDER = [
  'POISON IVY GIZY', 'ADMT PYRITE', 'CHANGE WORLD', 'ASC', 'REVENANT ECLIPSE',
  'GNR ESPORTS LEGACY OMEN', 'M12 sYn MAIN', 'LEAP MAIN', 'ROYAL GEMINI JA LN', 'ADMT MAIN',
];
function orderTeams(list) {
  const rank = function (t) {
    const i = GF_ORDER.findIndex(function (n) { return n.toLowerCase() === t.name.toLowerCase(); });
    return i === -1 ? GF_ORDER.length : i;
  };
  return list.map(function (t, i) { return { t: t, i: i, r: rank(t) }; })
    .sort(function (a, b) { return a.r - b.r || a.i - b.i; })
    .map(function (x) { return x.t; });
}

function grandFinalsTeams() {
  const re = stageSheetRe();
  const sheet = externalTally.get().sheets.find(function (s) { return re.test(String(s.name).trim()); });
  if (!sheet) return [];
  // Sheet order (stable for a checklist) — scores come from the same
  // aggregation every ranking uses, looked up by name.
  const scores = new Map(tallyRoster.getSingleSheetRoster(sheet.name).teams.map(function (t) { return [t.name, t]; }));
  let squadCol = 0, offset = 0;
  (sheet.headerGroups || []).some(function (g) {
    if (g.label === 'Squad') { squadCol = offset; return true; }
    offset += g.span; return false;
  });
  const out = [];
  (sheet.dataRows || []).forEach(function (row) {
    const name = String(row[squadCol] == null ? '' : row[squadCol]).trim();
    if (!name || out.some(function (t) { return t.name === name; })) return;
    const t = scores.get(name);
    out.push({ name: name, region: (t && t.region) || '', totalScore: t ? t.totalScore : 0 });
  });
  return orderTeams(out);
}

router.get('/api/in-the-zone', function (req, res) {
  res.set('Cache-Control', 'no-store').json(Object.assign({ teams: grandFinalsTeams(), stage: stageSheetRe() === SHOWMATCH_RE ? 'Showmatch' : 'Grand Finals' }, inTheZone.get()));
});

router.post('/api/in-the-zone', function (req, res) {
  res.json(Object.assign({ ok: true }, inTheZone.set(req.body || {})));
});

// ── Zowned Points (the overlay's number) ────────────────────────────────
// GET /api/zowned-points → { points, source:'manual'|'fallback'|'none', leader:{name,total}|null,
//                           mapsCounted, inZoneCount }.
// manual   = the In The Zone tab's threshold.
// fallback = no threshold set: the best Grand Finals (or Showmatch, per the selected stage) team total through Map 6, plus 10
//            (the Zone Point rule) — only once all six maps have a result.
// A team's score for a map = its leader row's TKP (team kill points) + PS (placement score).
function colStart(headerGroups, label) {
  let offset = 0;
  for (let i = 0; i < (headerGroups || []).length; i++) {
    if (headerGroups[i].label === label) return offset;
    offset += headerGroups[i].span;
  }
  return null;
}
function leaderAfterMap(n) {
  // Follows the selected stage's tally tab (Showmatch tab in Showmatch, else Grand Finals).
  const re = stageSheetRe();
  const sheet = externalTally.get().sheets.find(function (s) { return re.test(String(s.name).trim()); });
  if (!sheet) return { leader: null, mapsCounted: 0 };
  const sq = colStart(sheet.headerGroups, 'Squad');
  const squadCol = sq === null ? 0 : sq;
  const sub = sheet.subHeader || [];
  const mapCols = [];
  for (let k = 1; k <= n; k++) {
    const start = colStart(sheet.headerGroups, 'Map ' + k);
    if (start === null) continue;
    const find = function (lab) {
      for (let c = start; c < start + 5; c++) if (String(sub[c] == null ? '' : sub[c]).trim() === lab) return c;
      return -1;
    };
    mapCols.push({ p: find('P'), tkp: find('TKP'), ps: find('PS') });
  }
  const totals = new Map();
  const played = new Set();
  (sheet.dataRows || []).forEach(function (row) {
    const name = String(row[squadCol] == null ? '' : row[squadCol]).trim();
    if (!name) return;
    let t = totals.get(name) || 0;
    mapCols.forEach(function (m, i) {
      if (m.p >= 0 && typeof row[m.p] === 'number') played.add(i);
      if (m.tkp >= 0 && typeof row[m.tkp] === 'number') t += row[m.tkp];
      if (m.ps >= 0 && typeof row[m.ps] === 'number') t += row[m.ps];
    });
    totals.set(name, t);
  });
  let leader = null;
  totals.forEach(function (total, name) {
    if (!leader || total > leader.total) leader = { name: name, total: Math.round(total * 100) / 100 };
  });
  return { leader: leader, mapsCounted: played.size };
}
router.get('/api/zowned-points', function (req, res) {
  const z = inTheZone.get();
  // Grand Finals: leader after Map 6; Showmatch: after Map 1.
  const afterMap = stageSheetRe() === SHOWMATCH_RE ? 1 : 6;
  const r = leaderAfterMap(afterMap);
  let points = null, source = 'none';
  if (z.threshold !== null) { points = z.threshold; source = 'manual'; }
  else if (r.leader && r.mapsCounted >= afterMap) { points = Math.round((r.leader.total + 10) * 100) / 100; source = 'fallback'; }
  res.set('Cache-Control', 'no-store').json({ points: points, source: source, leader: r.leader, mapsCounted: r.mapsCounted, afterMap: afterMap, inZoneCount: z.zone.length });
});

// ── Zoned tooltip (ingame.html) ─────────────────────────────────────────
// GET /zoned1 … /zoned10 (also /overlay/zoned1 … /overlay/zoned10): the Nth team of the In The Zone tab's list
// (same order as /api/in-the-zone `teams`, e.g. 1 = the first row). If that team is ticked "In The Zone" a small
// tooltip pops in above the ingame lower-left bug; if it isn't (or there is no Nth team) the tooltip is hidden and
// nothing shows. Triggering another number replaces the tooltip. Optional ?sec=8 auto-hides it after 8 seconds.
// GET /zonedhide (also /overlay/zonedhide) hides it. SSE event: zoned_tip { action, team, n }.
// GET /overlay/zoned-state restores a freshly (re)loaded ingame.html.
const state = require('../lib/state');
state.zonedTip = state.zonedTip || { team: null, n: null };
let zonedTimer = null;
function zonedSend(payload) {
  const line = 'event: zoned_tip\ndata: ' + JSON.stringify(payload) + '\n\n';
  state.overlayClients.forEach(function (c) { try { c.write(line); } catch (e) {} });
}
function zonedSet(team, n, sec) {
  clearTimeout(zonedTimer);
  if (!team) {
    state.zonedTip = { team: null, n: null };
    zonedSend({ action: 'hide' });
    return;
  }
  state.zonedTip = { team: team, n: n };
  zonedSend({ action: 'show', team: team, n: n });
  if (sec > 0) zonedTimer = setTimeout(function () { zonedSet(null); }, sec * 1000);
}
const noStoreZ = { 'Cache-Control': 'no-store' };
router.get(/^\/(?:overlay\/)?zoned(10|[1-9])$/, function (req, res) {   // regex route: Express 5 has no inline :n(regex)
  const n = parseInt(req.params[0], 10);
  const team = grandFinalsTeams()[n - 1] || null;
  const zone = new Set(inTheZone.get().zone.map(function (x) { return String(x).trim().toLowerCase(); }));
  const inZone = !!(team && zone.has(team.name.trim().toLowerCase()));
  const sec = Math.max(0, Math.min(120, parseFloat(req.query.sec) || 0));
  zonedSet(inZone ? team.name : null, n, sec);
  res.set(noStoreZ).json({ ok: true, n: n, team: team ? team.name : null, inZone: inZone, action: inZone ? 'show' : 'hide' });
});
router.get(['/zonedhide', '/overlay/zonedhide'], function (req, res) {
  zonedSet(null);
  res.set(noStoreZ).json({ ok: true, action: 'hide' });
});
router.get('/overlay/zoned-state', function (req, res) { res.set(noStoreZ).json(state.zonedTip); });

module.exports = router;
