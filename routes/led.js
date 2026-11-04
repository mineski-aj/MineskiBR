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

module.exports = router;
