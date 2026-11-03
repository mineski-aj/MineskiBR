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
  return out;
}

router.get('/api/in-the-zone', function (req, res) {
  res.set('Cache-Control', 'no-store').json(Object.assign({ teams: grandFinalsTeams(), stage: stageSheetRe() === SHOWMATCH_RE ? 'Showmatch' : 'Grand Finals' }, inTheZone.get()));
});

router.post('/api/in-the-zone', function (req, res) {
  res.json(Object.assign({ ok: true }, inTheZone.set(req.body || {})));
});

module.exports = router;
