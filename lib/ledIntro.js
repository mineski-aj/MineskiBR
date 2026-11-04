// lib/ledIntro.js — the 10 Grand Finals squads that get a Team Introduction
// on the LED (html/ledoverlay.html). Each has its own /led/intro/<slug>/show|hide route.
const TEAMS = [
  'ADMT MAIN', 'POISON IVY GIZY', 'ADMT PYRITE', 'ASC', 'CHANGE WORLD',
  'GNR ESPORTS LEGACY OMEN', 'LEAP MAIN', 'M12 sYn MAIN', 'REVENANT ECLIPSE', 'ROYAL GEMINI JA LN',
];
const slugify = n => String(n).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const list = () => TEAMS.map(name => ({ name, slug: slugify(name) }));
const bySlug = slug => list().find(t => t.slug === slug) || null;
module.exports = { list, bySlug, slugify };
