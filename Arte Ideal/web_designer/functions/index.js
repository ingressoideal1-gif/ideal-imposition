const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { getStorage } = require("firebase-admin/storage");
const sharp = require("sharp");
const path = require("path");
const os = require("os");
const fs = require("fs");

admin.initializeApp();

exports.generateThumbnail = functions
    .runWith({ memory: "1GB", timeoutSeconds: 300 })
    .storage.object()
    .onFinalize(async (object) => {
    
    const fileBucket = object.bucket;
    const filePath = object.name;
    const contentType = object.contentType;

    // Apenas processar se estiver na pasta media dos projetos
    if (!filePath.startsWith("projects/") || !filePath.includes("/media/")) {
        console.log(`Ignorando arquivo fora do escopo: ${filePath}`);
        return null;
    }

    if (filePath.includes("/thumbnails/")) {
        return null;
    }

    if (!contentType.startsWith("image/")) {
        console.log(`Nao e uma imagem, ignorando: ${contentType}`);
        return null;
    }
    
    if (contentType.includes("svg")) {
        console.log(`Arquivo SVG ignorado para thumbnail.`);
        return null;
    }

    const pathParts = filePath.split("/");
    if (pathParts.length < 5) return null;

    const projectId = pathParts[1];
    const userId = pathParts[3];
    const fileName = pathParts[pathParts.length - 1];
    
    const fileId = fileName.substring(0, fileName.indexOf('_'));
    if (!fileId) {
        console.log(`Falha ao extrair fileId do nome: ${fileName}`);
        return null;
    }

    const thumbFileName = `${fileId}_thumb_200.webp`;
    const thumbFilePath = `projects/${projectId}/thumbnails/${userId}/${thumbFileName}`;

    const bucket = getStorage().bucket(fileBucket);
    
    const [exists] = await bucket.file(thumbFilePath).exists();
    if (exists) {
        console.log(`Thumbnail ja existe para ${filePath}`);
        return null;
    }

    console.log(`Gerando thumbnail para ${filePath}...`);

    const tempFilePath = path.join(os.tmpdir(), fileName);
    const tempThumbPath = path.join(os.tmpdir(), thumbFileName);

    try {
        await bucket.file(filePath).download({ destination: tempFilePath });
        console.log('Imagem baixada localmente.');

        await sharp(tempFilePath)
            .resize(200, 200, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .webp({ quality: 80 })
            .toFile(tempThumbPath);
        
        console.log('Thumbnail gerado com sucesso.');

        await bucket.upload(tempThumbPath, {
            destination: thumbFilePath,
            metadata: {
                contentType: 'image/webp'
            }
        });
        console.log('Thumbnail salvo no Storage.');

        const publicThumbUrl = `https://firebasestorage.googleapis.com/v0/b/${fileBucket}/o/${encodeURIComponent(thumbFilePath)}?alt=media`;

        console.log(`Atualizando Firestore para fileId: ${fileId}`);
        await admin.firestore().collection('files').doc(fileId).update({
            thumbnailUrl: publicThumbUrl
        });
        
        console.log('Concluido!');

    } catch (error) {
        console.error('Erro ao processar imagem:', error);
    } finally {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        if (fs.existsSync(tempThumbPath)) fs.unlinkSync(tempThumbPath);
    }
    
    return null;
});
