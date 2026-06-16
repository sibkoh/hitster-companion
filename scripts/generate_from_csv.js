require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY
});

const playlistsDir = 'C:\\Users\\sibko\\Desktop\\Hitster Playlists';
const outputFile = path.join(__dirname, '..', 'data', 'default_cards.json');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function generateTriviaWithDeepseek(trackName, artist) {
    if (!process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY === 'Pega_Tu_Clave_DeepSeek_Aqui') {
        console.error("No se ha configurado DEEPSEEK_API_KEY en el archivo .env");
        process.exit(1);
    }
    
    const prompt = `Actúa como un experto en cultura musical y creador de contenido para un juego de mesa de fiesta similar a Hitster.
Necesito 3 anécdotas divertidas, sorprendentes o muy curiosas sobre la canción "${trackName}" del artista "${artist}".
Si la canción no es muy conocida, da datos sobre el artista o la época.
Las anécdotas deben ser cortas (máximo 1 o 2 líneas cada una), fáciles de leer en voz alta, y que generen un "¡Ala, no lo sabía!" en los jugadores.
Devuélvelo estrictamente en formato JSON como un array de strings. Nada más. Ejemplo:
[
  "El cantante grabó esta canción estando totalmente resfriado.",
  "La melodía principal fue inspirada por el sonido de una lavadora.",
  "Estuvo a punto de no incluirse en el disco porque al productor le parecía demasiado aburrida."
]`;

    let retries = 3;
    while (retries > 0) {
        try {
            const response = await deepseek.chat.completions.create({
                model: "deepseek-v4-flash",
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" } // Aseguramos formato JSON (opcional pero ayuda)
            });
            
            let text = response.choices[0].message.content;
            
            // Clean markdown JSON formatting if present
            text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
            
            // Si deepseek-chat devuelve un objeto en vez de un array a veces:
            const parsed = JSON.parse(text);
            
            // Handle both flat arrays or an object with an array inside
            let finalArray = Array.isArray(parsed) ? parsed : Object.values(parsed).find(val => Array.isArray(val));
            
            if (finalArray && finalArray.length === 3) {
                return finalArray;
            }
        } catch (error) {
            console.error(`Intento fallido para ${trackName} (${error.message}). Reintentando en 5s...`);
            retries--;
            if (retries === 0) {
                console.error(`Abortado ${trackName} tras 3 intentos.`);
                return null;
            }
            await delay(5000); 
        }
    }
    return null;
}

async function processPlaylists() {
    const files = fs.readdirSync(playlistsDir).filter(f => f.endsWith('.csv'));
    let customCards = {};
    
    try {
        const existing = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
        customCards = { ...existing };
    } catch(e) {}

    let totalProcessed = 0;
    console.log(`Found ${files.length} CSV files.`);
    
    for (const file of files) {
        console.log(`\n--- Procesando archivo: ${file} ---`);
        const filePath = path.join(playlistsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        
        // Skip header
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const parts = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
            if (!parts || parts.length < 4) continue;
            
            const uriStr = parts[0].replace(/"/g, '');
            if (!uriStr.startsWith('spotify:track:')) continue;
            
            const trackId = uriStr.replace('spotify:track:', '');
            const trackName = parts[1].replace(/"/g, '');
            const artistStr = parts[3].replace(/"/g, '');
            const mainArtist = artistStr.split(';')[0];
            
            let needsGeneration = true;
            for (const key in customCards) {
                if (customCards[key].trackId === trackId) {
                    const existingTrivia = customCards[key].trivia;
                    if (Array.isArray(existingTrivia) && existingTrivia.length >= 3) {
                        needsGeneration = false;
                    }
                    break;
                }
            }
            if (!needsGeneration) continue;
            
            console.log(`Generando trivia (DeepSeek) para: ${trackName} - ${mainArtist}...`);
            let trivia = await generateTriviaWithDeepseek(trackName, mainArtist);
            
            if (trivia) {
                const newKey = `card_${trackId}`;
                customCards[newKey] = {
                    trackId: trackId,
                    trivia: trivia
                };
                
                totalProcessed++;
                
                if (totalProcessed % 5 === 0) {
                    fs.writeFileSync(outputFile, JSON.stringify(customCards, null, 2));
                    console.log(`[Guardado intermedio OK. Llevamos ${totalProcessed} canciones re-generadas]`);
                }
                
                // DeepSeek es rápido y sus límites son altos, pero no saturemos
                await delay(1000); 
            } else {
                console.log(`Falló la generación de ${trackName}. Saltando...`);
                await delay(1000);
            }
        }
    }
    
    fs.writeFileSync(outputFile, JSON.stringify(customCards, null, 2));
    console.log(`\n¡Finalizado! Se han generado anécdotas de alta calidad usando DeepSeek para ${totalProcessed} canciones.`);
}

processPlaylists().catch(console.error);
