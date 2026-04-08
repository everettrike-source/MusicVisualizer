const button = document.getElementById("login-button");
const authorizationEndpoint = "https://accounts.spotify.com/authorize";
const redirectUrl = 'http://127.0.0.1:5500/index.html';
const tokenEndpoint = "https://accounts.spotify.com/api/token";
const clientId = 'f35ce023cf1e4574a65bb7e75735f8bb';
const scope = 'user-read-currently-playing user-read-playback-state';

let refreshTimerId = null;
let isRefreshing = false;

const currentToken = {
  get access_token() { return localStorage.getItem('access_token') || null; },
  get refresh_token() { return localStorage.getItem('refresh_token') || null; },
  get expires_in() { return localStorage.getItem('expires_in') || null; },
  get expires() { return localStorage.getItem('expires') || null; },

  save: function (response) {
    const { access_token, refresh_token, expires_in } = response;
    localStorage.setItem('access_token', access_token);
    if (refresh_token) {
      localStorage.setItem('refresh_token', refresh_token);
    }
    localStorage.setItem('expires_in', expires_in);

    const now = new Date();
    const expiry = new Date(now.getTime() + (expires_in * 1000));
    localStorage.setItem('expires', expiry.toISOString());

    scheduleTokenRefresh(expires_in);
  },

  isExpired: function () {
    const expiry = localStorage.getItem('expires');
    if (!expiry) return true;
    return new Date() > new Date(expiry);
  },

  clear: function () {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('expires_in');
    localStorage.removeItem('expires');
  }
};

// --- CSRF state helpers using sessionStorage ---

function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  return randomValues.reduce((acc, x) => acc + possible[x % possible.length], "");
}

// --- Token refresh ---

function scheduleTokenRefresh(expiresInSeconds) {
  if (refreshTimerId) clearTimeout(refreshTimerId);
  const refreshAt = expiresInSeconds * 0.9 * 1000;
  refreshTimerId = setTimeout(() => attemptTokenRefresh(), refreshAt);
}

async function attemptTokenRefresh() {
  if (isRefreshing) return;
  isRefreshing = true;

  try {
    const refreshToken = currentToken.refresh_token;
    if (!refreshToken) {
      showSessionExpired();
      return;
    }

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Token refresh failed:", response.status, errorData);
      showSessionExpired();
      return;
    }

    const tokenData = await response.json();
    if (!tokenData.access_token || !tokenData.expires_in) {
      console.error("Invalid refresh response:", tokenData);
      showSessionExpired();
      return;
    }

    currentToken.save(tokenData);
    console.log("Token refreshed successfully");
  } catch (err) {
    console.error("Network error during token refresh:", err);
    showSessionExpired();
  } finally {
    isRefreshing = false;
  }
}

function showSessionExpired() {
  currentToken.clear();
  if (button) {
    button.style.display = '';
    button.disabled = false;
    button.innerText = 'Session Expired — Re-login';
  }
}

// --- Cross-tab token sync ---

window.addEventListener('storage', (event) => {
  if (event.key === 'access_token') {
    if (!event.newValue) {
      showSessionExpired();
    } else {
      const expiresIn = parseInt(localStorage.getItem('expires_in'), 10);
      if (expiresIn) scheduleTokenRefresh(expiresIn);
    }
  }
});

// --- Login flow ---

button.addEventListener("click", handleLogin);

async function handleLogin() {
  button.disabled = true;
  button.innerText = 'Loading...';
  try {
    await redirectToSpotifyAuthorize();
  } catch (err) {
    console.error("Failed to start login:", err);
    button.disabled = false;
    button.innerText = 'Login with Spotify';
  }
}

