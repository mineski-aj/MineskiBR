// routes/playoffs.js — Playoffs stage helpers (see lib/playoffs.js).
//
// GET  /api/playoffs/maps     — the Playoffs tally sheet's map blocks in
//                               order (Map 1, 2.1, 2.2, 3 ...). Match Board
//                               hardcodes its map list to this while Stage
//                               = Playoffs.
// GET  /api/playoffs/lobbies  — { lobbyA, lobbyB, teams } — the 10 squads
//                               per lobby plus every squad on the sheet
//                               (the pick-list for the PLAYOFFS tab).
// POST /api/playoffs/lobbies  — { lobbyA:[...], lobbyB:[...] } to save, or
//                               { reset:true } to restore the default seeding.
const express = require('express');
const router = express.Router();
const externalTally = require('../lib/externalTally');
const playoffs = require('../lib/playoffs');

function playoffsSheet() {
  return externalTally.get().sheets.find(function (s) { return String(s.name).trim().toLowerCase() === 'playoffs'; }) || null;
}

function sheetSquads(sheet) {
  if (!sheet) return [];
  let squadCol = 0, offset = 0;
  (sheet.headerGroups || []).some(function (g) {
    if (g.label === 'Squad') { squadCol = offset; return true; }
    offset += g.span; return false;
  });
  const out = [];
  (sheet.dataRows || []).forEach(function (row) {
    const n = String(row[squadCol] == null ? '' : row[squadCol]).trim();
    if (n && out.indexOf(n) === -1) out.push(n);
  });
  return out;
}

router.get('/api/playoffs/maps', function (req, res) {
  const sheet = playoffsSheet();
  res.set('Cache-Control', 'no-store').json({ sheet: sheet ? sheet.name : null, blocks: sheet ? playoffs.mapBlocks(sheet.headerGroups) : [] });
});

router.get('/api/playoffs/lobbies', function (req, res) {
  res.set('Cache-Control', 'no-store').json(Object.assign(playoffs.getLobbies(), { teams: sheetSquads(playoffsSheet()) }));
});

router.post('/api/playoffs/lobbies', function (req, res) {
  const body = req.body || {};
  const saved = body.reset ? playoffs.resetLobbies() : playoffs.setLobbies(body);
  res.json(Object.assign({ ok: true }, saved));
});

module.exports = router;
