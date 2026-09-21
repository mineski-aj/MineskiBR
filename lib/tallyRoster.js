// lib/tallyRoster.js — derives the whole-tournament roster (teams, players,
// kills, and the score breakdown) from lib/externalTally.js's parsed
// sheets. A squad appearing in more than one sheet (advanced from a Group
// Stage into Grand Finals, etc.) is merged into one entry — same rule the
// Roster page already used, now centralized here so both the page and the
// /api/roster JSON endpoint compute it exactly the same way.
const externalTally = require('./externalTally');
const tallyState    = require('./tallyState');

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
    const totalKillPointsCol = findGroupStartColumn(sheet.headerGroups, 'Total\nKill Points');
    const totalScoreCol = findGroupStartColumn(sheet.headerGroups, 'Total\nScores');
    // Squad/Members IGN used to always be columns A/B, but a Region column
    // inserted at B shifted Members IGN to C on every tally sheet — look
    // these up by their own header label (same as the Total columns above)
    // instead of a fixed index, so a future column insertion doesn't
    // silently break kill attribution again. Falls back to the old fixed
    // positions only if a sheet is somehow missing those exact headers.
    const squadCol  = findGroupStartColumn(sheet.headerGroups, 'Squad');
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
          current = { name: squadName, appearances: new Set(), players: new Map(), totalScore: 0, killPoints: 0 };
          byTeam.set(squadName, current);
        }
        current.appearances.add(sheet.name);
        // These "Total ..." values only live on a team's leader row — they
        // already represent that WHOLE sheet's total for the team, so we
        // add each sheet's leader-row value once per sheet the team appears in.
        if (totalKillPointsCol !== null && typeof row[totalKillPointsCol] === 'number') current.killPoints += row[totalKillPointsCol];
        if (totalScoreCol !== null && typeof row[totalScoreCol] === 'number') current.totalScore += row[totalScoreCol];
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
      group: teamToGroup.get(t.name) || null,
      totalKills: totalKills,
      killPoints: killPoints,
      placementPoints: placementPoints,
      totalScore: totalScore,
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
// roster sums across all sheets. Ties broken by raw kill total (higher
// kills wins), same tiebreaker convention used elsewhere in this app.
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
    return b.totalScore - a.totalScore || b.totalKills - a.totalKills || a.name.localeCompare(b.name);
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
// descending. Powers Match Board's "Teams & Series Score" panel. Squad/
// Region/Total Score are all looked up by their own header label (same
// reasoning as aggregateTeamsFromSheets above) rather than a fixed index,
// so a future column insertion doesn't silently break this either.
function getLiveSheetStandings() {
  const liveTallyTab = tallyState.get().liveTallyTab;
  const data = externalTally.get();
  if (!liveTallyTab) return { sheet: null, teams: [], fetchedAt: data.fetchedAt, error: data.error };

  const sheet = data.sheets.find(function (s) { return s.name === liveTallyTab; });
  if (!sheet) return { sheet: liveTallyTab, teams: [], fetchedAt: data.fetchedAt, error: data.error };

  const squadCol  = findGroupStartColumn(sheet.headerGroups, 'Squad');
  const regionCol = findGroupStartColumn(sheet.headerGroups, 'Region');
  const scoreCol  = findGroupStartColumn(sheet.headerGroups, 'Total\nScores');
  const squadColIdx = squadCol !== null ? squadCol : 0;

  const teams = [];
  sheet.dataRows.forEach(function (row) {
    const squadName = String(row[squadColIdx] == null ? '' : row[squadColIdx]).trim();
    if (!squadName) return; // player sub-row, not a team's own leader row
    const region = (regionCol !== null && row[regionCol] != null) ? String(row[regionCol]).trim() : '';
    const totalScore = (scoreCol !== null && typeof row[scoreCol] === 'number') ? row[scoreCol] : 0;
    teams.push({ name: squadName, region: region, totalScore: totalScore });
  });
  teams.sort(function (a, b) { return b.totalScore - a.totalScore || a.name.localeCompare(b.name); });

  return { sheet: liveTallyTab, teams: teams, fetchedAt: data.fetchedAt, error: data.error };
}

module.exports = {
  buildRoster: buildRoster,
  getRosterWithSummaries: getRosterWithSummaries,
  getGroupStageQualifiers: getGroupStageQualifiers,
  getLiveSheetStandings: getLiveSheetStandings,
};
