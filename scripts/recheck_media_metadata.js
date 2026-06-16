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

async function getRecheckedMetadata(trackName, artist) {
    const prompt = `Actúa como un experto en cultura pop de las últimas décadas. Para la canción "${trackName}" del artista "${artist}", debes pensar MUY a fondo si ha aparecido en la cultura popular (películas, series icónicas, anuncios famosos de TV).

Piensa paso a paso: ¿Salió en alguna película de culto como Reality Bites, Pulp Fiction, Guardianes de la Galaxia, Shrek, etc? ¿Fue usada en algún anuncio famoso de coches, perfumes, refrescos o electrónica?

Devuelve SOLO un objeto JSON estricto con estas 4 claves:

{
  "is_cinematografica": true o false,
  "pelicula_nombre": "Nombre de la película, saga o serie de tv icónica donde aparece" (o null),
  "is_de_anuncio": true o false,
  "marca_comercial": "Nombre de la marca comercial de un spot famoso" (o null)
}

Recuerda: si tienes dudas, busca en tu base de datos interna con mucho detenimiento. No devuelvas explicaciones, solo el JSON.`;

    let retries = 2;
    while (retries > 0) {
        try {
            const response = await deepseek.chat.completions.create({
                model: "deepseek-v4-flash", // O el modelo que prefieras usar
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" }
            });
            
            let text = response.choices[0].message.content;
            text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(text);
            
            if ('is_cinematografica' in parsed && 'is_de_anuncio' in parsed) {
                return parsed;
            } else {
                throw new Error("Estructura JSON inválida");
            }
        } catch (error) {
            retries--;
            if (retries === 0) return null;
            await delay(3000); 
        }
    }
    return null;
}

async function runRecheck() {
    // 1. Cargar info de pistas
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

    // 2. Cargar tarjetas
    let customCards = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    let totalUpdated = 0;
    const allKeys = Object.keys(customCards);

    console.log("Iniciando repaso exhaustivo de Cine y Anuncios...");

    for (const key of allKeys) {
        const card = customCards[key];
        const trackId = card.trackId;
        const info = trackInfoMap[trackId];
        
        if (!info) continue;

        console.log(`Repasando: ${info.trackName} - ${info.mainArtist}`);
        
        const newMeta = await getRecheckedMetadata(info.trackName, info.mainArtist);
        
        if (newMeta) {
            let changed = false;
            // Si el modelo ahora descubre que sí pertenece a cine o anuncio y antes decía que no, lo actualizamos
            if (newMeta.is_cinematografica && !card.is_cinematografica) {
                card.is_cinematografica = true;
                card.pelicula_nombre = newMeta.pelicula_nombre;
                changed = true;
            }
            if (newMeta.is_de_anuncio && !card.is_de_anuncio) {
                card.is_de_anuncio = true;
                card.marca_comercial = newMeta.marca_comercial;
                changed = true;
            }

            if (changed) {
                console.log(`>>> ¡Actualizado! Cine: ${card.pelicula_nombre} | Anuncio: ${card.marca_comercial}`);
                totalUpdated++;
            }
            
            // Guardado progresivo
            if (totalUpdated > 0 && totalUpdated % 5 === 0) {
                fs.writeFileSync(outputFile, JSON.stringify(customCards, null, 2));
            }
        }
        await delay(1000);
    }
    
    fs.writeFileSync(outputFile, JSON.stringify(customCards, null, 2));
    console.log(`\n¡Repaso completado! Se encontraron nuevas coincidencias para ${totalUpdated} tarjetas.`);
}

runRecheck().catch(console.error);
