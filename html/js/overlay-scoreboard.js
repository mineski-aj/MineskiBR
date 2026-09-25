/* ── [FEATURE: scoreboard] — always-on tournament ID card + team
   scoreboard. The old 1920x1080 sliding MLBB scoreboard (kills/tower/
   lord/turtle/gold/casters/map box/sponsor loop/team logos) has been
   removed — this now only builds mainheader1 (logo + name/tally text),
   header1 (banner strip above it), and the team scoreboard plate. ── */

(function buildScoreboard() {
  var scene = document.getElementById('scene');

  /* Tournament ID card — mainheader1 (logo + name/tally text) + header1
     (thin banner strip above it). Text is filled/kept in sync by
     sbPollTallyState/sbPollMatchState below; see ingame.css for
     positioning and the slide-in transition. */
  var mh1 = document.createElement('div');
  mh1.id = 'sb-mainheader1';

  var mh1Logo = document.createElement('div');
  mh1Logo.id = 'sb-mh1-logo';
  var mh1LogoImg = document.createElement('img');
  mh1LogoImg.src = 'gbrc_logo.png';
  mh1LogoImg.alt = '';
  mh1Logo.appendChild(mh1LogoImg);
  mh1.appendChild(mh1Logo);

  /* Box (position/size, fixed) + inner text span (auto-width, the actual
     sbFitText target) — see ingame.css's .sb-mh1-name/-tally comment for
     why sbFitText can't run on the fixed-width box itself. */
  var mh1Name = document.createElement('div');
  mh1Name.className = 'sb-mh1-name';
  var mh1NameText = document.createElement('span');
  mh1NameText.className = 'sb-mh1-name-text';
  mh1Name.appendChild(mh1NameText);
  mh1.appendChild(mh1Name);

  var mh1Tally = document.createElement('div');
  mh1Tally.className = 'sb-mh1-tally';
  var mh1TallyText = document.createElement('span');
  mh1TallyText.className = 'sb-mh1-tally-text';
  mh1Tally.appendChild(mh1TallyText);
  mh1.appendChild(mh1Tally);
  scene.appendChild(mh1);

  var h1 = document.createElement('div');
  h1.id = 'sb-header1';
  scene.appendChild(h1);

  /* Team scoreboard plate (right side) — column header + rows are filled
     in by sbRenderScoreboard/sbPollTeamScores below. */
  var scoreBack = document.createElement('div');
  scoreBack.id = 'sb-scoreboard-back';

  var scoreHeader = document.createElement('div');
  scoreHeader.id = 'sb-score-header';
  scoreHeader.innerHTML =
    '<div class="ssh-rank">Rank</div>' +
    '<div class="ssh-team">Team</div>' +
    '<div class="ssh-pts">PTS</div>' +
    '<div class="ssh-elim">Elim</div>' +
    '<div class="ssh-elim-solo">ELIM</div>';
  scoreBack.appendChild(scoreHeader);

  scene.appendChild(scoreBack);
})();

/* ── Show/hide (slide only, no fade) ── */
function sbHandleToggle(shown) {
  if (shown) {
    sbAnimateHeaders();
  } else {
    var mh1    = document.getElementById('sb-mainheader1');
    var h1     = document.getElementById('sb-header1');
    var sbBack = document.getElementById('sb-scoreboard-back');
    if (mh1)    mh1.classList.remove('sb-slide-in');
    if (h1)     h1.classList.remove('sb-slide-in');
    if (sbBack) sbBack.classList.remove('sb-slide-in');
  }
}

/* mainheader1 slides in from the left first, header1 follows ~120ms
   behind (almost together, but one after the other); the scoreboard
   plate slides in from the right in lockstep with mainheader1, and each
   team row cascades in one after another AT THE SAME TIME as the plate's
   own slide (see sbAnimateRowsIn — same technique as the Waiting Screen
   TVC scoreboard's row cascade). Reset-then-reapply so this replays
   identically every time the scoreboard is shown, not just on first page
   load. */
