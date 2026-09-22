// lib/ssAnimatorBridge.js — ATEM SuperSource Animator bridge
// ─────────────────────────────────────────────────────────
// Ported from the standalone ss_server.js bridge so the SuperSource
// Animator tab (html/ss-animator.html) can live inside MineskiBR's own
// server/process instead of a second Node process. Same protocol the
// standalone browser UI already speaks: a WebSocket the UI connects to
// for live ATEM state + box commands, and plain HTTP GET trigger routes
// so a switcher/StreamDeck can fire a bank change (`/ss-animator/ss1/1`).
//
// The one real difference from the standalone version: the ATEM IP is
// no longer read from a `config.json` file that only this bridge knows
// about — it's read/written via routes/ssAnimator.js's `/api/atem-ip`,
// same "Settings tab owns the value, dashboard.html POSTs it" pattern
// every other API URL in this project already uses.
const { Atem } = require('atem-connection');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ATEM_IP_FILE = path.join(__dirname, '..', 'atem_ip.json');
const DEFAULT_ATEM_IP = '192.168.1.240';

function readAtemIp() {
  try { return JSON.parse(fs.readFileSync(ATEM_IP_FILE, 'utf8')).ip || DEFAULT_ATEM_IP; }
  catch (e) { return DEFAULT_ATEM_IP; }
}

function writeAtemIp(ip) {
  fs.writeFileSync(ATEM_IP_FILE, JSON.stringify({ ip }, null, 2));
}

// ── ATEM state ─────────────────────────────────────────────────
let atem = null;
let atemIp = readAtemIp();
let atemConnected = false;
let reconnectTimer = null;
const RECONNECT_INTERVAL = 5000;

// Bank registry — populated by the browser UI via "register_banks"
// Structure: { ss1: [ {name, duration, bg, boxes[]}, ... ], ss2: [...] }
let bankRegistry = { ss1: [], ss2: [] };

// Track active animations to prevent stacking
const animating = { ss1: false, ss2: false };

const wss = new WebSocketServer({ noServer: true });

