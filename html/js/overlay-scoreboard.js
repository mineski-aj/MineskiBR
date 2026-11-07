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

  /* Sponsor bar (white strip under the ID card) — data-sponsorbox so the
     Settings "Sponsor Boxes" switch hides it (see CLAUDE.md). */
  var sbar = document.createElement('div');
  sbar.id = 'sb-sponsorbar';
  sbar.setAttribute('data-sponsorbox', '');
  sbar.innerHTML =
    '<div id="sb-sponsor-label"></div>' +
    '<div id="sb-sponsor-viewport"><canvas id="sb-sponsor-img"></canvas></div>';
  scene.appendChild(sbar);

  /* Zone frame (see ingame.css #sb-zonerect) — shown/hidden together with the zoned tooltip (window.sbZoneTip). */
  var zr = document.createElement('div');
  zr.id = 'sb-zonerect';
  scene.appendChild(zr);

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
    var sbar   = document.getElementById('sb-sponsorbar');
    if (window.sbZoneTip) window.sbZoneTip(null);   /* the tooltip sits on the bug: it goes with the scoreboard */
    if (sbar)   sbar.classList.remove('sb-slide-in');
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
  var sbar   = document.getElementById('sb-sponsorbar');
  /* .sb-instant suppresses the transition (now living on the base rule so
     sbHandleToggle's hide path can glide out — see ingame.css) just for
     this reset-before-replay snap, so it doesn't itself visibly animate
     back off-screen before the real slide-in below plays. */
  if (mh1)    { mh1.classList.add('sb-instant');    mh1.classList.remove('sb-slide-in'); }
  if (h1)     { h1.classList.add('sb-instant');     h1.classList.remove('sb-slide-in'); }
  if (sbBack) { sbBack.classList.add('sb-instant'); sbBack.classList.remove('sb-slide-in'); }
  if (sbar)   { sbar.classList.add('sb-instant');   sbar.classList.remove('sb-slide-in'); }
  void document.body.offsetWidth; /* force reflow so the removal above actually takes effect before re-adding */
  if (mh1)    mh1.classList.remove('sb-instant');
  if (h1)     h1.classList.remove('sb-instant');
  if (sbBack) sbBack.classList.remove('sb-instant');
  if (sbar)   sbar.classList.remove('sb-instant');
  if (mh1)    mh1.classList.add('sb-slide-in');
  if (sbar)   sbar.classList.add('sb-slide-in');
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

var _sbTodayMaps = [];
/* The current match's map name from Match Board's Today's Maps list
   (/match/state's todayMaps, 1-indexed by `match`). */
function sbCurrentMapName() {
  var m = _sbTodayMaps[_sbMatchNum - 1];
  var n = (m && m.mapName) ? String(m.mapName).trim() : '';
  return /^rebirth\s+island$/i.test(n) ? 'Rebirth' : n;   // shortened to fit the bug
}

/* Playoffs: Match Board's map list is the Playoffs sheet's own blocks, so
   the label is the sheet's ("2.1"), stamped on each row — not the plain
   match number. Any other stage (or a row without one) = the number. */
function sbCurrentMapLabel() {
  var m = _sbTodayMaps[_sbMatchNum - 1];
  return (/playoffs/i.test(_sbStage) && m && m.label) ? String(m.label) : String(_sbMatchNum);
}

function sbUpdateMh1Tally() {
  var tallyEl = document.querySelector('.sb-mh1-tally-text');
  if (!tallyEl) return;
  /* Groupstage: "MAP 5 | GROUP A + B" with the group part bold. */
  if (/groupstage/i.test(_sbStage) && _sbLiveTallyTab) {
    tallyEl.textContent = 'Map ' + _sbMatchNum + ' | ';
    var b = document.createElement('b');
    b.style.fontWeight = '700';
    b.textContent = 'Group ' + _sbLiveTallyTab;
    tallyEl.appendChild(b);
    sbFitText(tallyEl, SB_MH1_TEXT_WIDTH, SB_MH1_TALLY_MAXSIZE);
    return;
  }
  var parts = [];
  /* Playoffs: the live tally tab is just "Playoffs" again (same as the
     Stage line above it), so lead with the current map's NAME instead —
     "Isolated | Map 1". Falls back to the tab name when Match Board has
     no map picked for this match number yet. */
  /* Showmatch and Grand Finals behave the same: their live tab is just the stage name again. */
  var playoffMap = /playoffs|show\s*match|grand\s*finals/i.test(_sbStage) ? sbCurrentMapName() : '';
  if (playoffMap) parts.push(playoffMap);
  else if (_sbLiveTallyTab) parts.push(_sbLiveTallyTab);
  /* Qualifiers: the live tally tab (e.g. "Qualifier 1") already IS the
     map identity for that stage, so "Map N" is redundant — drop it and
     show just the tally tab (see sbIsQualifiers below). */
  if (!sbIsQualifiers()) parts.push('Map ' + sbCurrentMapLabel());
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
      _sbTodayMaps = s.todayMaps || [];
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
/* DISPLAY ONLY: LEAP MAIN is written with the reversed E (Ǝ) like the player IGNs. The fonts have no Ǝ glyph,
   so it is a mirrored "E" in the same font. Never use this for /logos/ or /photos/ URLs, those keep the sheet name. */
function teamNameHtml(n) {
  return String(n == null ? '' : n).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; })
    .replace(/^LEAP MAIN$/i, 'L<span style="display:inline-block;transform:scaleX(-1)">E</span>AP MAIN');
}