async function redirectToSpotifyAuthorize() {
  const code_verifier = generateRandomString(64);
  const data = new TextEncoder().encode(code_verifier);
  const hashed = await crypto.subtle.digest('SHA-256', data);

  const code_challenge_base64 = btoa(String.fromCharCode(...new Uint8Array(hashed)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const state = generateRandomString(32);

  sessionStorage.setItem('code_verifier', code_verifier);
  sessionStorage.setItem('oauth_state', state);

  const authUrl = new URL(authorizationEndpoint);
  const params = {
    response_type: 'code',
    client_id: clientId,
    scope: scope,
    code_challenge_method: 'S256',
    code_challenge: code_challenge_base64,
    redirect_uri: redirectUrl,
    state: state,
  };

  authUrl.search = new URLSearchParams(params).toString();
  window.location.href = authUrl.toString();
}

// --- Token exchange ---

async function getToken(code) {
  const code_verifier = sessionStorage.getItem('code_verifier');

  if (!code_verifier) {
    throw new Error("Missing code_verifier — cannot complete login. Please try again.");
  }

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUrl,
      code_verifier: code_verifier,
    }),
  });

  sessionStorage.removeItem('code_verifier');

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Token exchange failed (${response.status}): ${errorData.error_description || errorData.error || 'unknown'}`);
  }

  const tokenData = await response.json();
  if (!tokenData.access_token || !tokenData.expires_in) {
    throw new Error("Invalid token response — missing required fields");
  }

  return tokenData;
}

// --- Spotify playback polling ---

async function getPlaybackState() {
  const token = currentToken.access_token;

  const response = await fetch('https://api.spotify.com/v1/me/player', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (response.status === 401) {
    await attemptTokenRefresh();
    throw new Error("Token expired — refresh attempted");
  }

  if (response.status === 204 || response.status > 400) {
    return { isPlaying: false };
  }

  const data = await response.json();

  return {
    isPlaying: data.is_playing,
    progressMs: data.progress_ms,
    trackId: data.item?.id
  };
}

let pollIntervalId = null;
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;

function startPolling() {
  if (pollIntervalId) return;
  consecutiveErrors = 0;

  pollIntervalId = setInterval(async () => {
    if (!currentToken.access_token) return;

    try {
      const state = await getPlaybackState();
      consecutiveErrors = 0;

      const event = new CustomEvent('spotifyStateChange', {
        detail: {
          isPlaying: state.isPlaying,
          progress: state.progressMs
        }
      });
      window.dispatchEvent(event);
    }
    catch (error) {
      consecutiveErrors++;
      console.error(`Polling error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, error.message);

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
        showSessionExpired();
      }
    }
  }, 1000);
}

// --- Page load handler ---

function hideLoginShowAudioShare() {
  if (button) button.style.display = 'none';
  const audioBtn = document.getElementById("share-audio-button");
  if (audioBtn) audioBtn.style.display = '';
}

async function onPageLoad() {
  const args = new URLSearchParams(window.location.search);
  const code = args.get('code');
  const returnedState = args.get('state');

  // Already logged in with a valid token
  if (currentToken.access_token && !currentToken.isExpired()) {
    hideLoginShowAudioShare();
    const expiresIn = parseInt(currentToken.expires_in, 10);
    if (expiresIn) scheduleTokenRefresh(expiresIn);
    startPolling();
    return;
  }

  // Token expired but we have a refresh token — attempt silent refresh
  if (currentToken.access_token && currentToken.isExpired() && currentToken.refresh_token) {
    try {
      await attemptTokenRefresh();
      if (currentToken.access_token && !currentToken.isExpired()) {
        hideLoginShowAudioShare();
        startPolling();
        return;
      }
    } catch (err) {
      console.error("Silent refresh failed:", err);
    }
  }

  // Returning from Spotify with an authorization code
  if (code) {
    // Verify CSRF state
    const savedState = sessionStorage.getItem('oauth_state');
    sessionStorage.removeItem('oauth_state');

    if (!savedState || savedState !== returnedState) {
      console.error("OAuth state mismatch — possible CSRF attack. Expected:", savedState, "Got:", returnedState);
      if (button) {
        button.disabled = false;
        button.innerText = 'Login Failed — Try Again';
      }
      cleanUrl();
      return;
    }

    try {
      const token = await getToken(code);
      currentToken.save(token);
      cleanUrl();
      hideLoginShowAudioShare();
      startPolling();
    } catch (err) {
      console.error("Login failed:", err.message);
      cleanUrl();
      if (button) {
        button.disabled = false;
        button.innerText = 'Login Failed — Try Again';
      }
    }
    return;
  }

  // No token, no code — fresh visitor, show login button
  if (button) {
    button.disabled = false;
    button.innerText = 'Login with Spotify';
  }
}

function cleanUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState({}, document.title, url.toString());
}

onPageLoad();