function sbAnimateHeaders() {
  var mh1    = document.getElementById('sb-mainheader1');
  var h1     = document.getElementById('sb-header1');
  var sbBack = document.getElementById('sb-scoreboard-back');
  /* .sb-instant suppresses the transition (now living on the base rule so
     sbHandleToggle's hide path can glide out — see ingame.css) just for
     this reset-before-replay snap, so it doesn't itself visibly animate
     back off-screen before the real slide-in below plays. */
  if (mh1)    { mh1.classList.add('sb-instant');    mh1.classList.remove('sb-slide-in'); }
  if (h1)     { h1.classList.add('sb-instant');     h1.classList.remove('sb-slide-in'); }
  if (sbBack) { sbBack.classList.add('sb-instant'); sbBack.classList.remove('sb-slide-in'); }
  void document.body.offsetWidth; /* force reflow so the removal above actually takes effect before re-adding */
  if (mh1)    mh1.classList.remove('sb-instant');
  if (h1)     h1.classList.remove('sb-instant');
  if (sbBack) sbBack.classList.remove('sb-instant');
  if (mh1)    mh1.classList.add('sb-slide-in');
  if (sbBack) sbBack.classList.add('sb-slide-in');
  setTimeout(function() { if (h1) h1.classList.add('sb-slide-in'); }, 120);
  sbAnimateRowsIn();
}

/* One team at a time, not all at once — each row gets its own staggered
   delay so the cascade lands across a full 1s span regardless of row
   count (fewer rows just means bigger gaps between them), same
   opacity+translateY entrance and stagger-step math as Fullscreen.html's
   wtvcAnimateRows/wtvc-row-in. */
var SB_ROW_ANIM_MS = 400;
var SB_ROW_TRANSITION_MS = 1000;

function sbAnimateRowsIn() {
  var back = document.getElementById('sb-scoreboard-back');
  if (!back) return;
  var rows = back.querySelectorAll('.sb-score-row');
  var step = rows.length > 1 ? (SB_ROW_TRANSITION_MS - SB_ROW_ANIM_MS) / (rows.length - 1) : 0;
  rows.forEach(function(row, i) {
    row.style.animation = 'none';
    void row.offsetWidth; /* restart the animation every time the scoreboard is (re)shown */
    row.style.animation = 'ssr-row-in ' + SB_ROW_ANIM_MS + 'ms ease-in-out ' + (i * step) + 'ms both';
  });
}

/* Apply real server-side shown/hidden state on load, so a (re)loaded
   overlay restores instead of guessing (see checkOverlays.scoreboard). */
fetch('/overlay/check-overlays').then(function(r) { return r.json(); }).then(function(d) {
  sbHandleToggle(!(d && d.scoreboard === false));
}).catch(function() { sbHandleToggle(true); });

/* ── Shrink-to-fit text (binary search font-size) ── */
function sbFitText(el, maxWidth, maxPx) {
  maxPx = maxPx || 13;
  el.style.fontSize = maxPx + 'px';
  if (el.scrollWidth <= maxWidth) return;
  var lo = 6, hi = maxPx;
  while (hi - lo > 0.5) {
    var mid = (lo + hi) / 2;
    el.style.fontSize = mid + 'px';
    if (el.scrollWidth <= maxWidth) lo = mid; else hi = mid;
  }
  el.style.fontSize = lo + 'px';
}

/* ── Tournament ID card text — top line is Match Board's Stage field
   (/match/state's `stage`, e.g. "Grand Finals" — same value shown under
   Stage on match-dashboard.html); tally line ("Q1 | MAP 1") is that
   tally's liveTallyTab plus the current map number, both from
   /match/state and /tally/state below, and always rendered upper-case
   (see .sb-mh1-tally's text-transform in ingame.css). ── */
