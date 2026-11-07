// routes/eliminated.js — Elim Tracker API (see lib/eliminated.js).
//   GET  /api/eliminated                      → { teams: ["SQUAD", ...] }
//   POST /api/eliminated { name, eliminated } → flips one squad, returns the new list
//   POST /api/eliminated { clear: true }      → un-eliminates everyone
const express = require('express');
const eliminated = require('../lib/eliminated');

const router = express.Router();

router.get('/api/eliminated', function (req, res) {
  res.set('Cache-Control', 'no-store').json(eliminated.get());
});

router.post('/api/eliminated', function (req, res) {
  const b = req.body || {};
  const out = b.clear === true ? eliminated.clear() : eliminated.setOne(b.name, b.eliminated !== false && b.eliminated !== 'false');
  res.set('Cache-Control', 'no-store').json(Object.assign({ ok: true }, out));
});

module.exports = router;
