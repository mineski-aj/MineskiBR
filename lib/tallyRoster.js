// lib/tallyRoster.js — derives the whole-tournament roster (teams, players,
// kills, and the score breakdown) from lib/externalTally.js's parsed
// sheets. A squad appearing in more than one sheet (advanced from a Group
// Stage into Grand Finals, etc.) is merged into one entry — same rule the
// Roster page already used, now centralized here so both the page and the
// /api/roster JSON endpoint compute it exactly the same way.
const externalTally = require('./externalTally');
const tallyState    = require('./tallyState');
const matchState    = require('./matchState');

function findColumnsByLabel(subHeader, label) {
  const cols = [];
  (subHeader || []).forEach(function (v, i) { if (String(v).trim() === label) cols.push(i); });
  return cols;
}

// The column where a header-group with this exact label starts — that's
// where its real value lives on a team's leader row (a "Total Scores"
// 2-column group's second cell is just leftover legend text, not data).
function findGroupStartColumn(headerGroups, label) {
  let offset = 0;
  for (let i = 0; i < headerGroups.length; i++) {
    if (headerGroups[i].label === label) return offset;
    offset += headerGroups[i].span;
  }
  return null;
}

function round2(n) { return Math.round(n * 100) / 100; }

// The "Roster" tab is laid out as repeating 3-column blocks — [GroupLetter,
// TeamName, PlayerName] — one block per group, side by side (no blank
// spacer columns between them, unlike the map-tally sheets). The group
// letter is written only once, in the very first data row of its block;
// every squad listed anywhere below in that same 3-column block belongs to
// that same group. This became necessary once the group-stage sheets
// stopped being one-per-group (they're now crossover matchups like
// "A + B", "C + D") — sheet name alone no longer tells you a team's group,
// so this tab is the authoritative source instead.
// Returns a Map of teamName -> group letter.
function parseTeamGroups(rosterRows) {
  const teamToGroup = new Map();
  if (!rosterRows || !rosterRows.length) return teamToGroup;

  const totalCols = rosterRows.reduce(function (max, r) { return Math.max(max, r.length); }, 0);
  const blockCount = Math.floor(totalCols / 3);

  for (let b = 0; b < blockCount; b++) {
    const letterCol = b * 3, teamCol = b * 3 + 1;
    const letter = String((rosterRows[0] || [])[letterCol] || '').trim();
    if (!letter) continue;

    rosterRows.forEach(function (row) {
      const teamName = String(row[teamCol] == null ? '' : row[teamCol]).trim();
      if (teamName) teamToGroup.set(teamName, letter);
    });
  }
  return teamToGroup;
}