function sbFitTeamName(row) {
  var nameEl = row.querySelector('.ssr-team-name');
  if (!nameEl) return;
  var logo = row.querySelector('.ssr-team-logo');
  var hasLogo = logo && logo.style.display !== 'none';
  /* Showmatch drops the country tag, so the name box is wider (see .sb-no-country in ingame.css). */
  var maxWidth = SB_SCORE_TEAM_WIDTH + (sbIsShowmatch() ? 34 : 0) - (hasLogo ? SB_SCORE_LOGO_SPACE : 0);
  var teamBox = nameEl.parentNode;
  nameEl.style.whiteSpace = 'nowrap';
  nameEl.style.maxWidth = '';
  nameEl.style.lineHeight = '';
  if (teamBox) teamBox.style.height = '';
  sbFitText(nameEl, maxWidth, 27.42);
  /* Doesn't fit one row at full size -> use the biggest size at which
     the name fits in two rows (longest word must fit the width, 2 lines in 60px). */
  if (parseFloat(nameEl.style.fontSize) < 27.42) {
    nameEl.style.whiteSpace = 'normal';
    nameEl.style.maxWidth = maxWidth + 'px';
    nameEl.style.lineHeight = '0.85';
    if (teamBox) teamBox.style.height = '60px';
    var size = 27.42;
    nameEl.style.fontSize = size + 'px';
    while (size > 6 && (nameEl.scrollWidth > maxWidth || nameEl.offsetHeight > 58)) {
      size -= 0.5;
      nameEl.style.fontSize = size + 'px';
    }
  }
}

function sbBuildScoreRow() {
  var row = document.createElement('div');
  row.className = 'sb-score-row';

  var rank = document.createElement('div');
  rank.className = 'ssr-rank';
  row.appendChild(rank);

  var flag = document.createElement('div');
  flag.className = 'ssr-flag';
  /* Country code as plain text ("PH", "TW"...) from the live Tally sheet's
     Region column — flags are not allowed in any overlay. */
  var flagTxt = document.createElement('span');
  flagTxt.className = 'ssr-flag-text';
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
  var flagTxt = row.querySelector('.ssr-flag-text');
  if (flagTxt) {
    /* TWHK doesn't fit the 29px tag on one line → "TW" over "HK" (CSS .ssr-flag-two shrinks + stacks it). */
    var two = region === 'TWHK';
    if (two) { flagTxt.innerHTML = 'TW<br>HK'; }
    else flagTxt.textContent = region;
    if (flagTxt.parentNode) flagTxt.parentNode.classList.toggle('ssr-flag-two', two);
  }

  var teamName = (team && team.name) || '';
  var teamLogo = row.querySelector('.ssr-team-logo');
  var teamNameEl = row.querySelector('.ssr-team-name');
  if (teamNameEl) teamNameEl.innerHTML = teamNameHtml(teamName);
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
    /* PTS = total score so far (all maps), ELIM = kills on THIS map only
       (not the season-long running kill total — see currentMapKills in
       lib/tallyRoster.js's getLiveSheetStandings). */
    if (ptsEl)  { ptsEl.style.display  = 'flex'; ptsEl.textContent  = (team && (team.overallScore !== undefined ? team.overallScore : team.totalScore)) || 0; }
    if (elimEl) { elimEl.style.display = 'flex'; elimEl.textContent = (team && team.currentMapKills) || 0; }
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

/* ── Grand Finals "In The Zone" ──
   Squads ticked in the dashboard's IN THE ZONE tab (/api/in-the-zone) get the
   yellow row container. Grand Finals and Showmatch only — a leftover tick
   can't tint rows in any other stage. Re-applied
   on every render AND whenever the zone list itself changes, so ticking a
   box shows up within one poll without waiting on a standings change. */
var _sbZone = {}; /* lower-cased squad name -> true */
function sbIsShowmatch() { return /^show\s*match$/i.test(String(_sbStage).trim()); }
function sbIsGrandFinals() { return /grand\s*finals/i.test(_sbStage) || /^show\s*match$/i.test(String(_sbStage).trim()); } /* + Showmatch */
function sbApplyZone() {
  var on = sbIsGrandFinals();
  Object.keys(_sbRowsByTeam).forEach(function(name) {
    _sbRowsByTeam[name].classList.toggle('ssr-zone', on && !!_sbZone[String(name).trim().toLowerCase()]);
  });
}
function sbPollZone() {
  fetch('/api/in-the-zone', { cache: 'no-store' })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var z = {};
      ((d && d.zone) || []).forEach(function(n) { z[String(n).trim().toLowerCase()] = true; });
      _sbZone = z;
      sbApplyZone();
    })
    .catch(function() {});
}
sbPollZone();
setInterval(sbPollZone, 3500);

