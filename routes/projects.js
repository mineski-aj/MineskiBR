// routes/projects.js — GET/POST /api/projects*
// Named per-show profiles (overlay picks + layout) — see lib/projects.js.
const express  = require('express');
const fs       = require('fs');
const multer   = require('multer');
const router   = express.Router();
const projects = require('../lib/projects');

// POST /api/projects/:id/assets/:overlay — upload a replacement image/video
// for one Edit-tab element (see the `asset` override property, applied by
// every overlay page's own loadXOverrides() and by dashboard.html's
// applyToEditIframe()). Stored under projects/<id>/assets/<overlay>/,
// served for free by server.js's existing express.static over the repo
// root — no dedicated download route needed.
const ASSET_MIME_RE = /^(image\/(png|jpeg|webp|gif)|video\/(webm|mp4))$/;
const assetUpload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      try {
        var dir = projects.assetDir(req.params.id, req.params.overlay);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (e) { cb(e); }
    },
    filename: function (req, file, cb) {
      cb(null, Date.now() + '-' + projects.sanitizeForPath(file.originalname));
    },
  }),
  limits: { fileSize: projects.MAX_ASSET_BYTES },
  fileFilter: function (req, file, cb) {
    cb(null, ASSET_MIME_RE.test(file.mimetype));
  },
});

router.get('/api/projects', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json({
    projects: projects.listProjects(),
    active: projects.getActiveProject(),
  });
});

router.get('/api/projects/:id/enabled-overlays', function (req, res) {
  res.set({ 'Cache-Control': 'no-store' }).json({ enabled: projects.getEnabledOverlays(req.params.id) });
});

router.post('/api/projects', function (req, res) {
  var name = (req.body || {}).name;
  try {
    var meta = projects.createProject(name);
    res.json({ id: meta.id, name: meta.name });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/api/projects/active', function (req, res) {
  var id = (req.body || {}).id;
  if (id === undefined) id = null;
  try {
    projects.setActiveProject(id);
    res.json({ ok: true, active: id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/api/projects/:id/enabled-overlays', function (req, res) {
  var enabled = (req.body || {}).enabled;
  if (enabled !== null && !Array.isArray(enabled)) {
    return res.status(400).json({ error: 'enabled must be an array or null' });
  }
  try {
    projects.setEnabledOverlays(req.params.id, enabled);
    res.json({ ok: true, enabled: enabled });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/api/projects/:id/assets/:overlay', function (req, res) {
  if (!projects.projectExists(req.params.id)) {
    return res.status(404).json({ error: 'No such project: ' + req.params.id });
  }
  assetUpload.single('file')(req, res, function (err) {
    if (err) {
      var msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'File exceeds the 50MB limit'
        : (err.message || 'Upload failed');
      return res.status(400).json({ error: msg });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded, or unsupported file type (images: png/jpeg/webp/gif, video: webm/mp4)' });
    }
    var url = '/projects/' + encodeURIComponent(req.params.id) +
      '/assets/' + encodeURIComponent(projects.sanitizeForPath(req.params.overlay)) +
      '/' + encodeURIComponent(req.file.filename);
    res.json({ ok: true, url: url, filename: req.file.filename });
  });
});

module.exports = router;
