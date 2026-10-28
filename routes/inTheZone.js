// routes/inTheZone.js — Grand Finals "In The Zone" state (see lib/inTheZone.js).
//
// GET  /api/in-the-zone — { teams, zone, threshold }: teams = every squad on the
//                         Grand Finals tally sheet in sheet order (name, region,
//                         current total score), zone = the squads flagged
//                         "In The Zone", threshold = the score needed to reach it.
// POST /api/in-the-zone — { zone:[...], threshold:number|null } to save.
const express = require('express');
const router = express.Router();
const externalTally = require('../lib/externalTally');
const tallyRoster = require('../lib/tallyRoster');
const inTheZone = require('../lib/inTheZone');

const GF_SHEET_RE = /^grand\s*finals$/i;

function grandFinalsTeams() {
  const sheet = externalTally.get().sheets.find(function (s) { return GF_SHEET_RE.test(String(s.name).trim()); });
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
  res.set('Cache-Control', 'no-store').json(Object.assign({ teams: grandFinalsTeams() }, inTheZone.get()));
});

router.post('/api/in-the-zone', function (req, res) {
  res.json(Object.assign({ ok: true }, inTheZone.set(req.body || {})));
});

module.exports = router;