function attach(httpServer) {
  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname !== '/ss-animator/ws') return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });
  connectATEM(atemIp);
}

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[SSANIM WS] Client connected: ${clientIp}`);

  send(ws, { type: 'bridge_status', atemConnected, atemIp });
  for (const ssrcId of [0, 1]) {
    const s = readSSrcState(ssrcId);
    if (s) send(ws, { type: 'ssrc_state', ssrc: ssrcId, ...s });
  }
  send(ws, { type: 'routes_updated', routes: buildRouteList() });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); }
    catch { return; }
    handleCmd(ws, msg);
  });

  ws.on('close', () => console.log(`[SSANIM WS] Client disconnected: ${clientIp}`));
  ws.on('error', (e) => console.error(`[SSANIM WS] Client error: ${e.message}`));
});

function handleCmd(ws, msg) {
  switch (msg.cmd) {

    case 'connect_atem': {
      clearTimeout(reconnectTimer);
      connectATEM(msg.ip || atemIp);
      break;
    }

    case 'register_banks': {
      if (msg.ss1) bankRegistry.ss1 = msg.ss1;
      if (msg.ss2) bankRegistry.ss2 = msg.ss2;
      const routes = buildRouteList();
      console.log(`[SSANIM WS] Banks registered — ${bankRegistry.ss1.length} SS1, ${bankRegistry.ss2.length} SS2`);
      broadcast({ type: 'routes_updated', routes });
      break;
    }

    case 'get_ssrc': {
      const ssrcId = msg.ssrc ?? 0;
      if (!requireATEM(ws)) return;
      const s = readSSrcState(ssrcId);
      if (s) send(ws, { type: 'ssrc_state', ssrc: ssrcId, ...s });
      else send(ws, { type: 'error', message: `SS${ssrcId + 1} not available on this ATEM` });
      break;
    }

    case 'set_ssrc': {
      const ssrcId = msg.ssrc ?? 0;
      if (!requireATEM(ws)) return;
      const ssProps = {};
      if (msg.bg != null) ssProps.artFillSource = msg.bg;
      if (msg.artFill != null) ssProps.artFillSource = msg.artFill;
      if (msg.artOption != null) ssProps.artOption = msg.artOption;
      if (Object.keys(ssProps).length) safe(() => atem.setSuperSourceProperties(ssProps, ssrcId));
      (msg.boxes || []).forEach((b, i) => {
        if (!b) return;
        const p = {};
        if (b.enabled !== undefined) p.enabled = b.enabled;
        if (b.source !== undefined) p.source = b.source;
        if (b.x !== undefined) p.x = Math.round(b.x);
        if (b.y !== undefined) p.y = Math.round(b.y);
        if (b.size !== undefined) p.size = parseFloat(Number(b.size).toFixed(4));
        safe(() => atem.setSuperSourceBoxSettings(p, i, ssrcId));
      });
      break;
    }

    case 'set_ssrc_bg': {
      const ssrcId = msg.ssrc ?? 0;
      if (!requireATEM(ws)) return;
      safe(() => atem.setSuperSourceProperties({ artFillSource: msg.source }, ssrcId));
      break;
    }

    case 'set_ssrc_art': {
      const ssrcId = msg.ssrc ?? 0;
      if (!requireATEM(ws)) return;
      const props = {};
      if (msg.artFill != null) props.artFillSource = msg.artFill;
      if (msg.artOption != null) props.artOption = msg.artOption;
      safe(() => atem.setSuperSourceProperties(props, ssrcId));
      break;
    }

    case 'set_ssrc_box_source': {
      const ssrcId = msg.ssrc ?? 0;
      const boxId = msg.box ?? 0;
      if (!requireATEM(ws)) return;
      safe(() => atem.setSuperSourceBoxSettings({ source: msg.source, enabled: msg.enabled }, boxId, ssrcId));
      break;
    }

    case 'set_ssrc_positions': {
      const ssrcId = msg.ssrc ?? 0;
      const boxes = msg.boxes ?? [];
      if (!requireATEM(ws)) return;
      boxes.forEach((b, i) => {
        if (!b) return;
        const p = {};
        if (b.x !== undefined) p.x = Math.round(b.x);
        if (b.y !== undefined) p.y = Math.round(b.y);
        if (b.size !== undefined) p.size = parseFloat(Number(b.size).toFixed(4));
        if (Object.keys(p).length > 0) safe(() => atem.setSuperSourceBoxSettings(p, i, ssrcId));
      });
      break;
    }

    default:
      console.warn(`[SSANIM WS] Unknown cmd: ${msg.cmd}`);
  }
}

// ── HTTP trigger support (routes/ssAnimator.js calls these) ────
// Path-only (no host) — the client builds the absolute URL itself from
// its own location.origin, since this bridge is reachable from whatever
// host/IP the dashboard itself was loaded from (LAN IP, localhost, etc).
function buildRouteList() {
  const routes = [];
  ['ss1', 'ss2'].forEach(ss => {
    bankRegistry[ss].forEach((bank, i) => {
      routes.push({
        path: `/ss-animator/${ss}/${i + 1}`,
        name: bank.name,
        duration: bank.duration,
        ssrc: ss === 'ss1' ? 1 : 2,
        bankIndex: i + 1,
      });
    });
  });
  return routes;
}

function triggerBank(ssKey, bankNum) {
  const ssrcId = ssKey === 'ss1' ? 0 : 1;
  if (!atemConnected) return { ok: false, status: 503, error: 'ATEM not connected' };

  const banks = bankRegistry[ssKey];
  if (!banks || banks.length === 0) {
    return { ok: false, status: 503, error: `No banks registered for ${ssKey.toUpperCase()}. Open the SS Animator tab first.` };
  }
  const bank = banks[bankNum - 1];
  if (!bank) return { ok: false, status: 404, error: `Bank ${bankNum} not found in ${ssKey.toUpperCase()}. Available: 1–${banks.length}` };
  if (animating[ssKey]) return { ok: false, status: 409, error: `${ssKey.toUpperCase()} animation already in progress` };

  const fromState = readSSrcState(ssrcId);
  if (!fromState) return { ok: false, status: 500, error: 'Could not read current ATEM state' };

  broadcast({ type: 'http_go', ssrc: ssrcId, bankIndex: bankNum - 1, name: bank.name });
  runAnimation(ssKey, ssrcId, fromState, bank);

  return { ok: true, ssrc: ssrcId + 1, bank: bankNum, name: bank.name, duration: bank.duration };
}

function runAnimation(ssKey, ssrcId, from, bank) {
  animating[ssKey] = true;

  const to = bank;
  const duration = bank.duration || 1000;
  const STEPS = 60;
  const interval = duration / STEPS;
  const startTime = Date.now();

  const ssrcProps = {};
  if (to.bg != null) ssrcProps.artFillSource = to.bg;
  if (to.artFill != null) ssrcProps.artFillSource = to.artFill;
  if (to.artOption != null) ssrcProps.artOption = to.artOption;
  if (Object.keys(ssrcProps).length > 0) safe(() => atem.setSuperSourceProperties(ssrcProps, ssrcId));
  to.boxes.forEach((tb, i) => {
    const fb = from.boxes[i];
    if (!tb) return;
    if (tb.source !== fb?.source || tb.enabled !== fb?.enabled) {
      safe(() => atem.setSuperSourceBoxSettings({ source: tb.source, enabled: tb.enabled }, i, ssrcId));
    }
  });

  // Driven by real elapsed time, not a fixed tick counter — this server
  // process also runs lib/pollers.js's polling loops, SSE broadcasts, and
  // regular HTTP traffic on the same event loop, so a setInterval tick can
  // arrive late under load. Counting "step++" per tick regardless of how
  // late it fired stretches the WHOLE animation out (every delayed tick
  // permanently pushes the finish line back), which is what made an
  // HTTP-triggered GO play in slow motion compared to the button-driven
  // one (client-side, its own mostly-idle browser timer). Computing `t`
  // from Date.now() instead means a late tick just catches up to where it
  // should already be — worst case a couple of intermediate frames are
  // skipped, but total playback time stays correct.
  const timer = setInterval(() => {
    const t = Math.min((Date.now() - startTime) / duration, 1);
    const eased = easeInOut(t);

    from.boxes.forEach((fb, i) => {
      const tb = to.boxes[i];
      if (!tb || !tb.enabled) return;
      safe(() => atem.setSuperSourceBoxSettings({
        x: Math.round(lerp(fb.x, tb.x, eased)),
        y: Math.round(lerp(fb.y, tb.y, eased)),
        size: parseFloat(lerp(fb.size, tb.size, eased).toFixed(4)),
      }, i, ssrcId));
    });

    if (t >= 1) {
      clearInterval(timer);
      animating[ssKey] = false;
      broadcast({ type: 'http_go_done', ssrc: ssrcId, name: bank.name });
    }
  }, interval);
}

function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
function lerp(a, b, t) { return a + (b - a) * t; }

function readSSrcState(ssrcId) {
  try {
    const ss = atem?.state?.video?.superSources?.[ssrcId];
    if (!ss) return null;
    const boxes = [];
    for (let i = 0; i < 4; i++) {
      const box = ss.boxes?.[i];
      boxes.push({
        enabled: box?.enabled ?? false,
        source: box?.source ?? 0,
        x: box?.x ?? 0,
        y: box?.y ?? 0,
        size: box?.size ?? 0.5,
      });
    }
    return {
      bg: ss.properties?.artFillSource ?? 0,
      artFill: ss.properties?.artFillSource ?? 0,
      artOption: ss.properties?.artOption ?? 0,
      boxes,
    };
  } catch (e) {
    console.error('[SSANIM ATEM] readSSrcState error:', e.message);
    return null;
  }
}

function connectATEM(ip) {
  if (atem) { try { atem.disconnect(); } catch (_) {} atem = null; }
  clearTimeout(reconnectTimer);
  atemIp = ip; atemConnected = false;
  writeAtemIp(ip);

  console.log(`[SSANIM ATEM] Connecting to ${ip}...`);
  broadcast({ type: 'bridge_status', atemConnected: false, atemIp: ip, message: `Connecting to ${ip}...` });

  atem = new Atem({ externalLog: () => {} });

  atem.on('connected', () => {
    atemConnected = true;
    clearTimeout(reconnectTimer);
    console.log(`[SSANIM ATEM] ✓ Connected to ${ip}`);
    broadcast({ type: 'bridge_status', atemConnected: true, atemIp: ip });
    setTimeout(() => {
      for (const ssrcId of [0, 1]) {
        const s = readSSrcState(ssrcId);
        if (s) broadcast({ type: 'ssrc_state', ssrc: ssrcId, ...s });
      }
    }, 800);
  });

  atem.on('disconnected', () => {
    atemConnected = false;
    console.log(`[SSANIM ATEM] Disconnected — retrying in ${RECONNECT_INTERVAL}ms...`);
    broadcast({ type: 'bridge_status', atemConnected: false, atemIp: ip });
    reconnectTimer = setTimeout(() => connectATEM(ip), RECONNECT_INTERVAL);
  });

  atem.on('error', (e) => console.error('[SSANIM ATEM] Error:', typeof e === 'string' ? e : e?.message || e));

  let lastPush = 0;
  atem.on('stateChanged', (_s, paths) => {
    if (!paths.some(p => p.startsWith('video.superSources'))) return;
    const posOnly = paths.every(p => /\.(x|y|size)$/.test(p));
    const now = Date.now();
    if (posOnly && now - lastPush < 200) return;
    lastPush = now;
    for (const ssrcId of [0, 1]) {
      if (!paths.some(p => p.includes(`superSources.${ssrcId}`) || p.includes(`superSources[${ssrcId}]`))) continue;
      const s = readSSrcState(ssrcId);
      if (s) broadcast({ type: 'ssrc_state', ssrc: ssrcId, ...s });
    }
  });

  atem.connect(ip);
}

function safe(fn) { try { fn(); } catch (e) { console.error('[SSANIM ATEM] Cmd error:', e.message); } }
function requireATEM(ws) {
  if (!atemConnected || !atem) { send(ws, { type: 'error', message: 'ATEM not connected' }); return false; }
  return true;
}
function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function broadcast(obj) { const m = JSON.stringify(obj); wss.clients.forEach(c => { if (c.readyState === 1) c.send(m); }); }

function getStatus() { return { atemConnected, atemIp }; }

module.exports = {
  attach,
  triggerBank,
  buildRouteList,
  getStatus,
  connectATEM,
  readAtemIp,
  writeAtemIp,
};
