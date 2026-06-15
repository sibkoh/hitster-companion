import { CONFIG } from './config.js';

const generateRandomString = (length) => {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = crypto.getRandomValues(new Uint8Array(length));
    return values.reduce((acc, x) => acc + possible[x % possible.length], "");
};

const sha256 = async (plain) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return window.crypto.subtle.digest('SHA-256', data);
};

const base64encode = (input) => {
    return btoa(String.fromCharCode(...new Uint8Array(input)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
};

export async function loginWithSpotify() {
    const codeVerifier = generateRandomString(64);
    window.localStorage.setItem('code_verifier', codeVerifier);

    const hashed = await sha256(codeVerifier);
    const codeChallenge = base64encode(hashed);

    const authUrl = new URL("https://accounts.spotify.com/authorize");
    const params = {
        response_type: 'code',
        client_id: CONFIG.SPOTIFY_CLIENT_ID,
        scope: CONFIG.SCOPES,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        redirect_uri: CONFIG.REDIRECT_URI,
    };

    authUrl.search = new URLSearchParams(params).toString();
    window.location.href = authUrl.toString();
}

export async function handleCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    let code = urlParams.get('code');
    
    if (code) {
        let codeVerifier = localStorage.getItem('code_verifier');

        const payload = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: CONFIG.SPOTIFY_CLIENT_ID,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: CONFIG.REDIRECT_URI,
                code_verifier: codeVerifier,
            }),
        };

        try {
            const response = await fetch('https://accounts.spotify.com/api/token', payload);
            const data = await response.json();
            
            if (data.access_token) {
                localStorage.setItem('access_token', data.access_token);
                localStorage.setItem('refresh_token', data.refresh_token);
                
                // Clear URL parameters
                window.history.replaceState({}, document.title, window.location.pathname);
                return true;
            }
        } catch (error) {
            console.error("Error exchanging token", error);
        }
    }
    return false;
}

export function getAccessToken() {
    return localStorage.getItem('access_token');
}

export function logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    window.location.reload();
}
