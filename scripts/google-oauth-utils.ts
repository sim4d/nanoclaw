/**
 * Google OAuth Token Utilities
 *
 * Helper functions to load and use OAuth tokens obtained via device code flow.
 */

export interface StoredToken {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
  client_id: string;
  acquired_at: number;
  expires_at: number;
}

/**
 * Load token from file
 */
export async function loadToken(tokenPath: string = './google-token.json'): Promise<StoredToken | null> {
  try {
    const file = Bun.file(tokenPath);
    const content = await file.text();
    return JSON.parse(content) as StoredToken;
  } catch (error) {
    console.error(`Failed to load token from ${tokenPath}:`, error);
    return null;
  }
}

/**
 * Check if token is expired or will expire soon
 */
export function isTokenExpired(token: StoredToken, bufferSeconds: number = 300): boolean {
  return Date.now() >= (token.expires_at - (bufferSeconds * 1000));
}

/**
 * Refresh access token using refresh token
 */
export async function refreshToken(
  token: StoredToken,
  clientSecret?: string
): Promise<StoredToken | null> {
  if (!token.refresh_token) {
    throw new Error('No refresh token available - user must re-authenticate');
  }

  const params = new URLSearchParams({
    client_id: token.client_id,
    refresh_token: token.refresh_token,
    grant_type: 'refresh_token',
  });

  if (clientSecret) {
    params.append('client_secret', clientSecret);
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to refresh token: ${response.status} ${text}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  };

  return {
    ...token,
    access_token: data.access_token,
    refresh_token: data.refresh_token || token.refresh_token,
    expires_in: data.expires_in,
    expires_at: Date.now() + (data.expires_in * 1000),
    acquired_at: Date.now(),
  };
}

/**
 * Get valid access token, refreshing if necessary
 */
export async function getAccessToken(
  tokenPath: string = './google-token.json',
  clientSecret?: string
): Promise<string | null> {
  let token = await loadToken(tokenPath);

  if (!token) {
    console.error('No token found. Run google-oauth-device.ts first.');
    return null;
  }

  if (isTokenExpired(token)) {
    console.log('Token expired, refreshing...');
    token = await refreshToken(token, clientSecret);

    if (!token) {
      return null;
    }

    // Save refreshed token
    await Bun.write(tokenPath, JSON.stringify(token, null, 2));
    console.log('Token refreshed and saved.');
  }

  return token.access_token;
}

/**
 * Make authenticated API request
 */
export async function fetchWithAuth<T = unknown>(
  url: string,
  tokenPath: string = './google-token.json',
  clientSecret?: string,
  options?: RequestInit
): Promise<T | null> {
  const accessToken = await getAccessToken(tokenPath, clientSecret);

  if (!accessToken) {
    return null;
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API request failed: ${response.status} ${text}`);
  }

  return await response.json() as T;
}

// CLI to test the token
async function main(): Promise<void> {
  const tokenPath = process.env.TOKEN_OUTPUT || './google-token.json';

  console.log('🔍 Testing Google OAuth token...\n');

  const token = await loadToken(tokenPath);

  if (!token) {
    console.error(`❌ No token found at ${tokenPath}`);
    console.error('   Run the device code flow first to get a token.');
    process.exit(1);
  }

  console.log(`📋 Token info:`);
  console.log(`   Client ID: ${token.client_id.substring(0, 10)}...`);
  console.log(`   Expires: ${new Date(token.expires_at).toLocaleString()}`);
  console.log(`   Expired: ${isTokenExpired(token) ? 'Yes ❌' : 'No ✅'}`);

  if (token.refresh_token) {
    console.log(`   Has Refresh Token: Yes ✅`);
  }

  // Test with a simple API call
  try {
    const userInfo = await fetchWithAuth<{
      email: string;
      name: string;
      picture: string;
    }>('https://www.googleapis.com/oauth2/v2/userinfo', tokenPath);

    if (userInfo) {
      console.log('\n✅ Token is valid!');
      console.log(`   Email: ${userInfo.email}`);
      console.log(`   Name: ${userInfo.name}`);
    }
  } catch (error) {
    console.error('\n❌ Token validation failed:', error);
  }
}

// Run if executed directly
if (import.meta.main) {
  main();
}