var _sbLiveTallyTab = '';
var _sbMatchNum = 1;
var SB_MH1_TEXT_WIDTH = 309; /* .sb-mh1-name/.sb-mh1-tally's own 317px width, minus a little breathing room */
/* maxSize starts near each box's own height (57px/60px) now that stage and
   tally are standalone boxes, not the old shared 38px-tall wrapper the
   design guide's 36.88px/28.46px sizes were tuned for — keeping those
   old sizes here left the text looking tiny inside the new, much taller
   boxes. */
var SB_MH1_NAME_MAXSIZE  = 52;
var SB_MH1_TALLY_MAXSIZE = 48;

function sbUpdateMh1Tally() {
  var tallyEl = document.querySelector('.sb-mh1-tally-text');
  if (!tallyEl) return;
  var parts = [];
  if (_sbLiveTallyTab) parts.push(_sbLiveTallyTab);
  /* Qualifiers: the live tally tab (e.g. "Qualifier 1") already IS the
     map identity for that stage, so "Map N" is redundant — drop it and
     show just the tally tab (see sbIsQualifiers below). */
  if (!sbIsQualifiers()) parts.push('Map ' + _sbMatchNum);
  tallyEl.textContent = parts.join(' | ');
  sbFitText(tallyEl, SB_MH1_TEXT_WIDTH, SB_MH1_TALLY_MAXSIZE);
}

function sbPollTallyState() {
  fetch('/tally/state', { cache: 'no-store' })
    .then(function(r) { return r.json(); })
    .then(function(t) {
      _sbLiveTallyTab = (t && t.liveTallyTab) || '';
      sbUpdateMh1Tally();
    })
    .catch(function() {});
}

sbPollTallyState();
setInterval(sbPollTallyState, 3500);

function sbPollMatchState() {
  fetch('/match/state', { cache: 'no-store' })
    .then(function(r) { return r.json(); })
    .then(function(s) {
      var nameEl = document.querySelector('.sb-mh1-name-text');
      if (nameEl) {
        nameEl.textContent = s.stage || '';
        sbFitText(nameEl, SB_MH1_TEXT_WIDTH, SB_MH1_NAME_MAXSIZE);
      }
      _sbMatchNum = s.match || 1;
      /* _sbStage must land BEFORE sbUpdateMh1Tally() — it now reads
         sbIsQualifiers() (which reads _sbStage) to decide whether to
         drop the "Map N" part of the tally line. */
      _sbStage = s.stage || '';
      sbUpdateMh1Tally();
      sbRenderScoreboard();
    })
    .catch(function() {});
}

sbPollMatchState();
setInterval(sbPollMatchState, 3000);

/* ── Team scoreboard rows — one .sb-score-row per team on the live Tally
   sheet (capped at 20). The plate itself (#sb-scoreboard-back) NEVER
   resizes — it's each row's height that's recomputed to fill the
   plate's fixed space evenly, so 10 teams means 10 taller rows, not a
   shorter plate; each row's own content keeps its fixed Figma size and
   just re-centers vertically (see ingame.css). Same 3.5s cadence as
   match-dashboard.html's own live-standings poll for the roster, plus
   /match/state's Stage above for the Qualifiers column swap: Qualifiers
   has no separate placement points, so PTS+Elim collapse into one
   ELIM-only column (.ssr-elim-solo / .ssh-elim-solo) instead. */
var SB_SCORE_ROW_TOP = 48;   /* first row's offset from the plate's own top */
var SB_SCORE_PLATE_H  = 713; /* #sb-scoreboard-back's fixed height */
var SB_SCORE_MAX_ROWS = 20;
var SB_SCORE_TEAM_WIDTH = 165; /* .ssr-team's 173px width, minus a little breathing room */
var SB_SCORE_LOGO_SPACE = 32;  /* .ssr-team-logo's 26px width + its 6px margin-right */

var _sbTeams = [];
var _sbStage = '';

