const fs = require('fs');
const path = require('path');
const scriptPath = path.join(__dirname, 'script.js');
let content = fs.readFileSync(scriptPath, 'utf8');

function normalize(str) { return str.replace(/\r\n/g, '\n').replace(/\r/g, '\n'); }
function replaceOne(oldStr, newStr) {
    const n = normalize(content);
    const o = normalize(oldStr);
    if (!n.includes(o)) return false;
    content = n.replace(o, normalize(newStr)).replace(/\r?\n/g, '\r\n');
    return true;
}

// 1. Inserir a função generateSearchKeywords
const funcTarget = `function extractTagsFromName(filename) {`;
const funcReplacement = `/** Gera tokens para busca (n-grams) a partir do nome e tags */
function generateSearchKeywords(filename, tags) {
    var tokens = new Set();
    function addGrams(str) {
        if(!str) return;
        var clean = str.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (let i = 1; i <= clean.length; i++) {
            tokens.add(clean.substring(0, i));
        }
        var parts = str.toLowerCase().split(/[^a-z0-9]/);
        parts.forEach(p => {
            if(p.length > 2) tokens.add(p);
        });
    }
    addGrams(filename);
    if(tags && Array.isArray(tags)) {
        tags.forEach(addGrams);
    }
    return Array.from(tokens).slice(0, 30); // Limite do firebase
}

function extractTagsFromName(filename) {`;

// 2. Adicionar searchKeywords e categoria (se precisar) no upload
const uploadTarget = `                                    thumbnailUrl: "",
                                    contentType: file.type || getContentTypeByExtension(file.name),
                                    extension: ext,
                                    size: file.size,
                                    tags: extractTagsFromName(file.name),
                                    createdAt: firebase.firestore.FieldValue.serverTimestamp()`;
                                    
const uploadReplacement = `                                    thumbnailUrl: "",
                                    contentType: file.type || getContentTypeByExtension(file.name),
                                    extension: ext,
                                    size: file.size,
                                    tags: extractTagsFromName(file.name),
                                    searchKeywords: generateSearchKeywords(file.name, extractTagsFromName(file.name)),
                                    createdAt: firebase.firestore.FieldValue.serverTimestamp()`;

// 3. Modificar o loadLibraryFiles para incluir infinite scroll
// Primeiro, a pesquisa.
const queryTarget = `            if (searchTerm) {
                files = files.filter(f => 
                    f.originalName.toLowerCase().includes(searchTerm) || 
                    (f.tags && f.tags.some(t => t.toLowerCase().includes(searchTerm)))
                );
            }`;

const queryReplacement = `            if (searchTerm) {
                if (isFirebaseMock) {
                    files = files.filter(f => 
                        f.originalName.toLowerCase().includes(searchTerm) || 
                        (f.tags && f.tags.some(t => t.toLowerCase().includes(searchTerm)))
                    );
                }
            }`;

// E mudar a query firebase para usar searchKeywords
const dbQueryTarget = `            let query = db.collection('files')
                .where('projectId', '==', window.currentProjectId || 'demo_project')
                .orderBy('createdAt', 'desc');`;
                
const dbQueryReplacement = `            let query = db.collection('files')
                .where('projectId', '==', window.currentProjectId || 'demo_project');
                
            if (searchTerm) {
                query = query.where('searchKeywords', 'array-contains', searchTerm);
            }
            
            query = query.orderBy('createdAt', 'desc');`;

// O infinite scroll
const listenerTarget = `    if (libraryDropZone) {`;

const listenerReplacement = `    // Infinite Scroll setup
    const libraryGridContainer = document.getElementById('library-grid')?.parentElement;
    if (libraryGridContainer && !libraryGridContainer.hasAttribute('data-scroll-listener')) {
        libraryGridContainer.setAttribute('data-scroll-listener', 'true');
        libraryGridContainer.addEventListener('scroll', function() {
            if (this.scrollHeight - this.scrollTop <= this.clientHeight + 100) {
                const loadMoreBtn = document.getElementById('library-load-more-container');
                if (loadMoreBtn && loadMoreBtn.style.display === 'block') {
                    loadMoreBtn.style.display = 'none'; // previne multiplos chamados
                    loadLibraryFiles(false);
                }
            }
        });
    }

    if (libraryDropZone) {`;

let ok = 0;
if (replaceOne(funcTarget, funcReplacement)) { console.log('✅ generateSearchKeywords'); ok++; }
if (replaceOne(uploadTarget, uploadReplacement)) { console.log('✅ fileDoc update'); ok++; }
if (replaceOne(queryTarget, queryReplacement)) { console.log('✅ Mock filter update'); ok++; }
if (replaceOne(dbQueryTarget, dbQueryReplacement)) { console.log('✅ Firebase query update'); ok++; }
if (replaceOne(listenerTarget, listenerReplacement)) { console.log('✅ Infinite scroll'); ok++; }

fs.writeFileSync(scriptPath, content, 'utf8');
console.log('Total:', ok + '/5');