/* Elim Tracker (dashboard tab / /html/elim-tracker.html): eliminated squads get
   the darkened row (.ssr-out). Re-applied on every render too, since rows are
   keyed by team and rebuilt when a team first appears. */
var _sbElim = {}; /* lower-cased squad name -> true */
function sbApplyElim() {
  Object.keys(_sbRowsByTeam).forEach(function(name) {
    _sbRowsByTeam[name].classList.toggle('ssr-out', !!_sbElim[String(name).trim().toLowerCase()]);
  });
}
function sbPollElim() {
  fetch('/api/eliminated', { cache: 'no-store' })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var e = {};
      ((d && d.teams) || []).forEach(function(n) { e[String(n).trim().toLowerCase()] = true; });
      _sbElim = e;
      sbApplyElim();
    })
    .catch(function() {});
}
sbPollElim();
setInterval(sbPollElim, 2500);

function sbRenderScoreboard() {
  var back = document.getElementById('sb-scoreboard-back');
  if (!back) return;
  back.classList.toggle('sb-no-country', sbIsShowmatch()); /* Showmatch: no country tag */
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
    row.style.setProperty('--ssr-h', rowH + 'px'); /* sizes the Z! badge glyph */

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
  sbApplyZone();
  sbApplyElim();
}

function sbPollTeamScores() {
  fetch('/api/live-tally-standings', { cache: 'no-store' })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      _sbTeams = (d && d.teams) || [];
      /* Groupstage: PTS is the team's overall score across every group-stage
         sheet (overallScore, see getLiveSheetStandings), so rank by that
         too — otherwise the rank column would follow the sheet-only total
         while PTS shows something else. Stable sort keeps the sheet order
         (and kill-point tiebreak) for equal overall scores. */
      if (d && d.overall) {
        _sbTeams = _sbTeams.map(function(t, i) { return { t: t, i: i }; })
          .sort(function(a, b) {
            return (b.t.overallScore - a.t.overallScore) ||
                   (b.t.overallKillPoints - a.t.overallKillPoints) || (a.i - b.i);
          }).map(function(x) { return x.t; });
      }
      sbRenderScoreboard();
    })
    .catch(function() {});
}

sbPollTeamScores();
setInterval(sbPollTeamScores, 3500);


/* ── Sponsor bar — logos loop right to left. Source: /api/sponsors?ingame=1
   (same ordered list as before, minus logos hidden for in-game). Gated by
   the global Sponsor Boxes setting (/api/sponsor-boxes-enabled + the
   `sponsorboxes` SSE event): off hides the bar (data-sponsorbox CSS) and
   the ID card drops back to the bottom edge. ── */
var SB_SPONSOR_SLIDE_MS = 550; /* matches .sb-spon-in/out transition + a little slack */
var sbSponsorsEnabled = true;
var sbSponsorSig = '';
var sbSponsorList = [], sbSponsorIdx = 0, sbSponsorTimer = null, sbSponsorRun = 0;

function sbApplySponsorsEnabled(enabled) {
  sbSponsorsEnabled = enabled;
  document.body.classList.toggle('sponsorboxes-off', !enabled);
  if (enabled) { sbLoadSponsors(); }
  else {
    sbStopSponsors(); sbSponsorSig = '';
    sbSponsorTagCur = null;
    var lb = document.getElementById('sb-sponsor-label'); if (lb) lb.innerHTML = '';
  }
}

/* Category tag: push the old one down/out, new one in from the top.
   Only transitions when the category actually changes. */
