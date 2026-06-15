export const CONFIG = {
    // Replace with your Spotify Client ID
    SPOTIFY_CLIENT_ID: 'bf241b13cd714663b6b870e253370b30',

    // Using current origin as redirect URI to support GitHub Pages
    // For local dev, this will be http://localhost:port or similar.
    REDIRECT_URI: window.location.origin + window.location.pathname,

    // Required scopes for Web Playback SDK
    SCOPES: [
        'streaming',
        'user-read-email',
        'user-read-private',
        'user-modify-playback-state',
        'user-read-playback-state'
    ].join(' '),

    PLAYBACK_DURATION_MS: 30000 // 30 seconds
};