// Merges teams across whichever `sheets` are passed in — the full roster
// passes every tally sheet; getGroupStageQualifiers() passes only the
// group-stage ones. Same merge-by-name, sum-across-sheets rule either way.
function aggregateTeamsFromSheets(sheets, teamToGroup) {
  const byTeam = new Map(); // squad name -> { name, appearances:Set, players:Map(name->kills), totalScore, killPoints }

  sheets.forEach(function (sheet) {
    const killCols = findColumnsByLabel(sheet.subHeader, 'K');
    // One 'P' (placement) column per Map N group on the sheet — a team's
    // GW (# of maps they placed 1st on) is counted off the leader row's
    // value in EACH of these, not just the first map.
    const placeCols = findColumnsByLabel(sheet.subHeader, 'P');
    const totalKillPointsCol = findGroupStartColumn(sheet.headerGroups, 'Total\nKill Points');
    const totalScoreCol = findGroupStartColumn(sheet.headerGroups, 'Total\nScores');
    // Squad/Members IGN used to always be columns A/B, but a Region column
    // inserted at B shifted Members IGN to C on every tally sheet — look
    // these up by their own header label (same as the Total columns above)
    // instead of a fixed index, so a future column insertion doesn't
    // silently break kill attribution again. Falls back to the old fixed
    // positions only if a sheet is somehow missing those exact headers.
    const squadCol  = findGroupStartColumn(sheet.headerGroups, 'Squad');
    const regionCol = findGroupStartColumn(sheet.headerGroups, 'Region');
    const playerCol = findGroupStartColumn(sheet.headerGroups, 'Members IGN');
    const squadColIdx  = squadCol  !== null ? squadCol  : 0;
    const playerColIdx = playerCol !== null ? playerCol : 1;

    let current = null;
    sheet.dataRows.forEach(function (row) {
      const squadName = String(row[squadColIdx] == null ? '' : row[squadColIdx]).trim();
      const playerName = String(row[playerColIdx] == null ? '' : row[playerColIdx]).trim();
      if (squadName) {
        current = byTeam.get(squadName);
  if (!current) {
          current = { name: squadName, region: '', appearances: new Set(), players: new Map(), totalScore: 0, killPoints: 0, wins: 0 };
          byTeam.set(squadName, current);
        }
        current.appearances.add(sheet.name);
        if (!current.region && regionCol !== null && row[regionCol] != null) {
          const region = String(row[regionCol]).trim();
          if (region) current.region = region;
        }
        // These "Total ..." values only live on a team's leader row — they
        // already represent that WHOLE sheet's total for the team, so we
        // add each sheet's leader-row value once per sheet the team appears in.
        if (totalKillPointsCol !== null && typeof row[totalKillPointsCol] === 'number') current.killPoints += row[totalKillPointsCol];
        if (totalScoreCol !== null && typeof row[totalScoreCol] === 'number') current.totalScore += row[totalScoreCol];
        current.wins += placeCols.reduce(function (sum, c) { return sum + (row[c] === 1 || row[c] === '1' ? 1 : 0); }, 0);
      }
      if (!current || !playerName) return;
      const kills = killCols.reduce(function (sum, c) { return sum + (typeof row[c] === 'number' ? row[c] : 0); }, 0);
      current.players.set(playerName, (current.players.get(playerName) || 0) + kills);
    });
  });

  return Array.from(byTeam.values()).map(function (t) {
    const players = Array.from(t.players.entries()).map(function (entry) { return { name: entry[0], kills: entry[1] }; });
    const totalKills = players.reduce(function (sum, p) { return sum + p.kills; }, 0);
    const killPoints = round2(t.killPoints);
    const totalScore = round2(t.totalScore);
    const placementPoints = round2(totalScore - killPoints);
    return {
      name: t.name,
      region: t.region || '',
      group: teamToGroup.get(t.name) || null,
      totalKills: totalKills,
      killPoints: killPoints,
      placementPoints: placementPoints,
      totalScore: totalScore,
      wins: t.wins || 0,
      appearances: Array.from(t.appearances),
      players: players,
    };
  });
}

function buildRoster() {
  const data = externalTally.get();
  const teamToGroup = parseTeamGroups(data.rosterRows);
  const teams = aggregateTeamsFromSheets(data.sheets, teamToGroup);
  return { teams: teams, fetchedAt: data.fetchedAt, error: data.error };
}

// Sheets that don't count as "group stage" for qualification purposes —
// matched by exact name, not position, so reordering tabs or adding a 6th
// group-stage sheet later can't silently break this (a purely positional
// "first N sheets" rule would).
const NON_GROUP_STAGE_SHEETS = ['Playoffs', 'Grand Finals'];

