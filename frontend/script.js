// ─── VDP Engine — Frontend Script ────────────────────────────────────────────
'use strict';

// ─── Utility — Parse Decimal BR (aceita vírgula como separador) ──────────────
function parseDecimalBR(value) {
    if (typeof value !== 'string') value = String(value);
    value = value.trim().replace(/\s*mm\s*$/i, '').trim();
    // Aceitar vírgula como separador decimal (padrão brasileiro)
    value = value.replace(',', '.');
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
}

function validateOffsetField(inputEl) {
    const val = parseDecimalBR(inputEl.value);
    if (val === null && inputEl.value.trim() !== '' && inputEl.value.trim() !== '0') {
        inputEl.classList.add('invalid');
        return null;
    }
    inputEl.classList.remove('invalid');
    return val !== null ? val : 0;
}

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
    formatos: [],
    numeracoes: [],
    saidas: [],
    cores: [],

    // Editor de Numeração
    numFormato: null,       // formato selecionado no editor
    numElements: [],        // array de elementos no editor
    numElCounter: 0,        // contador de IDs locais (sempre cresce, nunca reseta)
    selectedElId: null,     // elemento selecionado no canvas
    selectedElIds: [],      // IDs dos elementos selecionados no editor
    dragging: null,         // { targets, downX, downY }
    canvasScale: 3,         // px por mm (default)
    bgImage: null,          // HTMLImageElement | null (arte de fundo no canvas)

    // Preview de Imposição
    impArtImage: null,
    impArtWidth: 0,
    impArtHeight: 0,
    csvFile: null,
    csvData: null,
    
    // Banco de Dados no Editor
    numCsvHeaders: [],
    numCsvData: null,
    numCsvFilename: "",
};

// ─── Utility — Toast ─────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const tc = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span>${icons[type]}</span> ${msg}`;
    tc.appendChild(el);
    setTimeout(() => el.remove(), 3100);
}

// ─── Navigation ──────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
        btn.classList.add('active');
        const view = document.getElementById(btn.dataset.view);
        if (view) view.classList.add('active');
    });
});

// ─── API Helpers ──────────────────────────────────────────────────────────────
async function api(method, path, body = null) {
    // Se o Firebase estiver ativo e for rota de banco de dados
    if (typeof dbFirebase !== 'undefined' && dbFirebase && (path.startsWith('/formatos') || path.startsWith('/numeracoes') || path.startsWith('/saidas') || path.startsWith('/cores'))) {
        const parts = path.substring(1).split('/');
        const col = parts[0];
        const docId = parts[1] || null;

        try {
            if (method === 'GET') {
                if (docId) {
                    const doc = await dbFirebase.collection(col).doc(docId).get();
                    if (!doc.exists) throw new Error('Item não encontrado no Firestore');
                    return { id: doc.id, ...doc.data() };
                } else {
                    const snapshot = await dbFirebase.collection(col).get();
                    const items = [];
                    snapshot.forEach(doc => {
                        items.push({ id: doc.id, ...doc.data() });
                    });
                    return items;
                }
            } else if (method === 'POST') {
                const docRef = await dbFirebase.collection(col).add(body);
                return { id: docRef.id };
            } else if (method === 'PUT') {
                if (!docId) throw new Error('ID ausente para atualização');
                const updateData = { ...body };
                delete updateData.id;
                await dbFirebase.collection(col).doc(docId).set(updateData, { merge: true });
                return { status: 'success' };
            } else if (method === 'DELETE') {
                if (!docId) throw new Error('ID ausente para exclusão');
                await dbFirebase.collection(col).doc(docId).delete();
                return { status: 'success' };
            }
        } catch (e) {
            console.error(`Erro no Firestore (${method} ${path}):`, e);
            throw new Error(`Erro no Banco de Dados: ${e.message}`);
        }
    }

    const baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';
    const opts = { method, headers: {} };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    
    // Obter o token JWT do Firebase Auth ativo se disponível
    if (typeof firebase !== 'undefined' && firebase.auth() && firebase.auth().currentUser) {
        try {
            const token = await firebase.auth().currentUser.getIdToken();
            opts.headers['Authorization'] = `Bearer ${token}`;
        } catch (e) {
            console.error("Erro ao obter Firebase ID Token:", e);
        }
    }

    const res = await fetch(`${baseUrl}/api${path}`, opts);
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Erro desconhecido' }));
        throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json().catch(() => ({}));
}


// ─── Load All Data ────────────────────────────────────────────────────────────
async function loadAll() {
    try {
        const [fmts, nums, sais, cores] = await Promise.all([
            api('GET', '/formatos'),
            api('GET', '/numeracoes'),
            api('GET', '/saidas'),
            api('GET', '/cores').catch(() => []),
        ]);
        state.formatos = fmts;
        state.numeracoes = nums;
        state.saidas = sais;
        state.cores = cores || [];
        renderAll();
    } catch (e) {
        toast('Erro ao carregar dados: ' + e.message, 'error');
    }
}

function renderAll() {
    renderFormatos();
    renderNumeracoes();
    renderSaidas();
    renderCores();
    updateBadges();
    populateSelects();
}

function updateBadges() {
    document.getElementById('badge-formatos').textContent = state.formatos.length;
    document.getElementById('badge-numeracao').textContent = state.numeracoes.length;
    document.getElementById('badge-saidas').textContent = state.saidas.length;
    const badgeCores = document.getElementById('badge-cores');
    if (badgeCores) badgeCores.textContent = state.cores.length;
}

// ─── FORMATOS ─────────────────────────────────────────────────────────────────
function renderFormatos() {
    const tbody = document.getElementById('tbody-formatos');
    const empty = document.getElementById('empty-formatos');
    if (!state.formatos.length) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';
    tbody.innerHTML = state.formatos.map(f => `
        <tr>
            <td>${f.name}</td>
            <td>${f.width_mm} × ${f.height_mm} mm</td>
            <td><span class="badge badge-blue">${f.cols} × ${f.rows}</span></td>
            <td>${f.gap_h_mm} × ${f.gap_v_mm} mm</td>
            <td class="actions-cell">
                <button class="btn btn-secondary btn-sm" onclick="duplicateFmt('${f.id}')" title="Duplicar Formato">⧉</button>
                <button class="btn btn-sm btn-ghost" onclick="editFmt('${f.id}')">✏️ Editar</button>
                <button class="btn btn-danger btn-sm" onclick="deleteFmt('${f.id}')">🗑️</button>
            </td>
        </tr>
    `).join('');
}

async function saveFmt() {
    const id = document.getElementById('fmt-id').value;

    // Validar campos de offset (aceita vírgula como separador decimal)
    const offhEl = document.getElementById('fmt-offh');
    const offvEl = document.getElementById('fmt-offv');
    const offH = validateOffsetField(offhEl);
    const offV = validateOffsetField(offvEl);
    if (offH === null || offV === null) return toast('Valor de offset inválido. Use números decimais (ex: 10,2).', 'error');

    const data = {
        name: document.getElementById('fmt-name').value.trim(),
        width_mm: parseFloat(document.getElementById('fmt-w').value),
        height_mm: parseFloat(document.getElementById('fmt-h').value),
        cols: parseInt(document.getElementById('fmt-cols').value),
        rows: parseInt(document.getElementById('fmt-rows').value),
        gap_h_mm: parseFloat(document.getElementById('fmt-gaph').value),
        gap_v_mm: parseFloat(document.getElementById('fmt-gapv').value),
        offset_h_mm: offH,
        offset_v_mm: offV,
    };
    if (!data.name) return toast('Informe um nome para o formato.', 'error');
    try {
        if (id) {
            await api('PUT', `/formatos/${id}`, data);
            toast('Formato atualizado!', 'success');
        } else {
            await api('POST', '/formatos', data);
            toast('Formato salvo!', 'success');
        }
        cancelFmtEdit();
        await loadAll();
        // Redirecionar para Lista Formatos
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
        document.getElementById('nav-lista-formatos').classList.add('active');
        document.getElementById('view-lista-formatos').classList.add('active');
    } catch (e) { toast(e.message, 'error'); }
}

function editFmt(id) {
    const f = state.formatos.find(x => x.id === id);
    if (!f) return;

    // Ativar view de formatos para edição
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    document.getElementById('nav-formatos').classList.add('active');
    document.getElementById('view-formatos').classList.add('active');

    document.getElementById('fmt-id').value = f.id;
    document.getElementById('fmt-name').value = f.name;
    document.getElementById('fmt-w').value = f.width_mm;
    document.getElementById('fmt-h').value = f.height_mm;
    document.getElementById('fmt-cols').value = f.cols;
    document.getElementById('fmt-rows').value = f.rows;
    document.getElementById('fmt-gaph').value = f.gap_h_mm;
    document.getElementById('fmt-gapv').value = f.gap_v_mm;
    document.getElementById('fmt-offh').value = (f.offset_h_mm || 0).toString().replace('.', ',');
    document.getElementById('fmt-offv').value = (f.offset_v_mm || 0).toString().replace('.', ',');
    document.getElementById('fmt-form-title').textContent = 'Editar Formato';
    document.getElementById('btn-fmt-cancel').style.display = 'inline-flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    drawFormatPreview();
}

function cancelFmtEdit() {
    document.getElementById('fmt-id').value = '';
    document.getElementById('fmt-name').value = '';
    document.getElementById('fmt-w').value = '100';
    document.getElementById('fmt-h').value = '50';
    document.getElementById('fmt-cols').value = '2';
    document.getElementById('fmt-rows').value = '5';
    document.getElementById('fmt-gaph').value = '3';
    document.getElementById('fmt-gapv').value = '2';
    document.getElementById('fmt-offh').value = '0';
    document.getElementById('fmt-offv').value = '0';
    // Remover classes de validação
    document.getElementById('fmt-offh').classList.remove('invalid');
    document.getElementById('fmt-offv').classList.remove('invalid');
    document.getElementById('fmt-form-title').textContent = 'Novo Formato';
    document.getElementById('btn-fmt-cancel').style.display = 'none';
    drawFormatPreview();
}

window.cancelFmtEdit = cancelFmtEdit;
window.editFmt = editFmt;

async function duplicateFmt(id) {
    const f = state.formatos.find(x => x.id === id);
    if (!f) return;
    try {
        const clone = JSON.parse(JSON.stringify(f));
        delete clone.id; // Remover ID para o backend gerar um novo UUID
        clone.name = clone.name + ' (cópia)';

        await api('POST', '/formatos', clone);
        toast('Formato duplicado!', 'success');
        await loadAll();
    } catch (e) {
        toast('Erro ao duplicar: ' + e.message, 'error');
    }
}
window.duplicateFmt = duplicateFmt;

async function deleteFmt(id) {
    if (!confirm('Excluir este formato?')) return;
    try {
        await api('DELETE', `/formatos/${id}`);
        toast('Formato excluído.', 'success');
        await loadAll();
    } catch (e) { toast(e.message, 'error'); }
}
window.deleteFmt = deleteFmt;

// ─── SAÍDAS ───────────────────────────────────────────────────────────────────
function renderSaidas() {
    const tbody = document.getElementById('tbody-saidas');
    const empty = document.getElementById('empty-saidas');
    if (!state.saidas.length) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';
    tbody.innerHTML = state.saidas.map(s => `
        <tr>
            <td>${s.name}</td>
            <td>${s.width_mm} × ${s.height_mm} mm</td>
            <td><span class="badge badge-teal">${(s.file_format || 'pdf').toUpperCase()}</span></td>
            <td class="actions-cell">
                <button class="btn btn-sm btn-ghost" onclick="editSai('${s.id}')">✏️ Editar</button>
                <button class="btn btn-danger btn-sm" onclick="deleteSai('${s.id}')">🗑️</button>
            </td>
        </tr>
    `).join('');
}

async function saveSaida() {
    const id = document.getElementById('sai-id').value;
    const data = {
        name: document.getElementById('sai-name').value.trim(),
        width_mm: parseFloat(document.getElementById('sai-w').value),
        height_mm: parseFloat(document.getElementById('sai-h').value),
        file_format: document.getElementById('sai-format').value,
    };
    if (!data.name) return toast('Informe um nome para a saída.', 'error');
    try {
        if (id) {
            await api('PUT', `/saidas/${id}`, data);
            toast('Saída atualizada!', 'success');
        } else {
            await api('POST', '/saidas', data);
            toast('Saída salva!', 'success');
        }
        cancelSaiEdit();
        await loadAll();
    } catch (e) { toast(e.message, 'error'); }
}

window.saveSaida = saveSaida;
window.cancelSaiEdit = cancelSaiEdit;

function editSai(id) {
    const s = state.saidas.find(x => x.id === id);
    if (!s) return;
    document.getElementById('sai-id').value = s.id;
    document.getElementById('sai-name').value = s.name;
    document.getElementById('sai-w').value = s.width_mm;
    document.getElementById('sai-h').value = s.height_mm;
    document.getElementById('sai-format').value = s.file_format || 'pdf';
    document.getElementById('sai-form-title').textContent = 'Editar Saída';
    document.getElementById('btn-sai-cancel').style.display = 'inline-flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.editSai = editSai;

function cancelSaiEdit() {
    document.getElementById('sai-id').value = '';
    document.getElementById('sai-name').value = '';
    document.getElementById('sai-w').value = '450';
    document.getElementById('sai-h').value = '320';
    document.getElementById('sai-format').value = 'pdf';
    document.getElementById('sai-form-title').textContent = 'Nova Saída';
    document.getElementById('btn-sai-cancel').style.display = 'none';
}

async function deleteSai(id) {
    if (!confirm('Excluir esta saída?')) return;
    try {
        await api('DELETE', `/saidas/${id}`);
        toast('Saída excluída.', 'success');
        await loadAll();
    } catch (e) { toast(e.message, 'error'); }
}
window.deleteSai = deleteSai;

window.setPreset = (w, h) => {
    document.getElementById('sai-w').value = w;
    document.getElementById('sai-h').value = h;
};

// ─── CORES ───────────────────────────────────────────────────────────────────
let corPdfBase64 = "";
let corPdfFilename = "";

// Função para renderizar a primeira página do PDF de referência no Canvas
async function renderPdfPreview(pdfBase64) {
    const canvas = document.getElementById('cor-pdf-preview-canvas');
    const emptyEl = document.getElementById('cor-pdf-preview-empty');
    if (!canvas) return;

    if (!pdfBase64) {
        canvas.style.display = 'none';
        if (emptyEl) {
            emptyEl.style.display = 'block';
            emptyEl.innerHTML = `
                <div style="font-size: 3rem; margin-bottom: 12px; opacity: 0.7;">📄</div>
                <p style="font-size: 0.9rem; font-weight: 500;">Selecione uma cor para editar ou faça upload de um PDF para visualizar.</p>
            `;
        }
        return;
    }

    try {
        if (emptyEl) {
            emptyEl.style.display = 'block';
            emptyEl.innerHTML = '<div class="spinner"></div><p style="margin-top:10px; font-size:0.88rem; font-weight:500;">Carregando PDF...</p>';
        }
        
        const base64Data = pdfBase64.includes('base64,') ? pdfBase64.split('base64,')[1] : pdfBase64;
        const binStr = atob(base64Data);
        const len = binStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binStr.charCodeAt(i);
        }

        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        
        // Renderizar com escala adequada baseada no container
        const viewport = page.getViewport({ scale: 1.0 });
        const containerW = canvas.parentElement.clientWidth - 30; // compensar paddings
        const scale = containerW / viewport.width;
        const scaledViewport = page.getViewport({ scale: Math.min(scale, 1.5) });
        
        const context = canvas.getContext('2d');
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        
        const renderContext = {
            canvasContext: context,
            viewport: scaledViewport
        };
        await page.render(renderContext).promise;
        
        if (emptyEl) emptyEl.style.display = 'none';
        canvas.style.display = 'block';
    } catch (e) {
        console.error("Erro ao renderizar preview do PDF:", e);
        if (emptyEl) {
            emptyEl.style.display = 'block';
            emptyEl.innerHTML = '<div style="font-size: 2rem; color: var(--red); margin-bottom:10px;">✕</div><p style="font-size:0.88rem; font-weight:500;">Falha ao carregar visualização do PDF.</p>';
        }
        canvas.style.display = 'none';
    }
}
window.renderPdfPreview = renderPdfPreview;

