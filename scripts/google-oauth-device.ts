#!/usr/bin/env node
/**
 * Google OAuth 2.0 Device Code Flow
 *
 * Run this script to authenticate with Google using the device code flow.
 * No redirect URI needed - perfect for Docker/containerized apps.
 *
 * Usage:
 *   GOOGLE_CLIENT_ID=xxx GOOGLE_SCOPES="openid,email,profile" node google-oauth-device.ts
 *
 * Environment Variables:
 *   GOOGLE_CLIENT_ID - Your Google OAuth client ID (required)
 *   GOOGLE_SCOPES - OAuth scopes (default: "openid,email,profile")
 *   TOKEN_OUTPUT - Where to save the token (default: ./google-token.json)
 */

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const SCOPES = process.env.GOOGLE_SCOPES || 'openid,email,profile';
const TOKEN_OUTPUT = process.env.TOKEN_OUTPUT || './google-token.json';

if (!CLIENT_ID) {
  console.error('❌ GOOGLE_CLIENT_ID is required!');
  console.error('\nUsage:');
  console.error('  GOOGLE_CLIENT_ID=xxx GOOGLE_SCOPES="..." node google-oauth-device.ts\n');
  console.error('Steps:');
  console.error('  1. Go to https://console.cloud.google.com/apis/credentials');
  console.error('  2. Create OAuth 2.0 Client ID (Desktop app or "Other")');
  console.error('  3. Copy the Client ID');
  process.exit(1);
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

interface TokenError {
  error: string;
  error_description?: string;
}

async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const response = await fetch('https://oauth2.googleapis.com/device/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      scope: SCOPES,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get device code: ${response.status} ${text}`);
  }

  return await response.json();
}

async function pollForToken(deviceCode: string, interval: number): Promise<TokenResponse> {
  const maxAttempts = 60; // 5 minutes max (assuming 5 second intervals)
  let attempts = 0;

  while (attempts < maxAttempts) {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    const data = await response.json() as TokenResponse | TokenError;

    if ('access_token' in data) {
      return data;
    }

    if ('error' in data) {
      if (data.error === 'authorization_pending') {
        // User hasn't approved yet, wait and retry
        process.stdout.write('.');
        await new Promise(resolve => setTimeout(resolve, interval * 1000));
        attempts++;
        continue;
      }

      if (data.error === 'slow_down') {
        // Poll too fast, increase interval
        await new Promise(resolve => setTimeout(resolve, interval * 2000));
        attempts++;
        continue;
      }

      throw new Error(`OAuth error: ${data.error} - ${data.error_description || 'Unknown error'}`);
    }

    throw new Error('Unexpected response from token endpoint');
  }

  throw new Error('Timeout: User did not complete authentication in time');
}

async function saveToken(token: TokenResponse): Promise<void> {
  const tokenData = {
    ...token,
    client_id: CLIENT_ID,
    acquired_at: Date.now(),
    expires_at: Date.now() + (token.expires_in * 1000),
  };

  await Bun.write(TOKEN_OUTPUT, JSON.stringify(tokenData, null, 2));
  console.log(`\n✅ Token saved to: ${TOKEN_OUTPUT}`);
}

async function main(): Promise<void> {
  console.log('🔐 Google OAuth 2.0 Device Code Flow\n');
  console.log(`Client ID: ${CLIENT_ID.substring(0, 10)}...`);
  console.log(`Scopes: ${SCOPES}\n`);

  try {
    // Step 1: Request device code
    console.log('⏳ Requesting device code...');
    const deviceCodeResponse = await requestDeviceCode();

    console.log('\n' + '='.repeat(60));
    console.log('📱 Step 1: Visit this URL on your device:');
    console.log(`   ${deviceCodeResponse.verification_url}\n`);
    console.log('📝 Step 2: Enter this code:');
    console.log(`   ${deviceCodeResponse.user_code}`);
    console.log('='.repeat(60) + '\n');

    console.log('⏳ Waiting for you to approve...');

    // Step 2: Poll for token
    const token = await pollForToken(deviceCodeResponse.device_code, deviceCodeResponse.interval);

    console.log('\n\n✅ Authentication successful!');

    // Step 3: Save token
    await saveToken(token);

    console.log('\n📋 Token info:');
    console.log(`   Access Token: ${token.access_token.substring(0, 20)}...`);
    console.log(`   Expires In: ${token.expires_in} seconds`);
    if (token.refresh_token) {
      console.log(`   Refresh Token: ${token.refresh_token.substring(0, 20)}...`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