// Top N teams (default 20) ranked on group-stage performance ONLY — every
// tally sheet except Playoffs/Grand Finals, summed the same way the full
// roster sums across all sheets. Ties broken by total KILL POINTS (higher
// wins), not raw kill count — same tiebreaker convention used everywhere
// else a ranking is shown.
// limit: number of teams to return (default 20 when omitted); pass `null`
// explicitly for no cap at all — e.g. the Dashboard's Group Leaderboard
// wants every group-stage team ranked, not just the top 20 who qualify.
function getGroupStageQualifiers(limit) {
  const data = externalTally.get();
  const teamToGroup = parseTeamGroups(data.rosterRows);
  const groupStageSheets = data.sheets.filter(function (s) { return NON_GROUP_STAGE_SHEETS.indexOf(s.name) === -1; });
  const teams = aggregateTeamsFromSheets(groupStageSheets, teamToGroup);

  const n = limit === undefined ? 20 : limit;
  const sorted = teams.slice().sort(function (a, b) {
    return b.totalScore - a.totalScore || b.killPoints - a.killPoints || a.name.localeCompare(b.name);
  });
  const sliced = n === null ? sorted : sorted.slice(0, n);
  const qualifiers = sliced.map(function (t, i) {
    return Object.assign({ rank: i + 1 }, t);
  });

  return {
    fetchedAt: data.fetchedAt,
    error: data.error,
    sourceSheets: groupStageSheets.map(function (s) { return s.name; }),
    qualifiers: qualifiers,
  };
}

// The full roster plus a few pre-ranked summaries — top 20 teams by kills,
// top 20 players by kills (across every team), top 20 teams by placement
// points.
function getRosterWithSummaries() {
  const roster = buildRoster();
  const teamsByKills = roster.teams.slice().sort(function (a, b) {
    return b.totalKills - a.totalKills || a.name.localeCompare(b.name);
  });
  const teamsByPlacement = roster.teams.slice().sort(function (a, b) {
    return b.placementPoints - a.placementPoints || a.name.localeCompare(b.name);
  });

  const allPlayers = [];
  roster.teams.forEach(function (t) {
    t.players.forEach(function (p) { allPlayers.push({ name: p.name, team: t.name, kills: p.kills }); });
  });
  allPlayers.sort(function (a, b) { return b.kills - a.kills || a.name.localeCompare(b.name); });

  // Every group letter actually present, sorted — so the client can build
  // its filter options dynamically instead of hardcoding "A" through "D"
  // (a 5th group tomorrow just shows up here with no code change).
  const groups = Array.from(new Set(roster.teams.map(function (t) { return t.group; }).filter(Boolean))).sort();

  return {
    fetchedAt: roster.fetchedAt,
    error: roster.error,
    teams: teamsByKills,
    groups: groups,
    mostKillsByTeam: teamsByKills.slice(0, 20).map(function (t) { return { name: t.name, kills: t.totalKills }; }),
    mostKillsByPlayer: allPlayers.slice(0, 20),
    topPlacementPoints: teamsByPlacement.slice(0, 20).map(function (t) { return { name: t.name, placementPoints: t.placementPoints }; }),
  };
}