var sbSponsorTagCur = null;
function sbSetSponsorTag(text) {
  text = String(text || '');
  if (text === sbSponsorTagCur) return;
  sbSponsorTagCur = text;
  var box = document.getElementById('sb-sponsor-label');
  if (!box) return;
  var old = box.querySelectorAll('.sb-tag');
  var tag = document.createElement('div');
  tag.className = 'sb-tag sb-tag-above';
  var span = document.createElement('span');
  span.textContent = text;
  tag.appendChild(span);
  box.appendChild(tag);
  /* shrink-to-fit (box is visible by now; font floor 14px) */
  var size = 27;
  while (span.offsetWidth > 195 && size > 14) { size--; tag.style.fontSize = size + 'px'; }
  void tag.offsetWidth;
  tag.classList.remove('sb-tag-above');
  old.forEach(function(o) {
    o.classList.add('sb-tag-below');
    setTimeout(function() { o.remove(); }, 600);
  });
}

function sbStopSponsors() {
  sbSponsorRun++;
  clearTimeout(sbSponsorTimer);
  var img = document.getElementById('sb-sponsor-img');
  if (img) img.className = '';
}

/* Sponsor logo files are full 1920x1080 canvases with the artwork in the
   middle, so drawing them as-is would shrink the artwork to nothing —
   crop to the opaque bounding box and draw that into the canvas. */