// Event Listener para ler o arquivo PDF em Base64
document.getElementById('cor-pdf-file')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
        toast('Selecione apenas arquivos PDF.', 'error');
        e.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = function(evt) {
        corPdfBase64 = evt.target.result;
        corPdfFilename = file.name;
        document.getElementById('cor-pdf-file-name').textContent = "📎 " + file.name;
        document.getElementById('btn-remove-cor-pdf').style.display = 'inline-flex';
        renderPdfPreview(corPdfBase64); // Exibir preview do PDF recém-carregado
    };
    reader.readAsDataURL(file);
});

function clearCorPdfFile() {
    corPdfBase64 = "";
    corPdfFilename = "";
    const fileEl = document.getElementById('cor-pdf-file');
    if (fileEl) fileEl.value = "";
    const labelEl = document.getElementById('cor-pdf-file-name');
    if (labelEl) labelEl.textContent = "";
    const btnRemove = document.getElementById('btn-remove-cor-pdf');
    if (btnRemove) btnRemove.style.display = 'none';
    renderPdfPreview(null); // Limpar visualização
}
window.clearCorPdfFile = clearCorPdfFile;

function onCorFormatoSelect() {
    const fmtId = document.getElementById('cor-formato').value;
    if (!fmtId) return;
    const fmt = state.formatos.find(f => f.id === fmtId);
    if (fmt) {
        document.getElementById('cor-w').value = fmt.width_mm;
        document.getElementById('cor-h').value = fmt.height_mm;
    }
}
window.onCorFormatoSelect = onCorFormatoSelect;