// Team / Region / Total Score for the CURRENTLY live Tally sheet only
// (lib/tallyState.js's liveTallyTab, set from the Tally console's
// sidebar) — one row per squad's own leader row, ranked by Total Score
// descending. Powers Match Board's "Teams & Series Score" panel, and
// ingame.html's team scoreboard (killPoints/placementPoints/
// currentMapKills added for that — see sbFillScoreRow in
// overlay-scoreboard.js). Squad/Region/Total Score/Kill Points are all
// looked up by their own header label (same reasoning as
// aggregateTeamsFromSheets above) rather than a fixed index, so a future
// column insertion doesn't silently break this either.
function getLiveSheetStandings() {
  const liveTallyTab = tallyState.get().liveTallyTab;
  const data = externalTally.get();
  if (!liveTallyTab) return { sheet: null, teams: [], fetchedAt: data.fetchedAt, error: data.error };

  const sheet = data.sheets.find(function (s) { return s.name === liveTallyTab; });
  if (!sheet) return { sheet: liveTallyTab, teams: [], fetchedAt: data.fetchedAt, error: data.error };

  const squadCol   = findGroupStartColumn(sheet.headerGroups, 'Squad');
  const regionCol  = findGroupStartColumn(sheet.headerGroups, 'Region');
  const scoreCol   = findGroupStartColumn(sheet.headerGroups, 'Total\nScores');
  const killPtsCol = findGroupStartColumn(sheet.headerGroups, 'Total\nKill Points');
  const squadColIdx = squadCol !== null ? squadCol : 0;

  // currentMapKills — THIS map's own kill points only, not the running
  // Total Kill Points above. Each "Map N" header group is a 5-column
  // P/K/TKP/PS/spacer block (see externalTally.js's buildHeaderGroups);
  // TKP (that map's own kill points, offset +2 from the block's start)
  // is used rather than the raw K/kill-count column so this stays
  // consistent with killPoints' own points-not-kills semantics (a
  // kill-point setting other than 1-per-kill would otherwise disagree
  // with the season-long total for the exact same map).
  const currentMap = matchState.get().match;
  const currentMapStartCol = currentMap ? findGroupStartColumn(sheet.headerGroups, 'Map ' + currentMap) : null;
  const currentMapKillCol = currentMapStartCol !== null ? currentMapStartCol + 2 : null;

  const teams = [];
  sheet.dataRows.forEach(function (row) {
    const squadName = String(row[squadColIdx] == null ? '' : row[squadColIdx]).trim();
    if (!squadName) return; // player sub-row, not a team's own leader row
    const region = (regionCol !== null && row[regionCol] != null) ? String(row[regionCol]).trim() : '';
    const totalScore = (scoreCol   !== null && typeof row[scoreCol]   === 'number') ? row[scoreCol]   : 0;
    const killPoints  = (killPtsCol !== null && typeof row[killPtsCol] === 'number') ? row[killPtsCol] : 0;
    const currentMapKills = (currentMapKillCol !== null && typeof row[currentMapKillCol] === 'number') ? row[currentMapKillCol] : 0;
    teams.push({
      name: squadName,
      region: region,
      totalScore: totalScore,
      killPoints: round2(killPoints),
      placementPoints: round2(totalScore - killPoints),
      currentMapKills: round2(currentMapKills),
    });
  });
  teams.sort(function (a, b) { return b.totalScore - a.totalScore || a.name.localeCompare(b.name); });

  return { sheet: liveTallyTab, teams: teams, fetchedAt: data.fetchedAt, error: data.error };
}

// Team standings for the CURRENTLY selected map (matchState's `match`
// number) on the CURRENTLY live tally sheet only — unlike
// getLiveSheetStandings() above, every number here comes from that one
// "Map N" column group alone (P/K/TKP/PS), not the sheet's running
// totals. Powers the Map Ranking scene (Fullscreen.html), which is
// explicitly "only the score in the current selected map", not the
// season-long standings Overall Ranking/getGroupStageQualifiers show.
function getCurrentMapStandings() {
  const liveTallyTab = tallyState.get().liveTallyTab;
  const data = externalTally.get();
  if (!liveTallyTab) return { sheet: null, map: null, teams: [], fetchedAt: data.fetchedAt, error: data.error };

  const sheet = data.sheets.find(function (s) { return s.name === liveTallyTab; });
  if (!sheet) return { sheet: liveTallyTab, map: null, teams: [], fetchedAt: data.fetchedAt, error: data.error };

  const currentMap = matchState.get().match;
  const mapStartCol = currentMap ? findGroupStartColumn(sheet.headerGroups, 'Map ' + currentMap) : null;
  if (mapStartCol === null) return { sheet: liveTallyTab, map: currentMap, teams: [], fetchedAt: data.fetchedAt, error: data.error };

  // Each "Map N" group is P, K, TKP, PS (see externalTally.js's buildHeaderGroups).
  const placeCol = mapStartCol;
  const killPtsCol = mapStartCol + 2;
  const placePtsCol = mapStartCol + 3;

  const squadCol  = findGroupStartColumn(sheet.headerGroups, 'Squad');
  const regionCol = findGroupStartColumn(sheet.headerGroups, 'Region');
  const squadColIdx = squadCol !== null ? squadCol : 0;
  const teamToGroup = parseTeamGroups(data.rosterRows);

  const teams = [];
  sheet.dataRows.forEach(function (row) {
    const squadName = String(row[squadColIdx] == null ? '' : row[squadColIdx]).trim();
    if (!squadName) return; // player sub-row, not a team's own leader row
    const region = (regionCol !== null && row[regionCol] != null) ? String(row[regionCol]).trim() : '';
    const killPoints = (typeof row[killPtsCol] === 'number') ? row[killPtsCol] : 0;
    const placementPoints = (typeof row[placePtsCol] === 'number') ? row[placePtsCol] : 0;
    const win = row[placeCol] === 1 || row[placeCol] === '1';
    teams.push({
      name: squadName,
      region: region,
      group: teamToGroup.get(squadName) || null,
      // "KP" (Kill Points), not raw kill count — matches getLiveSheetStandings'
      // own TKP-not-K reasoning above and keeps this in sync with totalScore
      // (killPoints + placementPoints) below.
      totalKills: round2(killPoints),
      placementPoints: round2(placementPoints),
      totalScore: round2(killPoints + placementPoints),
      wins: win ? 1 : 0,
    });
  });
  teams.sort(function (a, b) { return b.totalScore - a.totalScore || b.totalKills - a.totalKills || a.name.localeCompare(b.name); });
  const ranked = teams.map(function (t, i) { return Object.assign({ rank: i + 1 }, t); });

  return { sheet: liveTallyTab, map: currentMap, teams: ranked, fetchedAt: data.fetchedAt, error: data.error };
}

