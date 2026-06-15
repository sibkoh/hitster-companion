/**
 * Extracts the Spotify Track ID from various URL formats.
 */
function extractSpotifyId(url) {
    const regex = /(?:track\/|spotify:track:)([a-zA-Z0-9]+)/i;
    const match = url.match(regex);
    return match ? match[1] : null;
}

let html5QrcodeScanner = null;

export function startScanner(onScanSuccessCb) {
    if (html5QrcodeScanner) return; // Already running
    
    html5QrcodeScanner = new window.Html5QrcodeScanner(
        "reader",
        { 
            fps: 10, 
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            supportedScanTypes: [window.Html5QrcodeScanType.SCAN_TYPE_CAMERA]
        },
        false
    );

    html5QrcodeScanner.render((decodedText) => {
        const trackId = extractSpotifyId(decodedText);
        if (trackId) {
            onScanSuccessCb(trackId);
        }
    }, (error) => {
        // ignore continuous scan failures
    });
}

export function pauseScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.pause(true);
    }
}

export function resumeScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.resume();
    }
}