function renderCores() {
    const container = document.getElementById('cores-grouped-container');
    const empty = document.getElementById('empty-cores');
    if (!container) return;
    
    if (!state.cores || !state.cores.length) {
        container.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';

    // Agrupar cores por formato_id
    const grouped = {};
    state.cores.forEach(c => {
        if (!grouped[c.formato_id]) {
            grouped[c.formato_id] = [];
        }
        grouped[c.formato_id].push(c);
    });

    let html = '';
    
    // Obter todos os formatos que possuem cores
    Object.keys(grouped).forEach(formatoId => {
        const fmt = state.formatos.find(f => f.id === formatoId);
        const fmtName = fmt ? fmt.name : 'Formato Excluído/Não Identificado';
        const coresDoFormato = grouped[formatoId];

        html += `
            <div class="card" style="margin-bottom: 24px;">
                <div class="card-header" style="background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--border);">
                    <span class="card-title">📐 ${fmtName}</span>
                    <span class="badge badge-teal">${coresDoFormato.length} ${coresDoFormato.length === 1 ? 'cor' : 'cores'}</span>
                </div>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Nome da Cor</th>
                            <th>Tamanho</th>
                            <th>Arquivo PDF</th>
                            <th style="text-align: right; width: 120px;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${coresDoFormato.map(c => {
                            const pdfLink = c.pdf_base64 
                                ? `<a href="${c.pdf_base64}" download="${c.pdf_filename || 'referencia.pdf'}" class="badge badge-teal" style="text-decoration:none;" onclick="event.stopPropagation();">📥 Baixar PDF</a>`
                                : '<span style="color:var(--text-faint)">Sem arquivo</span>';
                            
                            return `
                                <tr style="cursor: pointer;" onclick="editCor('${c.id}')" title="Clique para editar/visualizar esta cor">
                                    <td><strong>${c.name}</strong></td>
                                    <td>${c.width_mm} × ${c.height_mm} mm</td>
                                    <td>${pdfLink}</td>
                                    <td class="actions-cell" style="text-align: right;" onclick="event.stopPropagation();">
                                        <button class="btn btn-sm btn-ghost" onclick="editCor('${c.id}')">✏️ Editar</button>
                                        <button class="btn btn-danger btn-sm" onclick="deleteCor('${c.id}')">🗑️</button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    });

    container.innerHTML = html;
}
window.renderCores = renderCores;

async function saveCor() {
    const id = document.getElementById('cor-id').value;
    const name = document.getElementById('cor-name').value.trim();
    const formatoId = document.getElementById('cor-formato').value;
    const w = parseFloat(document.getElementById('cor-w').value);
    const h = parseFloat(document.getElementById('cor-h').value);

    if (!name) return toast('Informe o nome da cor.', 'error');
    if (!formatoId) return toast('Selecione um formato base.', 'error');
    if (isNaN(w) || w <= 0 || isNaN(h) || h <= 0) return toast('Informe dimensões de tamanho válidas.', 'error');

    const data = {
        name,
        formato_id: formatoId,
        width_mm: w,
        height_mm: h,
        pdf_base64: corPdfBase64 || null,
        pdf_filename: corPdfFilename || ""
    };

    try {
        if (id) {
            await api('PUT', `/cores/${id}`, data);
            toast('Cor atualizada!', 'success');
        } else {
            await api('POST', '/cores', data);
            toast('Cor cadastrada!', 'success');
        }
        cancelCorEdit();
        await loadAll();
        
        // Redirecionar para a página Listar Cores após salvar
        const navListaCores = document.getElementById('nav-lista-cores');
        if (navListaCores) navListaCores.click();
    } catch (e) {
        toast(e.message, 'error');
    }
}
window.saveCor = saveCor;

function editCor(id) {
    const c = state.cores.find(x => x.id === id);
    if (!c) return;
    
    // Redirecionar para a página Cores (de cadastro) ao editar
    const navCores = document.getElementById('nav-cores');
    if (navCores) navCores.click();

    document.getElementById('cor-id').value = c.id;
    document.getElementById('cor-name').value = c.name;
    document.getElementById('cor-formato').value = c.formato_id;
    document.getElementById('cor-w').value = c.width_mm;
    document.getElementById('cor-h').value = c.height_mm;
    
    if (c.pdf_base64) {
        corPdfBase64 = c.pdf_base64;
        corPdfFilename = c.pdf_filename || "referencia.pdf";
        document.getElementById('cor-pdf-file-name').textContent = "📎 " + corPdfFilename;
        document.getElementById('btn-remove-cor-pdf').style.display = 'inline-flex';
        renderPdfPreview(c.pdf_base64); // Exibir preview do PDF ao editar
    } else {
        clearCorPdfFile();
    }
    
    document.getElementById('cor-form-title').textContent = 'Editar Cor';
    document.getElementById('btn-cor-cancel').style.display = 'inline-flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.editCor = editCor;

function cancelCorEdit() {
    document.getElementById('cor-id').value = '';
    document.getElementById('cor-name').value = '';
    document.getElementById('cor-formato').value = '';
    document.getElementById('cor-w').value = '';
    document.getElementById('cor-h').value = '';
    clearCorPdfFile();
    document.getElementById('cor-form-title').textContent = 'Nova Cor';
    document.getElementById('btn-cor-cancel').style.display = 'none';
    renderPdfPreview(null); // Resetar preview do PDF
}
window.cancelCorEdit = cancelCorEdit;

async function deleteCor(id) {
    if (!confirm('Excluir esta cor?')) return;
    try {
        await api('DELETE', `/cores/${id}`);
        toast('Cor excluída.', 'success');
        await loadAll();
    } catch (e) {
        toast(e.message, 'error');
    }
}
window.deleteCor = deleteCor;

// ─── SELECTS (população) ──────────────────────────────────────────────────────
function populateSelects() {
    // Numeração — select de formatos
    const selNumFmt = document.getElementById('num-formato');
    const curNumFmt = selNumFmt.value;
    selNumFmt.innerHTML = '<option value="">— Selecione um Formato —</option>' +
        state.formatos.map(f => `<option value="${f.id}">${f.name} (${f.width_mm}×${f.height_mm}mm)</option>`).join('');
    if (curNumFmt) selNumFmt.value = curNumFmt;

    // Cores - select de formatos
    const selCorFmt = document.getElementById('cor-formato');
    if (selCorFmt) {
        const curCorFmt = selCorFmt.value;
        selCorFmt.innerHTML = '<option value="">— Selecione —</option>' +
            state.formatos.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
        if (curCorFmt) selCorFmt.value = curCorFmt;
    }

    // Catálogo - filtro de formato
    const selCatFmt = document.getElementById('catalogo-filter-format');
    if (selCatFmt) {
        const curCatFmt = selCatFmt.value;
        selCatFmt.innerHTML = '<option value="">Todos os Formatos</option>' +
            state.formatos.map(f => `<option value="${f.id}">${f.name} (${f.width_mm}×${f.height_mm}mm)</option>`).join('');
        if (curCatFmt) selCatFmt.value = curCatFmt;
    }

    // Imposição
    ['imp-formato', 'imp-numeracao', 'imp-saida'].forEach(id => {
        const sel = document.getElementById(id);
        const cur = sel.value;
        if (id === 'imp-formato') {
            sel.innerHTML = '<option value="">— Selecione —</option>' +
                state.formatos.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
        } else if (id === 'imp-numeracao') {
            sel.innerHTML = '<option value="">— Sem numeração —</option>' +
                state.numeracoes.map(n => `<option value="${n.id}">${n.name}</option>`).join('');
        } else {
            sel.innerHTML = '<option value="">— Selecione —</option>' +
                state.saidas.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        }
        if (cur) sel.value = cur;
    });

    // Amostras
    const selAmCor = document.getElementById('amostra-cor');
    if (selAmCor) {
        const cur = selAmCor.value;
        selAmCor.innerHTML = '<option value="">— Selecione uma Cor —</option>' +
            state.cores.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        if (cur) selAmCor.value = cur;
    }

    const selAmNum = document.getElementById('amostra-numeracao');
    if (selAmNum) {
        const cur = selAmNum.value;
        selAmNum.innerHTML = '<option value="">— Selecione uma Numeração —</option>' +
            state.numeracoes.map(n => `<option value="${n.id}">${n.name}</option>`).join('');
        if (cur) selAmNum.value = cur;
    }
}

// ─── NUMERAÇÃO EDITOR ─────────────────────────────────────────────────────────

function renderNumeracoes() {
    const container = document.getElementById('catalogo-container');
    const empty = document.getElementById('empty-catalogo');

    // Filtros
    const searchVal = (document.getElementById('catalogo-search')?.value || '').toLowerCase();
    const filterFmt = document.getElementById('catalogo-filter-format')?.value || '';

    const filtradas = state.numeracoes.filter(n => {
        if (filterFmt && n.formato_id !== filterFmt) return false;
        if (searchVal && !(n.name || '').toLowerCase().includes(searchVal)) return false;
        return true;
    });

    if (!filtradas.length) {
        container.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    // Agrupar por formato
    const grouped = {};
    filtradas.forEach(n => {
        const fmtId = n.formato_id;
        if (!grouped[fmtId]) grouped[fmtId] = [];
        grouped[fmtId].push(n);
    });

    let html = '';
    for (const fmtId of Object.keys(grouped)) {
        const fmt = state.formatos.find(f => f.id === fmtId);
        const fmtName = fmt ? `${fmt.name} (${fmt.width_mm}×${fmt.height_mm}mm)` : 'Formato Excluído';

        html += `
        <div class="card" style="margin-bottom: 20px;">
            <div class="card-header" style="background: var(--bg-body); border-bottom: 1px solid var(--border);">
                <span class="card-title"><span class="icon">📐</span> ${fmtName}</span>
                <span class="badge badge-purple">${grouped[fmtId].length} numerações</span>
            </div>
            <table class="data-table">
                <thead>
                    <tr><th>Nome</th><th>Elementos</th><th>Ações</th></tr>
                </thead>
                <tbody>
        `;

        grouped[fmtId].forEach(n => {
            const typeBadges = [...new Set((n.elements || []).map(e => e.type))].map(t =>
                `<span class="badge badge-blue">${t}</span>`
            ).join(' ');
            html += `
                <tr>
                    <td><strong>${n.name}</strong></td>
                    <td>${typeBadges || '—'} <small style="color:var(--text-faint)">(${(n.elements || []).length} itens)</small></td>
                    <td class="actions-cell">
                        <button class="btn btn-secondary btn-sm" onclick="duplicateCatalogNumeracao('${n.id}')" title="Duplicar Numeração Completa">⧉</button>
                        <button class="btn btn-sm btn-ghost" onclick="editNumeracao('${n.id}')">✏️ Editar</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteNumeracao('${n.id}')">🗑️</button>
                    </td>
                </tr>`;
        });

        html += `
                </tbody>
            </table>
        </div>`;
    }

    container.innerHTML = html;
}

window.novaNumeracao = function () {
    cancelNumEdit();
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    document.getElementById('nav-numeracao').classList.add('active');
    document.getElementById('view-numeracao').classList.add('active');
};

function editNumeracao(id) {
    const n = state.numeracoes.find(x => x.id === id);
    if (!n) return;

    // Ativar view de numeração
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
    document.getElementById('nav-numeracao').classList.add('active');
    document.getElementById('view-numeracao').classList.add('active');

    document.getElementById('num-id').value = n.id;
    document.getElementById('num-name').value = n.name;
    document.getElementById('num-formato').value = n.formato_id;
    document.getElementById('btn-num-cancel').style.display = 'inline-flex';

    // Carregar elementos e recalcular contador para evitar colisões de ID (Bug 3)
    state.numElements = (n.elements || []).map(e => ({ ...e }));
    const maxId = state.numElements.reduce((max, el) => {
        const num = parseInt((el.id || '').replace('el_', '')) || 0;
        return Math.max(max, num);
    }, 0);
    state.numElCounter = maxId;

    state.numCsvFilename = n.csv_filename || "";
    state.numCsvHeaders = n.csv_headers || [];
    state.numCsvData = n.csv_data || null;

    if (state.numCsvHeaders && state.numCsvHeaders.length) {
        renderNumCsvInterface();
    } else {
        clearNumCsvFile();
    }

    state.numSvgFilename = n.svg_filename || "";
    state.numSvgContent = n.svg_content || "";
    if (state.numSvgContent) {
        const img = new Image();
        img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(state.numSvgContent);
        img.onload = () => {
            state.numSvgImage = img;
            drawCanvas();
        };
        const btn = document.getElementById('btn-remove-num-svg');
        const name = document.getElementById('num-svg-file-name');
        if (btn) btn.style.display = 'inline-flex';
        if (name) name.textContent = '📎 ' + state.numSvgFilename;
    } else {
        window.clearNumSvgFile();
    }

    onFormatoSelect(false);
    renderElementsList();
    drawCanvas();
}
window.editNumeracao = editNumeracao;

async function deleteNumeracao(id) {
    if (!confirm('Excluir esta numeração?')) return;
    try {
        await api('DELETE', `/numeracoes/${id}`);
        toast('Numeração excluída.', 'success');
        await loadAll();
    } catch (e) { toast(e.message, 'error'); }
}
window.deleteNumeracao = deleteNumeracao;

window.duplicateCatalogNumeracao = async function (id) {
    const n = state.numeracoes.find(x => x.id === id);
    if (!n) return;
    try {
        const clone = JSON.parse(JSON.stringify(n));
        delete clone.id; // Remover ID para o backend gerar um novo UUID
        clone.name = clone.name + ' (cópia)';

        await api('POST', '/numeracoes', clone);
        toast('Numeração duplicada!', 'success');
        await loadAll();
    } catch (e) {
        toast('Erro ao duplicar: ' + e.message, 'error');
    }
};

function cancelNumEdit() {
    document.getElementById('num-id').value = '';
    document.getElementById('num-name').value = '';
    document.getElementById('num-formato').value = '';
    document.getElementById('btn-num-cancel').style.display = 'none';
    state.numElements = [];
    state.numFormato = null;
    state.bgImage = null;
    const btnRemove = document.getElementById('btn-remove-bg');
    const bgName = document.getElementById('bg-file-name');
    const bgFile = document.getElementById('canvas-bg-file');
    if (btnRemove) btnRemove.style.display = 'none';
    if (bgName) bgName.textContent = '';
    if (bgFile) bgFile.value = '';
    document.getElementById('numeracao-editor').style.display = 'none';
    clearNumCsvFile();
    window.clearNumSvgFile();
}
window.cancelNumEdit = cancelNumEdit;

// Quando o formato é selecionado, mostrar editor
window.onFormatoSelect = function (clearElements = true) {
    const fmtId = document.getElementById('num-formato').value;
    if (!fmtId) {
        document.getElementById('numeracao-editor').style.display = 'none';
        return;
    }
    state.numFormato = state.formatos.find(f => f.id === fmtId);
    if (!state.numFormato) return;

    if (clearElements !== false) state.numElements = [];
    document.getElementById('numeracao-editor').style.display = 'grid';

    initCanvas();
    renderElementsList();
    drawCanvas();
};

// ─── CANVAS ──────────────────────────────────────────────────────────────────
const CANVAS_MAX_W = 2000;
const CANVAS_MAX_H = 1400;

function initCanvas() {
    const fmt = state.numFormato;
    if (!fmt) return;

    // Calcular escala para caber no espaço
    const scaleX = CANVAS_MAX_W / fmt.width_mm;
    const scaleY = CANVAS_MAX_H / fmt.height_mm;
    state.canvasScale = Math.min(scaleX, scaleY, 17.0);

    const canvas = document.getElementById('numeracao-canvas');
    canvas.width = Math.round(fmt.width_mm * state.canvasScale);
    canvas.height = Math.round(fmt.height_mm * state.canvasScale);

    document.getElementById('canvas-dim-label').textContent = `${fmt.width_mm} × ${fmt.height_mm} mm`;
    document.getElementById('canvas-scale-label').textContent = `1mm = ${state.canvasScale.toFixed(1)}px`;

    // Mouse events
    canvas.onmousedown = onCanvasMouseDown;
    canvas.onmousemove = onCanvasMouseMove;
    canvas.onmouseup = onCanvasMouseUp;
    canvas.onmouseleave = onCanvasMouseUp;
}

function drawCanvas() {
    const canvas = document.getElementById('numeracao-canvas');
    if (!canvas || !state.numFormato) return;
    const ctx = canvas.getContext('2d');
    const S = state.canvasScale;
    const W = canvas.width;
    const H = canvas.height;

    // Fundo branco
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // Arte de fundo (camada de referência semitransparente em tamanho original e centralizada)
    if (state.bgImage) {
        const MM2PT = 2.8346;
        let originalW_mm = 0;
        let originalH_mm = 0;

        if (state.bgImage.originalPdfWidthPt) {
            // Se for PDF, usar os pontos originais dividindo por MM2PT (72 / 25.4 = 2.8346)
            originalW_mm = state.bgImage.originalPdfWidthPt / MM2PT;
            originalH_mm = state.bgImage.originalPdfHeightPt / MM2PT;
        } else {
            // Se for imagem (JPG/PNG), obter o DPI lido ou adotar 300 DPI como fallback de alta resolução
            const dpi = state.bgImage.dpiValue || 300;
            // pixels / dpi * 25.4 (conversão para mm)
            originalW_mm = (state.bgImage.width / dpi) * 25.4;
            originalH_mm = (state.bgImage.height / dpi) * 25.4;
        }

        const drawW = originalW_mm * S;
        const drawH = originalH_mm * S;
        const drawX = (W - drawW) / 2;
        const drawY = (H - drawH) / 2;

        ctx.globalAlpha = 0.55;
        ctx.drawImage(state.bgImage, drawX, drawY, drawW, drawH);
        ctx.globalAlpha = 1.0;
    }

    // Grid de milímetros (cada 5mm)
    ctx.strokeStyle = '#e8eef8';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= state.numFormato.width_mm; x += 5) {
        ctx.beginPath();
        ctx.moveTo(x * S, 0);
        ctx.lineTo(x * S, H);
        ctx.stroke();
    }
    for (let y = 0; y <= state.numFormato.height_mm; y += 5) {
        ctx.beginPath();
        ctx.moveTo(0, y * S);
        ctx.lineTo(W, y * S);
        ctx.stroke();
    }

    // Grid forte a cada 10mm
    ctx.strokeStyle = '#d0d8ec';
    ctx.lineWidth = 0.8;
    for (let x = 0; x <= state.numFormato.width_mm; x += 10) {
        ctx.beginPath();
        ctx.moveTo(x * S, 0);
        ctx.lineTo(x * S, H);
        ctx.stroke();
    }
    for (let y = 0; y <= state.numFormato.height_mm; y += 10) {
        ctx.beginPath();
        ctx.moveTo(0, y * S);
        ctx.lineTo(W, y * S);
        ctx.stroke();
    }

    // Borda do formato
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.75, 0.75, W - 1.5, H - 1.5);

    // Renderizar elementos
    state.numElements.forEach(el => drawElement(ctx, el, S));
}

function drawElement(ctx, el, S) {
    const x = el.x_mm * S;
    const y = el.y_mm * S;
    const isSelected = isElSelected(el.id);
    const color = el.color || '#1e293b';
    const rot = (el.rotation || 0) * Math.PI / 180;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    const SAMPLE = el.type === 'FIXED' ? (el.fixed_value || 'TEXTO') :
        el.type === 'TEXT' ? '0001' :
            el.type === 'QR' ? null :
                el.type === 'BARCODE' ? null : '0001';

    if (el.type === 'TEXT' || el.type === 'FIXED') {
        const fs = (el.font_size || 12) * S / 2.8346;
        let fontStyle = 'Inter, sans-serif';
        if (el.font_name === 'helv-bold') fontStyle = 'bold Inter, sans-serif';
        else if (el.font_name === 'times') fontStyle = 'Times New Roman, serif';
        else if (el.font_name === 'times-bold') fontStyle = 'bold Times New Roman, serif';
        else if (el.font_name === 'cour') fontStyle = 'Courier New, monospace';
        else if (el.font_name === 'cour-bold') fontStyle = 'bold Courier New, monospace';

        ctx.font = `${fs}px ${fontStyle}`;
        ctx.fillStyle = color;
        let label = '';
        if (el.type === 'FIXED') {
            label = el.fixed_value || 'TEXTO FIXO';
        } else if (el.source === 'database') {
            label = `${el.prefix || ''}[${el.csv_column || 'coluna'}]${el.suffix || ''}`;
        } else {
            const padValue = typeof el.pad !== 'undefined' ? el.pad : 6;
            const dummyNum = String(1).padStart(padValue, '0');
            label = `${el.prefix || ''}${dummyNum}${el.suffix || ''}`;
        }
        ctx.fillText(label, 0, fs);

        // Selection box
        if (isSelected) {
            const mw = ctx.measureText(label).width;
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 2]);
            ctx.strokeRect(-3, -3, mw + 6, fs + 6);
            ctx.setLineDash([]);
        }

    } else if (el.type === 'QR') {
        const sz = (el.size_mm || 15) * S;
        ctx.fillStyle = color;
        // Desenhar QR placeholder
        ctx.fillRect(0, 0, sz, sz);
        ctx.fillStyle = '#fff';
        const cell = sz / 7;
        // Cantos do QR
        for (const [cx, cy] of [[0, 0], [4, 0], [0, 4]]) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(cx * cell, cy * cell, 3 * cell, 3 * cell);
            ctx.fillStyle = color;
            ctx.fillRect(cx * cell + cell * 0.5, cy * cell + cell * 0.5, 2 * cell, 2 * cell);
        }
        ctx.font = `${Math.max(6, sz * 0.14)}px Inter`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText('QR', sz / 2, sz / 2 + sz * 0.05);
        ctx.textAlign = 'left';

        if (isSelected) {
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 2]);
            ctx.strokeRect(-2, -2, sz + 4, sz + 4);
            ctx.setLineDash([]);
        }

    } else if (el.type === 'BARCODE') {
        const bw = (el.width_mm || 40) * S;
        const bh = (el.height_mm || 10) * S;
        // Desenhar barras
        ctx.fillStyle = color;
        const barW = bw / 40;
        for (let i = 0; i < 40; i++) {
            if (Math.random() > 0.4 || i % 3 === 0) {
                ctx.fillRect(i * barW, 0, barW * 0.6, bh);
            }
        }
        // Repaint (determinístico baseado no i)
        ctx.clearRect(0, 0, bw, bh);
        ctx.fillStyle = color;
        const pattern = [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1];
        for (let i = 0; i < pattern.length; i++) {
            if (pattern[i]) ctx.fillRect(i * barW, 0, barW * 0.7, bh);
        }

        if (isSelected) {
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 2]);
            ctx.strokeRect(-2, -2, bw + 4, bh + 4);
            ctx.setLineDash([]);
        }

        // Adicionar texto indicando o tipo de código de barras
        ctx.fillStyle = color;
        ctx.font = `${Math.max(6, bh * 0.35)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText((el.barcode_format || 'CODE128').toUpperCase(), bw / 2, bh + Math.max(6, bh * 0.35));
        ctx.textAlign = 'left';
    } else if (el.type === 'PICOTE') {
        const fmt = state.numFormato;
        const h_px = fmt ? fmt.height_mm * S : 100 * S;
        ctx.strokeStyle = color;
        ctx.lineWidth = 5.0; // Aumentado para 5px
        if (isSelected) {
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 7.0;
        }
        ctx.setLineDash([10, 5]);
        ctx.beginPath();
        // A linha é vertical e cruza o formato inteiro.
        // Como o contexto foi transladado para (x, y), a coordenada local Y vai de -y até (h_px - y)
        ctx.moveTo(0, -y);
        ctx.lineTo(0, h_px - y);
        ctx.stroke();
        ctx.setLineDash([]);
    } else if (el.type === 'SVG') {
        const w = (el.width_mm || 20) * S;
        const h = (el.height_mm || 20) * S;
        if (state.numSvgImage) {
            ctx.drawImage(state.numSvgImage, 0, 0, w, h);
        } else {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.strokeRect(0, 0, w, h);
            ctx.font = `${Math.max(6, h * 0.15)}px Inter, sans-serif`;
            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.fillText('SVG (Sem arquivo)', w / 2, h / 2 + (h * 0.05));
            ctx.textAlign = 'left';
        }
        if (isSelected) {
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 2]);
            ctx.strokeRect(-2, -2, w + 4, h + 4);
            ctx.setLineDash([]);
        }
    }

    // Indicador de posição quando selecionado
    if (isSelected) {
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

// ─── Canvas Mouse Events ──────────────────────────────────────────────────────
function getCanvasPos(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: ((e.clientX - rect.left) * scaleX) / state.canvasScale,
        y: ((e.clientY - rect.top) * scaleY) / state.canvasScale
    };
}

function hitTest(el, mx, my) {
    if (el.type === 'PICOTE') {
        // Para o Picote, a colisão ocorre na linha vertical (qualquer Y, mas X próximo de el.x_mm)
        return Math.abs(mx - el.x_mm) <= 2;
    }

    const S = 1;
    const ex = el.x_mm, ey = el.y_mm;
    let w = 20, h = 8;

    if (el.type === 'TEXT' || el.type === 'FIXED') { w = 30; h = (el.font_size || 12) / 2.8346; }
    else if (el.type === 'QR') { w = el.size_mm || 15; h = w; }
    else if (el.type === 'BARCODE') { w = el.width_mm || 40; h = el.height_mm || 10; }
    else if (el.type === 'SVG') { w = el.width_mm || 20; h = el.height_mm || 20; }

    return mx >= ex - 2 && mx <= ex + w + 2 && my >= ey - 2 && my <= ey + h + 2;
}

function onCanvasMouseDown(e) {
    const canvas = document.getElementById('numeracao-canvas');
    const { x, y } = getCanvasPos(canvas, e);

    // Verificar hit em sentido inverso (último = mais ao topo)
    let hit = null;
    for (let i = state.numElements.length - 1; i >= 0; i--) {
        if (hitTest(state.numElements[i], x, y)) {
            hit = state.numElements[i];
            break;
        }
    }

    const multi = e.ctrlKey || e.shiftKey;

    if (hit) {
        if (multi) {
            selectElId(hit.id, true);
        } else {
            if (!isElSelected(hit.id)) {
                selectElId(hit.id, false);
            }
        }

        // Configurar o arraste para todos os elementos atualmente selecionados
        state.dragging = {
            targets: state.selectedElIds.map(id => {
                const el = state.numElements.find(item => item.id === id);
                return el ? {
                    elId: id,
                    startX: el.x_mm,
                    startY: el.y_mm
                } : null;
            }).filter(Boolean),
            downX: x,
            downY: y
        };
    } else {
        if (!multi) {
            state.selectedElIds = [];
            state.selectedElId = null;
            document.querySelectorAll('.element-card').forEach(c => c.classList.remove('selected'));
        }
    }
    drawCanvas();
}

function onCanvasMouseMove(e) {
    if (!state.dragging) return;
    const canvas = document.getElementById('numeracao-canvas');
    const { x, y } = getCanvasPos(canvas, e);
    const fmt = state.numFormato;

    const dx = x - state.dragging.downX;
    const dy = y - state.dragging.downY;

    state.dragging.targets.forEach(target => {
        const el = state.numElements.find(item => item.id === target.elId);
        if (!el) return;

        let newX = target.startX + dx;
        let newY = target.startY + dy;

        if (e.shiftKey) {
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            if (absDx > absDy) {
                newY = target.startY; // Lock vertical
            } else {
                newX = target.startX; // Lock horizontal
            }
        }

        newX = Math.max(0, Math.min(fmt.width_mm - 1, newX));
        newY = Math.max(0, Math.min(fmt.height_mm - 1, newY));

        el.x_mm = newX;
        if (el.type === 'PICOTE') {
            el.y_mm = 0;
        } else {
            el.y_mm = newY;
        }

        // Sync com campos numéricos
        const card = document.getElementById(`elcard-${el.id}`);
        if (card) {
            const fx = card.querySelector('.el-x');
            const fy = card.querySelector('.el-y');
            if (fx) fx.value = el.x_mm.toFixed(1);
            if (fy && el.type !== 'PICOTE') fy.value = el.y_mm.toFixed(1);
        }
    });

    drawCanvas();
}

function onCanvasMouseUp() {
    state.dragging = null;
}

// ─── Ferramentas de Alinhamento ──────────────────────────────────────────────
function isElSelected(id) {
    if (!state.selectedElIds) state.selectedElIds = [];
    return state.selectedElIds.includes(id);
}

function selectElId(id, multi = false) {
    if (!state.selectedElIds) state.selectedElIds = [];
    if (multi) {
        const idx = state.selectedElIds.indexOf(id);
        if (idx > -1) {
            state.selectedElIds.splice(idx, 1);
        } else {
            state.selectedElIds.push(id);
        }
    } else {
        state.selectedElIds = [id];
    }
    // Sincronizar selectedElId com o último selecionado
    state.selectedElId = state.selectedElIds.length > 0 ? state.selectedElIds[state.selectedElIds.length - 1] : null;

    // Atualizar UI de seleção nos cards
    document.querySelectorAll('.element-card').forEach(c => c.classList.remove('selected'));
    state.selectedElIds.forEach(selectedId => {
        const card = document.getElementById(`elcard-${selectedId}`);
        if (card) card.classList.add('selected');
    });

    // Rolar até o último selecionado
    if (state.selectedElId) {
        const card = document.getElementById(`elcard-${state.selectedElId}`);
        if (card) {
            // Desativado scrollIntoView automático para evitar rolagem incômoda da página inteira
            // card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

function getElementSizeMM(el) {
    if (el.type === 'PICOTE') {
        return { w: 0, h: state.numFormato ? state.numFormato.height_mm : 0 };
    }
    let w = 20, h = 8;
    if (el.type === 'TEXT' || el.type === 'FIXED') {
        const canvas = document.getElementById('numeracao-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.save();
            const S = state.canvasScale;
            const fs = (el.font_size || 12) * S / 2.8346;
            let fontStyle = 'Inter, sans-serif';
            if (el.font_name === 'helv-bold') fontStyle = 'bold Inter, sans-serif';
            else if (el.font_name === 'times') fontStyle = 'Times New Roman, serif';
            else if (el.font_name === 'times-bold') fontStyle = 'bold Times New Roman, serif';
            else if (el.font_name === 'cour') fontStyle = 'Courier New, monospace';
            else if (el.font_name === 'cour-bold') fontStyle = 'bold Courier New, monospace';
            ctx.font = `${fs}px ${fontStyle}`;
            
            let label = '';
            if (el.type === 'FIXED') {
                label = el.fixed_value || 'TEXTO FIXO';
            } else if (el.source === 'database') {
                label = `${el.prefix || ''}[${el.csv_column || 'coluna'}]${el.suffix || ''}`;
            } else {
                label = `${el.prefix || ''}0001${el.suffix || ''}`;
            }
            const mw_px = ctx.measureText(label).width;
            ctx.restore();
            w = mw_px / S;
            h = el.font_size / 2.8346;
        } else {
            w = 30;
            h = (el.font_size || 12) / 2.8346;
        }
    }
    else if (el.type === 'QR') { w = el.size_mm || 15; h = w; }
    else if (el.type === 'BARCODE') { w = el.width_mm || 40; h = el.height_mm || 10; }
    else if (el.type === 'SVG') { w = el.width_mm || 20; h = el.height_mm || 20; }
    return { w, h };
}

window.alignSelectedElement = function (alignment) {
    if (!state.selectedElIds || !state.selectedElIds.length || !state.numFormato) {
        toast('Selecione um ou mais elementos para alinhar', 'error');
        return;
    }
    const fmt = state.numFormato;

    state.selectedElIds.forEach(id => {
        const el = state.numElements.find(e => e.id === id);
        if (!el) return;

        const { w, h } = getElementSizeMM(el);

        if (alignment === 'left') {
            el.x_mm = 0;
        } else if (alignment === 'center-h') {
            el.x_mm = Math.max(0, (fmt.width_mm - w) / 2);
        } else if (alignment === 'right') {
            el.x_mm = Math.max(0, fmt.width_mm - w);
        } else if (alignment === 'top') {
            if (el.type === 'PICOTE') return;
            el.y_mm = 0;
        } else if (alignment === 'center-v') {
            if (el.type === 'PICOTE') return;
            el.y_mm = Math.max(0, (fmt.height_mm - h) / 2);
        } else if (alignment === 'bottom') {
            if (el.type === 'PICOTE') return;
            el.y_mm = Math.max(0, fmt.height_mm - h);
        }

        // Arredondar para 1 casa decimal
        el.x_mm = Math.round(el.x_mm * 10) / 10;
        el.y_mm = Math.round(el.y_mm * 10) / 10;

        // Sincronizar com os inputs do card correspondente
        const card = document.getElementById(`elcard-${el.id}`);
        if (card) {
            const fx = card.querySelector('.el-x');
            const fy = card.querySelector('.el-y');
            if (fx) fx.value = el.x_mm.toFixed(1);
            if (fy && el.type !== 'PICOTE') fy.value = el.y_mm.toFixed(1);
        }
    });

    drawCanvas();
};


// ─── Arte de Fundo no Canvas (Bug 5) ────────────────────────────────────────────

window.clearBgImage = function () {
    state.bgImage = null;
    const btn = document.getElementById('btn-remove-bg');
    const name = document.getElementById('bg-file-name');
    const inp = document.getElementById('canvas-bg-file');
    if (btn) btn.style.display = 'none';
    if (name) name.textContent = '';
    if (inp) inp.value = '';
    drawCanvas();
};

async function loadBgImage(file) {
    if (!state.numFormato) return;
    const ext = file.name.split('.').pop().toLowerCase();
    try {
        const img = new Image();
        if (ext === 'pdf') {
            if (typeof pdfjsLib === 'undefined') {
                return toast('PDF.js não disponível. Use JPG/PNG.', 'error');
            }
            pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);
            
            // Renderizar em alta qualidade (escala 2) sem redimensionar ao tamanho do formato aqui
            const vp = page.getViewport({ scale: 2 });
            const off = document.createElement('canvas');
            const octx = off.getContext('2d');
            off.width = Math.round(vp.width);
            off.height = Math.round(vp.height);
            octx.fillStyle = '#ffffff';
            octx.fillRect(0, 0, off.width, off.height);
            await page.render({ canvasContext: octx, viewport: vp }).promise;
            img.src = off.toDataURL('image/png');
            
            // Guardar dimensões originais do PDF (em pontos / scale=1) para que drawCanvas possa escalar corretamente
            const vpOrig = page.getViewport({ scale: 1 });
            img.originalPdfWidthPt = vpOrig.width;
            img.originalPdfHeightPt = vpOrig.height;
        } else {
            img.src = URL.createObjectURL(file);
            // Obter o DPI da imagem a partir dos metadados e salvar na img
            const dpi = await getDpi(file);
            img.dpiValue = dpi;
        }
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
        state.bgImage = img;
        const btn = document.getElementById('btn-remove-bg');
        const name = document.getElementById('bg-file-name');
        if (btn) btn.style.display = 'inline-flex';
        if (name) name.textContent = '📎 ' + file.name;
        drawCanvas();
        toast('Arte de fundo carregada!', 'success');
    } catch (e) {
        toast('Erro ao carregar fundo: ' + e.message, 'error');
    }
}

window.clearNumSvgFile = function () {
    state.numSvgContent = null;
    state.numSvgFilename = "";
    state.numSvgImage = null;
    const btn = document.getElementById('btn-remove-num-svg');
    const name = document.getElementById('num-svg-file-name');
    const inp = document.getElementById('num-svg-file');
    if (btn) btn.style.display = 'none';
    if (name) name.textContent = '';
    if (inp) inp.value = '';

    drawCanvas();
};

async function loadNumSvgFile(file) {
    try {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.src = url;
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

        state.numSvgImage = img;
        state.numSvgFilename = file.name;

        const reader = new FileReader();
        reader.onload = e => {
            state.numSvgContent = e.target.result;
            drawCanvas();
        };
        reader.readAsText(file);

        const btn = document.getElementById('btn-remove-num-svg');
        const name = document.getElementById('num-svg-file-name');
        if (btn) btn.style.display = 'inline-flex';
        if (name) name.textContent = '📎 ' + file.name;

        toast('Arquivo SVG carregado com sucesso!', 'success');
    } catch (err) {
        toast('Erro ao processar SVG: ' + err.message, 'error');
    }
}

// Listeners dos inputs de arquivo (configurados uma única vez após DOM pronto)
document.addEventListener('DOMContentLoaded', () => {
    const bgInp = document.getElementById('canvas-bg-file');
    if (bgInp) bgInp.addEventListener('change', e => {
        if (e.target.files[0]) loadBgImage(e.target.files[0]);
    });

    const svgInp = document.getElementById('num-svg-file');
    if (svgInp) svgInp.addEventListener('change', e => {
        if (e.target.files[0]) loadNumSvgFile(e.target.files[0]);
    });
});

// Fallback: se DOMContentLoaded já passou, configura imediatamente
(function () {
    const bgInp = document.getElementById('canvas-bg-file');
    if (bgInp && !bgInp._listenerSet) {
        bgInp.addEventListener('change', e => {
            if (e.target.files[0]) loadBgImage(e.target.files[0]);
        });
        bgInp._listenerSet = true;
    }

    const svgInp = document.getElementById('num-svg-file');
    if (svgInp && !svgInp._listenerSet) {
        svgInp.addEventListener('change', e => {
            if (e.target.files[0]) loadNumSvgFile(e.target.files[0]);
        });
        svgInp._listenerSet = true;
    }
})();

// ─── ELEMENTOS VDP ────────────────────────────────────────────────────────────
window.addElement = function (type) {
    state.numElCounter++;
    const id = `el_${state.numElCounter}`;
    const base = { id, type, x_mm: type === 'PICOTE' ? 25 : 5, y_mm: type === 'PICOTE' ? 0 : 5, rotation: 0, color: type === 'PICOTE' ? '#ef4444' : '#000000' };

    if (type === 'TEXT') Object.assign(base, { font_size: 12, font_name: 'helv', pad: 6, prefix: '', suffix: '' });
    if (type === 'FIXED') Object.assign(base, { font_size: 12, font_name: 'helv', fixed: true, fixed_value: 'Texto' });
    if (type === 'QR') Object.assign(base, { size_mm: 15, pad: 4, prefix: '', suffix: '' });
    if (type === 'BARCODE') Object.assign(base, { width_mm: 40, height_mm: 10, barcode_format: 'code128', pad: 4, prefix: '', suffix: '' });
    if (type === 'SVG') Object.assign(base, { width_mm: 20, height_mm: 20, svg_content: state.numSvgContent || '' });
    if (type === 'PICOTE') Object.assign(base, { name: 'Picote' });

    state.numElements.push(base);
    renderElementsList();
    drawCanvas();
    selectElId(id, false);
};

function renderElementsList() {
    const container = document.getElementById('elements-list');
    let empty = document.getElementById('empty-elements');

    if (!empty) {
        empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.id = 'empty-elements';
        empty.innerHTML = '<div class="empty-state-icon">🎯</div><p>Adicione elementos acima</p>';
    }

    if (!state.numElements.length) {
        container.innerHTML = '';
        container.appendChild(empty);
        empty.style.display = 'block';
        return;
    }

    const typeLabel = { TEXT: '🔤 Numeração', FIXED: '🔠 Texto Fixo', QR: '📱 QR Code', BARCODE: '▌▌ Barcode', SVG: '🎨 SVG', PICOTE: '✂️ Picote' };
    const typeBadge = { TEXT: 'badge-blue', FIXED: 'badge-amber', QR: 'badge-teal', BARCODE: 'badge-purple', SVG: 'badge-green', PICOTE: 'badge-danger' };

    container.innerHTML = state.numElements.map(el => {
        const isSelected = isElSelected(el.id);

        if (el.type === 'PICOTE') {
            return `
            <div class="element-card ${isSelected ? 'selected' : ''}" id="elcard-${el.id}" onclick="selectEl('${el.id}', event)">
                <div class="element-card-header" style="flex-wrap: wrap; gap: 8px;">
                    <span class="element-card-title" style="flex: 1; display: flex; align-items: center; gap: 8px;">
                        <span class="badge ${typeBadge[el.type]}">${typeLabel[el.type]}</span>
                        <input class="form-control" style="flex: 1; max-width: 60%; padding: 2px 6px; font-size: 0.75rem; height: 24px; min-width: 80px; background: rgba(0,0,0,0.4);" type="text" placeholder="Nome do item (opcional)" value="${el.name || ''}" onchange="updateEl('${el.id}','name',this.value)" onclick="event.stopPropagation()">
                    </span>
                    <div style="display:flex; gap:4px;">
                        <button class="btn btn-secondary btn-sm" style="padding: 2px 8px; font-size: 1rem;" onclick="duplicateEl('${el.id}');event.stopPropagation()" title="Duplicar">⧉</button>
                        <button class="btn btn-danger btn-sm" style="padding: 2px 8px;" onclick="removeEl('${el.id}');event.stopPropagation()" title="Excluir">✕</button>
                    </div>
                </div>
                <div class="element-card-fields" style="grid-template-columns: 1fr 1fr;">
                    <div class="form-group"><label>X (mm)</label><input class="form-control el-x" type="number" value="${el.x_mm.toFixed(1)}" step="0.5" onchange="updateEl('${el.id}','x_mm',+this.value)"></div>
                    <div class="form-group"><label>Cor</label><input class="form-control" type="color" value="${el.color || '#ef4444'}" onchange="updateEl('${el.id}','color',this.value)"></div>
                </div>
            </div>`;
        }

        let extraFields = '';

        if (el.type === 'TEXT') {
            extraFields = `
                <div class="form-group"><label>Fonte</label>
                    <select class="form-control" onchange="updateEl('${el.id}','font_name',this.value)">
                        <option value="helv" ${el.font_name === 'helv' ? 'selected' : ''}>Sans-Serif (Helvetica)</option>
                        <option value="helv-bold" ${el.font_name === 'helv-bold' ? 'selected' : ''}>Sans-Serif Bold</option>
                        <option value="times" ${el.font_name === 'times' ? 'selected' : ''}>Serif (Times)</option>
                        <option value="times-bold" ${el.font_name === 'times-bold' ? 'selected' : ''}>Serif Bold</option>
                        <option value="cour" ${el.font_name === 'cour' ? 'selected' : ''}>Monospace (Courier)</option>
                        <option value="cour-bold" ${el.font_name === 'cour-bold' ? 'selected' : ''}>Monospace Bold</option>
                    </select>
                </div>
                <div class="form-group"><label>Tamanho (pt)</label><input class="form-control el-font" type="number" value="${el.font_size}" min="4" max="120" onchange="updateEl('${el.id}','font_size',+this.value)"></div>
                <div class="form-group">
                    <label>Zeros (pad) <span id="pad-hint-${el.id}" style="font-size: 0.72rem; color: var(--text-dim); font-weight: normal; margin-left: 4px;">(${el.pad} dígitos = ${el.pad > 0 ? '0'.repeat(el.pad - 1) + '1' : '1'})</span></label>
                    <input class="form-control" type="number" value="${el.pad}" min="0" max="10" oninput="const hint = document.getElementById('pad-hint-${el.id}'); const val = +this.value; hint.textContent = '(' + val + ' dígitos = ' + (val > 0 ? '0'.repeat(val - 1) + '1' : '1') + ')'; updateEl('${el.id}','pad',val)">
                </div>
                <div class="form-group"><label>Prefixo</label><input class="form-control" type="text" value="${el.prefix || ''}" onchange="updateEl('${el.id}','prefix',this.value)"></div>
                <div class="form-group"><label>Sufixo</label><input class="form-control" type="text" value="${el.suffix || ''}" onchange="updateEl('${el.id}','suffix',this.value)"></div>`;
        } else if (el.type === 'FIXED') {
            extraFields = `
                <div class="form-group el-full"><label>Texto Fixo</label><input class="form-control" type="text" value="${el.fixed_value || ''}" onchange="updateEl('${el.id}','fixed_value',this.value)"></div>
                <div class="form-group"><label>Fonte</label>
                    <select class="form-control" onchange="updateEl('${el.id}','font_name',this.value)">
                        <option value="helv" ${el.font_name === 'helv' ? 'selected' : ''}>Sans-Serif (Helvetica)</option>
                        <option value="helv-bold" ${el.font_name === 'helv-bold' ? 'selected' : ''}>Sans-Serif Bold</option>
                        <option value="times" ${el.font_name === 'times' ? 'selected' : ''}>Serif (Times)</option>
                        <option value="times-bold" ${el.font_name === 'times-bold' ? 'selected' : ''}>Serif Bold</option>
                        <option value="cour" ${el.font_name === 'cour' ? 'selected' : ''}>Monospace (Courier)</option>
                        <option value="cour-bold" ${el.font_name === 'cour-bold' ? 'selected' : ''}>Monospace Bold</option>
                    </select>
                </div>
                <div class="form-group"><label>Tamanho (pt)</label><input class="form-control" type="number" value="${el.font_size}" min="4" max="120" onchange="updateEl('${el.id}','font_size',+this.value)"></div>`;
        } else if (el.type === 'QR') {
            extraFields = `
                <div class="form-group el-full"><label>Tamanho (mm)</label><input class="form-control" type="number" value="${el.size_mm}" min="5" max="100" step="0.5" onchange="updateEl('${el.id}','size_mm',+this.value)"></div>
                <div class="form-group">
                    <label>Zeros (pad) <span id="pad-hint-${el.id}" style="font-size: 0.72rem; color: var(--text-dim); font-weight: normal; margin-left: 4px;">(${(el.pad || 0)} dígitos = ${(el.pad || 0) > 0 ? '0'.repeat((el.pad || 0) - 1) + '1' : '1'})</span></label>
                    <input class="form-control" type="number" value="${el.pad || 0}" min="0" max="10" oninput="const hint = document.getElementById('pad-hint-${el.id}'); const val = +this.value; hint.textContent = '(' + val + ' dígitos = ' + (val > 0 ? '0'.repeat(val - 1) + '1' : '1') + ')'; updateEl('${el.id}','pad',val)">
                </div>
                <div class="form-group"><label>Prefixo URL</label><input class="form-control" type="text" value="${el.prefix || ''}" onchange="updateEl('${el.id}','prefix',this.value)"></div>
                <div class="form-group"><label>Sufixo</label><input class="form-control" type="text" value="${el.suffix || ''}" onchange="updateEl('${el.id}','suffix',this.value)"></div>`;
        } else if (el.type === 'BARCODE') {
            extraFields = `
                <div class="form-group"><label>Tipo de Código</label>
                    <select class="form-control" onchange="updateEl('${el.id}','barcode_format',this.value)">
                        <option value="code128" ${el.barcode_format === 'code128' ? 'selected' : ''}>Code 128</option>
                        <option value="ean13" ${el.barcode_format === 'ean13' ? 'selected' : ''}>EAN-13</option>
                        <option value="ean8" ${el.barcode_format === 'ean8' ? 'selected' : ''}>EAN-8</option>
                        <option value="upca" ${el.barcode_format === 'upca' ? 'selected' : ''}>UPC-A</option>
                        <option value="code39" ${el.barcode_format === 'code39' ? 'selected' : ''}>Code 39</option>
                        <option value="itf" ${el.barcode_format === 'itf' ? 'selected' : ''}>Interleaved 2 of 5 (ITF)</option>
                        <option value="codabar" ${el.barcode_format === 'codabar' ? 'selected' : ''}>Codabar</option>
                    </select>
                </div>
                <div class="form-group"><label>Largura (mm)</label><input class="form-control" type="number" value="${el.width_mm}" min="10" max="200" step="0.5" onchange="updateEl('${el.id}','width_mm',+this.value)"></div>
                <div class="form-group"><label>Altura (mm)</label><input class="form-control" type="number" value="${el.height_mm}" min="4" max="50" step="0.5" onchange="updateEl('${el.id}','height_mm',+this.value)"></div>
                <div class="form-group">
                    <label>Zeros (pad) <span id="pad-hint-${el.id}" style="font-size: 0.72rem; color: var(--text-dim); font-weight: normal; margin-left: 4px;">(${(el.pad || 0)} dígitos = ${(el.pad || 0) > 0 ? '0'.repeat((el.pad || 0) - 1) + '1' : '1'})</span></label>
                    <input class="form-control" type="number" value="${el.pad || 0}" min="0" max="10" oninput="const hint = document.getElementById('pad-hint-${el.id}'); const val = +this.value; hint.textContent = '(' + val + ' dígitos = ' + (val > 0 ? '0'.repeat(val - 1) + '1' : '1') + ')'; updateEl('${el.id}','pad',val)">
                </div>
                <div class="form-group"><label>Prefixo</label><input class="form-control" type="text" value="${el.prefix || ''}" onchange="updateEl('${el.id}','prefix',this.value)"></div>
                <div class="form-group"><label>Sufixo</label><input class="form-control" type="text" value="${el.suffix || ''}" onchange="updateEl('${el.id}','suffix',this.value)"></div>`;
        } else if (el.type === 'SVG') {
            extraFields = `
                <div class="form-group"><label>Largura (mm)</label><input class="form-control" type="number" value="${el.width_mm || 20}" min="5" max="200" step="0.5" onchange="updateEl('${el.id}','width_mm',+this.value)"></div>
                <div class="form-group"><label>Altura (mm)</label><input class="form-control" type="number" value="${el.height_mm || 20}" min="5" max="200" step="0.5" onchange="updateEl('${el.id}','height_mm',+this.value)"></div>`;
        }

        return `
        <div class="element-card ${isSelected ? 'selected' : ''}" id="elcard-${el.id}" onclick="selectEl('${el.id}', event)">
            <div class="element-card-header" style="flex-wrap: wrap; gap: 8px;">
                <span class="element-card-title" style="flex: 1; display: flex; align-items: center; gap: 8px;">
                    <span class="badge ${typeBadge[el.type]}">${typeLabel[el.type]}</span>
                    <input class="form-control" style="flex: 1; max-width: 60%; padding: 2px 6px; font-size: 0.75rem; height: 24px; min-width: 80px; background: rgba(0,0,0,0.4);" type="text" placeholder="Nome do item (opcional)" value="${el.name || ''}" onchange="updateEl('${el.id}','name',this.value)" onclick="event.stopPropagation()">
                </span>
                <div style="display:flex; gap:4px;">
                    <button class="btn btn-secondary btn-sm" style="padding: 2px 8px; font-size: 1rem;" onclick="duplicateEl('${el.id}');event.stopPropagation()" title="Duplicar">⧉</button>
                    <button class="btn btn-danger btn-sm" style="padding: 2px 8px;" onclick="removeEl('${el.id}');event.stopPropagation()" title="Excluir">✕</button>
                </div>
            </div>
            <div class="element-card-fields">
                <div class="form-group"><label>X (mm)</label><input class="form-control el-x" type="number" value="${el.x_mm.toFixed(1)}" step="0.5" onchange="updateEl('${el.id}','x_mm',+this.value)"></div>
                <div class="form-group"><label>Y (mm)</label><input class="form-control el-y" type="number" value="${el.y_mm.toFixed(1)}" step="0.5" onchange="updateEl('${el.id}','y_mm',+this.value)"></div>
                <div class="form-group"><label>Rotação (°)</label>
                    <select class="form-control" onchange="updateEl('${el.id}','rotation',+this.value)">
                        <option value="0" ${el.rotation === 0 ? 'selected' : ''}>0°</option>
                        <option value="90" ${el.rotation === 90 ? 'selected' : ''}>90°</option>
                        <option value="180" ${el.rotation === 180 ? 'selected' : ''}>180°</option>
                        <option value="270" ${el.rotation === 270 ? 'selected' : ''}>270°</option>
                    </select>
                </div>
                ${el.type !== 'SVG' ? `
                <div class="form-group"><label>Cor</label><input class="form-control" type="color" value="${el.color || '#000000'}" onchange="updateEl('${el.id}','color',this.value)"></div>
                ` : ''}
                ${(el.type !== 'FIXED' && el.type !== 'SVG') ? `
                <div class="form-group">
                    <label>Origem</label>
                    <select class="form-control" onchange="updateElSource('${el.id}', this.value)">
                        <option value="sequential" ${el.source !== 'database' ? 'selected' : ''}>Sequencial</option>
                        <option value="database" ${el.source === 'database' ? 'selected' : ''}>Banco de Dados</option>
                    </select>
                </div>
                <div class="form-group" style="${el.source === 'database' ? '' : 'display:none;'}">
                    <label>Coluna do CSV</label>
                    ${state.numCsvHeaders && state.numCsvHeaders.length ? `
                    <select class="form-control" onchange="updateEl('${el.id}','csv_column',this.value)">
                        <option value="">— Selecione —</option>
                        ${state.numCsvHeaders.map(col => `<option value="${col}" ${el.csv_column === col ? 'selected' : ''}>${col}</option>`).join('')}
                    </select>
                    ` : `
                    <input class="form-control" type="text" value="${el.csv_column || ''}" placeholder="Ex: nome" onchange="updateEl('${el.id}','csv_column',this.value)">
                    `}
                </div>
                ` : ''}
                ${extraFields}
            </div>
        </div>`;
    }).join('');
}

window.updateEl = function (id, field, value) {
    const el = state.numElements.find(e => e.id === id);
    if (!el) return;
    el[field] = value;
    drawCanvas();
};

window.updateElSource = function (id, value) {
    const el = state.numElements.find(e => e.id === id);
    if (!el) return;
    el.source = value;
    if (value !== 'database') {
        delete el.csv_column;
    } else {
        el.csv_column = el.csv_column || '';
    }
    renderElementsList();
    drawCanvas();
};

window.removeEl = function (id) {
    state.numElements = state.numElements.filter(e => e.id !== id);
    if (state.selectedElId === id) state.selectedElId = null;
    renderElementsList();
    drawCanvas();
};

window.duplicateEl = function (id) {
    const el = state.numElements.find(e => e.id === id);
    if (!el) return;

    state.numElCounter++;
    const newId = `el_${state.numElCounter}`;

    const clone = JSON.parse(JSON.stringify(el));
    clone.id = newId;
    clone.x_mm += 5; // Desloca levemente para não sobrepor perfeitamente
    if (clone.type === 'PICOTE') {
        clone.y_mm = 0;
    } else {
        clone.y_mm += 5;
    }
    if (clone.name) clone.name += ' (cópia)';

    state.numElements.push(clone);
    renderElementsList();
    drawCanvas();
    selectElId(newId, false);
};


window.selectEl = function (id, event) {
    const multi = event ? (event.ctrlKey || event.shiftKey) : false;
    selectElId(id, multi);
    drawCanvas();
};

function selectElementCard(id) {
    document.querySelectorAll('.element-card').forEach(c => c.classList.remove('selected'));
    const card = document.getElementById(`elcard-${id}`);
    if (card) {
        card.classList.add('selected');
        // Desativado scrollIntoView automático para evitar rolagem incômoda da página inteira
        // card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function deselectAllCards() {
    document.querySelectorAll('.element-card').forEach(c => c.classList.remove('selected'));
}

// ─── Salvar Numeração ─────────────────────────────────────────────────────────
window.saveNumeracao = async function () {
    const id = document.getElementById('num-id').value;
    const name = document.getElementById('num-name').value.trim();
    const fmtId = document.getElementById('num-formato').value;

    if (!name) return toast('Informe um nome para a numeração.', 'error');
    if (!fmtId) return toast('Selecione um formato.', 'error');

    const data = {
        name,
        formato_id: fmtId,
        csv_filename: state.numCsvFilename || "",
        csv_headers: state.numCsvHeaders || [],
        csv_data: state.numCsvData || null,
        svg_content: state.numSvgContent || "",
        svg_filename: state.numSvgFilename || "",
        elements: state.numElements.map(el => {
            const e = { ...el };
            if (e.type === 'FIXED') e.fixed = true;
            if (e.type === 'SVG') e.svg_content = state.numSvgContent || "";
            return e;
        })
    };

    try {
        if (id) {
            // Editando existente
            await api('PUT', `/numeracoes/${id}`, data);
            toast('Numeração atualizada!', 'success');
        } else {
            // Novo: verifica se já existe com mesmo nome (Bug 2)
            const existing = state.numeracoes.find(
                n => n.name.trim().toLowerCase() === name.toLowerCase()
            );
            if (existing) {
                await api('PUT', `/numeracoes/${existing.id}`, data);
                toast('Numeração substituída!', 'success');
            } else {
                await api('POST', '/numeracoes', data);
                toast('Numeração salva!', 'success');
            }
        }
        cancelNumEdit();
        await loadAll();

        // Redirecionar para o Catálogo
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
        document.getElementById('nav-catalogo').classList.add('active');
        document.getElementById('view-catalogo').classList.add('active');

    } catch (e) { toast(e.message, 'error'); }
};

// ─── IMPOSIÇÃO ────────────────────────────────────────────────────────────────
// Detecta o DPI real de um arquivo de imagem (JPEG ou PNG) a partir dos seus metadados binários
async function getDpi(file) {
    try {
        const buffer = await file.arrayBuffer();
        const view = new DataView(buffer);
        
        // Verifica se é JPEG (começa com FF D8)
        if (view.byteLength > 4 && view.getUint16(0) === 0xFFD8) {
            let offset = 2;
            while (offset < view.byteLength - 4) {
                const marker = view.getUint16(offset);
                if (marker === 0xFFE0) { // APP0 (JFIF)
                    const units = view.getUint8(offset + 11);
                    const xDensity = view.getUint16(offset + 12);
                    if (units === 1 && xDensity > 0) { // 1 = dots per inch (DPI)
                        return xDensity;
                    }
                    if (units === 2 && xDensity > 0) { // 2 = dots per cm
                        return Math.round(xDensity * 2.54);
                    }
                    break;
                }
                // Pular o segmento
                const len = view.getUint16(offset + 2);
                offset += 2 + len;
            }
        }
        
        // Verifica se é PNG (começa com 89 50 4E 47)
        if (view.byteLength > 8 && view.getUint32(0) === 0x89504E47) {
            let offset = 8;
            while (offset < view.byteLength - 12) {
                const length = view.getUint32(offset);
                const type = view.getUint32(offset + 4);
                if (type === 0x70485973) { // pHYs chunk (physical pixel dimensions)
                    const xPixelsPerMeter = view.getUint32(offset + 8);
                    const unitSpecifier = view.getUint8(offset + 16);
                    if (unitSpecifier === 1 && xPixelsPerMeter > 0) {
                        return Math.round(xPixelsPerMeter * 0.0254); // Converter pixels por metro para DPI
                    }
                    break;
                }
                offset += 12 + length;
            }
        }
    } catch (e) {
        console.warn("Erro ao ler metadados de DPI:", e);
    }
    return 300; // Padrão de 300 DPI para artes gráficas profissionais
}

// ─── IMPOSIÇÃO ────────────────────────────────────────────────────────────────
async function loadImpArtFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    try {
        if (ext === 'pdf') {
            if (typeof pdfjsLib === 'undefined') {
                return toast('PDF.js não disponível. Use JPG/PNG.', 'error');
            }
            pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);
            const vp = page.getViewport({ scale: 1 });

            const scale = 2; // Renderizar em maior resolução para melhor qualidade de preview
            const off = document.createElement('canvas');
            const octx = off.getContext('2d');
            off.width = vp.width * scale;
            off.height = vp.height * scale;
            octx.fillStyle = '#ffffff';
            octx.fillRect(0, 0, off.width, off.height);
            await page.render({ canvasContext: octx, viewport: page.getViewport({ scale }) }).promise;

            state.impArtImage = off;
            state.impArtWidth = vp.width; // em pt
            state.impArtHeight = vp.height; // em pt
        } else {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
            
            // Obter o DPI da imagem a partir dos metadados
            const dpi = await getDpi(file);
            
            state.impArtImage = img;
            // Converter pixels para pontos PDF (1pt = 1/72 polegada, logo: px / DPI * 72)
            state.impArtWidth = img.width * (72 / dpi);
            state.impArtHeight = img.height * (72 / dpi);
        }
        toast('Arte carregada para preview!', 'success');
        drawPreview();
    } catch (e) {
        toast('Erro ao carregar arte: ' + e.message, 'error');
        state.impArtImage = null;
        drawPreview();
    }
}

function drawPreview() {
    const canvas = document.getElementById('preview-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const fmtId = document.getElementById('imp-formato').value;
    const numId = document.getElementById('imp-numeracao').value;
    const saiId = document.getElementById('imp-saida').value;
    const start = parseInt(document.getElementById('imp-start').value) || 1;
    const end = parseInt(document.getElementById('imp-end').value) || 100;
    const schema = document.getElementById('imp-schema').value;

    if (!fmtId || !saiId) {
        canvas.width = 300;
        canvas.height = 200;
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 300, 200);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Aguardando formato e saída...', 150, 100);
        document.getElementById('preview-sheet-num').textContent = 'Sem Configuração';
        return;
    }

    const fmt = state.formatos.find(f => f.id === fmtId);
    const sai = state.saidas.find(s => s.id === saiId);
    if (!fmt || !sai) return;

    const num = state.numeracoes.find(n => n.id === numId) || null;

    const MM2PT = 2.8346;
    const sheet_w = sai.width_mm * MM2PT;
    const sheet_h = sai.height_mm * MM2PT;
    const item_w = fmt.width_mm * MM2PT;
    const item_h = fmt.height_mm * MM2PT;
    const gap_h = (fmt.gap_h_mm || 0) * MM2PT;
    const gap_v = (fmt.gap_v_mm || 0) * MM2PT;
    const fmt_off_h = (fmt.offset_h_mm || 0) * MM2PT;
    const fmt_off_v = (fmt.offset_v_mm || 0) * MM2PT;

    const MAX_W = 480;
    const MAX_H = 340;
    const scale = Math.min(MAX_W / sheet_w, MAX_H / sheet_h);

    canvas.width = Math.round(sheet_w * scale);
    canvas.height = Math.round(sheet_h * scale);

    // Fundo branco do papel
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cols = fmt.cols;
    const rows = fmt.rows;
    const used_w = cols * item_w + (cols - 1) * gap_h;
    const used_h = rows * item_h + (rows - 1) * gap_v;

    const start_x = (sheet_w - used_w) / 2;
    const start_y = (sheet_h - used_h) / 2;

    const total_items = Math.max(1, end - start + 1);
    const poses_per_sheet = cols * rows;
    const total_sheets = Math.ceil(total_items / poses_per_sheet);

    document.getElementById('preview-sheet-num').textContent = `Folha 1 de ${total_sheets}`;

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const P = row * cols + col;

            let item_index = P;
            if (schema === "cut_stack") {
                item_index = (P * total_sheets);
            } else if (schema === "step_repeat") {
                item_index = 0;
            }

            if (item_index >= total_items) continue;

            const cell_x0 = start_x + col * (item_w + gap_h);
            const cell_y0 = start_y + row * (item_h + gap_v);

            const cx0 = cell_x0 * scale;
            const cy0 = cell_y0 * scale;
            const cw = item_w * scale;
            const ch = item_h * scale;

            // Borda do item
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(cx0, cy0, cw, ch);

            if (state.impArtImage) {
                // Dimensões originais da arte
                const art_orig_w = state.impArtWidth;
                const art_orig_h = state.impArtHeight;

                // Centralizar a arte na célula + aplicar offset do formato
                // (positivo H = direita, positivo V = para cima → negar Y)
                let art_x0 = cell_x0 + (item_w - art_orig_w) / 2 + fmt_off_h;
                let art_y0 = cell_y0 + (item_h - art_orig_h) / 2 - fmt_off_v;
                let art_x1 = art_x0 + art_orig_w;
                let art_y1 = art_y0 + art_orig_h;

                const dx = art_x0 * scale;
                const dy = art_y0 * scale;
                const dw = art_orig_w * scale;
                const dh = art_orig_h * scale;

                if (dw > 0 && dh > 0) {
                    ctx.drawImage(state.impArtImage, 0, 0, state.impArtImage.width, state.impArtImage.height, dx, dy, dw, dh);
                }
            } else {
                ctx.fillStyle = '#f8fafc';
                ctx.fillRect(cx0, cy0, cw, ch);
                ctx.strokeStyle = '#e2e8f0';
                ctx.setLineDash([3, 3]);
                ctx.strokeRect(cx0 + 2, cy0 + 2, cw - 4, ch - 4);
                ctx.setLineDash([]);

                ctx.fillStyle = '#94a3b8';
                ctx.font = `${Math.max(7, Math.round(ch * 0.12))}px Inter`;
                ctx.textAlign = 'center';
                ctx.fillText(`Posição ${P + 1}`, cx0 + cw / 2, cy0 + ch / 2);
            }

            // Elementos variáveis (VDP)
            if (num && num.elements) {
                const val = start + item_index;
                num.elements.forEach(el => {
                    const el_x = cell_x0 + (el.x_mm * MM2PT);
                    const el_y = cell_y0 + (el.y_mm * MM2PT);
                    const color = el.color || '#000000';
                    const rotation = el.rotation || 0;

                    let val_str = "";
                    if (el.fixed) {
                        val_str = el.fixed_value || "";
                    } else if (el.source === 'database') {
                        if (state.csvData && state.csvData[item_index]) {
                            const colName = el.csv_column || '';
                            val_str = String(state.csvData[item_index][colName] || '');
                        } else {
                            val_str = `${el.prefix || ''}[${el.csv_column || 'coluna'}]${el.suffix || ''}`;
                        }
                    } else {
                        const pad = parseInt(el.pad) || 0;
                        const prefix = el.prefix || "";
                        const suffix = el.suffix || "";
                        const raw = pad > 0 ? String(val).padStart(pad, '0') : String(val);
                        val_str = `${prefix}${raw}${suffix}`;
                    }

                    ctx.save();
                    ctx.translate(el_x * scale, el_y * scale);
                    ctx.rotate(rotation * Math.PI / 180);

                    if (el.type === 'TEXT' || el.type === 'FIXED') {
                        const fs = (el.font_size || 12) * scale;
                        let fontStyle = 'Inter, sans-serif';
                        if (el.font_name === 'helv-bold') fontStyle = 'bold Inter, sans-serif';
                        else if (el.font_name === 'times') fontStyle = 'Times New Roman, serif';
                        else if (el.font_name === 'times-bold') fontStyle = 'bold Times New Roman, serif';
                        else if (el.font_name === 'cour') fontStyle = 'Courier New, monospace';
                        else if (el.font_name === 'cour-bold') fontStyle = 'bold Courier New, monospace';

                        ctx.font = `${fs}px ${fontStyle}`;
                        ctx.fillStyle = color;
                        ctx.textAlign = 'left';
                        ctx.fillText(val_str, 0, fs);
                    } else if (el.type === 'QR') {
                        const sz = (el.size_mm || 15) * MM2PT * scale;
                        ctx.fillStyle = color;
                        ctx.fillRect(0, 0, sz, sz);
                        ctx.fillStyle = '#ffffff';
                        const cell = sz / 7;
                        for (const [cx, cy] of [[0, 0], [4, 0], [0, 4]]) {
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(cx * cell, cy * cell, 3 * cell, 3 * cell);
                            ctx.fillStyle = color;
                            ctx.fillRect(cx * cell + cell * 0.5, cy * cell + cell * 0.5, 2 * cell, 2 * cell);
                        }
                    } else if (el.type === 'BARCODE') {
                        const bw = (el.width_mm || 40) * MM2PT * scale;
                        const bh = (el.height_mm || 10) * MM2PT * scale;
                        ctx.fillStyle = color;
                        const barW = bw / 40;
                        const pattern = [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1];
                        for (let i = 0; i < pattern.length; i++) {
                            if (pattern[i]) ctx.fillRect(i * barW, 0, barW * 0.7, bh);
                        }

                        // Desenhar texto identificando o formato do código de barras
                        ctx.font = `${Math.max(5, bh * 0.3)}px Inter, sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.fillText((el.barcode_format || 'CODE128').toUpperCase(), bw / 2, bh + Math.max(5, bh * 0.35));
                        ctx.textAlign = 'left';
                    } else if (el.type === 'SVG') {
                        const sz_w = (el.width_mm || 20) * MM2PT * scale;
                        const sz_h = (el.height_mm || 20) * MM2PT * scale;
                        const svgImg = num && num._svgImage;
                        if (svgImg) {
                            ctx.drawImage(svgImg, 0, 0, sz_w, sz_h);
                        } else {
                            ctx.strokeStyle = color;
                            ctx.lineWidth = 0.5 * scale;
                            ctx.strokeRect(0, 0, sz_w, sz_h);
                            ctx.font = `${Math.max(5, sz_h * 0.15)}px Inter, sans-serif`;
                            ctx.fillStyle = color;
                            ctx.textAlign = 'center';
                            ctx.fillText('SVG', sz_w / 2, sz_h / 2 + (sz_h * 0.05));
                            ctx.textAlign = 'left';
                        }
                    }
                    ctx.restore();
                });
            }
        }
    }

    // Borda da folha
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
}

