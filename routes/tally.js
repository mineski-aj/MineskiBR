// routes/tally.js — REST + SSE endpoints for the collaborative BR tally
// state (fused in from the standalone CODMTally app). One POST
// /tally/action endpoint dispatches by `action`, same single-action-switch
// pattern as this project's own routes/overlay.js. Editing is open to
// everyone (no password) — every connected scorekeeper shares one live
// tournament.
const express = require('express');
const router = express.Router();
const tallyState = require('../lib/tallyState');

router.get('/tally/state', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json(tallyState.get());
});

router.get('/tally/events', function (req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  tallyState.addClient(res);
  req.on('close', function () { tallyState.removeClient(res); });
});

router.post('/tally/action', function (req, res) {
  const body = req.body || {};
  let createdId;
  switch (body.action) {
    case 'setTournamentName':   tallyState.setTournamentName(body.name); break;
    case 'addGroup':            createdId = tallyState.addGroup(body.name); break;
    case 'removeGroup':         tallyState.removeGroup(body.groupId); break;
    case 'renameGroup':         tallyState.renameGroup(body.groupId, body.name); break;
    case 'promoteTopTeams':     createdId = tallyState.promoteTopTeams(body.fromGroupId, body.count, body.newGroupName); break;
    case 'setLive':              tallyState.setLive(body.groupId, body.matchId); break;
    case 'setLiveTallyTab':      tallyState.setLiveTallyTab(body.tabName); break;
    case 'addTeam':              tallyState.addTeam(body.groupId, body.name); break;
    case 'removeTeam':          tallyState.removeTeam(body.groupId, body.teamId); break;
    case 'updatePlayerName':    tallyState.updatePlayerName(body.groupId, body.teamId, body.playerId, body.name); break;
    case 'addMatch':             createdId = tallyState.addMatch(body.groupId); break;
    case 'removeMatch':         tallyState.removeMatch(body.groupId, body.matchId); break;
    case 'updateKills':          tallyState.updateKills(body.groupId, body.matchId, body.teamId, body.value); break;
    case 'updatePlacement':     tallyState.updatePlacement(body.groupId, body.matchId, body.teamId, body.value); break;
    case 'updatePlayerKills':   tallyState.updatePlayerKills(body.groupId, body.matchId, body.teamId, body.playerId, body.value); break;
    case 'updateKillPoint':     tallyState.updateKillPoint(body.groupId, body.value); break;
    case 'updatePlacementPoint': tallyState.updatePlacementPoint(body.groupId, body.rank, body.value); break;
    case 'importState':         tallyState.importState(body.data); break;
    default: return res.status(400).json({ ok: false, error: 'Unknown action: ' + body.action });
  }
  res.json({ ok: true, state: tallyState.get(), createdId });
});

module.exports = router;
