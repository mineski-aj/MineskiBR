// lib/externalTally.js — read-only mirror of an externally-maintained
// Google Sheet, via the real Sheets API v4 (service-account auth), for the
// experimental "Tally" tab. This is intentionally separate from
// lib/tallyState.js's collaborative groups/teams/matches model — it's a
// live view of someone else's spreadsheet, not data this app owns or
// writes to.
//
// Switched from parsing the published "publish to web" XLSX export to the
// real API: that public export is served through a CDN that can lag or
// serve inconsistent snapshots for a while after an edit (a whole saga of
// flapping/stale-read bugs came from that), whereas the API reads straight
// from Sheets' live backend — no propagation delay, no CDN inconsistency.
//
// Polls on a timer (not per-request) so N browsers with the Tally tab open
// don't turn into N x as many requests to Google. The source sheet is
// changeable at runtime from Settings (setSourceUrl) and persisted to
// tally_sheet_config.json so it survives a restart.
const fs = require('fs');
const path = require('path');
const { getAccessToken } = require('./googleSheetsAuth');

const CONFIG_FILE = path.join(__dirname, '..', 'tally_sheet_config.json');
const DEFAULT_SPREADSHEET_ID = '1SL9GAC15zpUgPVLiTPvGGfTYnvI4u_h_DsKs7q_jyNU';
const POLL_MS = 3500; // a hair over 3s, easy on the Sheets API quota

let spreadsheetId = DEFAULT_SPREADSHEET_ID;
let sourceUrl = 'https://docs.google.com/spreadsheets/d/' + DEFAULT_SPREADSHEET_ID + '/edit';

if (fs.existsSync(CONFIG_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (saved && saved.spreadsheetId) {
      spreadsheetId = saved.spreadsheetId;
      sourceUrl = saved.sourceUrl || sourceUrl;
    }
  } catch (e) {
    console.warn('[externalTally] Could not parse tally_sheet_config.json, using default sheet');
  }
}

let cache = { sheets: [], rosterRows: null, fetchedAt: null, error: null, sourceUrl: sourceUrl };
let fetchInFlight = false;

function isEmptyCell(v) { return v === '' || v === null || v === undefined; }

function trimTrailingEmptyRows(rows) {
  let end = rows.length;
  while (end > 0 && rows[end - 1].every(isEmptyCell)) end--;
  return rows.slice(0, end);
}

// The Sheets API omits trailing empty cells in a row instead of padding
// them out — restore each row to the sheet's full column count so column
// indices line up the same way the rest of this file (and the client)
// expect, matching how the previous XLSX-based reader behaved.
function padRows(rows, width) {
  return rows.map(function (row) {
    return row.length >= width ? row : row.concat(Array(width - row.length).fill(''));
  });
}

// This tally format always starts with a "Squad" / "Members IGN" header
// followed by one 5-column block (P/K/TKP/PS/spacer) per map. Detecting by
// that content signature — not by sheet name — means a newly added sheet
// (e.g. a "Group Stage D" for a bigger bracket) shows up automatically with
// no code change, while unrelated helper tabs in the same workbook (room
// slot assignments, a standings scratchpad, anything not in this format)
// are silently skipped instead of rendering as a garbled table.
function isTallySheet(rows) {
  const header = rows[0] || [];
  return String(header[0] || '').trim().toLowerCase() === 'squad';
}

// Row 0 has a label only in the first column of each block (e.g. "Map 3
// TPP") with the rest of that block's columns left blank (a real merged
// cell, read back this way by the API too) — this collapses those runs
// back into {label, span} groups so the client can render a single
// <th colspan> per block instead of the raw blank-padded row.
function buildHeaderGroups(row) {
  const groups = [];
  for (let i = 0; i < row.length; i++) {
    if (isEmptyCell(row[i])) continue;
    let span = 1;
    while (i + span < row.length && isEmptyCell(row[i + span])) span++;
    groups.push({ label: String(row[i]), span });
    i += span - 1;
  }
  return groups;
}

// A1-notation range that's JUST a sheet title (no "!A1:B2" suffix) is
// supposed to mean "the whole sheet" — but if the title itself happens to
// also be valid A1 cell/range syntax (a tab literally named "Q1", "A1",
// "B2", etc. — exactly what a "Qualifiers" tab often gets shortened to),
// the Sheets API resolves the ambiguity in favor of the CELL reading
// instead: 'Q1'!Q1, a single cell, which then 400s as out of grid bounds
// for a sheet with no column Q. Single-quoting the title removes the
// ambiguity (it's always valid A1 syntax for "reference this sheet by
// name," title-looks-like-a-cell or not) — doubling any embedded quote is
// the standard A1 escape for a literal quote inside a quoted sheet name.
function quoteSheetName(name) {
  return "'" + String(name).replace(/'/g, "''") + "'";
}

// Accepts either a full Google Sheets URL (any of its usual forms) or a
// bare spreadsheet ID pasted directly.
function extractSpreadsheetId(input) {
  const trimmed = (input || '').trim();
  const m = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]+$/.test(trimmed)) return trimmed;
  return null;
}