function updateImpSummary() {
    const fmtId = document.getElementById('imp-formato').value;
    const numId = document.getElementById('imp-numeracao').value;
    const saiId = document.getElementById('imp-saida').value;
    const start = parseInt(document.getElementById('imp-start').value) || 1;
    const end = parseInt(document.getElementById('imp-end').value) || 100;
    const box = document.getElementById('imp-summary');

    const num = state.numeracoes.find(n => n.id === numId) || null;
    if (num && num.svg_content && !num._svgImage) {
        const img = new Image();
        img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(num.svg_content);
        img.onload = () => {
            num._svgImage = img;
            drawPreview();
        };
    }
    if (num && num.csv_data && num.csv_data.length) {
        state.csvData = num.csv_data;
        state.csvFile = null; // Banco embutido
        
        // Travar e preencher campos
        const impStart = document.getElementById('imp-start');
        const impEnd = document.getElementById('imp-end');
        if (impStart) {
            impStart.value = 1;
            impStart.setAttribute('disabled', 'true');
        }
        if (impEnd) {
            impEnd.value = num.csv_data.length;
            impEnd.setAttribute('disabled', 'true');
        }
    } else {
        state.csvData = null;
        state.csvFile = null;
        
        const impStart = document.getElementById('imp-start');
        const impEnd = document.getElementById('imp-end');
        if (impStart) impStart.removeAttribute('disabled');
        if (impEnd) impEnd.removeAttribute('disabled');
    }

    if (!fmtId || !saiId) {
        box.style.display = 'none';
        drawPreview();
        return;
    }

    const fmt = state.formatos.find(f => f.id === fmtId);
    const sai = state.saidas.find(s => s.id === saiId);
    if (!fmt || !sai) {
        box.style.display = 'none';
        drawPreview();
        return;
    }

    const total = state.csvData ? state.csvData.length : (end - start + 1);
    const perSheet = fmt.cols * fmt.rows;
    const sheets = Math.ceil(total / perSheet);

    box.style.display = 'grid';
    document.getElementById('sum-formato').textContent = `${fmt.name} (${fmt.width_mm}×${fmt.height_mm}mm)`;
    document.getElementById('sum-grade').textContent = `${fmt.cols} × ${fmt.rows} = ${perSheet} itens/folha`;
    document.getElementById('sum-total').textContent = total.toLocaleString('pt-BR');
    document.getElementById('sum-folhas').textContent = sheets.toLocaleString('pt-BR') + ' folha(s)';
    document.getElementById('sum-saida').textContent = `${sai.name} — ${(sai.file_format || 'pdf').toUpperCase()}`;

    // Update steps
    ['step-1', 'step-2', 'step-3', 'step-4'].forEach((s, i) => {
        const el = document.getElementById(s);
        el.classList.remove('done', 'active');
        el.classList.add(i < 3 ? 'done' : 'active');
    });

    drawPreview();
}
window.updateImpSummary = updateImpSummary;
window.drawPreview = drawPreview;

