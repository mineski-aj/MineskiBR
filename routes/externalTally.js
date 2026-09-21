// routes/externalTally.js — endpoints for the experimental "Tally" tab (see
// lib/externalTally.js). Separate from routes/tally.js on purpose: this
// mirrors someone else's Google Sheet, not this app's own collaborative
// state. The only "write" here is which sheet to read from (Settings tab),
// never anything in the sheet itself.
const express = require('express');
const router = express.Router();
const externalTally = require('../lib/externalTally');

router.get('/tally/external', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json(externalTally.get());
});

router.post('/tally/external/config', async function (req, res) {
  const result = await externalTally.setSourceUrl((req.body || {}).url);
  res.json(result);
});

module.exports = router;
