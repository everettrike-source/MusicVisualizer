// JavaScript code for handling the login process with Spotify API

const button = document.getElementById("login-button");
const authorizationEndpoint = "https://accounts.spotify.com/authorize";
const redirectUrl = 'http://127.0.0.1:5500/index.html';     
const tokenEndpoint = "https://accounts.spotify.com/api/token"; 
const clientId = 'f35ce023cf1e4574a65bb7e75735f8bb'; 
const scope = 'user-read-currently-playing user-read-playback-state';

//Handles the currentToken storage
const currentToken = {
  get access_token() { return localStorage.getItem('access_token') || null; },
  get refresh_token() { return localStorage.getItem('refresh_token') || null; },
  get expires_in() { return localStorage.getItem('refresh_in') || null },
  get expires() { return localStorage.getItem('expires') || null },

  save: function (response) {
    const { access_token, refresh_token, expires_in } = response;
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    localStorage.setItem('expires_in', expires_in);

    const now = new Date();
    const expiry = new Date(now.getTime() + (expires_in * 1000));
    localStorage.setItem('expires', expiry);
  }
};

//Handles the initial login process, sending the user to the spotify login page, and then redirects back to the application
button.addEventListener("click", handleLogin);

async function handleLogin() {
    button.disable = 'true';
    button.innerText = 'Loading...';
    await redirectToSpotifyAuthorize();
}

async function redirectToSpotifyAuthorize() {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomValues = crypto.getRandomValues(new Uint8Array(64));
  const randomString = randomValues.reduce((acc, x) => acc + possible[x % possible.length], "");

  const code_verifier = randomString;
  const data = new TextEncoder().encode(code_verifier);
  const hashed = await crypto.subtle.digest('SHA-256', data);

  const code_challenge_base64 = btoa(String.fromCharCode(...new Uint8Array(hashed)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  window.localStorage.setItem('code_verifier', code_verifier);

  const authUrl = new URL(authorizationEndpoint)
  const params = {
    response_type: 'code',
    client_id: clientId,
    scope: scope,
    code_challenge_method: 'S256',
    code_challenge: code_challenge_base64,
    redirect_uri: redirectUrl,
  };

  authUrl.search = new URLSearchParams(params).toString();
  window.location.href = authUrl.toString(); // Redirect the user to the authorization server for login
}

// Handles the callback from Spotify after the user logs in and exchanges the authorization code for an access token
const args = new URLSearchParams(window.location.search);
const code = args.get('code');
//If there is a code, it means the user has loggin in to spotify
if (code) {
    const token = await getToken(code);
    currentToken.save(token);
    if(button){
      button.style.display = 'none'; // Hide the login button after successful login
    }
}

async function getToken(code) {
  const code_verifier = localStorage.getItem('code_verifier');

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUrl,
      code_verifier: code_verifier,
    }),
  });

  return await response.json();
}

async function getPlaybackState() {
  const token = currentToken.access_token;
  
  const response = await fetch('https://api.spotify.com/v1/me/player', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  // Handle the case where the player is inactive (no active device)
  if (response.status === 204 || response.status > 400) {
    return { is_playing: false };
  }

  const data = await response.json();
  
  // Return the is_playing status (and potentially the progress_ms for your 3D sync)
  return {
    isPlaying: data.is_playing,
    progressMs: data.progress_ms,
    trackId: data.item?.id
  };
}


// Poll Spotify every second
setInterval(async () => {
    // Only check if we have a valid token
    if (currentToken.access_token) {
        try {
            //get the current playback state from spotify
            const state = await getPlaybackState();
            
            //Create a custom event with the playback state
            const event = new CustomEvent('spotifyStateChange', {
                detail: { 
                    isPlaying: state.isPlaying,
                    progress: state.progressMs
                }
            });

            //broadcast the event to the window so the animation script can listen to it
            window.dispatchEvent(event);
            
        } catch (error) {
            console.error("Error polling Spotify:", error);
        }
    }
}, 1000);







