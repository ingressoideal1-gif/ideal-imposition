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

// Adicionar funcao escapeHtml antes do bloco de permissoes
const insertBefore = `// =============================================
// SISTEMA DE PERMISSOES POR USUARIO
// =============================================`;

const withEscapeHtml = `/** Escapa caracteres HTML para evitar XSS na renderizacao do painel de permissoes */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// =============================================
// SISTEMA DE PERMISSOES POR USUARIO
// =============================================`;

let ok = 0;
if (replaceOne(insertBefore, withEscapeHtml)) {
    console.log('✅ escapeHtml adicionada');
    ok++;
} else {
    console.log('❌ Ponto de insercao nao encontrado');
}

fs.writeFileSync(scriptPath, content, 'utf8');
console.log('Total:', ok + '/1. Bytes:', fs.statSync(scriptPath).size);
