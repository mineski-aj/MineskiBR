/* ── [FEATURE: killevents] — Ingame Events → Kill Events ──
   Pops a flashy lower third when a player reaches 5 kills (MERCENARY!) or 10
   kills (ULTIMATE MERCENARY!) on the CURRENT map. Kills come from the live
   Tally sheet (/api/map-mvp-players = lib/tallyRoster.js getMapPlayerKills:
   every squad on the live tab with each player's K on the current map),
   polled here; the sheet itself refreshes every ~3.5s server-side.

   Detection rules:
   - The first poll on a page / on a new map only seeds a baseline — a page
     (re)loaded mid-map never replays old milestones.
   - Only the HIGHEST tier newly crossed fires (4→10 in one poll = ULTIMATE
     only), and a tier fires once per player per map even if the sheet
     briefly dips and recovers.
   - Popups queue and play one at a time: 0.9s in, 3s hold, 0.5s out.
   - Arm/disarm: the Control tab's Ingame Events → Kill Events toggle
     (featuretoggle SSE / GET /overlay/features). Disabled still tracks
     baselines silently so re-enabling mid-map doesn't flood.
   - 'ingame_event' SSE { action:'kill_test', tier, name, team, country } is the
     Control tab's "on air" test; keTest(tier) is the local-only preview. ── */

