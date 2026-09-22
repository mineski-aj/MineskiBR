// routes/overlay.js — SSE + all /overlay/*
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const router  = express.Router();
const state   = require('../lib/state');
const matchState = require('../lib/matchState');

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

// GET /overlay/post_hearts/show
router.get('/overlay/post_hearts/show', (req, res) => {
  state.fullscreenScene.matchboard = true;
  state.fullscreenScene.middleboard = true;
  state.fullscreenScene.activeFeature = 'hearts';
  state.overlayClients.forEach(c => {
    try {
      c.write('event: matchboard\ndata: {"action":"show"}\n\n');
      c.write('event: middleboard\ndata: {"action":"show"}\n\n');
      c.write('event: post_hearts\ndata: {"action":"show"}\n\n');
    } catch {}
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/post_hearts/hide
router.get('/overlay/post_hearts/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: post_hearts\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/post_richguy/show
router.get('/overlay/post_richguy/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'richguy';
  state.overlayClients.forEach(c => { try { c.write('event: post_richguy\ndata: {"action":"show","data":{}}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/post_richguy/hide
router.get('/overlay/post_richguy/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: post_richguy\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
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

// GET /overlay/group_ranking/show
router.get('/overlay/group_ranking/show', (req, res) => {
  state.fullscreenScene.activeFeature = 'groupranking';
  state.overlayClients.forEach(c => { try { c.write('event: group_ranking\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/group_ranking/hide
router.get('/overlay/group_ranking/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: group_ranking\ndata: {"action":"hide"}\n\n'); } catch {} });
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

// GET /overlay/matchboard/show
router.get('/overlay/matchboard/show', (req, res) => {
  state.fullscreenScene.matchboard = true;
  state.overlayClients.forEach(c => { try { c.write('event: matchboard\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/matchboard/hide
router.get('/overlay/matchboard/hide', (req, res) => {
  state.fullscreenScene.matchboard = false;
  state.overlayClients.forEach(c => { try { c.write('event: matchboard\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/middleboard/show
router.get('/overlay/middleboard/show', (req, res) => {
  state.fullscreenScene.middleboard = true;
  state.overlayClients.forEach(c => { try { c.write('event: middleboard\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/middleboard/hide
router.get('/overlay/middleboard/hide', (req, res) => {
  state.fullscreenScene.middleboard = false;
  state.overlayClients.forEach(c => { try { c.write('event: middleboard\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
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

// GET /overlay/post_itemline/itemin
router.get('/overlay/post_itemline/itemin', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: post_itemline_itemin\ndata: {}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true });
});

// GET /overlay/post_itemline/itemout
router.get('/overlay/post_itemline/itemout', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: post_itemline_itemout\ndata: {}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true });
});

// GET /overlay/post_itemline/show
router.get('/overlay/post_itemline/show', (req, res) => {
  state.fullscreenScene.matchboard = true;
  state.fullscreenScene.activeFeature = 'itemline';
  state.overlayClients.forEach(c => {
    try {
      c.write('event: matchboard\ndata: {"action":"show"}\n\n');
      c.write('event: post_itemline\ndata: {"action":"show"}\n\n');
    } catch {}
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/post_itemline/hide
router.get('/overlay/post_itemline/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: post_itemline\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/post_emblems/show
router.get('/overlay/post_emblems/show', (req, res) => {
  state.fullscreenScene.matchboard = true;
  state.fullscreenScene.middleboard = true;
  state.fullscreenScene.activeFeature = 'emblems';
  state.overlayClients.forEach(c => {
    try {
      c.write('event: matchboard\ndata: {"action":"show"}\n\n');
      c.write('event: middleboard\ndata: {"action":"show"}\n\n');
      c.write('event: post_emblems\ndata: {"action":"show"}\n\n');
    } catch {}
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/post_emblems/hide
router.get('/overlay/post_emblems/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: post_emblems\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
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

// GET /overlay/post_stats/show
router.get('/overlay/post_stats/show', (req, res) => {
  state.fullscreenScene.matchboard = true;
  state.fullscreenScene.middleboard = true;
  state.fullscreenScene.activeFeature = 'stats';
  state.overlayClients.forEach(c => {
    try {
      c.write('event: matchboard\ndata: {"action":"show"}\n\n');
      c.write('event: middleboard\ndata: {"action":"show"}\n\n');
      c.write('event: post_stats\ndata: {"action":"show"}\n\n');
    } catch {}
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/post_stats/hide
router.get('/overlay/post_stats/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: post_stats\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/consolidated_post/show
router.get('/overlay/consolidated_post/show', (req, res) => {
  state.fullscreenScene.matchboard = true;
  state.fullscreenScene.activeFeature = 'consolidated_post';
  // Deliberately do NOT also broadcast a standalone 'matchboard' event here.
  // Fullscreen.html has its own independent 'matchboard' SSE listener (for the
  // Control tab's standalone Matchboard toggle) that calls showMatchBoard()
  // directly with no idea cp-compact is about to be applied — broadcasting
  // it here raced against showConsolidatedPost()'s own properly-sequenced
  // internal showMatchBoard() call, so the board would animate in at its
  // normal (non-compact) position first, then jump 36px once
  // showConsolidatedPost() finally added cp-compact. The dashboard's own
  // Matchboard toggle indicator still stays in sync without this broadcast:
  // it refetches the full /overlay/fullscreen-scene snapshot (which includes
  // this matchboard flag) off the 'consolidated_post' event alone.
  state.overlayClients.forEach(c => {
    try {
      c.write('event: consolidated_post\ndata: {"action":"show"}\n\n');
    } catch {}
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/consolidated_post/hide
router.get('/overlay/consolidated_post/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: consolidated_post\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/consolidated_post_2/show
router.get('/overlay/consolidated_post_2/show', (req, res) => {
  state.fullscreenScene.matchboard = true;
  state.fullscreenScene.activeFeature = 'consolidated_post_2';
  // Same reasoning as consolidated_post/show above: no standalone
  // 'matchboard' broadcast — showConsolidatedPost2() sequences the
  // cp-compact class itself before its own showMatchBoard() call.
  state.overlayClients.forEach(c => {
    try { c.write('event: consolidated_post_2\ndata: {"action":"show"}\n\n'); } catch {}
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/consolidated_post_2/hide
router.get('/overlay/consolidated_post_2/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: consolidated_post_2\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "hide" });
});

// GET /overlay/post4key/show
router.get('/overlay/post4key/show', (req, res) => {
  state.fullscreenScene.matchboard = true;
  state.fullscreenScene.activeFeature = 'post4key';
  // Same reasoning as consolidated_post/show above: no standalone
  // 'matchboard' broadcast — Fullscreen.html's own transitionTo() already
  // calls showMatchBoard() internally, and the dashboard's Matchboard
  // toggle stays in sync via the /overlay/fullscreen-scene refetch triggered
  // off the 'post4key' event alone.
  state.overlayClients.forEach(c => {
    try { c.write('event: post4key\ndata: {"action":"show"}\n\n'); } catch {}
  });
  res.set({ "Cache-Control": "no-store" }).json({ ok: true, action: "show" });
});

// GET /overlay/post4key/hide
router.get('/overlay/post4key/hide', (req, res) => {
  state.fullscreenScene.activeFeature = null;
  state.overlayClients.forEach(c => { try { c.write('event: post4key\ndata: {"action":"hide"}\n\n'); } catch {} });
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

module.exports = router;
