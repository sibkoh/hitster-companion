/**
 * Extracts the Spotify Track ID from various URL formats.
 */
function extractSpotifyId(url) {
    const regex = /(?:track\/|spotify:track:)([a-zA-Z0-9]+)/i;
    const match = url.match(regex);
    return match ? match[1] : null;
}

let html5QrCode = null;

export function startScanner(onScanSuccessCb) {
    if (html5QrCode) return; // Already running
    
    html5QrCode = new window.Html5Qrcode("reader");

    const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
    };

    // Esto fuerza el arranque automático usando la cámara trasera (environment)
    html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
            // on success
            if (decodedText) {
                onScanSuccessCb(decodedText);
            }
        },
        (errorMessage) => {
            // ignore continuous scan failures
        }
    ).catch((err) => {
        console.error("Error al arrancar la cámara automáticamente:", err);
        // Si falla (p. ej. deniegan permisos), se podría mostrar un mensaje en UI
    });
}

export function pauseScanner() {
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.pause(true);
    }
}

export function resumeScanner() {
    if (html5QrCode) {
        html5QrCode.resume();
    }
}
