// routes/overlay.js — SSE + all /overlay/*
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const router  = express.Router();
const state   = require('../lib/state');
const matchState = require('../lib/matchState');
const elimsMap = require('../lib/elimsMap');
const playerH2H = require('../lib/playerH2H');
const teamH2H = require('../lib/teamH2H');

// GET /api/player-photos — basenames with both FRONT and VICTORY photos available
const PHOTOS_DIR = path.join(__dirname, '..', 'photos');
let _playerPhotoNames = null;
router.get('/api/player-photos', (req, res) => {
  if (!_playerPhotoNames) {
    try {
      const front = fs.readdirSync(path.join(PHOTOS_DIR, 'FRONT'))
        .filter(f => f.endsWith('_FRONT_resized.png'))
        .map(f => f.slice(0, -'_FRONT_resized.png'.length));
      const victorySet = new Set(
        fs.readdirSync(path.join(PHOTOS_DIR, 'VICTORY'))
          .filter(f => f.endsWith('_VICTORY_resized.png'))
          .map(f => f.slice(0, -'_VICTORY_resized.png'.length))
      );
      _playerPhotoNames = front.filter(n => victorySet.has(n));
    } catch (e) {
      _playerPhotoNames = [];
    }
  }
  res.set({ 'Cache-Control': 'no-store' }).json({ names: _playerPhotoNames });
});

// GET /overlay/force-reload — hard-reload every open overlay page
// (Fullscreen.html, ENTVC.html, ingame.html) at once, so production
// browser sources don't need to be refreshed by hand
// after a dashboard Edit-tab save or any other change. Reuses the exact
// 'reload' SSE event routes/overlayStyles.js already broadcasts after a
// style save — every overlay page already listens for it, so no client-side
// changes were needed to wire this up. See dashboard.html's Settings page
// ("Overlay Pages" section) for the button that calls this.
router.get('/overlay/force-reload', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: reload\ndata: {}\n\n'); } catch {} });
  res.set({ 'Cache-Control': 'no-store' }).json({ ok: true, clients: state.overlayClients.length });
});

// SSE heartbeat
setInterval(() => {
  state.overlayClients.forEach(c => { try { c.write(': heartbeat\n\n'); } catch {} });
}, 15000);

// GET /overlay/events — SSE stream
router.get('/overlay/events', (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.writeHead(200);
  res.write(': connected\n\n');
  state.overlayClients.push(res);
  req.on("close", () => {
    const i = state.overlayClients.indexOf(res);
    if (i !== -1) state.overlayClients.splice(i, 1);
  });
});