function sbIsQualifiers() {
  return /qualifier/i.test(_sbStage);
}

/* Shrinks .ssr-team-name to fit whatever width is actually left in the
   173px team box — the full width when there's no logo (current state,
   e.g. Qualifiers), or minus the logo's own space once one loads. Reruns
   on every logo onload/onerror too, since that changes the budget. */
function sbFitTeamName(row) {
  var nameEl = row.querySelector('.ssr-team-name');
  if (!nameEl) return;
  var logo = row.querySelector('.ssr-team-logo');
  var hasLogo = logo && logo.style.display !== 'none';
  var maxWidth = SB_SCORE_TEAM_WIDTH - (hasLogo ? SB_SCORE_LOGO_SPACE : 0);
  sbFitText(nameEl, maxWidth, 27.42);
}

function sbBuildScoreRow() {
  var row = document.createElement('div');
  row.className = 'sb-score-row';

  var rank = document.createElement('div');
  rank.className = 'ssr-rank';
  row.appendChild(rank);

  var flag = document.createElement('div');
  flag.className = 'ssr-flag';
  var flagImg = document.createElement('img');
  flagImg.className = 'ssr-flag-img';
  flagImg.alt = '';
  flagImg.style.display = 'none';
  var flagTxt = document.createElement('span');
  flagTxt.className = 'ssr-flag-text';
  /* Same fallback idiom as the old team-logo containers: try the image
     (assets/flag/<REGION>_flag.png), fall back to the region text (from
     the live Tally sheet, e.g. "PH") if it 404s. */
  flagImg.onload  = function() { flagImg.style.display = 'block'; flagTxt.style.display = 'none'; };
  flagImg.onerror = function() { flagImg.style.display = 'none';  flagTxt.style.display = ''; };
  flag.appendChild(flagImg);
  flag.appendChild(flagTxt);
  row.appendChild(flag);

  var divider = document.createElement('div');
  divider.className = 'ssr-divider';
  row.appendChild(divider);

  /* Team box — logo (once one exists) + name, or just the name filling
     the whole box when there's no logo (e.g. Qualifiers). Same
     img-with-fallback idiom as the flag above. */
  var team = document.createElement('div');
  team.className = 'ssr-team';
  var teamLogo = document.createElement('img');
  teamLogo.className = 'ssr-team-logo';
  teamLogo.alt = '';
  teamLogo.style.display = 'none';
  var teamName = document.createElement('span');
  teamName.className = 'ssr-team-name';
  teamLogo.onload  = function() { teamLogo.style.display = ''; sbFitTeamName(row); };
  teamLogo.onerror = function() { teamLogo.style.display = 'none'; sbFitTeamName(row); };
  team.appendChild(teamLogo);
  team.appendChild(teamName);
  row.appendChild(team);

  var pts = document.createElement('div');
  pts.className = 'ssr-pts';
  row.appendChild(pts);

  var elim = document.createElement('div');
  elim.className = 'ssr-elim';
  row.appendChild(elim);

  var elimSolo = document.createElement('div');
  elimSolo.className = 'ssr-elim-solo';
  row.appendChild(elimSolo);

  return row;
}

/* Rank is deliberately NOT set here — sbRenderScoreboard sets it directly
   (immediately for an unchanged/new row) or defers it to the end of the
   move animation (see sbAnimateRowMove) when a team's rank has actually
   changed, so the number-fade-in always shows the NEW rank exactly when
   the row lands in its new spot. */
function sbSetRank(row, rank) {
  var rankEl = row.querySelector('.ssr-rank');
  if (rankEl) rankEl.textContent = rank;
}

