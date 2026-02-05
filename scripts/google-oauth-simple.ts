#!/usr/bin/env node
/**
 * Simple Google OAuth 2.0 Flow
 *
 * 1. Script prints an OAuth URL
 * 2. User opens URL in browser
 * 3. User approves → redirect to localhost
 * 4. Script catches callback and saves token
 *
 * Usage:
 *   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=xxx node google-oauth-simple.ts
 */

import { serve } from 'bun';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_PORT = parseInt(process.env.REDIRECT_PORT || '8432');
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const SCOPES = process.env.GOOGLE_SCOPES || 'openid email profile';
const TOKEN_FILE = process.env.TOKEN_FILE || './google-token.json';

if (!CLIENT_ID) {
  console.error('❌ GOOGLE_CLIENT_ID is required!');
  console.error('\nGet your credentials:');
  console.error('  1. Go to https://console.cloud.google.com/apis/credentials');
  console.error('  2. Create OAuth 2.0 Client ID (Web application)');
  console.error('  3. Add redirect URI: http://localhost:8432/callback');
  process.exit(1);
}

const STATE = Math.random().toString(36).substring(7);

// Build the OAuth URL
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPES);
authUrl.searchParams.set('state', STATE);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

console.log('🔐 Google OAuth Authentication\n');
console.log('=' .repeat(60));
console.log('STEP 1: Open this URL in your browser:\n');
console.log(authUrl.toString());
console.log('\n' + '='.repeat(60));
console.log('\n⏳ Waiting for authorization...\n');

let serverStopped = false;

const server = serve({
  port: REDIRECT_PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      // Validate state
      if (state !== STATE) {
        return new Response('❌ Invalid state parameter', { status: 400 });
      }

      if (!code) {
        return new Response('❌ No authorization code', { status: 400 });
      }

      console.log('✅ Received authorization code!');

      // Exchange code for tokens
      try {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code',
          }),
        });

        if (!tokenResponse.ok) {
          const error = await tokenResponse.text();
          throw new Error(`Token exchange failed: ${error}`);
        }

        const tokens = await tokenResponse.json();

        // Save tokens
        const tokenData = {
          ...tokens,
          client_id: CLIENT_ID,
          acquired_at: Date.now(),
          expires_at: Date.now() + (tokens.expires_in * 1000),
          redirect_uri: REDIRECT_URI,
        };

        await Bun.write(TOKEN_FILE, JSON.stringify(tokenData, null, 2));

        console.log(`💾 Tokens saved to: ${TOKEN_FILE}`);
        console.log('\n📋 Token info:');
        console.log(`   Access Token: ${tokens.access_token.substring(0, 30)}...`);
        if (tokens.refresh_token) {
          console.log(`   Refresh Token: ${tokens.refresh_token.substring(0, 30)}...`);
        }
        console.log(`   Expires In: ${tokens.expires_in} seconds`);
        console.log(`   Scope: ${tokens.scope || SCOPES}`);

        // Stop server after saving tokens
        setTimeout(() => {
          serverStopped = true;
          server.stop();
        }, 100);

        return new Response(
          '<html><body style="font-family:sans-serif;text-align:center;padding:50px">' +
          '<h1 style="color:#4CAF55">✅ Authentication Successful!</h1>' +
          '<p>Tokens have been saved. You can close this window.</p>' +
          '</body></html>',
          { headers: { 'Content-Type': 'text/html' } }
        );
      } catch (error) {
        console.error('❌ Error exchanging code for tokens:', error);
        return new Response(
          '<html><body style="font-family:sans-serif;text-align:center;padding:50px">' +
          '<h1 style="color:#f44336">❌ Authentication Failed</h1>' +
          '<p>' + (error as Error).message + '</p>' +
          '</body></html>',
          { headers: { 'Content-Type': 'text/html' } }
        );
      }
    }

    return new Response('OAuth callback server running', { status: 404 });
  },
});

console.log(`🌐 Local server listening on: ${REDIRECT_URI}\n`);

// Timeout after 5 minutes
setTimeout(() => {
  if (!serverStopped) {
    console.log('\n⏱️  Timeout: No authorization received after 5 minutes');
    server.stop();
    process.exit(1);
  }
}, 5 * 60 * 1000);
