#!/usr/bin/env node
/**
 * Test Google OAuth Token
 * Verifies the saved token works by making a simple API call
 */

const TOKEN_FILE = process.env.TOKEN_FILE || './google-token.json';

async function testToken() {
  console.log('🔍 Testing Google OAuth token...\n');

  let token;
  try {
    const file = Bun.file(TOKEN_FILE);
    const content = await file.text();
    token = JSON.parse(content);
  } catch {
    console.error(`❌ No token found at ${TOKEN_FILE}`);
    console.error('   Run the OAuth script first to get a token.');
    process.exit(1);
  }

  console.log('📋 Token info:');
  console.log(`   Client ID: ${token.client_id?.substring(0, 15)}...`);
  console.log(`   Expires: ${new Date(token.expires_at).toLocaleString()}`);

  const isExpired = Date.now() > token.expires_at;
  console.log(`   Status: ${isExpired ? '❌ Expired' : '✅ Valid'}`);

  if (token.refresh_token) {
    console.log(`   Refresh Token: ✅ Available`);
  }

  // Test with Google userinfo endpoint
  console.log('\n🔗 Testing API call...');
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const user = await response.json();
    console.log('✅ Token is valid!\n');
    console.log('👤 User info:');
    console.log(`   Name: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Picture: ${user.picture}`);

  } catch (error) {
    console.error('❌ API call failed:', (error as Error).message);
  }
}

testToken();
