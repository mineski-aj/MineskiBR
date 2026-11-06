// routes/led.js — all /led/* routes
const express = require('express');
const router  = express.Router();
const state   = require('../lib/state');
const ledTable = require('../lib/ledTable');

const noStore = { "Cache-Control": "no-store" };

router.get('/led/home', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: led_side\ndata: {"side":"home"}\n\n'); } catch {} });
  res.set(noStore).json({ ok: true, side: "home" });
});

router.get('/led/swap', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: led_side\ndata: {"side":"swap"}\n\n'); } catch {} });
  res.set(noStore).json({ ok: true, side: "swap" });
});

router.get('/led/fightshow', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: led_fight\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set(noStore).json({ ok: true, action: "show" });
});

router.get('/led/fighthide', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: led_fight\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set(noStore).json({ ok: true, action: "hide" });
});

router.get('/led/draftpredshow', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: led_draftpred\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set(noStore).json({ ok: true, action: "show" });
});

router.get('/led/draftpredhide', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: led_draftpred\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set(noStore).json({ ok: true, action: "hide" });
});

router.get('/led/winshow', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: led_win\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set(noStore).json({ ok: true, action: "show" });
});

router.get('/led/winhide', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: led_win\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set(noStore).json({ ok: true, action: "hide" });
});

router.get('/led/healthshow', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: led_health\ndata: {"action":"show"}\n\n'); } catch {} });
  res.set(noStore).json({ ok: true, action: "show" });
});

router.get('/led/healthhide', (req, res) => {
  state.overlayClients.forEach(c => { try { c.write('event: led_health\ndata: {"action":"hide"}\n\n'); } catch {} });
  res.set(noStore).json({ ok: true, action: "hide" });
});

// Grand Finals "Table Teams" — which squad sits in which LED slot (see lib/ledTable.js).
// GET  /api/led-table — { arranged, order:[10], featured:[2] }
// POST /api/led-table — { order:[...], featured:[...] } to save, or { reset:true }.
router.get('/api/led-table', (req, res) => {
  res.set(noStore).json(ledTable.get());
});

router.post('/api/led-table', (req, res) => {
  const body = req.body || {};
  if (body.mode !== undefined) ledTable.setMode(body.mode);   // { mode: 'standings' | 'table' } (may come alone)
  if (body.mode !== undefined && body.order === undefined && !body.reset) return res.json(Object.assign({ ok: true }, ledTable.get()));
  res.json(Object.assign({ ok: true }, body.reset ? ledTable.reset() : ledTable.set(body)));
});

// Team Introduction (LED) — one show/hide route per Grand Finals squad (lib/ledIntro.js).
// Showing a different squad while one is up swaps them (out animation, then in).
// GET /led/intro/list | /led/intro/state | /led/intro/hide | /led/intro/<slug>/show | /led/intro/<slug>/hide
const ledIntro = require('../lib/ledIntro');
state.ledIntro = state.ledIntro || { slug: null, name: null };
function ledIntroSend(payload) {
  const line = 'event: led_intro\ndata: ' + JSON.stringify(payload) + '\n\n';
  state.overlayClients.forEach(c => { try { c.write(line); } catch {} });
}
router.get('/led/intro/list', (req, res) => res.set(noStore).json({ teams: ledIntro.list() }));
router.get('/led/intro/state', (req, res) => res.set(noStore).json(state.ledIntro));
router.get('/led/intro/hide', (req, res) => {
  state.ledIntro = { slug: null, name: null };
  ledIntroSend({ action: 'hide' });
  res.set(noStore).json({ ok: true, action: 'hide' });
});
router.get('/led/intro/:slug/show', (req, res) => {
  const t = ledIntro.bySlug(req.params.slug);
  if (!t) return res.status(404).set(noStore).json({ ok: false, error: 'unknown team' });
  state.ledIntro = { slug: t.slug, name: t.name };
  state.ledChampion = { slug: null, name: null };   // Intro, Champion and Finals MVP are mutually exclusive on the wall
  state.ledFinalsMvp = { team: null, player: null };
  ledIntroSend({ action: 'show', slug: t.slug, name: t.name });
  res.set(noStore).json({ ok: true, action: 'show', team: t.name });
});
router.get('/led/intro/:slug/hide', (req, res) => {
  const t = ledIntro.bySlug(req.params.slug);
  if (!t) return res.status(404).set(noStore).json({ ok: false, error: 'unknown team' });
  if (state.ledIntro.slug === t.slug) state.ledIntro = { slug: null, name: null };
  ledIntroSend({ action: 'hide', slug: t.slug });
  res.set(noStore).json({ ok: true, action: 'hide', team: t.name });
});

