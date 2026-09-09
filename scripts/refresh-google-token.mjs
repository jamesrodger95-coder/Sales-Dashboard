#!/usr/bin/env node
// Run with: node scripts/refresh-google-token.mjs
//
// Re-authorizes Google Calendar + Gmail send access and prints a fresh
// GOOGLE_REFRESH_TOKEN.
// Why this exists: refresh tokens silently expire when access is revoked, the password
// changes, or the token goes unused — when that happens, every calendar call fails with
// invalid_grant. There is no API to fix this; you have to grant consent in a browser.
//
// Requirements:
//   - .env.local must have GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
//   - Your OAuth client (Google Cloud Console → Credentials) must list this redirect URI
//     in "Authorized redirect URIs": http://localhost:8765/oauth2callback
//     (If it doesn't yet, add it and re-run.)

import http from 'node:http';
import { URL } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 8765;
const REDIRECT = `http://localhost:${PORT}/oauth2callback`;
// Calendar read is what the dashboard runs on; gmail.send is what the report
// crons need. The original token was minted with calendar only, so every
// sendGmailEmail() call returned 403 ACCESS_TOKEN_SCOPE_INSUFFICIENT and the
// emails silently never arrived. Both scopes are requested together so one
// re-auth fixes reading the calendar and sending the reports.
const SCOPE = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');

function loadEnv() {
  try {
    const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf-8');
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2];
    }
    return out;
  } catch {
    return {};
  }
}

const env = loadEnv();
const CLIENT_ID = env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env.local');
  process.exit(1);
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPE);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');           // force refresh-token issuance
authUrl.searchParams.set('include_granted_scopes', 'true');

console.log('\n=== Google Calendar re-auth ===\n');
console.log('Redirect URI in use:', REDIRECT);
console.log('Make sure this is listed under "Authorized redirect URIs" for this OAuth client.\n');
console.log('Open this URL in your browser, sign in as james@bryant.dental, click Allow:\n');
console.log(authUrl.toString());
console.log('\nListening for the callback on port', PORT, '...\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/oauth2callback') {
    res.writeHead(404); res.end('Not found'); return;
  }
  const code = url.searchParams.get('code');
  const err = url.searchParams.get('error');
  if (err) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`<h1>OAuth error</h1><pre>${err}</pre>`);
    console.error('OAuth error:', err);
    server.close(); process.exit(1);
  }
  if (!code) {
    res.writeHead(400); res.end('No code'); return;
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT, grant_type: 'authorization_code',
      }),
    });
    const body = await tokenRes.json();
    if (!tokenRes.ok || !body.refresh_token) {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<h1>Token exchange failed</h1><pre>${JSON.stringify(body, null, 2)}</pre>`);
      console.error('Token exchange failed:', body);
      if (!body.refresh_token) {
        console.error('\nNo refresh_token returned. This usually means Google reused an existing grant.');
        console.error('Fix: visit https://myaccount.google.com/permissions, remove the Bryant Dental dashboard app,');
        console.error('then run this script again.');
      }
      server.close(); process.exit(1);
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>Done.</h1><p>You can close this tab. New refresh token printed in the terminal.</p>');

    console.log('\n=== SUCCESS ===\n');
    console.log('New GOOGLE_REFRESH_TOKEN:\n');
    console.log(body.refresh_token);
    console.log('\nReplace the GOOGLE_REFRESH_TOKEN line in .env.local with the value above,');
    console.log('then restart `npm run dev` and re-check http://localhost:3000/api/health\n');
    server.close();
  } catch (e) {
    res.writeHead(500); res.end('Exchange threw: ' + e.message);
    console.error(e);
    server.close(); process.exit(1);
  }
});

server.listen(PORT);
