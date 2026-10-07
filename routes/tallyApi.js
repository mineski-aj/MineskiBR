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
const elimsMap = require('../lib/elimsMap');

router.get('/api/tally-roster', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json(tallyRoster.getRosterWithSummaries());
});

// GET /api/tally-stats?scope=groupstage|playoffs|grandfinals|overall
// (default overall; never includes Qualifiers). Powers the Tally console's
// Stats page — see lib/tallyRoster.js's getStats().
router.get('/api/tally-stats', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json(tallyRoster.getStats(String(req.query.scope || 'overall')));
});

// GET /api/eliminations-map[?map=Blackout] — top 5 players by kills on one
// map (defaults to the Control tab's saved pick, lib/elimsMap.js). Powers
// Fullscreen.html's Eliminations/Map scene.
router.get('/api/eliminations-map', function (req, res) {
  const map = req.query.map || elimsMap.get();
  res.set({ 'Cache-Control': 'no-store' }).json(tallyRoster.getTopPlayersOnMap(map, 5));
});

// GET /api/total-elim-leaders — top 5 players by total kills across every
// tally sheet. Powers Fullscreen.html's Total Elim Leaders scene.
router.get('/api/total-elim-leaders', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json(tallyRoster.getTopPlayersTotal(5));
});

// GET /api/group-elim-leaders — same as total-elim-leaders but counting only
// the Groupstage crossover sheets (A + B, C + D, ...). Powers Group Elim Leaders.
router.get('/api/group-elim-leaders', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json(tallyRoster.getTopPlayersTotal(5, 'groupstage'));
});

// GET /api/team-map-elims[?map=Blackout] — top 5 TEAMS by kills on one map
// (defaults to Team Map Elims' own saved pick). Powers Team Map Elims.
router.get('/api/team-map-elims', function (req, res) {
  const map = req.query.map || elimsMap.get('team_map_elims');
  res.set({ 'Cache-Control': 'no-store' }).json(tallyRoster.getTopTeamsOnMap(map, 5));
});

// GET /api/team-point-percent — top 5 teams by total points (Overall scope)
// with their kill-point / placement-point split. Powers Team Point Percent.
router.get('/api/team-point-percent', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json(tallyRoster.getTopTeamsByPoints(5));
});

// GET /api/qualifier-elim-leaders — same as total-elim-leaders but counting
// only the Qualifier 1..N tabs. Powers Qualifier Elim Leaders.
router.get('/api/qualifier-elim-leaders', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json(tallyRoster.getTopPlayersTotal(5, 'qualifiers'));
});

// GET /api/total-team-elims — top 5 TEAMS by total kills across every tally
// sheet. Powers Total Team Elims. /api/group-team-elims is the same limited
// to the Groupstage crossover tabs. Powers Group Team Elims.
router.get('/api/total-team-elims', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json(tallyRoster.getTopTeamsTotalKills(5, 'all'));
});
router.get('/api/group-team-elims', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json(tallyRoster.getTopTeamsTotalKills(5, 'groupstage'));
});

router.get('/api/groupstage-qualifiers', function (req, res) {
  const q = req.query.limit;
  const limit = q === 'all' ? null : (q ? parseInt(q, 10) || 20 : 20);
  res.set({ 'Cache-Control': 'no-store' }).json(tallyRoster.getGroupStageQualifiers(limit));
});

router.get('/api/live-tally-standings', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json(tallyRoster.getLiveSheetStandings());
});

// GET /api/waiting-tvc-standings — same live-sheet standings Match Board
// uses, EXCEPT during Qualifiers, where it aggregates the whole day's
// tabs (Day 1: Qualifier 1-5, Day 2: Qualifier 6-10) instead of just
// whichever single tab is marked live — see getWaitingTvcStandings().
// Powers Waiting Screen TVC (Fullscreen.html) only.
router.get('/api/waiting-tvc-standings', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json(tallyRoster.getWaitingTvcStandings());
});

router.get('/api/current-map-standings', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json(tallyRoster.getCurrentMapStandings());
});

router.get('/api/live-sheet-overall-standings', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json(tallyRoster.getLiveSheetOverallStandings());
});

// GET /api/qualified-teams-standings?from=1&to=10 — rank 1 & 2 team from
// each Qualifier tab in that range, skipping any tab with no data yet —
// see lib/tallyRoster.js's getQualifiedTeamsStandings(). Powers the
// Qualified Teams 1 (Qualifier 1-10) / Qualified Teams 2 (Qualifier 11-20)
// scenes (Fullscreen.html).
router.get('/api/qualified-teams-standings', function (req, res) {
  const from = parseInt(req.query.from, 10) || 1;
  const to = parseInt(req.query.to, 10) || 10;
  res.set({ 'Cache-Control': 'no-store' }).json(tallyRoster.getQualifiedTeamsStandings(from, to));
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
    mapNames: sheet.mapNames,
    subHeader: sheet.subHeader,
    dataRows: sheet.dataRows,
    fetchedAt: data.fetchedAt,
  });
});

module.exports = router;
