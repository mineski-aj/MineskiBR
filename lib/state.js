// lib/state.js — all mutable state, initialized from config
const { players, CAMP_MAP } = require('./config');

function freshPlayerStats() {
  const s = {};
  for (const pid of Object.keys(players)) {
    s[pid] = {
      bpm_samples:           [],
      ticks_above_120:       0,
      ticks_total:           0,
      objective_bpm_samples: [],
    };
  }
  return s;
}

// Initialize readings from players
const readings = {};
for (const [pid, info] of Object.entries(players)) {
  readings[pid] = { ...info, bpm: null, last_bpm: null, status: "disconnected", last_seen: null };
}

const state = {
  readings,
  gameState: { state: "unknown", battleid: null, game_time_s: 0, game_time_fmt: "00:00", paused: false },
  campSwapped: false,
  activeCampMap: { camp1: [...CAMP_MAP.camp1], camp2: [...CAMP_MAP.camp2] },
  campTricodes: { camp1: null, camp2: null },
  playerNames: {},
  postgamePlayerNames: {},
  bpmOnEnd: {},
  stats: freshPlayerStats(),
  prevKillLord: 0, prevKillTurtle: 0,
  clashSnapshots: [], prevTotalKills: 0,
  activeFight: null, fightLog: [], fightIdSeq: 0, lastPlayerSnap: {},
  prevSeatKDA: {}, itemLog: {}, prevItemCounts: {},
  prevC1Lord: 0, prevC2Lord: 0, prevC1Turtle: 0, prevC2Turtle: 0,
  prevC1Tower: 0, prevC2Tower: 0,
  gameEvents: [], positionLog: [], posWriteCounter: 0,
  overlayClients: [], fightsPendingAction: null,
  // scheduleHighlight: 0 = no row highlighted; 1/2/3 = that Today's
  // Schedule match row is currently "grown" (see routes/overlay.js's
  // /overlay/today_schedule/show — pressing Show again while the scene
  // is already live cycles this instead of re-triggering the scene).
  fullscreenScene: { matchboard: false, middleboard: false, activeFeature: null, scheduleHighlight: 0 },
  featureToggles: {
    fights:     true,
    debugphotos: false, // Fullscreen Consolidated Post player photos: off = live photos by name, on = random test photos
  },
  // Whether the scoreboard overlay is currently shown — lets the
  // dashboard toggle reflect true state on reload instead of resetting to
  // a guess.
  checkOverlays: {
    scoreboard: true,
  },
  // ingame_red.html / ingame_blue.html per-player heart-rate meter:
  // true = OFF (swapped to KDA + Gold block), false = LIVE (BPM meter
  // shown). Server-side so every open page (dashboard, ingame_red,
  // ingame_blue, vMix) reflects the same on/off state — this used to
  // live only in each browser's own localStorage, which never syncs
  // across separate browsers/machines.
  hrmOff: {
    player1: false, player2: false, player3: false, player4: false, player5: false,
    player6: false, player7: false, player8: false, player9: false, player10: false,
  },
  // Per-API on/off switches (Settings page) — an operator can stop a
  // misbehaving/unreachable upstream from being polled at all without
  // touching its saved URL. In-memory only, same as featureToggles above
  // (resets to this default on server restart). Consulted by
  // lib/pollers.js, lib/hrmPoller.js and routes/devapi.js's proxy routes
  // before making the actual outbound request.
  // Defaulted to OFF (2026-09) — these are all the old MLBB architecture's
  // upstreams, and BR doesn't have this API access yet. The Settings page
  // UI itself (toggle buttons, URL fields, API Mode switch) stays fully
  // intact so flipping any of these back on is a one-click operation
  // whenever BR gets its own API access.
  apiEnabled: {
    game: false, hrm: false, postinfo: false,
    hexagon: false, highlights: false,
  },
  currentBattleId: null, gameStartTime: null,
  lastWrittenBattleId: null, hasSeenPlay: false,
  freshPlayerStats,
};

module.exports = state;
