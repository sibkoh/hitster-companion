export class DataManager {
    static STORAGE_KEY = 'hitster_custom_cards';

    static async initialize() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        let needsReset = false;
        
        if (stored) {
            try {
                const data = JSON.parse(stored);
                // Check if it's old format (string values)
                const firstValue = Object.values(data)[0];
                if (firstValue && typeof firstValue === 'string') {
                    needsReset = true;
                }
            } catch(e) { needsReset = true; }
        }
        
        if (!stored || needsReset) {
            try {
                const response = await fetch('data/default_cards.json');
                if (response.ok) {
                    const data = await response.json();
                    this.saveAll(data);
                    console.log("Default cards loaded.");
                }
            } catch (error) {
                console.error("Failed to load default cards", error);
                this.saveAll({});
            }
        }
    }

    static getAll() {
        const data = localStorage.getItem(this.STORAGE_KEY);
        return data ? JSON.parse(data) : {};
    }

    static saveAll(data) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    }

    static getCardData(scannedText) {
        const data = this.getAll();
        return data[scannedText] || null;
    }

    static getTriviaByTrackId(trackId) {
        const data = this.getAll();
        for (const [key, value] of Object.entries(data)) {
            if (value && typeof value === 'object' && value.trackId === trackId) {
                return value.trivia;
            }
        }
        return null;
    }

    static exportData() {
        const data = this.getAll();
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.href = url;
        downloadAnchorNode.download = "hitster_custom_cards.json";
        
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        
        setTimeout(() => {
            document.body.removeChild(downloadAnchorNode);
            window.URL.revokeObjectURL(url);
        }, 100);
    }

    static importData(file, onCompleteCallback) {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                if (this.validateData(importedData)) {
                    this.saveAll(importedData);
                    alert("¡Colección importada correctamente!");
                    if (onCompleteCallback) onCompleteCallback(true);
                } else {
                    alert("Formato de archivo incorrecto. Asegúrate de que sea un JSON válido { 'ID': 'SpotifyID' }.");
                    if (onCompleteCallback) onCompleteCallback(false);
                }
            } catch (e) {
                alert("Error al procesar el archivo JSON.");
                if (onCompleteCallback) onCompleteCallback(false);
            }
        };
        reader.readAsText(file);
    }

    static validateData(data) {
        if (typeof data !== 'object' || Array.isArray(data) || data === null) {
            return false;
        }
        for (const [key, value] of Object.entries(data)) {
            if (typeof key !== 'string' || typeof value !== 'object' || value === null) {
                return false;
            }
            if (typeof value.trackId !== 'string' || typeof value.trivia !== 'string') {
                return false;
            }
        }
        return true;
    }
}