// GET /overlay/fights/show
router.get('/overlay/fights/show', (req, res) => {
  state.fightsPendingAction = { action: "show", ts: Date.now() };
  state.overlayClients.forEach(c => { try { c.write('event: fights\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/fights/hide
router.get('/overlay/fights/hide', (req, res) => {
  state.fightsPendingAction = { action: "hide", ts: Date.now() };
  state.overlayClients.forEach(c => { try { c.write('event: fights\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/check-overlays — current shown/hidden state of the
// sliding "check" overlays, so the dashboard toggle can restore its
// position on load instead of guessing.
router.get('/overlay/check-overlays', (req, res) => {
  res.set({ 'Cache-Control': 'no-store' }).json(state.checkOverlays);
});

// GET /overlay/scoreboard/show
router.get('/overlay/scoreboard/show', (req, res) => {
  state.checkOverlays.scoreboard = true;
  state.overlayClients.forEach(c => { try { c.write('event: scoreboard\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/scoreboard/hide
router.get('/overlay/scoreboard/hide', (req, res) => {
  state.checkOverlays.scoreboard = false;
  state.overlayClients.forEach(c => { try { c.write('event: scoreboard\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/hrm-state — current per-player heart-rate meter on/off
// state (ingame_red.html / ingame_blue.html), so any page (dashboard,
// ingame overlays on a different browser/machine, vMix) can poll the
// same source of truth instead of relying on each browser's own
// localStorage, which never syncs across separate machines.
router.get('/overlay/hrm-state', (req, res) => {
  res.set({ 'Cache-Control': 'no-store' }).json(state.hrmOff);
});

// GET /overlay/hrm/:slot/show — turn the BPM meter back on (LIVE) for one player
router.get('/overlay/hrm/:slot/show', (req, res) => {
  const slot = req.params.slot;
  if (!(slot in state.hrmOff)) return res.status(400).json({ ok: false, error: 'unknown slot' });
  state.hrmOff[slot] = false;
  const payload = JSON.stringify({ slot, isOff: false });
  state.overlayClients.forEach(c => { try { c.write(`event: hrm\ndata: ${payload}\n\n`); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, slot, isOff: false });
});

// GET /overlay/hrm/:slot/hide — turn the BPM meter off (swap to KDA + Gold) for one player
router.get('/overlay/hrm/:slot/hide', (req, res) => {
  const slot = req.params.slot;
  if (!(slot in state.hrmOff)) return res.status(400).json({ ok: false, error: 'unknown slot' });
  state.hrmOff[slot] = true;
  const payload = JSON.stringify({ slot, isOff: true });
  state.overlayClients.forEach(c => { try { c.write(`event: hrm\ndata: ${payload}\n\n`); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, slot, isOff: true });
});

// GET /overlay/fights/pending
router.get('/overlay/fights/pending', (req, res) => {
  const p = state.fightsPendingAction;
  state.fightsPendingAction = null;
  res.set({ "Cache-Control": "no-store" }).json(p || { action: null });
});

// GET /overlay/waiting_tvc/show
router.get('/overlay/waiting_tvc/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'waiting';
  state.overlayClients.forEach(c => { try { c.write('event: waiting_tvc\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/waiting_tvc/hide
router.get('/overlay/waiting_tvc/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: waiting_tvc\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/waiting_timer/show
router.get('/overlay/waiting_timer/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'timer';
  state.overlayClients.forEach(c => { try { c.write('event: waiting_timer\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/waiting_timer/hide
router.get('/overlay/waiting_timer/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: waiting_timer\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/team_hexagon/show
router.get('/overlay/team_hexagon/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'hexagon';
  state.overlayClients.forEach(c => { try { c.write('event: team_hexagon\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/team_hexagon/hide
router.get('/overlay/team_hexagon/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: team_hexagon\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/overall_ranking_2/show|hide — Overall Ranking page 2 (teams
// 21-40), same header/scene as page 1; own activeFeature + SSE event.
router.get('/overlay/overall_ranking_2/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'overallranking2';
  state.overlayClients.forEach(c => { try { c.write('event: overall_ranking_2\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});
router.get('/overlay/overall_ranking_2/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: overall_ranking_2\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/overall_ranking/show
router.get('/overlay/overall_ranking/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'overallranking';
  state.overlayClients.forEach(c => { try { c.write('event: overall_ranking\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/overall_ranking/hide
router.get('/overlay/overall_ranking/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: overall_ranking\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/map_ranking/show
router.get('/overlay/map_ranking/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'mapranking';
  state.overlayClients.forEach(c => { try { c.write('event: map_ranking\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/map_ranking/hide
router.get('/overlay/map_ranking/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: map_ranking\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/slot_teams/show
router.get('/overlay/slot_teams/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'slotteams';
  state.overlayClients.forEach(c => { try { c.write('event: slot_teams\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/slot_teams/hide
router.get('/overlay/slot_teams/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: slot_teams\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/group_a|b|c|d/show|hide — Group A..D scenes (rank-header
// family, replaces the old single Group Ranking scene). One route pair and
// one SSE event per group; activeFeature is 'groupa'..'groupd'.
['a', 'b', 'c', 'd'].forEach(l => {
  router.get('/overlay/group_' + l + '/show', (req, res) => {
    state.fullscreenScene.activeFeature = 'group' + l;
    state.overlayClients.forEach(c => { try { c.write('event: group_' + l + '\ndata: {"action":"show"}\n\n'); } catch {} });
    res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
  });
  router.get('/overlay/group_' + l + '/hide', (req, res) => {
    state.fullscreenScene.activeFeature = null;
    state.overlayClients.forEach(c => { try { c.write('event: group_' + l + '\ndata: {"action":"hide"}\n\n'); } catch {} });
    res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
  });
});

// GET /overlay/danger_zone/show|hide — Danger Zone (Group A..D page layout,
// overall rank 16-25). Rank-header family; activeFeature is 'dangerzone'.
router.get('/overlay/danger_zone/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'dangerzone';
  state.overlayClients.forEach(c => { try { c.write('event: danger_zone\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});
router.get('/overlay/danger_zone/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: danger_zone\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/qualified_teams_1/show
router.get('/overlay/qualified_teams_1/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'qualifiedteams1';
  state.overlayClients.forEach(c => { try { c.write('event: qualified_teams_1\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/qualified_teams_1/hide
router.get('/overlay/qualified_teams_1/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: qualified_teams_1\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/qualified_teams_2/show
router.get('/overlay/qualified_teams_2/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'qualifiedteams2';
  state.overlayClients.forEach(c => { try { c.write('event: qualified_teams_2\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/qualified_teams_2/hide
router.get('/overlay/qualified_teams_2/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: qualified_teams_2\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/map_rotation/show
router.get('/overlay/map_rotation/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'maprotation';
  state.overlayClients.forEach(c => { try { c.write('event: map_rotation\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/map_rotation/hide
router.get('/overlay/map_rotation/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: map_rotation\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// Eliminations/Map — GET/POST the chosen map (dashboard Control tab).
// POST re-broadcasts on the scene's own event with action 'refresh' so a
// scene that's already on screen re-ranks without a hide/show.
router.get('/overlay/elims_map/selection', (req, res) => {
  res.set({ "Cache-Control": "no-store" }).json({ map: elimsMap.get(), maps: elimsMap.ELIMS_MAPS });
});
router.post('/overlay/elims_map/selection', (req, res) => {
  const map = elimsMap.set(String((req.body || {}).map || ''));
  if (!map) return res.status(400).json({ ok: false, error: 'unknown map' });
  state.overlayClients.forEach(c => { try { c.write('event: elims_map\ndata: {"action":"refresh"}\n\n'); } catch {} });
  res.json({ ok: true, map });
});

// GET /overlay/elims_map/show
router.get('/overlay/elims_map/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'elimsmap';
  state.overlayClients.forEach(c => { try { c.write('event: elims_map\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/elims_map/hide
router.get('/overlay/elims_map/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: elims_map\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/elim_leaders/show
router.get('/overlay/elim_leaders/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'elimleaders';
  state.overlayClients.forEach(c => { try { c.write('event: elim_leaders\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/elim_leaders/hide
router.get('/overlay/elim_leaders/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: elim_leaders\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/group_elim_leaders/show
router.get('/overlay/group_elim_leaders/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'groupelimleaders';
  state.overlayClients.forEach(c => { try { c.write('event: group_elim_leaders\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/playoffs_elim_leaders/show
router.get('/overlay/playoffs_elim_leaders/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'playoffselimleaders';
  state.overlayClients.forEach(c => { try { c.write('event: playoffs_elim_leaders\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/playoffs_elim_leaders/hide
router.get('/overlay/playoffs_elim_leaders/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: playoffs_elim_leaders\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/group_elim_leaders/hide
router.get('/overlay/group_elim_leaders/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: group_elim_leaders\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// Team Map Elims — own map pick (independent of Eliminations/Map's), same
// GET/POST + 'refresh' push pattern as /overlay/elims_map/selection.
router.get('/overlay/team_map_elims/selection', (req, res) => {
  res.set({ "Cache-Control": "no-store" }).json({ map: elimsMap.get('team_map_elims'), maps: elimsMap.ELIMS_MAPS });
});
router.post('/overlay/team_map_elims/selection', (req, res) => {
  const map = elimsMap.set(String((req.body || {}).map || ''), 'team_map_elims');
  if (!map) return res.status(400).json({ ok: false, error: 'unknown map' });
  state.overlayClients.forEach(c => { try { c.write('event: team_map_elims\ndata: {"action":"refresh"}\n\n'); } catch {} });
  res.json({ ok: true, map });
});

// GET /overlay/team_map_elims/show
router.get('/overlay/team_map_elims/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'teammapelims';
  state.overlayClients.forEach(c => { try { c.write('event: team_map_elims\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/team_map_elims/hide
router.get('/overlay/team_map_elims/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: team_map_elims\ndata: {"action":"hide"}\n\n'); } catch {} });

  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// Zowned Rate — own map pick (independent of the other map scenes'), same
// GET/POST + 'refresh' push pattern as /overlay/elims_map/selection.
router.get('/overlay/zowned_rate/selection', (req, res) => {
  res.set({ "Cache-Control": "no-store" }).json({ map: elimsMap.get('zowned_rate'), maps: elimsMap.ELIMS_MAPS });
});
router.post('/overlay/zowned_rate/selection', (req, res) => {
  const map = elimsMap.set(String((req.body || {}).map || ''), 'zowned_rate');
  if (!map) return res.status(400).json({ ok: false, error: 'unknown map' });
  state.overlayClients.forEach(c => { try { c.write('event: zowned_rate\ndata: {"action":"refresh"}\n\n'); } catch {} });
  res.json({ ok: true, map });
});

// Team H2H — the two teams being compared; same pattern as Player H2H below.
router.get('/overlay/team_h2h/selection', (req, res) => {
  res.set({ "Cache-Control": "no-store" }).json(teamH2H.get());
});
router.post('/overlay/team_h2h/selection', (req, res) => {
  const sel = teamH2H.set(req.body || {});
  state.overlayClients.forEach(c => { try { c.write('event: team_h2h\ndata: {"action":"refresh"}\n\n'); } catch {} });
  res.json({ ok: true, selection: sel });
});
router.get('/overlay/team_h2h/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'teamh2h';
  state.overlayClients.forEach(c => { try { c.write('event: team_h2h\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});
router.get('/overlay/team_h2h/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: team_h2h\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// Player H2H — the two players being compared (GET/POST selection, POST
// pushes a 'refresh' so a live scene swaps), plus show/hide.
router.get('/overlay/player_h2h/selection', (req, res) => {
  res.set({ "Cache-Control": "no-store" }).json(playerH2H.get());
});
router.post('/overlay/player_h2h/selection', (req, res) => {
  const sel = playerH2H.set(req.body || {});
  state.overlayClients.forEach(c => { try { c.write('event: player_h2h\ndata: {"action":"refresh"}\n\n'); } catch {} });
  res.json({ ok: true, selection: sel });
});
router.get('/overlay/player_h2h/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'playerh2h';
  state.overlayClients.forEach(c => { try { c.write('event: player_h2h\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});
router.get('/overlay/player_h2h/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: player_h2h\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// Map Placement AVG — own map pick, same pattern as Zowned Rate above.
router.get('/overlay/map_placement_avg/selection', (req, res) => {
  res.set({ "Cache-Control": "no-store" }).json({ map: elimsMap.get('map_placement_avg'), maps: elimsMap.ELIMS_MAPS });
});
router.post('/overlay/map_placement_avg/selection', (req, res) => {
  const map = elimsMap.set(String((req.body || {}).map || ''), 'map_placement_avg');
  if (!map) return res.status(400).json({ ok: false, error: 'unknown map' });
  state.overlayClients.forEach(c => { try { c.write('event: map_placement_avg\ndata: {"action":"refresh"}\n\n'); } catch {} });
  res.json({ ok: true, map });
});
router.get('/overlay/map_placement_avg/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'mapplacementavg';
  state.overlayClients.forEach(c => { try { c.write('event: map_placement_avg\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});
router.get('/overlay/map_placement_avg/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: map_placement_avg\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/average_placement/show|hide — Average Placement (rank-header
// family; activeFeature is 'averageplacement').
router.get('/overlay/average_placement/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'averageplacement';
  state.overlayClients.forEach(c => { try { c.write('event: average_placement\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});
router.get('/overlay/average_placement/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: average_placement\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/zowned_rate/show
router.get('/overlay/zowned_rate/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'zownedrate';
  state.overlayClients.forEach(c => { try { c.write('event: zowned_rate\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/zowned_rate/hide
router.get('/overlay/zowned_rate/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: zowned_rate\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/point_contribution/show|hide — Point Contribution (per-player
// clone of Team Point Percent). Rank-header family; activeFeature is
// 'pointcontribution'.
router.get('/overlay/point_contribution/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'pointcontribution';
  state.overlayClients.forEach(c => { try { c.write('event: point_contribution\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});
router.get('/overlay/point_contribution/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: point_contribution\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/team_point_percent/show
router.get('/overlay/team_point_percent/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'teampointpct';
  state.overlayClients.forEach(c => { try { c.write('event: team_point_percent\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/team_point_percent/hide
router.get('/overlay/team_point_percent/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: team_point_percent\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/qual_elim_leaders/show
router.get('/overlay/qual_elim_leaders/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'qualelimleaders';
  state.overlayClients.forEach(c => { try { c.write('event: qual_elim_leaders\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/qual_elim_leaders/hide
router.get('/overlay/qual_elim_leaders/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: qual_elim_leaders\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/total_team_elims/show
router.get('/overlay/total_team_elims/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'totalteamelims';
  state.overlayClients.forEach(c => { try { c.write('event: total_team_elims\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/total_team_elims/hide
router.get('/overlay/total_team_elims/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: total_team_elims\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/qual_team_elims/show|hide — Qualifier Team Elims (clone of Group
// Team Elims, Qualifier tabs only). Rank-header family; activeFeature is
// 'qualteamelims'.
router.get('/overlay/qual_team_elims/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'qualteamelims';
  state.overlayClients.forEach(c => { try { c.write('event: qual_team_elims\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});
router.get('/overlay/qual_team_elims/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: qual_team_elims\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/group_team_elims/show
router.get('/overlay/group_team_elims/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'groupteamelims';
  state.overlayClients.forEach(c => { try { c.write('event: group_team_elims\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/playoffs_team_elims/show
router.get('/overlay/playoffs_team_elims/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'playoffsteamelims';
  state.overlayClients.forEach(c => { try { c.write('event: playoffs_team_elims\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/playoffs_team_elims/hide
router.get('/overlay/playoffs_team_elims/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: playoffs_team_elims\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/group_team_elims/hide
router.get('/overlay/group_team_elims/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: group_team_elims\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/tournament_schedule/show
router.get('/overlay/tournament_schedule/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'tournamentschedule';
  state.overlayClients.forEach(c => { try { c.write('event: tournament_schedule\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/tournament_schedule/hide
router.get('/overlay/tournament_schedule/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: tournament_schedule\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// Team Lineup — one scene, 3 pages. page route also works while hidden (stores
// the page for the next Show) and broadcasts so a live scene swaps pages.
router.get('/overlay/team_lineup/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'teamlineup';
  state.overlayClients.forEach(c => { try { c.write('event: team_lineup\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});
router.get('/overlay/team_lineup/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: team_lineup\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});
router.get('/overlay/team_lineup/page/:n', (req, res) => {
  const n = Math.min(3, Math.max(1, parseInt(req.params.n, 10) || 1));
  state.fullscreenScene.teamLineupPage = n;
  state.overlayClients.forEach(c => { try { c.write('event: team_lineup\ndata: {"action":"page","page":' + n + '}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "page", page: n });
});

// GET /overlay/prize_pool/show
router.get('/overlay/prize_pool/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'prizepool';
  state.overlayClients.forEach(c => { try { c.write('event: prize_pool\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/prize_pool/hide
router.get('/overlay/prize_pool/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: prize_pool\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/map_winner/show — rank-header family (same as Prize Pool
// above): just activeFeature + the feature's own SSE event.
router.get('/overlay/map_winner/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'mapwinner';
  state.overlayClients.forEach(c => { try { c.write('event: map_winner\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/map_winner/hide
router.get('/overlay/map_winner/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: map_winner\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/map_mvp/show — rank-header family (same as Map Winner
// above): just activeFeature + the feature's own SSE event. The picked
// player lives in map_mvp_selection.json (routes/devapi.js).
router.get('/overlay/map_mvp/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'mapmvp';
  state.overlayClients.forEach(c => { try { c.write('event: map_mvp\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/map_mvp/hide
router.get('/overlay/map_mvp/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: map_mvp\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/post_qualified/show — same rank-header family as Overall/
// Map/Group Ranking, Map Rotation, Tournament Schedule, Prize Pool above:
// no matchboard/middleboard touching here, Fullscreen.html's own
// transitionToImpl already hides both for any non-Post feature.
router.get('/overlay/post_qualified/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'postqualified';
  state.overlayClients.forEach(c => { try { c.write('event: post_qualified\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/post_qualified/hide
router.get('/overlay/post_qualified/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: post_qualified\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/map_highlights/show — plain scene, no Matchboard/
// Middleboard/header: no board state touched here, same reasoning as
// post_qualified above.
router.get('/overlay/map_highlights/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'maphighlights';
  state.overlayClients.forEach(c => { try { c.write('event: map_highlights\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/map_highlights/hide
router.get('/overlay/map_highlights/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: map_highlights\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/highlights/show
router.get('/overlay/highlights/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'highlights';
  state.overlayClients.forEach(c => { try { c.write('event: highlights\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/highlights/hide
router.get('/overlay/highlights/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: highlights\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/mvp/show
router.get('/overlay/mvp/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'mvp';
  state.overlayClients.forEach(c => { try { c.write('event: mvp\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/mvp/hide
router.get('/overlay/mvp/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: mvp\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/credits/show
router.get('/overlay/credits/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'credits';
  state.overlayClients.forEach(c => { try { c.write('event: credits\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/credits/hide
router.get('/overlay/credits/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: credits\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/final_team/show
router.get('/overlay/final_team/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'finalteam';
  state.overlayClients.forEach(c => { try { c.write('event: final_team\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/final_team/hide
router.get('/overlay/final_team/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: final_team\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/team_lineup_blue/show
router.get('/overlay/team_lineup_blue/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'lineupblue';
  state.overlayClients.forEach(c => { try { c.write('event: team_lineup_blue\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/team_lineup_blue/hide
router.get('/overlay/team_lineup_blue/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: team_lineup_blue\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/team_lineup_red/show
router.get('/overlay/team_lineup_red/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'lineupred';
  state.overlayClients.forEach(c => { try { c.write('event: team_lineup_red\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/team_lineup_red/hide
router.get('/overlay/team_lineup_red/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: team_lineup_red\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/herolineup/show
router.get('/overlay/herolineup/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'herolineup';
  state.overlayClients.forEach(c => { try { c.write('event: herolineup\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/herolineup/hide
router.get('/overlay/herolineup/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: herolineup\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/today_schedule/show
// Pressing Show again while the scene is ALREADY live doesn't re-trigger
// the whole scene — it cycles a "currently being talked about" highlight
// through each match row instead (grows 1.15x), one row per press, then
// back to nothing. Match count (2 vs 3) follows the same isDay2 rule as
// Fullscreen.html's msToMatchRows, so the cycle length matches whatever's
// actually on screen.
router.get('/overlay/today_schedule/show', (req, res) => {
  if (state.fullscreenScene.activeFeature === 'schedule') {
    const ms = matchState.get();
    const maxMatches = (ms.day || 1) === 2 ? 3 : 2;
    const cur  = state.fullscreenScene.scheduleHighlight || 0;
    const next = cur >= maxMatches ? 0 : cur + 1;
    state.fullscreenScene.scheduleHighlight = next;
    state.overlayClients.forEach(c => { try { c.write('event: today_schedule\ndata: ' + JSON.stringify({ action: 'highlight', match: next }) + '\n\n'); } catch {} });
    return res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "highlight", match: next });
  }
  state.fullscreenScene.activeFeature = 'schedule';
  state.fullscreenScene.scheduleHighlight = 0;
  state.overlayClients.forEach(c => { try { c.write('event: today_schedule\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/today_schedule/hide
router.get('/overlay/today_schedule/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.fullscreenScene.scheduleHighlight = 0;
  state.overlayClients.forEach(c => { try { c.write('event: today_schedule\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/tomorrow_schedule/show
router.get('/overlay/tomorrow_schedule/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'tomorrow';
  state.overlayClients.forEach(c => { try { c.write('event: tomorrow_schedule\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/tomorrow_schedule/hide
router.get('/overlay/tomorrow_schedule/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: tomorrow_schedule\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/fs/debugoff
router.get('/overlay/fs/debugoff', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: fs_debugoff\ndata: {}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true });
});

// GET /overlay/fs/hide
router.get('/overlay/fs/hide', (req, res) => {
  state.fullscreenScene = { matchboard: false, middleboard: false, activeFeature: null, scheduleHighlight: 0 };
  state.overlayClients.forEach(c => {
    try {
      c.write('event: matchboard\ndata: {"action":"hide"}\n\n');
      c.write('event: middleboard\ndata: {"action":"hide"}\n\n');
      c.write('event: fs_hide\ndata: {}\n\n');
    } catch {}
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true });
});

// GET /overlay/fullscreen-scene — current fullscreen display state for restore-on-load
router.get('/overlay/fullscreen-scene', (req, res) => {
  res.set({ 'Cache-Control': 'no-store' }).json(state.fullscreenScene);
});

// GET /overlay/post_items/show
router.get('/overlay/post_items/show', (req, res) => {
  state.fullscreenScene.matchboard = true;
  state.fullscreenScene.middleboard = true;
  state.fullscreenScene.activeFeature = 'items';
  state.overlayClients.forEach(c => {
    try {
      c.write('event: matchboard\ndata: {"action":"show"}\n\n');
      c.write('event: middleboard\ndata: {"action":"show"}\n\n');
      c.write('event: post_items\ndata: {"action":"show"}\n\n');
    } catch {}
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/post_items/hide
router.get('/overlay/post_items/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: post_items\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/debugoff — hide debug bars on all overlays
router.get('/overlay/debugoff', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: debugoff\ndata: {}\n\n'); } catch {} });
  res.set({ 'Cache-Control': 'no-store' }).json({ ok: true });
});

// GET /overlay/features — return current feature toggle states
router.get('/overlay/features', (req, res) => {
  res.set({ 'Cache-Control': 'no-store' }).json(state.featureToggles);
});

// GET /overlay/feature/:feature/enable|disable
const VALID_FEATURES = ['fights','debugphotos'];
router.get('/overlay/feature/:feature/:action', (req, res) => {
  const { feature, action } = req.params;
  if (!VALID_FEATURES.includes(feature) || !['enable','disable'].includes(action)) {
    return res.status(400).json({ ok: false, error: 'unknown feature or action' });
  }
  const enabled = action === 'enable';
  state.featureToggles[feature] = enabled;
  const payload = JSON.stringify({ feature, enabled });
  state.overlayClients.forEach(c => { try { c.write(`event: featuretoggle\ndata: ${payload}\n\n`); } catch {} });
  res.set({ 'Cache-Control': 'no-store' }).json({ ok: true, feature, enabled });
});

// GET /overlay/apis — current per-API enable/disable states (Settings page)
router.get('/overlay/apis', (req, res) => {
  res.set({ 'Cache-Control': 'no-store' }).json(state.apiEnabled);
});

// GET /overlay/api/:api/enable|disable — flips whether that API's poller/
// proxy actually hits its upstream (see lib/pollers.js, lib/hrmPoller.js,
// and routes/devapi.js's *-data proxies).
const VALID_APIS = ['game','hrm','postinfo','hexagon','highlights'];
router.get('/overlay/api/:api/:action', (req, res) => {
  const { api, action } = req.params;
  if (!VALID_APIS.includes(api) || !['enable','disable'].includes(action)) {
    return res.status(400).json({ ok: false, error: 'unknown api or action' });
  }
  const enabled = action === 'enable';
  state.apiEnabled[api] = enabled;
  const payload = JSON.stringify({ api, enabled });
  state.overlayClients.forEach(c => { try { c.write(`event: apitoggle\ndata: ${payload}\n\n`); } catch {} });
  res.set({ 'Cache-Control': 'no-store' }).json({ ok: true, api, enabled });
});

// GET/POST /overlay/:slot — generic show/hide slot handler (must be LAST)
router.all('/overlay/:slot', (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const slot = req.params.slot.replace(/\/+$/, '');
  if (slot === "hide") {
    state.overlayClients.forEach(c => { try { c.write('event: hide\ndata: {}\n\n'); } catch {} });
  } else {
    const msg = `event: show\ndata: ${JSON.stringify({ slot })}\n\n`;
    state.overlayClients.forEach(c => { try { c.write(msg); } catch {} });
  }
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: slot === "hide" ? "hide" : "show", slot });
});

// Lower Thirds (LowerThirds.html) — independent tags, no activeFeature slot.
// One SSE event, 'lowerthird', { action, type }; the page itself fetches the
// current Dynamic-tab comment when a 'comment' show arrives with no text.
function lowerThirdBroadcast(payload) {
  const msg = 'event: lowerthird\ndata: ' + JSON.stringify(payload) + '\n\n';
  state.overlayClients.forEach(c => { try { c.write(msg); } catch {} });
}
router.get('/overlay/lowerthird/comment/show', (req, res) => {
  state.checkOverlays.lowerthird_comment = true;
  lowerThirdBroadcast({ action: 'show', type: 'comment' }); // state restored via /overlay/check-overlays
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});
router.get('/overlay/lowerthird/comment/hide', (req, res) => {
  state.checkOverlays.lowerthird_comment = false;
  lowerThirdBroadcast({ action: 'hide', type: 'comment' });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});
// Player H2H L3 — same picked pair as the Player H2H scene (player_h2h.json);
// a 'player_h2h' refresh event (pair changed) swaps it while on air.
router.get('/overlay/lowerthird/player_h2h/show', (req, res) => {
  state.checkOverlays.lowerthird_player_h2h = true;
  lowerThirdBroadcast({ action: 'show', type: 'playerh2h' });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});
router.get('/overlay/lowerthird/player_h2h/hide', (req, res) => {
  state.checkOverlays.lowerthird_player_h2h = false;
  lowerThirdBroadcast({ action: 'hide', type: 'playerh2h' });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});
router.get('/overlay/lowerthird/team_h2h/show', (req, res) => {
  state.checkOverlays.lowerthird_team_h2h = true;
  lowerThirdBroadcast({ action: 'show', type: 'teamh2h' });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});
router.get('/overlay/lowerthird/team_h2h/hide', (req, res) => {
  state.checkOverlays.lowerthird_team_h2h = false;
  lowerThirdBroadcast({ action: 'hide', type: 'teamh2h' });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});
router.get('/overlay/lowerthird/hideall', (req, res) => {
  state.checkOverlays.lowerthird_comment = false;
  state.checkOverlays.lowerthird_player_h2h = false;
  state.checkOverlays.lowerthird_team_h2h = false;
  lowerThirdBroadcast({ action: 'hideall' });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hideall" });
});

module.exports = router;