// Team standings for the CURRENTLY live tally sheet's own running total —
// every map played within that one sheet, not just one map
// (getCurrentMapStandings above) and not the whole season across every
// sheet (getGroupStageQualifiers). Reuses aggregateTeamsFromSheets exactly
// as-is, just scoped to the single live sheet, so it comes with the same
// name/region/group/totalKills/placementPoints/totalScore/wins shape the
// Overall Ranking / Group Ranking scenes (Fullscreen.html) already know
// how to render.
function getLiveSheetOverallStandings() {
  const liveTallyTab = tallyState.get().liveTallyTab;
  const data = externalTally.get();
  if (!liveTallyTab) return { sheet: null, teams: [], fetchedAt: data.fetchedAt, error: data.error };

  const sheet = data.sheets.find(function (s) { return s.name === liveTallyTab; });
  if (!sheet) return { sheet: liveTallyTab, teams: [], fetchedAt: data.fetchedAt, error: data.error };

  const teamToGroup = parseTeamGroups(data.rosterRows);
  const teams = aggregateTeamsFromSheets([sheet], teamToGroup);
  // Tie broken by total KILL POINTS, not raw kill count — same convention
  // as every other ranking (see getGroupStageQualifiers above).
  teams.sort(function (a, b) { return b.totalScore - a.totalScore || b.killPoints - a.killPoints || a.name.localeCompare(b.name); });
  const ranked = teams.map(function (t, i) { return Object.assign({ rank: i + 1 }, t); });

  return { sheet: liveTallyTab, teams: ranked, fetchedAt: data.fetchedAt, error: data.error };
}

