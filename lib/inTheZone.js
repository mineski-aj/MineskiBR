// lib/inTheZone.js — Grand Finals "In The Zone" state.
//
// In The Zone is a Grand-Finals-only state a squad can be in. The operator
// flags which squads are in it from the dashboard's IN THE ZONE tab, and sets
// the score threshold a squad has to reach to qualify for it. For now this is
// just the persisted state behind that page — nothing reads it yet (no overlay
// or standings logic uses the threshold), so it's deliberately inert.
// Persisted to in_the_zone.json: { zone: ["SQUAD", ...], won: ["SQUAD", ...], threshold: number|null }.
// `won` = squads that WON via ZOWNED! (always a subset of `zone`) — the overlay
// draws those rows red with a crown instead of yellow with Z!.
const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'in_the_zone.json');

function names(arr) {
  const seen = new Set();
  return (Array.isArray(arr) ? arr : []).map(function (n) { return String(n == null ? '' : n).trim(); })
    .filter(function (n) { const k = n.toLowerCase(); if (!n || seen.has(k)) return false; seen.add(k); return true; });
}

function get() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const t = Number(d.threshold);
    const zone = names(d.zone);
    const inZone = new Set(zone.map(function (n) { return n.toLowerCase(); }));
    return {
      zone: zone,
      won: names(d.won).filter(function (n) { return inZone.has(n.toLowerCase()); }),
      threshold: d.threshold === null || d.threshold === '' || !isFinite(t) || t < 0 ? null : t,
    };
  } catch (e) {
    return { zone: [], won: [], threshold: null };
  }
}

function set(body) {
  const zone = names(body && body.zone);
  const inZone = new Set(zone.map(function (n) { return n.toLowerCase(); }));
  const won = names(body && body.won).filter(function (n) { return inZone.has(n.toLowerCase()); });
  const raw = body && body.threshold;
  const t = Number(raw);
  const threshold = raw === null || raw === undefined || raw === '' || !isFinite(t) || t < 0 ? null : t;
  fs.writeFileSync(FILE, JSON.stringify({ zone: zone, won: won, threshold: threshold }));
  return { zone: zone, won: won, threshold: threshold };
}

module.exports = { get, set };
