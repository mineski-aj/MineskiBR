/* ── overlay-core.js ── shared state, polling engine, utilities ── */

const DEFAULT_URL = 'https://theapi.dpdns.org/api/sub-info/';

function formatTime(s) {
  return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}
var currentApiUrl = localStorage.getItem('overlayApiUrl') || DEFAULT_URL;
function getApiUrl() { return currentApiUrl; }
async function fetchData() {
  const res  = await fetch(getApiUrl());
  const json = await res.json();
  return json.data;
}

const pollHandlers = [];
function registerPollHandler(fn) { pollHandlers.push(fn); }

const pollStatusEl = document.getElementById('poll-status');
function setPollStatus(state) {
  if (!pollStatusEl) return;
  pollStatusEl.className = state || '';
  pollStatusEl.textContent = { live: '● LIVE', error: '● OFFLINE' }[state] || '● IDLE';
}

/* ── Universal poll loop ── */
var prevBattleId = null;
var isFetching   = false;

async function masterPoll() {
  if (isFetching) return;
  isFetching = true;
  try {
    const data = await fetchData();
    if (!data) { setPollStatus('error'); isFetching = false; return; }
    setPollStatus('live');
    const bid = data.battleid || data.roomname || null;
    if (bid && prevBattleId && bid !== prevBattleId) {
      window.location.reload();
      return;
    }
    if (bid) prevBattleId = bid;
    pollHandlers.forEach(fn => { try { fn(data); } catch(e) {} });
  } catch(e) {
    setPollStatus('error');
  } finally {
    isFetching = false;
  }
}

(function keepAlive() { requestAnimationFrame(keepAlive); })();