// File drop
const impDrop = document.getElementById('imp-drop-area');
const impFile = document.getElementById('imp-file');
const impInfo = document.getElementById('imp-file-info');

impDrop.addEventListener('click', () => impFile.click());
impDrop.addEventListener('dragover', e => { e.preventDefault(); impDrop.classList.add('dragover'); });
impDrop.addEventListener('dragleave', () => impDrop.classList.remove('dragover'));
impDrop.addEventListener('drop', e => {
    e.preventDefault();
    impDrop.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
        impFile.files = e.dataTransfer.files;
        showFileInfo();
    }
});
impFile.addEventListener('change', showFileInfo);

function showFileInfo() {
    if (impFile.files.length) {
        const f = impFile.files[0];
        const kb = (f.size / 1024).toFixed(0);
        impInfo.textContent = `✅ ${f.name} (${kb} KB)`;
        impInfo.style.display = 'block';
        // Mark step 4 as active
        document.getElementById('step-4').classList.add('active');
        loadImpArtFile(f);
    }
}

let impositionAbortController = null;

window.runImposition = async function () {
    const fmtId = document.getElementById('imp-formato').value;
    const numId = document.getElementById('imp-numeracao').value;
    const saiId = document.getElementById('imp-saida').value;
    const start = parseInt(document.getElementById('imp-start').value);
    const end = parseInt(document.getElementById('imp-end').value);
    const schema = document.getElementById('imp-schema').value;

    if (!fmtId) return toast('Selecione um Formato.', 'error');
    if (!saiId) return toast('Selecione uma Saída.', 'error');
    if (!impFile.files.length) return toast('Selecione a arte (PDF/JPG/PNG).', 'error');
    if (start > end) return toast('Número inicial deve ser menor que o final.', 'error');

    const formato = state.formatos.find(f => f.id === fmtId);
    const saida = state.saidas.find(s => s.id === saiId);
    const numeracao = numId ? state.numeracoes.find(n => n.id === numId) : null;

    const payload = {
        formato_id: fmtId,
        numeracao_id: numId || null,
        saida_id: saiId,
        formato: formato,
        saida: saida,
        numeracao: numeracao,
        seq_start: start,
        seq_end: end,
        seq_increment: 1,
        schema
    };

    const formData = new FormData();
    formData.append('file', impFile.files[0]);
    if (state.csvFile) {
        formData.append('csv_file', state.csvFile);
    }
    formData.append('payload', JSON.stringify(payload));

    const overlay = document.getElementById('loading-overlay');
    const sub = document.getElementById('loading-sub');
    const total = end - start + 1;
    overlay.classList.add('active');
    sub.textContent = `Gerando ${total.toLocaleString('pt-BR')} itens...`;
    document.getElementById('btn-impose').disabled = true;

    // Instancia o AbortController e associa ao botão de cancelamento
    impositionAbortController = new AbortController();
    const cancelBtn = document.getElementById('btn-cancel-imposition');
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            if (impositionAbortController) {
                impositionAbortController.abort();
            }
        };
    }

    try {
        let baseUrl = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '';
        
        // Verifica se o Agente Local está ativo para processar a imposição localmente de forma instantânea (com timeout de 300ms)
        let localActive = false;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 300);
            
            const agentCheck = await fetch("http://localhost:9000/", { 
                method: "GET",
                signal: controller.signal 
            }).catch(() => null);
            
            clearTimeout(timeoutId);
            
            if (agentCheck && agentCheck.ok) {
                const checkData = await agentCheck.json().catch(() => ({}));
                if (checkData.status === "running") {
                    localActive = true;
                }
            }
        } catch (_) {}

        if (localActive) {
            baseUrl = "http://localhost:9000";
            console.log("[Imposition] Processando localmente na máquina do usuário para máxima velocidade");
        } else {
            console.log("[Imposition] Processando na nuvem (Render)");
        }
        
        const headers = {};
        if (typeof firebase !== 'undefined' && firebase.auth() && firebase.auth().currentUser) {
            try {
                const token = await firebase.auth().currentUser.getIdToken();
                headers['Authorization'] = `Bearer ${token}`;
            } catch (e) {
                console.error("Erro ao obter Firebase ID Token para imposição:", e);
            }
        }

        const res = await fetch(`${baseUrl}/api/impose`, { 
            method: 'POST', 
            headers: headers,
            body: formData,
            signal: impositionAbortController.signal
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Erro no servidor');
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `VDP_${start}-${end}_${Date.now()}.pdf`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast('PDF gerado com sucesso!', 'success');
    } catch (err) {
        if (err.name === 'AbortError') {
            toast('Geração do PDF cancelada pelo usuário.', 'info');
        } else {
            toast(`Erro: ${err.message}`, 'error');
        }
    } finally {
        overlay.classList.remove('active');
        document.getElementById('btn-impose').disabled = false;
        impositionAbortController = null;
    }
};;

