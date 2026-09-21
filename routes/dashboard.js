// routes/dashboard.js — root redirect
const express = require('express');
const router  = express.Router();
const path    = require('path');

// Root → serve dashboard.html
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../html/dashboard.html'));
});

module.exports = router;
