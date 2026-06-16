require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY
});

const csvFile = 'C:\\Users\\sibko\\Desktop\\Hitster Playlists\\HITSTER_-_Bingo_Español.csv';
const outputFile = path.join(__dirname, '..', 'data', 'default_cards.json');
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getMegaEnrichedMetadata(trackName, artist) {
    const prompt = `Actúa como un experto en cultura musical y pop. Para la canción "${trackName}" del artista "${artist}", debes proporcionar un desglose completo de curiosidades y metadatos para un juego de mesa en formato JSON estricto.

Piensa paso a paso sobre la historia de la canción, si salió en películas de culto (ej. Reality Bites, Pulp Fiction, Shrek...), si salió en anuncios de televisión icónicos (coches, perfumes, etc.) y si su cantante principal sigue vivo.

Devuelve SOLO un objeto JSON con estas 13 claves exactas:

{
  "trivia": ["Dato curioso 1", "Dato curioso 2", "Dato curioso 3"],
  "is_one_hit_wonder": true o false (Si el artista es conocido casi exclusivamente por este tema),
  "comentario_one_hit": "Comentario ingenioso justificando si es o no un one-hit wonder",
  "is_cinematografica": true o false (Si sale en una película muy famosa),
  "pelicula_nombre": "Nombre de la película famosa" (o null),
  "is_karaoke_dios": true o false (Dificultad vocal extrema para cantar en karaoke),
  "comentario_karaoke": "Comentario humorístico sobre cantarla en público",
  "is_cierra_discotecas": true o false (Himno para cerrar fiestas),
  "comentario_cierre": "Comentario ingenioso sobre el impacto en la pista",
  "is_artista_vivo": true o false (Estado vital del artista o líder),
  "anio_fallecimiento": Año numérico (o null),
  "causa_fallecimiento": "Causa del deceso" (o null),
  "is_de_anuncio": true o false (Si se usó en un anuncio famoso),
  "marca_comercial": "Nombre de la marca del anuncio" (o null)
}

Recuerda: los campos "comentario_..." deben ser muy divertidos y en español. La trivia debe ser 3 frases sobre la canción. NO añadas nada fuera del JSON.`;

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
            
            if ('trivia' in parsed && 'is_cinematografica' in parsed && 'is_cierra_discotecas' in parsed) {
                return parsed;
            } else {
                throw new Error("El JSON no tiene la estructura completa");
            }
        } catch (error) {
            retries--;
            if (retries === 0) return null;
            await delay(4000); 
        }
    }
    return null;
}

async function runOfficialCards() {
    console.log("Leyendo CSV de tarjetas oficiales...");
    const content = fs.readFileSync(csvFile, 'utf-8');
    const lines = content.split('\n');
    
    let customCards = {};
    if (fs.existsSync(outputFile)) {
        customCards = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    }

    let totalAdded = 0;

    // Empezamos en la línea 1 (omitiendo cabecera) y vamos procesando hasta la 225
    // En el CSV las líneas van del índice 1 al 225 (aprox) correspondientes a tarjetas 00001 a 00225.
    let indexTarjeta = 1;
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
        
        const cardKey = `http://www.hitstergame.com/es/aaaa0017/${String(indexTarjeta).padStart(5, '0')}`;
        
        if (customCards[cardKey] && customCards[cardKey].is_one_hit_wonder !== undefined) {
            // Ya la procesamos, pasamos a la siguiente
            indexTarjeta++;
            continue;
        }

        console.log(`[Oficial ${indexTarjeta}/225] Enriqueciendo: ${trackName} - ${mainArtist}`);
        
        const meta = await getMegaEnrichedMetadata(trackName, mainArtist);
        if (meta) {
            customCards[cardKey] = {
                trackId: trackId,
                ...meta
            };
            totalAdded++;
            
            // Guardamos cada 5 por seguridad
            if (totalAdded % 5 === 0) {
                fs.writeFileSync(outputFile, JSON.stringify(customCards, null, 2));
            }
        } else {
            console.log(`Falló el enriquecimiento para ${trackName}.`);
        }
        
        indexTarjeta++;
        await delay(1000);
    }

    fs.writeFileSync(outputFile, JSON.stringify(customCards, null, 2));
    console.log(`\n¡Finalizado! Se inyectaron metadatos para ${totalAdded} tarjetas oficiales.`);
}

runOfficialCards().catch(console.error);