// ─── Init ─────────────────────────────────────────────────────────────────────
loadAll();

// ─── Formato Preview ──────────────────────────────────────────────────────────
function drawFormatPreview() {
    const canvas = document.getElementById('fmt-preview-canvas');
    if (!canvas) return;

    const width_mm = Math.max(1, parseFloat(document.getElementById('fmt-w').value) || 0);
    const height_mm = Math.max(1, parseFloat(document.getElementById('fmt-h').value) || 0);
    const cols = Math.max(1, parseInt(document.getElementById('fmt-cols').value) || 0);
    const rows = Math.max(1, parseInt(document.getElementById('fmt-rows').value) || 0);
    const gap_h = Math.max(0, parseFloat(document.getElementById('fmt-gaph').value) || 0);
    const gap_v = Math.max(0, parseFloat(document.getElementById('fmt-gapv').value) || 0);
    const off_h = parseDecimalBR(document.getElementById('fmt-offh').value) || 0;
    const off_v = parseDecimalBR(document.getElementById('fmt-offv').value) || 0;

    // Validação visual inline enquanto digita
    const offhEl = document.getElementById('fmt-offh');
    const offvEl = document.getElementById('fmt-offv');
    if (offhEl) validateOffsetField(offhEl);
    if (offvEl) validateOffsetField(offvEl);

    // Atualizar texto do badge
    const badge = document.getElementById('fmt-preview-info');
    if (badge) {
        let badgeText = `Grade: ${cols}×${rows} · Total: ${cols * rows} itens`;
        if (off_h !== 0 || off_v !== 0) {
            badgeText += ` · Offset: ${off_h.toFixed(1)}×${off_v.toFixed(1)}mm`;
        }
        badge.textContent = badgeText;
    }

    const ctx = canvas.getContext('2d');

    // Calcular tamanho total em mm
    const total_w_mm = (cols * width_mm) + ((cols - 1) * gap_h);
    const total_h_mm = (rows * height_mm) + ((rows - 1) * gap_v);

    // Ajustar tamanho do canvas
    const max_w = 400;
    const max_h = 280;
    const padding = 20;

    // Escala para caber no canvas com padding
    const scale = Math.min((max_w - padding * 2) / total_w_mm, (max_h - padding * 2) / total_h_mm);

    canvas.width = max_w;
    canvas.height = max_h;

    // Limpar
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, max_w, max_h);

    // Centralizar o desenho no canvas
    const offset_x = (max_w - (total_w_mm * scale)) / 2;
    const offset_y = (max_h - (total_h_mm * scale)) / 2;

    // Desenhar fundo da "folha" ou área da grade
    ctx.strokeStyle = 'rgba(99, 120, 180, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(offset_x, offset_y, total_w_mm * scale, total_h_mm * scale);
    ctx.setLineDash([]);

    // Desenhar itens
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const item_x = offset_x + c * (width_mm + gap_h) * scale;
            const item_y = offset_y + r * (height_mm + gap_v) * scale;
            const item_w = width_mm * scale;
            const item_h = height_mm * scale;

            // Retângulo do item (célula)
            ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1.5;
            ctx.fillRect(item_x, item_y, item_w, item_h);
            ctx.strokeRect(item_x, item_y, item_w, item_h);

            // Indicador de offset (se houver offset, desenhar seta do centro)
            if (off_h !== 0 || off_v !== 0) {
                const cx = item_x + item_w / 2;
                const cy = item_y + item_h / 2;
                const dx = off_h * scale;
                const dy = -off_v * scale; // positivo V = para cima → negativo no canvas
                const tx = cx + dx;
                const ty = cy + dy;

                // Linha de deslocamento
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 1.2;
                ctx.setLineDash([3, 2]);
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(tx, ty);
                ctx.stroke();
                ctx.setLineDash([]);

                // Ponto de destino
                ctx.fillStyle = '#ef4444';
                ctx.beginPath();
                ctx.arc(tx, ty, 3, 0, Math.PI * 2);
                ctx.fill();

                // Crosshair no centro (referência)
                ctx.strokeStyle = 'rgba(99, 120, 180, 0.4)';
                ctx.lineWidth = 0.6;
                ctx.beginPath();
                ctx.moveTo(cx - 6, cy);
                ctx.lineTo(cx + 6, cy);
                ctx.moveTo(cx, cy - 6);
                ctx.lineTo(cx, cy + 6);
                ctx.stroke();
            }

            // Conteúdo fictício simples (ex: "#1", "#2", ...)
            ctx.fillStyle = '#475569';
            ctx.font = `bold ${Math.max(8, Math.min(12, item_h * 0.25))}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const num = r * cols + c + 1;
            ctx.fillText(`#${num}`, item_x + item_w / 2, item_y + item_h / 2);
        }
    }

    // Desenhar marcações de Gap se houver mais de 1 col/row
    ctx.fillStyle = '#8b5cf6';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';

    if (cols > 1 && gap_h > 0) {
        // Mostrar linha do gap horizontal
        const first_x = offset_x + width_mm * scale;
        const gap_w = gap_h * scale;
        const mid_y = offset_y + (total_h_mm * scale) / 2;

        ctx.fillStyle = 'rgba(139, 92, 246, 0.15)';
        ctx.fillRect(first_x, offset_y, gap_w, total_h_mm * scale);

        // Indicador de tamanho
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(first_x, mid_y);
        ctx.lineTo(first_x + gap_w, mid_y);
        ctx.stroke();

        ctx.fillStyle = '#8b5cf6';
        ctx.fillText(`${gap_h}mm`, first_x + gap_w / 2, mid_y - 4);
    }

    if (rows > 1 && gap_v > 0) {
        // Mostrar linha do gap vertical
        const first_y = offset_y + height_mm * scale;
        const gap_h_px = gap_v * scale;
        const mid_x = offset_x + (total_w_mm * scale) / 2;

        ctx.fillStyle = 'rgba(139, 92, 246, 0.15)';
        ctx.fillRect(offset_x, first_y, total_w_mm * scale, gap_h_px);

        // Indicador de tamanho
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(mid_x, first_y);
        ctx.lineTo(mid_x, first_y + gap_h_px);
        ctx.stroke();

        ctx.fillStyle = '#8b5cf6';
        ctx.fillText(`${gap_v}mm`, mid_x + 18, first_y + gap_h_px / 2 + 3);
    }

    // Exibir área total em mm na parte inferior do canvas
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${total_w_mm.toFixed(1)} × ${total_h_mm.toFixed(1)} mm`, max_w - 8, max_h - 8);
}

// Bind events for live preview (incluindo campos de offset)
['fmt-w', 'fmt-h', 'fmt-cols', 'fmt-rows', 'fmt-gaph', 'fmt-gapv', 'fmt-offh', 'fmt-offv'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('input', drawFormatPreview);
    }
});

// Render initial preview
drawFormatPreview();
window.drawFormatPreview = drawFormatPreview;

// ─── LÓGICA DE BANCO DE DADOS (CSV) ──────────────────────────────────────────
window.clearCsvFile = function() {
    state.csvFile = null;
    state.csvData = null;
    const csvFileEl = document.getElementById('csv-file');
    const csvInfoEl = document.getElementById('csv-file-info');
    if (csvFileEl) csvFileEl.value = '';
    if (csvInfoEl) {
        csvInfoEl.textContent = '';
        csvInfoEl.style.display = 'none';
    }
    
    const impStart = document.getElementById('imp-start');
    const impEnd = document.getElementById('imp-end');
    if (impStart) impStart.removeAttribute('disabled');
    if (impEnd) impEnd.removeAttribute('disabled');
    
    drawPreview();
};

function initCsvUploadEvents() {
    const csvDrop = document.getElementById('csv-drop-area');
    const csvFile = document.getElementById('csv-file');
    if (!csvDrop || !csvFile || csvDrop._listenerSet) return;
    
    csvDrop.addEventListener('click', () => csvFile.click());
    csvDrop.addEventListener('dragover', e => { e.preventDefault(); csvDrop.classList.add('dragover'); });
    csvDrop.addEventListener('dragleave', () => csvDrop.classList.remove('dragover'));
    csvDrop.addEventListener('drop', e => {
        e.preventDefault();
        csvDrop.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            csvFile.files = e.dataTransfer.files;
            handleCsvSelected();
        }
    });
    csvFile.addEventListener('change', handleCsvSelected);
    csvDrop._listenerSet = true;
}

async function handleCsvSelected() {
    const csvFileEl = document.getElementById('csv-file');
    if (csvFileEl.files.length) {
        const file = csvFileEl.files[0];
        state.csvFile = file;
        
        try {
            const text = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.onerror = e => reject(e.target.error);
                reader.readAsText(file);
            });
            
            state.csvData = parseCSVRows(text);
            
            const infoEl = document.getElementById('csv-file-info');
            infoEl.textContent = `✅ CSV carregado: ${file.name} (${state.csvData.length} registros)`;
            infoEl.style.display = 'block';
            
            const impStart = document.getElementById('imp-start');
            const impEnd = document.getElementById('imp-end');
            if (impStart) {
                impStart.value = 1;
                impStart.setAttribute('disabled', 'true');
            }
            if (impEnd) {
                impEnd.value = state.csvData.length;
                impEnd.setAttribute('disabled', 'true');
            }
            
            toast('Banco de dados carregado com sucesso!', 'success');
            updateImpSummary();
        } catch (err) {
            toast('Erro ao processar CSV: ' + err.message, 'error');
            clearCsvFile();
        }
    }
}

function parseCSVRows(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length <= 1) return [];
    
    let delimiter = ',';
    if (lines[0].includes(';')) {
        delimiter = ';';
    }
    
    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const currentline = lines[i].split(delimiter);
        const obj = {};
        for (let j = 0; j < headers.length; j++) {
            obj[headers[j]] = (currentline[j] || '').trim().replace(/^["']|["']$/g, '');
        }
        rows.push(obj);
    }
    return rows;
}

// Inicializar listeners do CSV do Editor
document.addEventListener('DOMContentLoaded', () => {
    initNumCsvEvents();
});
(function() {
    initNumCsvEvents();
})();

function initNumCsvEvents() {
    const fileEl = document.getElementById('num-csv-file');
    if (fileEl && !fileEl._listenerSet) {
        fileEl.addEventListener('change', handleNumCsvSelected);
        fileEl._listenerSet = true;
    }
}

async function handleNumCsvSelected() {
    const fileEl = document.getElementById('num-csv-file');
    if (fileEl && fileEl.files.length) {
        const file = fileEl.files[0];
        try {
            const text = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.onerror = e => reject(e.target.error);
                reader.readAsText(file);
            });
            
            const rows = parseCSVRows(text);
            if (!rows.length) {
                throw new Error("O arquivo CSV está vazio ou é inválido.");
            }
            
            let delimiter = ',';
            if (text.split('\n')[0].includes(';')) {
                delimiter = ';';
            }
            const headers = text.split('\n')[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
            
            state.numCsvHeaders = headers;
            state.numCsvData = rows;
            state.numCsvFilename = file.name;
            
            renderNumCsvInterface();
            toast('CSV carregado no editor!', 'success');
        } catch (e) {
            toast('Erro ao ler CSV: ' + e.message, 'error');
            clearNumCsvFile();
        }
    }
}

window.clearNumCsvFile = function() {
    state.numCsvHeaders = [];
    state.numCsvData = null;
    state.numCsvFilename = "";
    
    const fileEl = document.getElementById('num-csv-file');
    const nameEl = document.getElementById('num-csv-file-name');
    const btnRemove = document.getElementById('btn-remove-num-csv');
    
    if (fileEl) {
        // Clonar o input file para limpar completamente o estado do navegador e forçar o reset
        const newFileEl = fileEl.cloneNode(true);
        newFileEl.value = '';
        fileEl.parentNode.replaceChild(newFileEl, fileEl);
        // Registrar novamente o listener no novo elemento clonado
        newFileEl.addEventListener('change', handleNumCsvSelected);
        newFileEl._listenerSet = true;
    }
    if (nameEl) nameEl.textContent = '';
    if (btnRemove) btnRemove.style.display = 'none';
    
    const colContainer = document.getElementById('num-csv-columns-container');
    if (colContainer) colContainer.style.display = 'none';
    
    renderElementsList();
    drawCanvas();
};

function renderNumCsvInterface() {
    const nameEl = document.getElementById('num-csv-file-name');
    const btnRemove = document.getElementById('btn-remove-num-csv');
    const container = document.getElementById('num-csv-columns-container');
    const bar = document.getElementById('num-csv-columns-bar');
    
    if (nameEl) nameEl.textContent = `📎 ${state.numCsvFilename} (${state.numCsvData ? state.numCsvData.length : 0} linhas)`;
    if (btnRemove) btnRemove.style.display = 'inline-flex';
    
    if (container && bar && state.numCsvHeaders && state.numCsvHeaders.length) {
        container.style.display = 'block';
        bar.innerHTML = state.numCsvHeaders.map(col => `
            <button class="btn btn-sm btn-secondary" onclick="addCsvColumnElement('${col}')" title="Adicionar como texto variável">📊 ${col}</button>
        `).join('');
    } else if (container) {
        container.style.display = 'none';
    }
    
    renderElementsList();
    drawCanvas();
}

window.addCsvColumnElement = function(colName) {
    state.numElCounter++;
    const id = `el_${state.numElCounter}`;
    const base = { 
        id, 
        type: 'TEXT', 
        name: colName,
        x_mm: 5, 
        y_mm: 5, 
        rotation: 0, 
        color: '#000000',
        font_size: 12,
        font_name: 'helv',
        pad: 0,
        prefix: '',
        suffix: '',
        source: 'database',
        csv_column: colName
    };
    
    state.numElements.push(base);
    state.selectedElId = id;
    renderElementsList();
    drawCanvas();
    selectElementCard(id);
};

// ─── LÓGICA DE AUTENTICAÇÃO E ADMINISTRAÇÃO ───────────────────────────────────
let authMode = 'login'; // 'login' ou 'register'

window.toggleAuthMode = function(e) {
    if (e) e.preventDefault();
    const title = document.querySelector('.auth-header h2');
    const p = document.querySelector('.auth-header p');
    const btnSubmit = document.getElementById('btn-auth-submit');
    const toggleLink = document.getElementById('auth-toggle-link');
    
    if (authMode === 'login') {
        authMode = 'register';
        title.textContent = 'Ideal Imposition — Cadastro';
        p.textContent = 'Crie sua conta para começar';
        btnSubmit.textContent = 'Cadastrar';
        toggleLink.textContent = 'Já tem uma conta? Entrar';
    } else {
        authMode = 'login';
        title.textContent = 'Ideal Imposition';
        p.textContent = 'Faça login para acessar o painel online';
        btnSubmit.textContent = 'Entrar';
        toggleLink.textContent = 'Criar uma nova conta';
    }
};

window.handleAuthSubmit = async function(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const btnSubmit = document.getElementById('btn-auth-submit');
    
    btnSubmit.disabled = true;
    btnSubmit.textContent = authMode === 'login' ? 'Entrando...' : 'Cadastrando...';
    
    try {
        if (authMode === 'login') {
            await firebase.auth().signInWithEmailAndPassword(email, password);
            toast('Login efetuado com sucesso!', 'success');
        } else {
            await firebase.auth().createUserWithEmailAndPassword(email, password);
            toast('Conta criada com sucesso!', 'success');
        }
        document.getElementById('auth-overlay').classList.remove('active');
        document.body.classList.remove('not-logged-in');
    } catch (err) {
        toast('Erro: ' + err.message, 'error');
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = authMode === 'login' ? 'Entrar' : 'Cadastrar';
    }
};

window.handleGoogleLogin = async function() {
    const provider = new firebase.auth.GoogleAuthProvider();
    const btnGoogle = document.getElementById('btn-google-login');
    if (btnGoogle) btnGoogle.disabled = true;
    
    try {
        await firebase.auth().signInWithPopup(provider);
        toast('Login com Google efetuado com sucesso!', 'success');
        document.getElementById('auth-overlay').classList.remove('active');
        document.body.classList.remove('not-logged-in');
    } catch (err) {
        toast('Erro ao entrar com Google: ' + err.message, 'error');
    } finally {
        if (btnGoogle) btnGoogle.disabled = false;
    }
};

window.handleSignOut = async function() {
    try {
        await firebase.auth().signOut();
        toast('Logoff efetuado!', 'success');
        location.reload();
    } catch (e) {
        toast('Erro ao sair: ' + e.message, 'error');
    }
};

// Monitora o estado de autenticação do Firebase Auth
document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                // Logado
                document.getElementById('auth-overlay').classList.remove('active');
                document.body.classList.remove('not-logged-in');
                
                // Mostrar informações do perfil
                const profileBar = document.getElementById('user-profile-bar');
                const emailDisplay = document.getElementById('user-email-display');
                if (profileBar) profileBar.style.display = 'block';
                if (emailDisplay) emailDisplay.textContent = user.email;

                // Obter claims personalizadas (para saber se é admin)
                try {
                    const idTokenResult = await user.getIdTokenResult();
                    const isAdmin = idTokenResult.claims.admin === true;
                    if (isAdmin) {
                        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
                    } else {
                        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
                    }
                } catch (e) {
                    console.error("Erro ao ler Claims:", e);
                }

                // Carregar dados principais
                loadAll();
            } else {
                // Deslogado
                document.getElementById('auth-overlay').classList.add('active');
                document.body.classList.add('not-logged-in');
                
                const profileBar = document.getElementById('user-profile-bar');
                if (profileBar) profileBar.style.display = 'none';
                document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
            }
        });
    }
});

// Lógica do Painel de Administração (Lista usuários e altera permissões)
window.loadAdminUsers = async function() {
    const tbody = document.getElementById('tbody-admin-users');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Carregando usuários...</td></tr>';
    
    try {
        const users = await api('GET', '/admin/users');
        if (!users || !users.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum usuário retornado.</td></tr>';
            return;
        }
        
        tbody.innerHTML = users.map(u => `
            <tr>
                <td>
                    <strong>${u.display_name}</strong><br>
                    <small style="color: var(--text-dim);">${u.email}</small>
                </td>
                <td><code style="font-size:0.75rem; background:rgba(0,0,0,0.2); padding: 2px 6px; border-radius:4px;">${u.uid}</code></td>
                <td>
                    <span class="badge ${u.role === 'admin' ? 'badge-red' : (u.role === 'editor' ? 'badge-blue' : 'badge-teal')}">${u.role.toUpperCase()}</span>
                </td>
                <td>
                    <select class="form-control" style="width: auto; display: inline-block; padding: 4px 8px; font-size: 0.8rem; height: 30px;" onchange="changeUserRole('${u.uid}', this.value)">
                        <option value="user" ${u.role === 'user' ? 'selected' : ''}>User (Visualizador)</option>
                        <option value="editor" ${u.role === 'editor' ? 'selected' : ''}>Editor</option>
                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--red);">Erro: ${e.message}</td></tr>`;
        toast('Erro ao obter usuários: ' + e.message, 'error');
    }
};

