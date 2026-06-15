import { loginWithSpotify, handleCallback, getAccessToken, logout } from './auth.js';
import { initializePlayer, playTrack, pauseTrack, getTrackMetadata } from './player.js';
import { startScanner, pauseScanner, resumeScanner } from './scanner.js';
import { CONFIG } from './config.js';
import { DataManager } from './dataManager.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize data manager
    await DataManager.initialize();

    // 1. Check for Auth callback
    const hasCallback = await handleCallback();

    const token = getAccessToken();
    const authContainer = document.getElementById('auth-container');
    const appContent = document.getElementById('app-content');
    const loginBtn = document.getElementById('btn-login');
    const logoutBtn = document.getElementById('btn-logout');

    if (!token) {
        // Show login
        authContainer.classList.remove('hidden');
        appContent.classList.add('hidden');
        loginBtn.addEventListener('click', loginWithSpotify);
    } else {
        // Authenticated
        authContainer.classList.add('hidden');
        appContent.classList.remove('hidden');
        logoutBtn.addEventListener('click', logout);

        setupGame();
    }
});

let currentTrackId = null;
let playbackTimeout = null;

function setupGame() {
    const gameContainer = document.getElementById('game-container');
    const statusText = document.getElementById('status-text');
    const btnReveal = document.getElementById('btn-reveal');
    const btnNext = document.getElementById('btn-next');
    const metadataDisplay = document.getElementById('metadata-display');
    const readerContainer = document.getElementById('reader-container');

    // Initialize player
    initializePlayer((isReady) => {
        if (isReady) {
            // Player is ready, start scanner
            startScanner(onTrackScanned);
        }
    });

    async function onTrackScanned(decodedText) {
        console.log("Scanned Text:", decodedText);
        
        // 1. Check DataManager cache first
        let trackId = DataManager.getTrackId(decodedText);
        
        // 2. If not in cache, fallback to checking if it's a raw Spotify URL
        if (!trackId) {
            const regex = /(?:track\/|spotify:track:)([a-zA-Z0-9]+)/i;
            const match = decodedText.match(regex);
            if (match) trackId = match[1];
        }

        if (!trackId) {
            statusText.textContent = "Tarjeta no reconocida.";
            return;
        }

        currentTrackId = trackId;

        // Pause scanning to avoid multiple triggers
        pauseScanner();
        readerContainer.classList.add('hidden');
        
        // Setup UI for blind play
        gameContainer.classList.remove('hidden');
        metadataDisplay.classList.add('hidden');
        btnReveal.classList.add('hidden');
        btnNext.classList.add('hidden');
        statusText.textContent = "Playing Blindly...";

        // Play the track
        await playTrack(trackId);

        // Start 30s timer
        playbackTimeout = setTimeout(() => {
            pauseTrack();
            statusText.textContent = "Playback Paused. Ready to Reveal?";
            btnReveal.classList.remove('hidden');
        }, CONFIG.PLAYBACK_DURATION_MS);
    }

    btnReveal.addEventListener('click', async () => {
        if (!currentTrackId) return;
        
        btnReveal.classList.add('hidden');
        statusText.textContent = "Revealed!";
        
        // Fetch metadata
        const metadata = await getTrackMetadata(currentTrackId);
        if (metadata) {
            document.getElementById('track-title').textContent = metadata.name;
            document.getElementById('track-artist').textContent = metadata.artists.map(a => a.name).join(', ');
            if (metadata.album && metadata.album.images.length > 0) {
                document.getElementById('track-cover').src = metadata.album.images[0].url;
            }
        }
        
        metadataDisplay.classList.remove('hidden');
        btnNext.classList.remove('hidden');
    });

    btnNext.addEventListener('click', () => {
        // Reset state for next round
        gameContainer.classList.add('hidden');
        readerContainer.classList.remove('hidden');
        currentTrackId = null;
        if (playbackTimeout) clearTimeout(playbackTimeout);
        resumeScanner();
    });

    // Data Management Listeners
    const btnExport = document.getElementById('btn-export');
    const btnImportTrigger = document.getElementById('btn-import-trigger');
    const fileImport = document.getElementById('file-import');

    if (btnExport) {
        btnExport.addEventListener('click', () => {
            DataManager.exportData();
        });
    }

    if (btnImportTrigger && fileImport) {
        btnImportTrigger.addEventListener('click', () => {
            fileImport.click();
        });

        fileImport.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                DataManager.importData(file, (success) => {
                    // Reset input so the same file can be selected again
                    fileImport.value = '';
                });
            }
        });
    }
}