function sbDrawTrimmed(canvas, im) {
  var w = im.naturalWidth, h = im.naturalHeight, x0 = 0, y0 = 0, x1 = w, y1 = h;
  try {
    var t = document.createElement('canvas'); t.width = w; t.height = h;
    var tc = t.getContext('2d'); tc.drawImage(im, 0, 0);
    var d = tc.getImageData(0, 0, w, h).data;
    var minX = w, minY = h, maxX = -1, maxY = -1;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (maxX >= 0) { x0 = minX; y0 = minY; x1 = maxX + 1; y1 = maxY + 1; }
  } catch (e) {}
  canvas.width = x1 - x0; canvas.height = y1 - y0;
  canvas.getContext('2d').drawImage(im, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
}

/* Logo per logo: slide in from the right, hold for that logo's own dur,
   slide out to the left, then the next one. */
function sbStartSponsors(list) {
  sbStopSponsors();
  sbSponsorList = list;
  sbSponsorIdx = 0;
  if (!list.length) return;
  var run = sbSponsorRun;
  var img = document.getElementById('sb-sponsor-img');
  function step() {
    if (run !== sbSponsorRun) return;
    var s = sbSponsorList[sbSponsorIdx % sbSponsorList.length];
    img.className = '';
    var src = new Image();
    src.onload = function() {
      if (run !== sbSponsorRun) return;
      sbDrawTrimmed(img, src);
      sbSetSponsorTag(s.category);
      void img.offsetWidth;
      img.classList.add('sb-spon-in');
      sbSponsorTimer = setTimeout(function() {
        if (run !== sbSponsorRun) return;
        img.classList.remove('sb-spon-in');
        img.classList.add('sb-spon-out');
        sbSponsorTimer = setTimeout(function() {
          sbSponsorIdx = (sbSponsorIdx + 1) % sbSponsorList.length;
          step();
        }, SB_SPONSOR_SLIDE_MS);
      }, SB_SPONSOR_SLIDE_MS + (s.dur || 3000));
    };
    src.onerror = function() {
      if (run !== sbSponsorRun) return;
      sbSponsorIdx = (sbSponsorIdx + 1) % sbSponsorList.length;
      sbSponsorTimer = setTimeout(step, 500); /* skip a broken logo without spinning */
    };
    src.src = s.src;
  }
  step();
}

function sbLoadSponsors() {
  if (!sbSponsorsEnabled) return;
  fetch('/api/sponsors?ingame=1', { cache: 'no-store' }).then(function(r) { return r.json(); }).then(function(list) {
    list = Array.isArray(list) ? list : [];
    var sig = list.map(function(s) { return s.src; }).join('|');
    if (sig === sbSponsorSig) return; /* unchanged — don't restart the scroll */
    sbSponsorSig = sig;
    sbStartSponsors(list);
  }).catch(function() {});
}

fetch('/api/sponsor-boxes-enabled', { cache: 'no-store' }).then(function(r) { return r.json(); })
  .then(function(d) { sbApplySponsorsEnabled(!!(d && d.enabled)); })
  .catch(function() { sbApplySponsorsEnabled(true); });
setInterval(sbLoadSponsors, 30000); /* pick up dashboard Sponsors-tab edits */
try {
  createOverlaySSE().addEventListener('sponsorboxes', function(e) {
    try { sbApplySponsorsEnabled(!!JSON.parse(e.data).enabled); } catch (err) {}
  });
} catch (err) {}

/* ── Zoned tooltip — "IN THE ZONE" tag above the lower-left bug + the team name in a black box inside the zone frame,
   driven by /zonedN (routes/inTheZone.js). The server already decided: a 'show' event means that team IS in the zone,
   'hide' means show nothing. Element font-sizes (editable in the Edit tab) are MAX sizes; the inner span shrinks to fit. ── */
(function zoneTip() {
  var scene = document.getElementById('scene');
  var tip = document.createElement('div');
  tip.id = 'sb-zonetip';
  tip.innerHTML = '<span>IN THE ZONE!</span>';
  scene.appendChild(tip);
  var nameBox = document.createElement('div');
  nameBox.id = 'sb-zonename';
  nameBox.innerHTML = '<span></span>';
  scene.appendChild(nameBox);
  var nameSpan = nameBox.querySelector('span'), tipSpan = tip.querySelector('span');
  var frame = document.getElementById('sb-zonerect');
  var token = 0, shown = false;
  /* Shrink the span (not the box — the Edit tab's !important font-size on the box would beat an inline one) until it fits. */
  function fitBox(box, span) {
    span.style.fontSize = '';
    var cs = getComputedStyle(box);
    var max = parseFloat(cs.fontSize) || 20, size = max;
    var avail = box.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    span.style.fontSize = size + 'px';
    while (span.offsetWidth > avail && size > 5) span.style.fontSize = (size -= 0.5) + 'px';
  }
  /* The team-name box always spans the frame border to border (inside the border): left/width follow the frame, so only its
     Y and height are edited. Runs before every fit, so resizing the frame or its border in Edit carries the box with it. */
  function syncName() {
    if (!frame) return;
    /* CSS px from computed style — NOT getBoundingClientRect(), which is in scaled screen px (wrong whenever the page is
       displayed scaled: the Edit tab preview, a vMix source that isn't exactly 1920x1080) and offsetWidth, which rounds. */
    var cs = getComputedStyle(frame);
    var bw = parseFloat(cs.borderLeftWidth) || 0;
    /* 'important' on the inline style: beats any stale left/width an older Edit-tab save left in overlay_styles.json
       (those are !important too — they broke this once, after the box stopped having X/Width fields). */
    nameBox.style.setProperty('left', ((parseFloat(cs.left) || 0) + bw) + 'px', 'important');
    nameBox.style.setProperty('width', Math.max(0, (parseFloat(cs.width) || 0) - 2 * bw) + 'px', 'important');
  }
  function fitAll() { syncName(); fitBox(tip, tipSpan); fitBox(nameBox, nameSpan); }
  window.sbZoneTip = function (team) {
    var t = ++token;
    if (!team) {
      shown = false;
      tip.classList.remove('zt-in'); nameBox.classList.remove('sb-zr-on'); if (frame) frame.classList.remove('sb-zr-on');
      return;
    }
    nameSpan.innerHTML = teamNameHtml(team);
    var go = function () {
      if (t !== token) return;
      fitAll();
      tip.classList.remove('zt-in'); void tip.offsetWidth; tip.classList.add('zt-in');
      nameBox.classList.add('sb-zr-on'); if (frame) frame.classList.add('sb-zr-on');
      shown = true;
    };
    /* Teko is lazy-loaded: measure against the real face, not the fallback */
    (document.fonts && document.fonts.load ? document.fonts.load('700 30px Teko') : Promise.resolve()).then(go, go);
  };
  window.sbZoneTipDemo = function () { window.sbZoneTip('GNR ESPORTS LEGACY OMEN'); };   /* Edit tab: needs it on screen — the longest team name */
  /* The Edit tab changes sizes through injected CSS, which no observer sees: in the preview frame just re-fit regularly. */
  if (/[?&]preview=1(?:&|$)/.test(window.location.search)) setInterval(function () { if (shown) fitAll(); }, 400);
  try {
    createOverlaySSE().addEventListener('zoned_tip', function (e) {
      try { var d = JSON.parse(e.data); window.sbZoneTip(d.action === 'show' ? d.team : null); } catch (err) {}
    });
  } catch (err) {}
  /* restore-on-load: a tab that (re)loads while a tooltip is up comes up showing it */
  fetch('/overlay/zoned-state', { cache: 'no-store' }).then(function (r) { return r.json(); })
    .then(function (st) { if (st && st.team) window.sbZoneTip(st.team); }).catch(function () {});
})();
