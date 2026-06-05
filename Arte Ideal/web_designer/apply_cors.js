// Script para aplicar CORS no bucket do Firebase Storage
// INSTRUÇÃO: Execute este script após criar o bucket no console do Firebase
// Use: node apply_cors.js NOME_DO_BUCKET
// Exemplo: node apply_cors.js ideal-arte-e64f6.firebasestorage.app

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

function makeRequest(options, data = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                let parsed = body;
                if (res.headers['content-type'] && res.headers['content-type'].includes('application/json')) {
                    try { parsed = JSON.parse(body); } catch(e) {}
                }
                resolve({ statusCode: res.statusCode, body: parsed });
            });
        });
        req.on('error', reject);
        if (data) req.write(typeof data === 'string' ? data : JSON.stringify(data));
        req.end();
    });
}

async function run() {
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const accessToken = config.tokens.access_token;

    const corsRules = [
        {
            "origin": ["*"],
            "method": ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],
            "responseHeader": ["Content-Type", "Authorization", "x-goog-meta-*", "x-goog-resumable"],
            "maxAgeSeconds": 3600
        }
    ];

    // Listar todos os buckets para achar o certo
    console.log("Buscando todos os buckets do projeto...");
    const projectId = "ideal-arte-e64f6";
    const listRes = await makeRequest({
        hostname: 'storage.googleapis.com',
        path: `/storage/v1/b?project=${projectId}&maxResults=100`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    let bucketsToTry = [];
    if (listRes.body && listRes.body.items && listRes.body.items.length > 0) {
        bucketsToTry = listRes.body.items.map(b => b.id || b.name);
        console.log("✅ Buckets encontrados:", bucketsToTry);
    } else {
        // Se não encontrou por listagem, usar o argumento da linha de comando
        const bucketArg = process.argv[2];
        if (bucketArg) {
            bucketsToTry = [bucketArg];
            console.log("Usando bucket especificado:", bucketArg);
        } else {
            console.error("Nenhum bucket encontrado. Especifique o nome: node apply_cors.js NOME_DO_BUCKET");
            process.exit(1);
        }
    }

    let success = false;
    for (const bucket of bucketsToTry) {
        console.log(`\nAplicando CORS no bucket: ${bucket}`);
        const payload = JSON.stringify({ cors: corsRules });
        const res = await makeRequest({
            hostname: 'storage.googleapis.com',
            path: `/storage/v1/b/${encodeURIComponent(bucket)}`,
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, payload);
        
        if (res.statusCode === 200) {
            console.log(`✅ CORS aplicado com sucesso no bucket: ${bucket}`);
            success = true;
        } else {
            console.log(`❌ Falha (${res.statusCode}):`, JSON.stringify(res.body).slice(0, 200));
        }
    }
    
    if (success) {
        console.log("\n🎉 CORS configurado! O upload de arquivos deve funcionar agora.");
    } else {
        console.log("\n❌ Não foi possível configurar CORS. O bucket ainda não existe.");
        console.log("Crie o bucket em: https://console.firebase.google.com/project/ideal-arte-e64f6/storage");
    }
}

run().catch(console.error);
