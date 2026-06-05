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
                try { parsed = JSON.parse(body); } catch(e) {}
                resolve({ statusCode: res.statusCode, body: parsed });
            });
        });
        req.on('error', reject);
        if (data !== null) {
            const str = typeof data === 'string' ? data : JSON.stringify(data);
            req.write(str);
        }
        req.end();
    });
}

// Firebase CLI OAuth2 credentials
const FB_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FB_CLIENT_SECRET = 'j9iVZfS8ggxc_Ci9xCUBjFR3';

async function getNewAccessToken(refresh_token) {
    const payload = [
        `grant_type=refresh_token`,
        `refresh_token=${encodeURIComponent(refresh_token)}`,
        `client_id=${encodeURIComponent(FB_CLIENT_ID)}`,
        `client_secret=${encodeURIComponent(FB_CLIENT_SECRET)}`
    ].join('&');
    
    const res = await makeRequest({
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(payload)
        }
    }, payload);
    return res.body;
}

async function run() {
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const projectId = "ideal-arte-e64f6";

    console.log("=== RENOVANDO TOKEN DO FIREBASE CLI ===");
    
    if (!config.tokens || !config.tokens.refresh_token) {
        console.error("Erro: refresh_token não encontrado no configstore do Firebase CLI.");
        process.exit(1);
    }
    
    console.log("Solicitando novo access_token via refresh_token...");
    const tokenResponse = await getNewAccessToken(config.tokens.refresh_token);
    
    if (!tokenResponse.access_token) {
        console.error("Falha ao renovar token:", JSON.stringify(tokenResponse));
        process.exit(1);
    }
    
    const accessToken = tokenResponse.access_token;
    console.log("✅ Novo access_token obtido! Expira em:", tokenResponse.expires_in, "segundos");
    
    // Salvar o novo token no configstore
    config.tokens.access_token = accessToken;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log("✅ Token salvo no configstore do Firebase CLI.\n");

    // Testar autenticação
    console.log("=== TESTANDO AUTENTICAÇÃO ===");
    const testRes = await makeRequest({
        hostname: 'storage.googleapis.com',
        path: `/storage/v1/b?project=${projectId}&maxResults=10`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    console.log("Status da API de Storage:", testRes.statusCode);
    
    if (testRes.statusCode === 200) {
        console.log("✅ Autenticação OK!");
        if (testRes.body && testRes.body.items && testRes.body.items.length > 0) {
            console.log("Buckets existentes:", testRes.body.items.map(b => b.id));
            
            // Aplicar CORS nos buckets existentes
            for (const bucket of testRes.body.items) {
                console.log(`\nAplicando CORS no bucket: ${bucket.id}`);
                const corsPayload = JSON.stringify({
                    cors: [{
                        origin: ["*"],
                        method: ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],
                        responseHeader: ["Content-Type", "Authorization", "x-goog-meta-*", "x-goog-resumable"],
                        maxAgeSeconds: 3600
                    }]
                });
                const corsRes = await makeRequest({
                    hostname: 'storage.googleapis.com',
                    path: `/storage/v1/b/${encodeURIComponent(bucket.id)}`,
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(corsPayload)
                    }
                }, corsPayload);
                
                if (corsRes.statusCode === 200) {
                    console.log("✅ CORS configurado com sucesso!");
                } else {
                    console.log(`❌ Falha CORS (${corsRes.statusCode}):`, JSON.stringify(corsRes.body).slice(0, 200));
                }
            }
        } else {
            console.log("⚠️ Nenhum bucket encontrado. O Storage precisa ser criado no console do Firebase.");
            console.log("Acesse: https://console.firebase.google.com/project/ideal-arte-e64f6/storage");
            
            // Tentar criar bucket
            console.log("\n=== TENTANDO CRIAR BUCKET ===");
            const bucketName = `${projectId}.firebasestorage.app`;
            const createPayload = JSON.stringify({
                name: bucketName,
                location: "US-CENTRAL1",
                storageClass: "STANDARD"
            });
            const createRes = await makeRequest({
                hostname: 'storage.googleapis.com',
                path: `/storage/v1/b?project=${projectId}`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(createPayload)
                }
            }, createPayload);
            
            console.log(`Criação do bucket '${bucketName}': Status ${createRes.statusCode}`);
            console.log("Resposta:", JSON.stringify(createRes.body).slice(0, 500));
            
            if (createRes.statusCode === 200 || createRes.statusCode === 201) {
                console.log("✅ Bucket criado! Aplicando CORS...");
                // aplicar CORS
                const corsPayload = JSON.stringify({
                    cors: [{
                        origin: ["*"],
                        method: ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],
                        responseHeader: ["Content-Type", "Authorization", "x-goog-meta-*", "x-goog-resumable"],
                        maxAgeSeconds: 3600
                    }]
                });
                const corsRes = await makeRequest({
                    hostname: 'storage.googleapis.com',
                    path: `/storage/v1/b/${encodeURIComponent(bucketName)}`,
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(corsPayload)
                    }
                }, corsPayload);
                
                if (corsRes.statusCode === 200) {
                    console.log("✅ CORS configurado com sucesso!");
                } else {
                    console.log(`❌ Falha CORS:`, JSON.stringify(corsRes.body).slice(0, 200));
                }
            }
        }
    } else {
        console.log("❌ Falha na autenticação:", JSON.stringify(testRes.body).slice(0, 300));
    }
    
    console.log("\n=== FIM ===");
}

run().catch(err => {
    console.error("Erro fatal:", err.message);
});