function sbFillScoreRow(row, team, qualifiers) {
  var region = ((team && team.region) || '').toUpperCase();
  var flagImg = row.querySelector('.ssr-flag-img');
  var flagTxt = row.querySelector('.ssr-flag-text');
  if (flagTxt) flagTxt.textContent = region;
  if (flagImg) {
    if (region) {
      if (flagImg.dataset.region !== region) {
        flagImg.dataset.region  = region;
        flagImg.style.display   = 'none';
        if (flagTxt) flagTxt.style.display = '';
        flagImg.src = '/flag/' + encodeURIComponent(region) + '_flag.png';
      }
    } else {
      flagImg.style.display = 'none';
      flagImg.removeAttribute('src');
    }
  }

  var teamName = (team && team.name) || '';
  var teamLogo = row.querySelector('.ssr-team-logo');
  var teamNameEl = row.querySelector('.ssr-team-name');
  if (teamNameEl) teamNameEl.textContent = teamName;
  if (teamLogo) {
    if (teamName) {
      if (teamLogo.dataset.team !== teamName) {
        teamLogo.dataset.team  = teamName;
        teamLogo.style.display = 'none'; /* onload/onerror (set in sbBuildScoreRow) re-show + refit */
        teamLogo.src = '/logos/' + encodeURIComponent(teamName) + '.png';
      }
    } else {
      teamLogo.style.display = 'none';
      teamLogo.removeAttribute('src');
    }
  }
  sbFitTeamName(row);

  var ptsEl      = row.querySelector('.ssr-pts');
  var elimEl     = row.querySelector('.ssr-elim');
  var elimSoloEl = row.querySelector('.ssr-elim-solo');
  if (qualifiers) {
    if (ptsEl)  ptsEl.style.display  = 'none';
    if (elimEl) elimEl.style.display = 'none';
    if (elimSoloEl) {
      elimSoloEl.style.display = 'flex';
      elimSoloEl.textContent   = (team && team.currentMapKills) || 0;
    }
  } else {
    if (elimSoloEl) elimSoloEl.style.display = 'none';
    /* PTS = total score so far (all maps), ELIM = +kills on THIS map only
       (not the season-long running kill total — see currentMapKills in
       lib/tallyRoster.js's getLiveSheetStandings). */
    if (ptsEl)  { ptsEl.style.display  = 'flex'; ptsEl.textContent  = (team && team.totalScore) || 0; }
    if (elimEl) { elimEl.style.display = 'flex'; elimEl.textContent = '+' + ((team && team.currentMapKills) || 0); }
  }
}

function sbUpdateScoreHeaderLabels(qualifiers) {
  var pts  = document.querySelector('.ssh-pts');
  var elim = document.querySelector('.ssh-elim');
  var solo = document.querySelector('.ssh-elim-solo');
  if (pts)  pts.style.display  = qualifiers ? 'none' : 'flex';
  if (elim) elim.style.display = qualifiers ? 'none' : 'flex';
  if (solo) solo.style.display = qualifiers ? 'flex' : 'none';
}

/* Overtake animation — a row that's changing rank gets raised above every
   other row (elevated z-index) and its rank number fades out BEFORE the
   move starts, then transitions to its new top/height, then (once the
   move finishes) the rank text updates to the new number and fades back
   in, and the row drops back to its normal stacking. .ssr-moving only
   carries the `transition` — it's added right before the top/height
   change and removed once settled, so a brand-new row's very first
   placement (in sbRenderScoreboard) never itself transitions in from
   some stale/zero position. */
var SB_ROW_MOVE_MS = 500;

function sbAnimateRowMove(row, newTop, newHeight, newRank) {
  row.classList.add('ssr-moving');
  void row.offsetWidth; /* force reflow so the class above is applied before top/height change below, or the browser may coalesce them and skip the transition */
  row.style.zIndex = 500;
  var rankEl = row.querySelector('.ssr-rank');
  if (rankEl) rankEl.style.opacity = '0';

  row.style.top    = newTop + 'px';
  row.style.height = newHeight + 'px';

  var done = false;
  function finish() {
    if (done) return;
    done = true;
    row.removeEventListener('transitionend', onEnd);
    row.classList.remove('ssr-moving');
    row.style.zIndex = '';
    sbSetRank(row, newRank);
    if (rankEl) {
      void rankEl.offsetWidth; /* force reflow so the opacity transition below actually plays instead of being coalesced with the '0' set above */
      rankEl.style.opacity = '1';
    }
  }
  function onEnd(ev) {
    if (ev.target !== row || ev.propertyName !== 'top') return;
    finish();
  }
  row.addEventListener('transitionend', onEnd);
  setTimeout(finish, SB_ROW_MOVE_MS + 150); /* safety net, same idiom as this file's other transition/animation cleanups */
}

