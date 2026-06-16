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

async function getEnrichedMetadata(trackName, artist) {
    if (!process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY === 'Pega_Tu_Clave_DeepSeek_Aqui') {
        console.error("No se ha configurado DEEPSEEK_API_KEY en el archivo .env");
        process.exit(1);
    }
    
    const prompt = `Actúa como un experto en cultura musical. Para la canción "${trackName}" del artista "${artist}", debes proporcionar los siguientes metadatos sobre mecánicas de juego en formato JSON estricto:

{
  "is_one_hit_wonder": true o false (Indica si el artista es reconocido globalmente de forma casi exclusiva por este tema),
  "comentario_one_hit": "Justificación de por qué se considera o no un éxito único.",
  "is_cinematografica": true o false (Indica si está fuertemente vinculada a una película/serie muy famosa),
  "pelicula_nombre": "Nombre de la película, saga o serie de tv icónica donde aparece" (o null si is_cinematografica es false),
  "is_karaoke_dios": true o false (Indica si presenta una dificultad vocal o rítmica extrema para un amateur),
  "comentario_karaoke": "Comentario humorístico sobre la dificultad o facilidad extrema de cantarla en público.",
  "is_cierra_discotecas": true o false (Indica si es un himno generacional indiscutible idóneo para el clímax o el cierre de una fiesta),
  "comentario_cierre": "Frase ingeniosa sobre el impacto del tema en la pista de baile.",
  "is_artista_vivo": true o false (Indica el estado vital actual del artista principal o vocalista de la banda),
  "anio_fallecimiento": Año (número) del deceso (o null si is_artista_vivo es true),
  "causa_fallecimiento": "Causa oficial de la muerte" (o null si is_artista_vivo es true),
  "is_de_anuncio": true o false (Identificación de impactos publicitarios masivos),
  "marca_comercial": "Nombre de la marca comercial de un spot famoso con esta canción" (o null si is_de_anuncio es false)
}

Asegúrate de que los campos "comentario_one_hit", "comentario_karaoke" y "comentario_cierre" NUNCA estén vacíos y tengan un tono ingenioso. Devuelve SOLO un objeto JSON con estas 13 claves exactas. Nada más.`;

    let retries = 3;
    while (retries > 0) {
        try {
            const response = await deepseek.chat.completions.create({
                model: "deepseek-v4-flash",
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" }
            });
            
            let text = response.choices[0].message.content;
            text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(text);
            
            // Validaciones básicas de que las claves existen
            if (
                'is_one_hit_wonder' in parsed &&
                'is_cinematografica' in parsed &&
                'is_karaoke_dios' in parsed &&
                'is_cierra_discotecas' in parsed &&
                'is_artista_vivo' in parsed &&
                'is_de_anuncio' in parsed
            ) {
                return parsed;
            } else {
                throw new Error("El JSON no tiene la estructura de claves requerida");
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

// Vamos a usar la estructura actual de default_cards.json para extraer artist y trackName, 
// o los cruzaremos usando el CSV para asegurarnos de que pasamos la info correcta a DeepSeek.
async function processEnrichment() {
    // Primero, leemos los CSVs para obtener un diccionario de trackId -> {trackName, artist}
    const files = fs.readdirSync(playlistsDir).filter(f => f.endsWith('.csv'));
    const trackInfoMap = {};
    for (const file of files) {
        const filePath = path.join(playlistsDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
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
            trackInfoMap[trackId] = { trackName, mainArtist };
        }
    }

    let customCards = {};
    try {
        customCards = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    } catch(e) {
        console.error("No se encontró default_cards.json o está corrupto.");
        process.exit(1);
    }

    let totalProcessed = 0;
    const allKeys = Object.keys(customCards);
    console.log(`Encontradas ${allKeys.length} tarjetas en default_cards.json.`);

    for (const key of allKeys) {
        const card = customCards[key];
        
        // Comprobamos si ya tiene los metadatos nuevos
        if (card.hasOwnProperty('is_one_hit_wonder')) {
            continue; // Ya procesada
        }

        const trackId = card.trackId;
        const info = trackInfoMap[trackId];
        
        if (!info) {
            console.log(`No se encontró info en los CSV para el trackId: ${trackId}. Saltando...`);
            continue;
        }

        console.log(`Enriqueciendo metadatos para: ${info.trackName} - ${info.mainArtist}...`);
        
        const newMetadata = await getEnrichedMetadata(info.trackName, info.mainArtist);
        
        if (newMetadata) {
            // Fusionamos preservando "trackId" y "trivia"
            customCards[key] = {
                ...card,
                ...newMetadata
            };
            
            totalProcessed++;
            
            if (totalProcessed % 5 === 0) {
                fs.writeFileSync(outputFile, JSON.stringify(customCards, null, 2));
                console.log(`[Guardado intermedio OK. Llevamos ${totalProcessed} tarjetas enriquecidas]`);
            }
            
            await delay(1000); 
        } else {
            console.log(`Falló el enriquecimiento de ${info.trackName}. Saltando...`);
            await delay(1000);
        }
    }
    
    fs.writeFileSync(outputFile, JSON.stringify(customCards, null, 2));
    console.log(`\n¡Finalizado! Se han añadido metadatos enriquecidos a ${totalProcessed} tarjetas.`);
}

processEnrichment().catch(console.error);