// Standings for Waiting Screen TVC. During Qualifiers there's no single
// "live" tally tab that means the whole stage — there are up to 20
// Qualifier tabs total, 5 per day (Day 1: Qualifier 1-5, Day 2: Qualifier
// 6-10, Day 3: 11-15, Day 4: 16-20), and each is its OWN standings table,
// not summed together — so this returns one page per qualifier tab in that
// day's block, each independently ranked (page 1 = Qualifier N's own
// standings, ..., page 5 = Qualifier N+4's). Any other stage has no such
// day/tab split, so it falls back to a single page: the plain
// currently-live-tab behavior getLiveSheetStandings() already uses.
function getWaitingTvcStandings() {
  const data = externalTally.get();
  const ms = matchState.get();
  const isQualifiers = /qualifier/i.test((ms && ms.stage) || '');
  const teamToGroup = parseTeamGroups(data.rosterRows);

  function rankSheet(sheet) {
    const teams = aggregateTeamsFromSheets(sheet ? [sheet] : [], teamToGroup);
    // Tie broken by total KILL POINTS, not raw kill count — same convention
    // as every other ranking (see getGroupStageQualifiers above).
    teams.sort(function (a, b) { return b.totalScore - a.totalScore || b.killPoints - a.killPoints || a.name.localeCompare(b.name); });
    return teams.map(function (t, i) { return Object.assign({ rank: i + 1 }, t); });
  }

  if (isQualifiers) {
    const day = (ms && ms.day) || 1;
    const firstTab = (day - 1) * 5 + 1;
    const pages = [];
    for (let n = firstTab; n < firstTab + 5; n++) {
      const name = 'Qualifier ' + n;
      const sheet = data.sheets.find(function (s) { return s.name === name; });
      pages.push({ sheet: name, teams: rankSheet(sheet) });
    }
    return { mode: 'qualifiers', pages: pages, fetchedAt: data.fetchedAt, error: data.error };
  }

  const liveTallyTab = tallyState.get().liveTallyTab;
  const sheet = liveTallyTab ? data.sheets.find(function (s) { return s.name === liveTallyTab; }) : null;
  return { mode: 'live', sheet: liveTallyTab, teams: rankSheet(sheet), fetchedAt: data.fetchedAt, error: data.error };
}

// A sheet "has data" (the game has actually been played) only if some
// operator has typed a real P or K value into at least one cell — NOT
// "some team's Total Score is > 0", since an untouched sheet's formulas
// resolve blank placement/kill cells to "" and 0 respectively, and "0 + an
// error/blank" reads back from the Sheets API as a non-number (so an
// unplayed sheet's totals already look like 0 everywhere) — checking the
// raw P/K input columns instead is what actually distinguishes "not
// played yet" from "played and everyone happened to score 0".
function sheetHasData(sheet) {
  const cols = findColumnsByLabel(sheet.subHeader, 'P').concat(findColumnsByLabel(sheet.subHeader, 'K'));
  return sheet.dataRows.some(function (row) {
    return cols.some(function (c) { return typeof row[c] === 'number'; });
  });
}

// Qualified Teams 1/2 (Fullscreen.html) — the rank 1 and rank 2 team from
// EACH Qualifier tab in [fromTab..toTab] (Qualified Teams 1 -> Qualifier
// 1-10, Qualified Teams 2 -> Qualifier 11-20), in Qualifier order, rank 1
// then rank 2 within each. A Qualifier tab with no P/K data entered yet
// (see sheetHasData above) contributes NO entries at all — not a
// placeholder row — since "the game hasn't been played yet" for that
// qualifier means there's no rank 1/2 to show, not a rank 1/2 that
// happens to be blank.
function getQualifiedTeamsStandings(fromTab, toTab) {
  const data = externalTally.get();
  const teamToGroup = parseTeamGroups(data.rosterRows);
  const entries = [];

  for (let n = fromTab; n <= toTab; n++) {
    const name = 'Qualifier ' + n;
    const sheet = data.sheets.find(function (s) { return s.name === name; });
    if (!sheet || !sheetHasData(sheet)) continue;

    const teams = aggregateTeamsFromSheets([sheet], teamToGroup);
    teams.sort(function (a, b) { return b.totalScore - a.totalScore || b.killPoints - a.killPoints || a.name.localeCompare(b.name); });
    teams.slice(0, 2).forEach(function (t, i) {
      entries.push(Object.assign({ qualifier: n, rank: i + 1 }, t));
    });
  }

  return { fromTab: fromTab, toTab: toTab, entries: entries, fetchedAt: data.fetchedAt, error: data.error };
}

module.exports = {
  buildRoster: buildRoster,
  getRosterWithSummaries: getRosterWithSummaries,
  getGroupStageQualifiers: getGroupStageQualifiers,
  getLiveSheetStandings: getLiveSheetStandings,
  getCurrentMapStandings: getCurrentMapStandings,
  getLiveSheetOverallStandings: getLiveSheetOverallStandings,
  getWaitingTvcStandings: getWaitingTvcStandings,
  getQualifiedTeamsStandings: getQualifiedTeamsStandings,
};
