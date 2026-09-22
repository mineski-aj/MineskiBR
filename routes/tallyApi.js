// routes/tallyApi.js — public read-only JSON surface for the Tally data
// (fused in from the standalone CODMTally app — renamed from routes/api.js
// to avoid clashing with this project's own routes/devapi.js, and
// GET /api/roster below was renamed to GET /api/tally-roster since this
// server already has an unrelated POST /api/roster for mainroster.json,
// see server.js).
//
// GET /api/tally-roster — whole-tournament roster derived from the Tally
//                      sheets (teams, players, kills, kill/placement/total
//                      score), plus ranked summaries (top kills by
//                      team/player, top placement points). Same computation
//                      the Roster page itself uses — see lib/tallyRoster.js.
// GET /api/tab1..N  — one endpoint per CURRENTLY detected Tally sheet, in
//                      tab order, exposing that sheet's parsed structure
//                      as-is. A plain RegExp route (not a fixed list) so it
//                      always matches however many tabs currently exist —
//                      add a "Group Stage E" tab and /api/tab7 just works.
// GET /api/groupstage-qualifiers — top 20 teams ranked on group-stage-only
//                      performance (every tally sheet except Playoffs/Grand
//                      Finals), tie-broken by raw kills — see
//                      lib/tallyRoster.js's getGroupStageQualifiers().
//                      Pass ?limit=all for every group-stage team ranked
//                      (used by the Dashboard's Group Leaderboard), or
//                      ?limit=N for a different cutoff.
// GET /api/live-tally-standings — Team/Region/Total Score for ONLY the
//                      Tally sheet currently marked live (lib/tallyState.js's
//                      liveTallyTab), ranked by Total Score — see
//                      lib/tallyRoster.js's getLiveSheetStandings(). Powers
//                      Match Board's "Teams & Series Score" panel.
const express = require('express');
const router = express.Router();
const externalTally = require('../lib/externalTally');
const tallyRoster = require('../lib/tallyRoster');

router.get('/api/tally-roster', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json(tallyRoster.getRosterWithSummaries());
});

router.get('/api/groupstage-qualifiers', function (req, res) {
  const q = req.query.limit;
  const limit = q === 'all' ? null : (q ? parseInt(q, 10) || 20 : 20);
  res.set({ 'Cache-Control': 'no-store' }).json(tallyRoster.getGroupStageQualifiers(limit));
});

router.get('/api/live-tally-standings', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json(tallyRoster.getLiveSheetStandings());
});

router.get('/api/current-map-standings', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json(tallyRoster.getCurrentMapStandings());
});

router.get('/api/live-sheet-overall-standings', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json(tallyRoster.getLiveSheetOverallStandings());
});

router.get(/^\/api\/tab(\d+)$/, function (req, res) {
  const n = parseInt(req.params[0], 10);
  const data = externalTally.get();
  const sheet = data.sheets[n - 1];
  if (!sheet) {
    return res.status(404).json({ error: 'No tab ' + n + ' — there are currently ' + data.sheets.length + ' tab(s).' });
  }
  res.set({ 'Cache-Control': 'no-store' }).json({
    tab: n,
    name: sheet.name,
    headerGroups: sheet.headerGroups,
    subHeader: sheet.subHeader,
    dataRows: sheet.dataRows,
    fetchedAt: data.fetchedAt,
  });
});

module.exports = router;