(function killEvents() {
  var scene = document.getElementById('scene');
  var isPreviewFrame = /[?&]preview=1(?:&|$)/.test(window.location.search);

  var TIERS = [
    { tier: 2, kills: 10, title: 'ULTIMATE MERCENARY!' },
    { tier: 1, kills: 5,  title: 'MERCENARY!' },
  ];
  var IN_MS = 900, HOLD_MS = 3000, OUT_MS = 500;
  var POLL_MS = 2000;

  /* ── DOM (every piece independently positionable — see ingame.css) ── */
  var root = document.createElement('div');
  root.id = 'ke-root';
  root.innerHTML =
    '<div id="ke-glow" class="ke-el"></div>' +
    '<div id="ke-bar" class="ke-el"></div>' +
    '<div id="ke-accent" class="ke-el"></div>' +
    '<div id="ke-shine" class="ke-el"></div>' +
    '<img id="ke-photo" class="ke-el" src="" alt="">' +
    '<div id="ke-title" class="ke-el ke-flex"><span></span></div>' +
    '<div id="ke-name" class="ke-el ke-flex"><span></span></div>' +
    '<div id="ke-team" class="ke-el ke-flex"><span></span></div>' +
    '<div id="ke-kills-num" class="ke-el ke-flex"><span></span></div>' +
    '<div id="ke-kills-label" class="ke-el ke-flex"><span>ELIMS</span></div>' +
    '<div id="ke-flash" class="ke-el"></div>' +
    '<div id="ke-sparks"></div>';
  scene.appendChild(root);
  function $(id) { return document.getElementById(id); }
  function txt(id) { return $(id).querySelector('span'); }

  function fit(boxId, max, min) {
    var box = $(boxId), sp = txt(boxId), size = max;
    box.style.fontSize = size + 'px';
    while (sp.scrollWidth > box.clientWidth - 4 && size > min) box.style.fontSize = (--size) + 'px';
  }

  /* Probe the player's photo first. No photo file (or no team) = .ke-nophoto, which slides the
     title/name/team into the space the photo would have taken (see ingame.css) instead of
     showing a placeholder silhouette. cb(hasPhoto) */
  function photoFor(p, cb) {
    var img = $('ke-photo');
    if (!p.team || !p.name) { img.style.display = 'none'; return cb(false); }
    var url = '/photos/FRONT/' + encodeURIComponent(p.team) + '/' + encodeURIComponent(p.name) + '.png';
    var probe = new Image(), done = false;
    function end(ok) {
      if (done) return; done = true;
      if (ok) { img.style.display = ''; img.src = url; } else img.style.display = 'none';
      cb(ok);
    }
    probe.onload = function () { end(true); };
    probe.onerror = function () { end(false); };
    setTimeout(function () { end(false); }, 1500);   // a hung request must not block the popup
    probe.src = url;
  }

  function sparks(tier) {
    var wrap = $('ke-sparks'); wrap.innerHTML = '';
    var n = tier === 2 ? 28 : 16;
    for (var i = 0; i < n; i++) {
      var s = document.createElement('div');
      s.className = 'ke-spark';
      var a = Math.random() * Math.PI * 2, d = 120 + Math.random() * (tier === 2 ? 420 : 300);
      s.style.setProperty('--dx', Math.round(Math.cos(a) * d * 1.6) + 'px');
      s.style.setProperty('--dy', Math.round(Math.sin(a) * d * .7) + 'px');
      s.style.animationDelay = Math.round(Math.random() * 120) + 'ms';
      wrap.appendChild(s);
    }
  }

  /* ── playback queue ── */
  var queue = [], playing = false, timers = [], watchdog = null;
  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function play(item, hold) {
    playing = true;
    var def = TIERS.filter(function (t) { return t.tier === item.tier; })[0] || TIERS[1];
    clearTimeout(watchdog);
    /* Safety net: whatever goes wrong mid-popup, never stay "playing" forever (that would
       silently swallow every later milestone). */
    if (!hold) watchdog = setTimeout(function () { if (playing) { console.warn('[killevents] watchdog reset'); finish(); } }, IN_MS + HOLD_MS + OUT_MS + 4000);
    photoFor(item, function (hasPhoto) {
      if (!playing) return;                   // cancelled (keTest/finish) while probing
      try {
      root.className = 'ke-on ke-t' + def.tier + (hasPhoto ? '' : ' ke-nophoto');
      txt('ke-title').textContent = def.title;
      txt('ke-name').textContent = item.name || '';
      txt('ke-team').textContent = (item.country ? item.country + ' - ' : '') + (item.team || '');
      txt('ke-kills-num').textContent = String(item.kills != null ? item.kills : def.kills);
      void root.offsetWidth;                  // real layout before measuring
      fit('ke-title', 78, 36); fit('ke-name', 36, 18); fit('ke-team', 26, 14);
      root.classList.add('ke-in');
      later(function () { sparks(def.tier); }, 450);
      if (hold) return;                       // Edit-tab demo: stay on screen
      later(function () { root.classList.add('ke-out'); }, IN_MS + HOLD_MS);
      later(finish, IN_MS + HOLD_MS + OUT_MS);
      } catch (e) { console.error('[killevents] play failed', e); finish(); }
    });
  }
  function finish() {
    clearTimers();
    clearTimeout(watchdog);
    root.className = '';
    $('ke-sparks').innerHTML = '';
    playing = false;
    if (queue.length) play(queue.shift());
  }
  function enqueue(item) { if (playing) queue.push(item); else play(item); }

  /* ── arm / disarm ── */
  var enabled = true;
  fetch('/overlay/features', { cache: 'no-store' }).then(function (r) { return r.json(); })
    .then(function (d) { enabled = !(d && d.killevents === false); }).catch(function () {});

  /* ── milestone detection ── */
  var baseMap = null, last = {}, fired = {};
  function poll() {
    fetch('/api/map-mvp-players', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.teams || !d.teams.length) return;
      var mapKey = (d.sheet || '') + '|' + (d.map || '');
      var seeding = baseMap !== mapKey;
      if (seeding) { baseMap = mapKey; last = {}; fired = {}; }
      d.teams.forEach(function (t) {
        t.players.forEach(function (p) {
          var key = t.name + '||' + p.name, prev = last[key], k = p.kills || 0;
          last[key] = k;
          if (seeding || prev == null) {
            // baseline: whatever tier they're already past counts as "seen"
            TIERS.forEach(function (tr) { if (k >= tr.kills) fired[key] = Math.max(fired[key] || 0, tr.tier); });
            return;
          }
          var hit = TIERS.filter(function (tr) { return k >= tr.kills && tr.tier > (fired[key] || 0); })[0];
          if (!hit) return;
          fired[key] = hit.tier;
          if (!enabled) return;
          console.log('[killevents] milestone', hit.tier, t.name, p.name, k);
          enqueue({ tier: hit.tier, name: p.name, team: t.name, country: t.region, kills: k });
        });
      });
    }).catch(function (e) { console.warn('[killevents] poll failed', e); });
  }
  if (!isPreviewFrame) { setInterval(poll, POLL_MS); poll(); }

  /* ── SSE (live pages only — a preview frame stays isolated from real broadcast) ── */
  if (!isPreviewFrame) {
    var sse = createOverlaySSE();
    sse.addEventListener('featuretoggle', function (e) {
      try { var d = JSON.parse(e.data); if (d.feature === 'killevents') enabled = !!d.enabled; } catch (err) {}
    });
    sse.addEventListener('ingame_event', function (e) {
      try {
        var d = JSON.parse(e.data);
        if (d.action === 'kill_test') enqueue({ tier: d.tier === 2 ? 2 : 1, name: d.name, team: d.team, country: d.country, kills: d.kills });
      } catch (err) {}
    });
  }

  /* ── local test hooks (Control-tab Preview buttons / Edit tab) ── */
  var SAMPLE = { name: 'IVY VoìdGIZY', team: 'POISON IVY GIZY', country: 'PH' };
  window.keTest = function (tier, player) {
    var t = tier === 2 ? 2 : 1;
    clearTimers(); queue = []; root.className = ''; playing = false;
    play(Object.assign({ tier: t, kills: t === 2 ? 10 : 5 }, SAMPLE, player || {}));
  };
  /* Edit tab: frozen on screen (no out) so the pieces can be dragged around. */
  window.keShowDemo = function () {
    clearTimers(); queue = []; root.className = ''; playing = false;
    play(Object.assign({ tier: 1, kills: 5 }, SAMPLE), true);
  };

  /* Per-element position/size overrides saved from the dashboard Edit tab. */
  fetch('/api/overlay-styles?file=ingame_events', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (styles) {
    if (!styles || !Object.keys(styles).length) return;
    var css = Object.keys(styles).map(function (sel) {
      return sel + '{' + Object.keys(styles[sel]).filter(function (p) { return p !== 'asset'; }).map(function (p) {
        return (p === 'fontSize' ? 'font-size' : p) + ':' + styles[sel][p] + ' !important';
      }).join(';') + '}';
    }).join('\n');
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  }).catch(function () {});
})();
