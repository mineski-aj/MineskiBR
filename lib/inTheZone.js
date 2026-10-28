// lib/inTheZone.js — Grand Finals "In The Zone" state.
//
// In The Zone is a Grand-Finals-only state a squad can be in. The operator
// flags which squads are in it from the dashboard's IN THE ZONE tab, and sets
// the score threshold a squad has to reach to qualify for it. For now this is
// just the persisted state behind that page — nothing reads it yet (no overlay
// or standings logic uses the threshold), so it's deliberately inert.
// Persisted to in_the_zone.json: { zone: ["SQUAD", ...], threshold: number|null }.
const fs   = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'in_the_zone.json');

function get() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const t = Number(d.threshold);
    return {
      zone: Array.isArray(d.zone) ? d.zone.map(function (n) { return String(n).trim(); }).filter(Boolean) : [],
      threshold: d.threshold === null || d.threshold === '' || !isFinite(t) || t < 0 ? null : t,
    };
  } catch (e) {
    return { zone: [], threshold: null };
  }
}

function set(body) {
  const seen = new Set();
  const zone = (Array.isArray(body && body.zone) ? body.zone : []).map(function (n) { return String(n == null ? '' : n).trim(); })
    .filter(function (n) { const k = n.toLowerCase(); if (!n || seen.has(k)) return false; seen.add(k); return true; });
  const raw = body && body.threshold;
  const t = Number(raw);
  const threshold = raw === null || raw === undefined || raw === '' || !isFinite(t) || t < 0 ? null : t;
  fs.writeFileSync(FILE, JSON.stringify({ zone: zone, threshold: threshold }));
  return { zone: zone, threshold: threshold };
}

module.exports = { get, set };