window.changeUserRole = async function(uid, newRole) {
    if (!confirm(`Deseja alterar a função deste usuário para ${newRole.toUpperCase()}?`)) {
        loadAdminUsers();
        return;
    }
    
    try {
        await api('POST', `/admin/users/${uid}/role`, { role: newRole });
        toast('Função de usuário atualizada!', 'success');
        loadAdminUsers();
    } catch (e) {
        toast('Erro ao alterar função: ' + e.message, 'error');
        loadAdminUsers();
    }
};

// Vincula clique na aba de administração para carregar usuários automaticamente
document.getElementById('nav-admin')?.addEventListener('click', () => {
    loadAdminUsers();
});

// ─── LÓGICA DA TELA DE AMOSTRAS ──────────────────────────────────────────────
let amostraArteImage = null;
let amostraArteWidth = 0;
let amostraArteHeight = 0;

// Helper para obter dimensões do formato ativo em Amostras
function getAmostraFormato() {
    const corId = document.getElementById('amostra-cor').value;
    const numId = document.getElementById('amostra-numeracao').value;
    
    if (numId) {
        const num = state.numeracoes.find(n => n.id === numId);
        if (num) {
            const fmt = state.formatos.find(f => f.id === num.formato_id);
            if (fmt) return fmt;
        }
    }
    if (corId) {
        const cor = state.cores.find(c => c.id === corId);
        if (cor) {
            // Retorna dimensões do formato correspondentes à cor
            return {
                width_mm: cor.width_mm,
                height_mm: cor.height_mm
            };
        }
    }
    return null;
}

