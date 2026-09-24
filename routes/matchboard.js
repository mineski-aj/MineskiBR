// routes/matchboard.js — read-only JSON snapshots of the Match Board data
// (team names/scores/kills/result), for anything OUTSIDE this app that
// wants to read it: a browser tab for debugging, or vMix's own Data
// Sources feature (Title Designer → Data Sources → Web/JSON), which is
// what /api/matchboard/vmix is shaped for.
//
// Same two sources Fullscreen.html's own fetchMatchBoardData() reads
// (state.lastGameData for live kills/win_camp, lib/matchState for team
// identity/series score) — this just assembles the same fields
// server-side so an external tool doesn't have to combine two endpoints
// and replicate the swapped/campid pairing logic itself.
const express    = require('express');
const router     = express.Router();
const state      = require('../lib/state');
const matchState = require('../lib/matchState');

function buildMatchboardData(req) {
  const ms = matchState.get() || {};
  const isSwapped = ms.swapped !== undefined ? ms.swapped : (ms.blueTeam === 'B');
  const home = ms.home || {};
  const away = ms.away || {};
  // c1/c2 = camp 1 (left/blue) and camp 2 (right/red) — same pairing
  // Fullscreen.html's applyMatchBoardData() uses, so campid 1/2 from the
  // live game feed lines up with whichever team is actually shown there.
  const c1 = isSwapped ? away : home;
  const c2 = isSwapped ? home : away;

  const gameData = (state.lastGameData && state.lastGameData.data) || null;
  const camps    = (gameData && gameData.camp_list) || [];
  const gc1      = camps.find(c => c.campid === 1) || {};
  const gc2      = camps.find(c => c.campid === 2) || {};
  const winCamp  = gameData ? (gameData.win_camp ?? null) : null;

  function result(campNum) {
    if (winCamp === null || winCamp === undefined) return null;
    return winCamp === campNum ? 'VICTORY' : 'DEFEAT';
  }

  const origin = req.protocol + '://' + req.get('host');
  function logoUrl(short) { return short ? origin + '/logos/' + short + '.png' : ''; }

  return {
    series: ms.series || 'BO3',
    team1: {
      name:        c1.name  || '',
      short:       c1.short || '',
      logo:        logoUrl(c1.short),
      seriesScore: c1.score || 0,
      kills:       gc1.score ?? 0,
      result:      result(1),
    },
    team2: {
      name:        c2.name  || '',
      short:       c2.short || '',
      logo:        logoUrl(c2.short),
      seriesScore: c2.score || 0,
      kills:       gc2.score ?? 0,
      result:      result(2),
    },
    updatedAt: new Date().toISOString(),
  };
}

// GET /api/matchboard — plain nested JSON, for a browser tab or any
// generic JSON consumer.
router.get('/api/matchboard', (req, res) => {
  res.set('Cache-Control', 'no-store').json(buildMatchboardData(req));
});

// GET /api/matchboard/vmix — vMix Data Sources-compatible shape: a JSON
// ARRAY of flat objects (vMix Data Sources always expect a list of "rows",
// even for a single-row snapshot like this one), so every field can be
// bound directly as ${team1_name} etc. in a vMix Title without any nested
// path. Point a vMix Data Source at this URL (JSON), map it to a Title,
// and set it to auto-refresh.
router.get('/api/matchboard/vmix', (req, res) => {
  const d = buildMatchboardData(req);
  res.set('Cache-Control', 'no-store').json([{
    series:             d.series,
    team1_name:         d.team1.name,
    team1_short:        d.team1.short,
    team1_logo:         d.team1.logo,
    team1_series_score: d.team1.seriesScore,
    team1_kills:        d.team1.kills,
    team1_result:       d.team1.result || '',
    team2_name:         d.team2.name,
    team2_short:        d.team2.short,
    team2_logo:         d.team2.logo,
    team2_series_score: d.team2.seriesScore,
    team2_kills:        d.team2.kills,
    team2_result:       d.team2.result || '',
    updatedAt:          d.updatedAt,
  }]);
});

module.exports = router;
