require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY
});

const outputFile = path.join(__dirname, '..', 'data', 'default_cards.json');
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getTranslationMap(items, type) {
    if (items.length === 0) return {};
    
    let prompt = "";
    if (type === 'movies') {
        prompt = `Actúa como un experto en cine. Aquí tienes una lista de nombres de películas originales. Devuelve un objeto JSON estrictamente formateado donde la CLAVE es el nombre original y el VALOR es el nombre oficial con el que se estrenó esa película en ESPAÑA (España, no Latinoamérica). Si la película no se tradujo o no existe, deja el valor igual que la clave. NO devuelvas nada más que el JSON.\n\nPelículas:\n` + JSON.stringify(items);
    } else {
        prompt = `Aquí tienes un array de textos variados (curiosidades musicales y comentarios). Muchos están en inglés. Devuelve un objeto JSON estrictamente formateado donde la CLAVE es el texto original y el VALOR es la traducción al ESPAÑOL, manteniendo un tono humorístico y divertido. ATENCIÓN: Si el texto original YA está mayormente en español y solo tiene algún título en inglés, entonces el VALOR debe ser idéntico al texto original. NO devuelvas nada más que el JSON.\n\nTextos:\n` + JSON.stringify(items);
    }

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
            return JSON.parse(text);
        } catch (error) {
            console.error("Error en batch de " + type, error.message);
            retries--;
            await delay(4000);
        }
    }
    return {};
}

async function run() {
    console.log("Cargando JSON...");
    let data = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    
    let movieSet = new Set();
    let textSet = new Set();
    
    const engRegex = /\b(the|is|and|of|in|to|with)\b/i;
    
    // Extracción
    for (let k in data) {
        let obj = data[k];
        if (obj.pelicula_nombre) {
            movieSet.add(obj.pelicula_nombre);
        }
        
        ['comentario_one_hit', 'comentario_karaoke', 'comentario_cierre'].forEach(key => {
            if (obj[key] && obj[key].match(engRegex)) textSet.add(obj[key]);
        });
        
        if (Array.isArray(obj.trivia)) {
            obj.trivia.forEach(t => {
                if (t && t.match(engRegex)) textSet.add(t);
            });
        }
    }
    
    const movies = Array.from(movieSet);
    const texts = Array.from(textSet);
    console.log(`Películas únicas a procesar: ${movies.length}`);
    console.log(`Textos sospechosos de inglés a procesar: ${texts.length}`);
    
    // Lotes de 150
    let movieMap = {};
    for (let i = 0; i < movies.length; i += 150) {
        console.log(`Traduciendo lote de películas ${i} a ${i+150}...`);
        const batch = movies.slice(i, i + 150);
        const map = await getTranslationMap(batch, 'movies');
        movieMap = { ...movieMap, ...map };
    }
    
    let textMap = {};
    for (let i = 0; i < texts.length; i += 100) {
        console.log(`Traduciendo lote de textos ${i} a ${i+100}...`);
        const batch = texts.slice(i, i + 100);
        const map = await getTranslationMap(batch, 'texts');
        textMap = { ...textMap, ...map };
    }
    
    console.log("Aplicando traducciones al JSON...");
    let translatedCount = 0;
    
    for (let k in data) {
        let obj = data[k];
        
        if (obj.pelicula_nombre && movieMap[obj.pelicula_nombre]) {
            obj.pelicula_nombre = movieMap[obj.pelicula_nombre];
        }
        
        ['comentario_one_hit', 'comentario_karaoke', 'comentario_cierre'].forEach(key => {
            if (obj[key] && textMap[obj[key]]) {
                obj[key] = textMap[obj[key]];
                translatedCount++;
            }
        });
        
        if (Array.isArray(obj.trivia)) {
            for (let i=0; i<obj.trivia.length; i++) {
                if (textMap[obj.trivia[i]]) {
                    obj.trivia[i] = textMap[obj.trivia[i]];
                    translatedCount++;
                }
            }
        }
    }
    
    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
    console.log(`¡Listo! Se guardó el JSON con ${translatedCount} textos purificados y todas las películas en español.`);
}

run().catch(console.error);