var _sbRowsByTeam = {}; /* team name -> row element, so a reorder moves the SAME element instead of just swapping text between fixed slots */

function sbRenderScoreboard() {
  var back = document.getElementById('sb-scoreboard-back');
  if (!back) return;
  var teams = _sbTeams.slice(0, SB_SCORE_MAX_ROWS);
  var n = teams.length;
  var qualifiers = sbIsQualifiers();
  var rowH = n ? (SB_SCORE_PLATE_H - SB_SCORE_ROW_TOP) / n : 0;

  var seen = {};
  teams.forEach(function(team, i) {
    var rank = i + 1;
    var name = (team && team.name) || ('#' + rank);
    seen[name] = true;

    var row = _sbRowsByTeam[name];
    var isNew = !row;
    if (isNew) {
      row = sbBuildScoreRow();
      _sbRowsByTeam[name] = row;
      back.appendChild(row);
    }

    sbFillScoreRow(row, team, qualifiers);

    var newTop = SB_SCORE_ROW_TOP + i * rowH;
    var prevRank = row.dataset.rank ? parseInt(row.dataset.rank, 10) : null;

    if (isNew) {
      row.style.top    = newTop + 'px';
      row.style.height = rowH + 'px';
      row.dataset.rank = rank;
      sbSetRank(row, rank);
      /* .sb-score-row's own CSS default is opacity:0 (see ingame.css) so
         the whole plate starts empty for sbAnimateRowsIn's entrance
         cascade — a row built AFTER that cascade already ran (a new team
         showing up mid-broadcast) needs its own one-off reveal here, or
         it would just stay invisible forever. Harmless to always run
         this even before the scoreboard's first show: sbAnimateRowsIn
         resets `animation` from scratch for every row anyway. */
      row.style.animation = 'ssr-row-in ' + SB_ROW_ANIM_MS + 'ms ease-in-out both';
    } else if (prevRank !== rank) {
      row.dataset.rank = rank;
      sbAnimateRowMove(row, newTop, rowH, rank);
    } else if (parseFloat(row.style.top) !== newTop || parseFloat(row.style.height) !== rowH) {
      /* Same rank, but the plate's own row height shifted (team count
         changed) — glide to the new size/slot too, just without the
         overtake z-index/rank-fade theatrics since nothing overtook
         anything. */
      row.classList.add('ssr-moving');
      void row.offsetWidth;
      row.style.top    = newTop + 'px';
      row.style.height = rowH + 'px';
      setTimeout(function() { row.classList.remove('ssr-moving'); }, SB_ROW_MOVE_MS + 150);
      sbSetRank(row, rank);
    } else {
      sbSetRank(row, rank);
    }
  });

  Object.keys(_sbRowsByTeam).forEach(function(name) {
    if (seen[name]) return;
    var row = _sbRowsByTeam[name];
    if (row.parentNode) row.parentNode.removeChild(row);
    delete _sbRowsByTeam[name];
  });

  sbUpdateScoreHeaderLabels(qualifiers);
}

function sbPollTeamScores() {
  fetch('/api/live-tally-standings', { cache: 'no-store' })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      _sbTeams = (d && d.teams) || [];
      sbRenderScoreboard();
    })
    .catch(function() {});
}

sbPollTeamScores();
setInterval(sbPollTeamScores, 3500);
