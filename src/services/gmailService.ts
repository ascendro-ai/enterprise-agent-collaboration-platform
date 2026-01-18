import { storage } from '../utils/storage'
import type { GmailAuthState } from '../types'

const CLIENT_ID = import.meta.env.VITE_GMAIL_CLIENT_ID || ''
const REDIRECT_URI = window.location.origin + '/auth/gmail/callback'
const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send'

// Generate code verifier for PKCE
function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// Generate code challenge from verifier
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// Get current auth state
export function getGmailAuthState(): GmailAuthState | null {
  return storage.getGmailAuth()
}

// Check if authenticated
export function isGmailAuthenticated(): boolean {
  const auth = getGmailAuthState()
  if (!auth) return false
  if (!auth.authenticated) return false
  if (auth.expiresAt && auth.expiresAt < Date.now()) {
    // Token expired
    return false
  }
  return true
}

// Initiate OAuth2 PKCE flow
export async function initiateGmailAuth(): Promise<void> {
  if (!CLIENT_ID) {
    throw new Error('Gmail OAuth client ID is not configured')
  }

  const verifier = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)

  // Store verifier in sessionStorage for later use
  sessionStorage.setItem('gmail_code_verifier', verifier)

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('code_challenge', challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')

  // Redirect to Google OAuth
  window.location.href = authUrl.toString()
}

// Handle OAuth callback
export async function handleGmailCallback(code: string): Promise<void> {
  const verifier = sessionStorage.getItem('gmail_code_verifier')
  if (!verifier) {
    throw new Error('Code verifier not found')
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
    })

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for tokens')
    }

    const tokens = await tokenResponse.json()

    // Get user info
    const userInfoResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      }
    )

    const userInfo = await userInfoResponse.json()

    // Save auth state
    const authState: GmailAuthState = {
      authenticated: true,
      account: userInfo.email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in
        ? Date.now() + tokens.expires_in * 1000
        : undefined,
    }

    storage.saveGmailAuth(authState)
    sessionStorage.removeItem('gmail_code_verifier')

    // Redirect back to app
    window.location.href = '/'
  } catch (error) {
    console.error('Error handling Gmail callback:', error)
    throw error
  }
}

// Refresh access token
export async function refreshGmailToken(): Promise<string | null> {
  const auth = getGmailAuthState()
  if (!auth || !auth.refreshToken) {
    return null
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        refresh_token: auth.refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to refresh token')
    }

    const tokens = await response.json()

    // Update auth state
    const updatedAuth: GmailAuthState = {
      ...auth,
      accessToken: tokens.access_token,
      expiresAt: tokens.expires_in
        ? Date.now() + tokens.expires_in * 1000
        : auth.expiresAt,
    }

    storage.saveGmailAuth(updatedAuth)
    return tokens.access_token
  } catch (error) {
    console.error('Error refreshing token:', error)
    // Clear auth state on refresh failure
    storage.saveGmailAuth({ authenticated: false })
    return null
  }
}

// Get valid access token (refresh if needed)
export async function getGmailAccessToken(): Promise<string | null> {
  const auth = getGmailAuthState()
  if (!auth || !auth.authenticated) {
    return null
  }

  // Check if token is expired
  if (auth.expiresAt && auth.expiresAt < Date.now()) {
    // Try to refresh
    return await refreshGmailToken()
  }

  return auth.accessToken || null
}

// Send email via Gmail API
export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<void> {
  const accessToken = await getGmailAccessToken()
  if (!accessToken) {
    throw new Error('Gmail not authenticated')
  }

  // Create email message
  const email = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\n')

  // Encode to base64url
  const encodedEmail = btoa(email)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  try {
    const response = await fetch(
      'https://www.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          raw: encodedEmail,
        }),
      }
    )

    if (!response.ok) {
      throw new Error('Failed to send email')
    }
  } catch (error) {
    console.error('Error sending email:', error)
    throw error
  }
}

// Read emails from Gmail API
export async function readEmails(maxResults: number = 10): Promise<any[]> {
  const accessToken = await getGmailAccessToken()
  if (!accessToken) {
    throw new Error('Gmail not authenticated')
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error('Failed to read emails')
    }

    const data = await response.json()
    return data.messages || []
  } catch (error) {
    console.error('Error reading emails:', error)
    throw error
  }
}

// Sign out
export function signOutGmail(): void {
  storage.saveGmailAuth({ authenticated: false })
}