async function sheetsApiGet(url) {
  const token = await getAccessToken();
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) {
    const body = await res.text();
    let message = body;
    try { message = JSON.parse(body).error.message; } catch (e) { /* not JSON, use raw body as-is */ }
    throw new Error('HTTP ' + res.status + ': ' + message);
  }
  return res.json();
}

// Does the actual fetch-metadata + batchGet-values + parse work for a given
// spreadsheet id. Deliberately has no knowledge of `fetchInFlight` or the
// module-level `cache`/`spreadsheetId` — both the scheduled poller AND
// setSourceUrl's validation call this directly, so validating a NEW id can
// never be silently skipped just because a background poll of the OLD id
// happens to be in flight at that moment (that was a real bug: it let a
// bogus id through as "ok" once, because the skip returned undefined and
// the caller mistook untouched leftover state for a successful validation).
async function fetchSheetsData(id) {
  const apiBase = 'https://sheets.googleapis.com/v4/spreadsheets/' + id;
  const meta = await sheetsApiGet(apiBase + '?fields=' + encodeURIComponent('sheets.properties.title'));
  const titles = (meta.sheets || []).map(function (s) { return s.properties.title; });
  if (titles.length === 0) return { sheets: [], rosterRows: null };

  const rangesQuery = titles.map(function (t) { return 'ranges=' + encodeURIComponent(quoteSheetName(t)); }).join('&');
  const values = await sheetsApiGet(
    apiBase + '/values:batchGet?' + rangesQuery + '&valueRenderOption=UNFORMATTED_VALUE'
  );

  const sheets = [];
  let rosterRows = null;
  (values.valueRanges || []).forEach(function (vr, i) {
    const raw = vr.values || [];
    // The "Roster" tab (any casing) is a different-purpose sheet — a
    // team-to-group listing, not a per-map kill tally — so it's captured
    // separately here (raw, unpadded/untrimmed) instead of going through
    // isTallySheet()'s "Squad" header check, which it would fail anyway.
    if (String(titles[i] || '').trim().toLowerCase() === 'roster') {
      rosterRows = raw;
      return;
    }
    if (!isTallySheet(raw)) return;
    const width = raw.reduce(function (max, r) { return Math.max(max, r.length); }, 0);
    const rows = trimTrailingEmptyRows(padRows(raw, width));
    sheets.push({
      name: titles[i],
      headerGroups: buildHeaderGroups(rows[0] || []),
      subHeader: rows[1] || [],
      dataRows: rows.slice(2),
    });
  });
  return { sheets: sheets, rosterRows: rosterRows };
}

async function fetchAndParse() {
  if (fetchInFlight) return;
  fetchInFlight = true;
  try {
    const result = await fetchSheetsData(spreadsheetId);
    cache = { sheets: result.sheets, rosterRows: result.rosterRows, fetchedAt: Date.now(), error: null, sourceUrl: sourceUrl };
  } catch (e) {
    // Keep serving the last good snapshot through a transient fetch/parse
    // failure — only the error flag changes, so the client can show a
    // "stale, last updated at..." banner instead of the table going blank.
    cache = { sheets: cache.sheets, rosterRows: cache.rosterRows, fetchedAt: cache.fetchedAt, error: String((e && e.message) || e), sourceUrl: sourceUrl };
  } finally {
    fetchInFlight = false;
  }
}

function get() { return cache; }

// Switches the source sheet at runtime (Settings tab) and persists the
// choice. Validates with its OWN independent fetch (fetchSheetsData, not
// the guarded fetchAndParse) before committing anything — if that fails
// (bad ID, not shared with the service account, wrong API enabled, etc.),
// nothing about the current working sheet is touched at all.
async function setSourceUrl(rawInput) {
  const id = extractSpreadsheetId(rawInput);
  if (!id) return { ok: false, error: "Couldn't find a spreadsheet ID in that URL." };

  let result;
  try {
    result = await fetchSheetsData(id);
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }

  spreadsheetId = id;
  sourceUrl = (rawInput || '').trim();
  cache = { sheets: result.sheets, rosterRows: result.rosterRows, fetchedAt: Date.now(), error: null, sourceUrl: sourceUrl };

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ spreadsheetId: spreadsheetId, sourceUrl: sourceUrl }, null, 2));
  } catch (e) {
    console.warn('[externalTally] Could not write tally_sheet_config.json');
  }
  return { ok: true };
}

fetchAndParse();
setInterval(fetchAndParse, POLL_MS);

module.exports = { get, setSourceUrl };
