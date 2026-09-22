/* ── overlay-debug.js — poll loop bootstrap + scoreboard/reload SSE ── */

setInterval(masterPoll, 1000);
masterPoll();

(function() {
  // Backed by the shared SharedWorker (html/js/overlay-shared-worker.js) —
  // this page opens zero real connections of its own now, so having
  // several overlay browser sources/tabs open at once no longer eats into
  // the browser's shared connection pool per page. ingame.html must
  // load html/js/overlay-sse-shim.js before this file for createOverlaySSE
  // to exist.
  var sse = createOverlaySSE();

  /* Dashboard Edit tab's own live preview (loadIframe() always appends
     ?preview=1) — used below to exempt this instance from the 'reload'
     SSE event. */
  var isPreviewFrame = /[?&]preview=1(?:&|$)/.test(window.location.search);

  /* Fired by routes/overlayStyles.js after any Edit-tab Save — force a
     hard reload so new position/size overrides apply immediately.
     isPreviewFrame is exempt — this IS the Edit tab's own live preview,
     already showing the just-saved values. */
  sse.addEventListener('reload', function() { if (isPreviewFrame) return; window.location.reload(); });

  sse.addEventListener('scoreboard', function(e) {
    try {
      var d = JSON.parse(e.data);
      if (typeof sbHandleToggle === 'function') sbHandleToggle(d.action === 'show');
    } catch {}
  });
})();