// Champion LED — one show/hide route per Grand Finals squad (same 10 squads as Team Introduction).
// Same takeover shape as Team Intro; showing one squad while another is up swaps them, and showing it
// while a Team Intro is up replaces that intro. SSE event: led_champion { action, slug, name }.
// GET /led/champion/list | /led/champion/state | /led/champion/hide | /led/champion/<slug>/show | /led/champion/<slug>/hide
state.ledChampion = state.ledChampion || { slug: null, name: null };
function ledChampionSend(payload) {
  const line = 'event: led_champion\ndata: ' + JSON.stringify(payload) + '\n\n';
  state.overlayClients.forEach(c => { try { c.write(line); } catch {} });
}
router.get('/led/champion/list', (req, res) => res.set(noStore).json({ teams: ledIntro.list() }));
router.get('/led/champion/state', (req, res) => res.set(noStore).json(state.ledChampion));
router.get('/led/champion/hide', (req, res) => {
  state.ledChampion = { slug: null, name: null };
  ledChampionSend({ action: 'hide' });
  res.set(noStore).json({ ok: true, action: 'hide' });
});
router.get('/led/champion/:slug/show', (req, res) => {
  const t = ledIntro.bySlug(req.params.slug);
  if (!t) return res.status(404).set(noStore).json({ ok: false, error: 'unknown team' });
  state.ledChampion = { slug: t.slug, name: t.name };
  state.ledIntro = { slug: null, name: null };
  state.ledFinalsMvp = { team: null, player: null };
  ledChampionSend({ action: 'show', slug: t.slug, name: t.name });
  res.set(noStore).json({ ok: true, action: 'show', team: t.name });
});
router.get('/led/champion/:slug/hide', (req, res) => {
  const t = ledIntro.bySlug(req.params.slug);
  if (!t) return res.status(404).set(noStore).json({ ok: false, error: 'unknown team' });
  if (state.ledChampion.slug === t.slug) state.ledChampion = { slug: null, name: null };
  ledChampionSend({ action: 'hide', slug: t.slug });
  res.set(noStore).json({ ok: true, action: 'hide', team: t.name });
});

// Finals MVP (LED) — Champion LED's duplicate with ONE player: whoever is picked in the dashboard's Dynamic tab
// (Map MVP picker, map_mvp_selection.json — read fresh on every show, so a new pick is always what goes up).
// A single show/hide pair; show answers 409 and does nothing if no player is picked. SSE event led_finals_mvp { action, team, player }.
// GET /led/finalsmvp/show | /led/finalsmvp/hide | /led/finalsmvp/state
state.ledFinalsMvp = state.ledFinalsMvp || { team: null, player: null };
function ledFinalsMvpSend(payload) {
  const line = 'event: led_finals_mvp\ndata: ' + JSON.stringify(payload) + '\n\n';
  state.overlayClients.forEach(c => { try { c.write(line); } catch {} });
}
function readMvpPick() {
  try {
    const d = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'map_mvp_selection.json'), 'utf8'));
    return { team: String(d.team || '').trim(), player: String(d.player || '').trim() };
  } catch (e) { return { team: '', player: '' }; }
}
router.get('/led/finalsmvp/state', (req, res) => res.set(noStore).json(state.ledFinalsMvp));
router.get('/led/finalsmvp/show', (req, res) => {
  const pick = readMvpPick();
  if (!pick.team || !pick.player) return res.status(409).set(noStore).json({ ok: false, error: 'no MVP picked in the Dynamic tab' });
  state.ledFinalsMvp = pick;
  state.ledIntro = { slug: null, name: null };
  state.ledChampion = { slug: null, name: null };
  ledFinalsMvpSend({ action: 'show', team: pick.team, player: pick.player });
  res.set(noStore).json({ ok: true, action: 'show', team: pick.team, player: pick.player });
});
router.get('/led/finalsmvp/hide', (req, res) => {
  state.ledFinalsMvp = { team: null, player: null };
  ledFinalsMvpSend({ action: 'hide' });
  res.set(noStore).json({ ok: true, action: 'hide' });
});

module.exports = router;