// Helper para calcular a escala (px/mm) ideal para que todos os canvas tenham o mesmo tamanho
function getAmostraScale(fmt, canvasElement) {
    if (!fmt || !canvasElement) return 3.5; // Escala padrão
    const containerW = canvasElement.parentElement.clientWidth - 30; // compensar padding
    return containerW / fmt.width_mm;
}

window.onAmostraCorSelect = async function() {
    const corId = document.getElementById('amostra-cor').value;
    const canvas = document.getElementById('amostra-cor-canvas');
    const empty = document.getElementById('amostra-cor-empty');
    const badge = document.getElementById('amostra-cor-badge');
    
    if (!corId) {
        if (canvas) canvas.style.display = 'none';
        if (empty) {
            empty.style.display = 'block';
            empty.innerHTML = `<div style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.7;">🎨</div><p style="font-size: 0.85rem; font-weight: 500;">Selecione uma cor para visualizar.</p>`;
        }
        if (badge) badge.textContent = 'Sem Cor';
        return;
    }

    const cor = state.cores.find(c => c.id === corId);
    if (!cor) return;

    if (badge) badge.textContent = cor.name;

    if (cor.pdf_base64) {
        if (empty) {
            empty.style.display = 'block';
            empty.innerHTML = '<div class="spinner"></div><p style="margin-top:10px; font-size:0.82rem; font-weight:500;">Carregando PDF da Cor...</p>';
        }
        try {
            const base64Data = cor.pdf_base64.includes('base64,') ? cor.pdf_base64.split('base64,')[1] : cor.pdf_base64;
            const binStr = atob(base64Data);
            const bytes = new Uint8Array(binStr.length);
            for (let i = 0; i < binStr.length; i++) {
                bytes[i] = binStr.charCodeAt(i);
            }

            const loadingTask = pdfjsLib.getDocument({ data: bytes });
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1);
            
            // Usar escala proporcional unificada baseada no formato da cor
            const fmt = getAmostraFormato();
            const scalePxMm = getAmostraScale(fmt, canvas);
            
            const viewport = page.getViewport({ scale: 1.0 });
            // Converter mm para pontos PDF (72 / 25.4 = 2.8346) para saber a escala certa do renderizador
            const pdfScale = (fmt.width_mm * 2.8346) / viewport.width;
            
            // Escala final de renderização
            const scaledViewport = page.getViewport({ scale: pdfScale * (scalePxMm / 2.8346) });
            
            const context = canvas.getContext('2d');
            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;
            
            await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
            
            if (empty) empty.style.display = 'none';
            canvas.style.display = 'block';
            
            // Renderiza amostra combinada
            renderAmostraCombinada();
        } catch (e) {
            console.error("Erro ao renderizar cor na amostra:", e);
            if (empty) {
                empty.style.display = 'block';
                empty.innerHTML = '<div style="font-size: 2rem; color: var(--red); margin-bottom:10px;">✕</div><p style="font-size:0.85rem; font-weight:500;">Erro ao carregar PDF de referência da cor.</p>';
            }
            canvas.style.display = 'none';
            renderAmostraCombinada();
        }
    } else {
        if (canvas) canvas.style.display = 'none';
        if (empty) {
            empty.style.display = 'block';
            empty.innerHTML = `<div style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.7;">🎨</div><p style="font-size: 0.85rem; font-weight: 500;">Esta cor não possui PDF de referência cadastrado.</p>`;
        }
        renderAmostraCombinada();
    }
};

window.onAmostraNumeracaoSelect = function() {
    const numId = document.getElementById('amostra-numeracao').value;
    const canvas = document.getElementById('amostra-num-canvas');
    const empty = document.getElementById('amostra-num-empty');
    const badge = document.getElementById('amostra-num-badge');

    if (!numId) {
        if (canvas) canvas.style.display = 'none';
        if (empty) empty.style.display = 'block';
        if (badge) badge.textContent = 'Sem Numeração';
        renderAmostraCombinada();
        return;
    }

    const num = state.numeracoes.find(n => n.id === numId);
    if (!num) return;

    if (badge) badge.textContent = num.name;

    const fmt = state.formatos.find(f => f.id === num.formato_id);
    if (!fmt) {
        if (canvas) canvas.style.display = 'none';
        if (empty) {
            empty.style.display = 'block';
            empty.innerHTML = `<p style="font-size:0.85rem; color:var(--red);">Formato base desta numeração foi excluído.</p>`;
        }
        renderAmostraCombinada();
        return;
    }

    // Desenhar a numeração fictícia no Canvas de Amostras
    if (empty) empty.style.display = 'none';
    canvas.style.display = 'block';

    // Obter escala unificada proporcional
    const S = getAmostraScale(fmt, canvas);
    canvas.width = Math.round(fmt.width_mm * S);
    canvas.height = Math.round(fmt.height_mm * S);
    const ctx = canvas.getContext('2d');

    // Fundo branco limpo
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Contorno do formato
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    // Desenhar elementos cadastrados
    const MM2PT = 2.8346;
    if (num.elements) {
        num.elements.forEach(el => {
            const x = el.x_mm * S;
            const y = el.y_mm * S;
            const color = el.color || '#000000';
            const rot = (el.rotation || 0) * Math.PI / 180;

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(rot);

            if (el.type === 'TEXT' || el.type === 'FIXED') {
                const fs = (el.font_size || 12) * S / 2.8346;
                let fontStyle = 'Inter, sans-serif';
                if (el.font_name === 'helv-bold') fontStyle = 'bold Inter, sans-serif';
                else if (el.font_name === 'times') fontStyle = 'Times New Roman, serif';
                else if (el.font_name === 'times-bold') fontStyle = 'bold Times New Roman, serif';
                else if (el.font_name === 'cour') fontStyle = 'Courier New, monospace';
                else if (el.font_name === 'cour-bold') fontStyle = 'bold Courier New, monospace';

                ctx.font = `${fs}px ${fontStyle}`;
                ctx.fillStyle = color;
                
                let label = '';
                if (el.type === 'FIXED') {
                    label = el.fixed_value || 'TEXTO';
                } else {
                    const padVal = typeof el.pad !== 'undefined' ? el.pad : 6;
                    label = `${el.prefix || ''}${String(1).padStart(padVal, '0')}${el.suffix || ''}`;
                }
                ctx.fillText(label, 0, fs);
            } else if (el.type === 'QR') {
                const sz = (el.size_mm || 15) * S;
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, sz, sz);
                ctx.fillStyle = '#ffffff';
                const cell = sz / 7;
                for (const [cx, cy] of [[0, 0], [4, 0], [0, 4]]) {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(cx * cell, cy * cell, 3 * cell, 3 * cell);
                    ctx.fillStyle = color;
                    ctx.fillRect(cx * cell + cell * 0.5, cy * cell + cell * 0.5, 2 * cell, 2 * cell);
                }
            } else if (el.type === 'BARCODE') {
                const bw = (el.width_mm || 40) * S;
                const bh = (el.height_mm || 10) * S;
                ctx.fillStyle = color;
                const barW = bw / 40;
                const pattern = [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1];
                for (let i = 0; i < pattern.length; i++) {
                    if (pattern[i]) ctx.fillRect(i * barW, 0, barW * 0.7, bh);
                }
            } else if (el.type === 'PICOTE') {
                ctx.strokeStyle = color;
                ctx.lineWidth = 2.0;
                ctx.setLineDash([6, 3]);
                ctx.beginPath();
                ctx.moveTo(0, -y);
                ctx.lineTo(0, canvas.height - y);
                ctx.stroke();
            } else if (el.type === 'SVG') {
                const sz_w = (el.width_mm || 20) * S;
                const sz_h = (el.height_mm || 20) * S;
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.strokeRect(0, 0, sz_w, sz_h);
                ctx.font = `${Math.max(6, sz_h * 0.15)}px Inter, sans-serif`;
                ctx.fillStyle = color;
                ctx.textAlign = 'center';
                ctx.fillText('SVG', sz_w / 2, sz_h / 2 + (sz_h * 0.05));
            }
            ctx.restore();
        });
    }

    renderAmostraCombinada();
};

window.clearAmostraArteFile = function() {
    amostraArteImage = null;
    amostraArteWidth = 0;
    amostraArteHeight = 0;
    document.getElementById('amostra-arte-file').value = '';
    document.getElementById('amostra-arte-file-name').textContent = '';
    document.getElementById('btn-remove-amostra-arte').style.display = 'none';
    document.getElementById('amostra-arte-badge').textContent = 'Sem Arte';
    
    const canvas = document.getElementById('amostra-arte-canvas');
    const empty = document.getElementById('amostra-arte-empty');
    if (canvas) canvas.style.display = 'none';
    if (empty) {
        empty.style.display = 'block';
        empty.innerHTML = `<div style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.7;">🖼️</div><p style="font-size: 0.85rem; font-weight: 500;">Carregue uma arte em PDF ou imagem para visualizar.</p>`;
    }
    renderAmostraCombinada();
};

async function loadAmostraArteFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const canvas = document.getElementById('amostra-arte-canvas');
    const empty = document.getElementById('amostra-arte-empty');
    const badge = document.getElementById('amostra-arte-badge');

    if (badge) badge.textContent = file.name;
    if (empty) {
        empty.style.display = 'block';
        empty.innerHTML = '<div class="spinner"></div><p style="margin-top:10px; font-size:0.82rem; font-weight:500;">Processando Arte...</p>';
    }

    try {
        const fmt = getAmostraFormato();
        const S = getAmostraScale(fmt, canvas);

        if (ext === 'pdf') {
            if (typeof pdfjsLib === 'undefined') {
                return toast('PDF.js não disponível. Use JPG/PNG.', 'error');
            }
            pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const page = await pdf.getPage(1);
            
            const vp = page.getViewport({ scale: 1.0 });
            
            // Se tivermos um formato ativo, escala a arte para o mesmo tamanho proporcional
            let pdfScale = 1.0;
            if (fmt) {
                pdfScale = (fmt.width_mm * 2.8346) / vp.width;
            }
            
            const scaledViewport = page.getViewport({ scale: pdfScale * (S / 2.8346) });
            
            const context = canvas.getContext('2d');
            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;
            
            await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
        } else {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
            
            // Adotar 300 DPI se não conseguirmos ler
            const dpi = 300;
            const originalW_mm = (img.width / dpi) * 25.4;
            const originalH_mm = (img.height / dpi) * 25.4;
            
            // Usar o tamanho do formato (se houver) ou o tamanho físico da imagem na mesma escala S
            const targetW = fmt ? fmt.width_mm : originalW_mm;
            const targetH = fmt ? fmt.height_mm : originalH_mm;
            
            canvas.width = Math.round(targetW * S);
            canvas.height = Math.round(targetH * S);
            const context = canvas.getContext('2d');
            
            // Desenhar a imagem preenchendo/centralizando proporcionalmente se as dimensões diferirem do formato
            context.drawImage(img, 0, 0, canvas.width, canvas.height);
        }

        if (empty) empty.style.display = 'none';
        if (canvas) canvas.style.display = 'block';
        
        document.getElementById('btn-remove-amostra-arte').style.display = 'inline-flex';
        document.getElementById('amostra-arte-file-name').textContent = '📎 ' + file.name;
        toast('Arte de amostra carregada!', 'success');
        renderAmostraCombinada();
    } catch (e) {
        toast('Erro ao carregar arte: ' + e.message, 'error');
        clearAmostraArteFile();
    }
}

// Função para renderizar a Amostra Combinada (Cor + Arte + Numeração) com Multiply
function renderAmostraCombinada() {
    const canvasComb = document.getElementById('amostra-comb-canvas');
    const emptyComb = document.getElementById('amostra-comb-empty');
    if (!canvasComb) return;

    const corCanvas = document.getElementById('amostra-cor-canvas');
    const arteCanvas = document.getElementById('amostra-arte-canvas');
    const numCanvas = document.getElementById('amostra-num-canvas');

    const corId = document.getElementById('amostra-cor').value;
    const numId = document.getElementById('amostra-numeracao').value;
    const hasArte = document.getElementById('amostra-arte-file').files.length > 0;

    // Se nenhuma camada estiver selecionada/carregada, esconde o canvas e mostra o estado vazio
    if (!corId && !numId && !hasArte) {
        canvasComb.style.display = 'none';
        if (emptyComb) emptyComb.style.display = 'block';
        return;
    }

    // A amostra base de tamanho oficial do canvasComb é estritamente baseada no elemento Cor
    // Se não houver cor cadastrada ou o canvas de cor não estiver pronto, usamos o getAmostraFormato como fallback
    let canvasW = 300;
    let canvasH = 200;

    const cor = state.cores.find(c => c.id === corId);
    
    if (corId && corCanvas && corCanvas.style.display !== 'none' && corCanvas.width > 0) {
        canvasW = corCanvas.width;
        canvasH = corCanvas.height;
    } else if (cor) {
        // Se a cor estiver selecionada mas o canvas ainda não estiver carregado, calculamos a escala
        const S = getAmostraScale(cor, canvasComb);
        canvasW = Math.round(cor.width_mm * S);
        canvasH = Math.round(cor.height_mm * S);
    } else {
        const fmtFallback = getAmostraFormato();
        if (fmtFallback) {
            const S = getAmostraScale(fmtFallback, canvasComb);
            canvasW = Math.round(fmtFallback.width_mm * S);
            canvasH = Math.round(fmtFallback.height_mm * S);
        } else {
            canvasComb.style.display = 'none';
            if (emptyComb) emptyComb.style.display = 'block';
            return;
        }
    }

    if (emptyComb) emptyComb.style.display = 'none';
    canvasComb.style.display = 'block';

    canvasComb.width = canvasW;
    canvasComb.height = canvasH;

    const ctx = canvasComb.getContext('2d');
    ctx.clearRect(0, 0, canvasComb.width, canvasComb.height);

    // Resetar composite operation
    ctx.globalCompositeOperation = 'source-over';

    // 1. Desenhar a Camada 1: Cor (se estiver disponível)
    if (corId && corCanvas && corCanvas.style.display !== 'none' && corCanvas.width > 0) {
        ctx.drawImage(corCanvas, 0, 0, canvasComb.width, canvasComb.height);
    } else {
        // Se não tiver cor selecionada, desenha uma base branca para podermos visualizar as outras camadas
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasComb.width, canvasComb.height);
    }

    // 2. Desenhar a Camada 2: Arte com efeito similar ao Photoshop Multiply (centralizada na janela da cor)
    if (hasArte && arteCanvas && arteCanvas.style.display !== 'none' && arteCanvas.width > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        // Centralizar horizontal e verticalmente mantendo seu próprio tamanho original
        const dx = (canvasComb.width - arteCanvas.width) / 2;
        const dy = (canvasComb.height - arteCanvas.height) / 2;
        ctx.drawImage(arteCanvas, dx, dy, arteCanvas.width, arteCanvas.height);
        ctx.restore();
    }

    // 3. Desenhar a Camada 3: Numeração com efeito similar ao Photoshop Multiply (centralizada na janela da cor)
    if (numId && numCanvas && numCanvas.style.display !== 'none' && numCanvas.width > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        // Centralizar horizontal e verticalmente mantendo seu próprio tamanho original
        const dx = (canvasComb.width - numCanvas.width) / 2;
        const dy = (canvasComb.height - numCanvas.height) / 2;
        ctx.drawImage(numCanvas, dx, dy, numCanvas.width, numCanvas.height);
        ctx.restore();
    }

    // Borda final da amostra
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0, 0, canvasComb.width, canvasComb.height);
    ctx.restore();
}
window.renderAmostraCombinada = renderAmostraCombinada;

// Configuração de listeners para Amostras
document.addEventListener('DOMContentLoaded', () => {
    const amArteInp = document.getElementById('amostra-arte-file');
    if (amArteInp) {
        amArteInp.addEventListener('change', e => {
            if (e.target.files[0]) loadAmostraArteFile(e.target.files[0]);
        });
    }
});

(function () {
    const amArteInp = document.getElementById('amostra-arte-file');
    if (amArteInp && !amArteInp._listenerSet) {
        amArteInp.addEventListener('change', e => {
            if (e.target.files[0]) loadAmostraArteFile(e.target.files[0]);
        });
        amArteInp._listenerSet = true;
    }
})();

