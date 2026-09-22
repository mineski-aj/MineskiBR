// routes/ssAnimator.js — HTTP surface for the SuperSource Animator tab
// (see lib/ssAnimatorBridge.js for the actual ATEM/WebSocket logic).
const express = require('express');
const router = express.Router();
const bridge = require('../lib/ssAnimatorBridge');

// GET /ss-animator/routes — list all registered banks (mirrors the
// standalone bridge's GET /routes)
router.get('/ss-animator/routes', (req, res) => {
  const status = bridge.getStatus();
  res.set({ 'Cache-Control': 'no-store' }).json({ ok: true, ...status, routes: bridge.buildRouteList() });
});

// GET /ss-animator/ss1/:bank or /ss-animator/ss2/:bank — fire a bank
// animation, e.g. from a StreamDeck/switcher macro.
router.get('/ss-animator/:ssKey/:bank', (req, res) => {
  const ssKey = req.params.ssKey;
  const bank = parseInt(req.params.bank, 10);
  if ((ssKey !== 'ss1' && ssKey !== 'ss2') || !Number.isInteger(bank)) {
    return res.status(404).json({ ok: false, error: 'Unknown route. Try /ss-animator/ss1/1' });
  }
  const result = bridge.triggerBank(ssKey, bank);
  res.set({ 'Cache-Control': 'no-store' }).status(result.ok ? 200 : result.status).json(result);
});

// ATEM IP — flat single value, edited from the Settings tab.
router.get('/api/atem-ip', (req, res) => {
  res.set({ 'Cache-Control': 'no-store' }).json({ ip: bridge.readAtemIp(), connected: bridge.getStatus().atemConnected });
});

router.post('/api/atem-ip', (req, res) => {
  const ip = (req.body && req.body.ip || '').trim();
  if (!ip) return res.status(400).json({ ok: false, error: 'Missing ip' });
  bridge.connectATEM(ip);
  res.json({ ok: true, ip });
});

module.exports = router;
