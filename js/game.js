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
let currentTrivia = null;
let playbackTimeout = null;
let currentSegment = 0; // 0=0%, 1=25%, 2=50%
let trackDurationMs = 0;

function setupGame() {
    const gameContainer = document.getElementById('game-container');
    const statusText = document.getElementById('status-text');
    const playbackControls = document.getElementById('playback-controls');
    const btnStop = document.getElementById('btn-stop');
    const btnNextSegment = document.getElementById('btn-next-segment');
    const btnReveal = document.getElementById('btn-reveal');
    const btnNext = document.getElementById('btn-next');
    const metadataDisplay = document.getElementById('metadata-display');
    const readerContainer = document.getElementById('reader-container');
    const trackTrivia = document.getElementById('track-trivia');

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
        let cardData = DataManager.getCardData(decodedText);
        let trackId = null;
        currentTrivia = null;

        if (cardData && cardData.trackId) {
            trackId = cardData.trackId;
            currentTrivia = cardData.trivia || null;
        } else {
            // 2. Fallback to checking if it's a raw Spotify URL
            const regex = /(?:track\/|spotify:track:)([a-zA-Z0-9]+)/i;
            const match = decodedText.match(regex);
            if (match) trackId = match[1];
        }

        if (!trackId) {
            statusText.textContent = "Tarjeta no reconocida.";
            return;
        }

        currentTrackId = trackId;
        currentSegment = 0;

        // Pause scanning to avoid multiple triggers
        pauseScanner();
        readerContainer.classList.add('hidden');
        
        // Setup UI for blind play
        gameContainer.classList.remove('hidden');
        metadataDisplay.classList.add('hidden');
        btnReveal.classList.add('hidden');
        btnNext.classList.add('hidden');
        playbackControls.classList.remove('hidden');
        btnNextSegment.disabled = false;
        
        statusText.textContent = "Preparando pista...";

        // Fetch duration before playing
        const metadata = await getTrackMetadata(currentTrackId);
        if (metadata) {
            trackDurationMs = metadata.duration_ms;
        } else {
            trackDurationMs = 180000; // fallback 3 mins
        }

        playSegment(0);
    }

    async function playSegment(segmentIndex) {
        if (playbackTimeout) clearTimeout(playbackTimeout);
        
        let positionMs = 0;
        if (segmentIndex === 1) positionMs = Math.floor(trackDurationMs * 0.25);
        if (segmentIndex === 2) positionMs = Math.floor(trackDurationMs * 0.50);

        statusText.textContent = `Reproduciendo Tramo ${segmentIndex + 1}/3...`;
        gameContainer.classList.add('is-playing');

        await playTrack(currentTrackId, positionMs);

        playbackTimeout = setTimeout(() => {
            stopPlayback();
        }, CONFIG.PLAYBACK_DURATION_MS);
    }

    async function stopPlayback() {
        if (playbackTimeout) clearTimeout(playbackTimeout);
        await pauseTrack();
        gameContainer.classList.remove('is-playing');
        statusText.textContent = "Música Pausada.";
        btnReveal.classList.remove('hidden');
    }

    btnStop.addEventListener('click', stopPlayback);

    btnNextSegment.addEventListener('click', () => {
        if (currentSegment < 2) {
            currentSegment++;
            playSegment(currentSegment);
            if (currentSegment === 2) {
                btnNextSegment.disabled = true;
            }
        }
    });

    btnReveal.addEventListener('click', async () => {
        if (!currentTrackId) return;
        
        stopPlayback();
        playbackControls.classList.add('hidden');
        btnReveal.classList.add('hidden');
        statusText.textContent = "¡Revelado!";
        
        // Fetch metadata
        const metadata = await getTrackMetadata(currentTrackId);
        if (metadata) {
            document.getElementById('track-title').textContent = metadata.name;
            document.getElementById('track-artist').textContent = metadata.artists.map(a => a.name).join(', ');
            if (metadata.album && metadata.album.images.length > 0) {
                document.getElementById('track-cover').src = metadata.album.images[0].url;
            }
        }
        
        if (currentTrivia) {
            trackTrivia.textContent = currentTrivia;
            trackTrivia.classList.remove('hidden');
        } else {
            trackTrivia.classList.add('hidden');
        }
        
        metadataDisplay.classList.remove('hidden');
        btnNext.classList.remove('hidden');
    });

    btnNext.addEventListener('click', () => {
        // Reset state for next round
        gameContainer.classList.add('hidden');
        readerContainer.classList.remove('hidden');
        currentTrackId = null;
        currentTrivia = null;
        if (playbackTimeout) clearTimeout(playbackTimeout);
        gameContainer.classList.remove('is-playing');
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
