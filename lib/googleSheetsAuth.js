// lib/googleSheetsAuth.js — service-account OAuth2 for the Google Sheets
// API (read-only), used by lib/externalTally.js. Signs a JWT with the
// service account's private key and exchanges it for a short-lived access
// token, refreshing only when the cached one is close to expiring. No
// external auth library needed — just Node's built-in crypto + fetch.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEY_PATH = path.join(__dirname, '..', 'google-service-account.json');
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

let key = null;
function loadKey() {
  if (!key) key = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
  return key;
}

function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAccessToken() {
  // Refresh a minute before actual expiry so an in-flight request never
  // gets caught using a token that expires mid-call.
  if (cachedToken && Date.now() < cachedTokenExpiry - 60000) return cachedToken;

  const k = loadKey();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = { iss: k.client_email, scope: SCOPE, aud: k.token_uri, iat: now, exp: now + 3600 };
  const signingInput = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(claims));
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(k.private_key);
  const jwt = signingInput + '.' + base64url(signature);

  const res = await fetch(k.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error('Google token exchange failed: HTTP ' + res.status + ' ' + (await res.text()));
  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiry = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

module.exports = { getAccessToken };
