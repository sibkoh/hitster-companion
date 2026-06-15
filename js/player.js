import { getAccessToken } from './auth.js';

let player = null;
let deviceId = null;

export function initializePlayer(onReadyCallback) {
    if (!getAccessToken()) return;

    window.onSpotifyWebPlaybackSDKReady = () => {
        player = new window.Spotify.Player({
            name: 'Hitster Web Player',
            getOAuthToken: cb => { cb(getAccessToken()); },
            volume: 0.5
        });

        player.addListener('ready', ({ device_id }) => {
            console.log('Ready with Device ID', device_id);
            deviceId = device_id;
            onReadyCallback(true);
        });

        player.addListener('not_ready', ({ device_id }) => {
            console.log('Device ID has gone offline', device_id);
            onReadyCallback(false);
        });

        // Error handling
        player.addListener('initialization_error', ({ message }) => { console.error(message); });
        player.addListener('authentication_error', ({ message }) => { console.error(message); });
        player.addListener('account_error', ({ message }) => { console.error(message); });

        player.connect();
    };
}

export async function playTrack(trackId) {
    if (!deviceId || !getAccessToken()) return;

    const uri = `spotify:track:${trackId}`;
    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        body: JSON.stringify({ uris: [uri] }),
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAccessToken()}`
        },
    });
}

export async function pauseTrack() {
    if (!deviceId || !getAccessToken()) return;
    await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${getAccessToken()}`
        },
    });
}

export async function getTrackMetadata(trackId) {
    if (!getAccessToken()) return null;
    try {
        const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
            headers: {
                'Authorization': `Bearer ${getAccessToken()}`
            }
        });
        return await response.json();
    } catch (e) {
        console.error("Failed to fetch metadata", e);
        return null;
    }
}
