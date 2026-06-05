with open('C:/Antigravity Projetos/Arte Ideal/web_designer/script.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_bg = """async function performBgRemoval(imgEl, callback) {
    try {
        if (typeof imglyRemoveBackground === 'undefined') {
            throw new Error("Biblioteca de remoção de fundo não carregada.");
        }
        
        showStudioLoading(true, "A IA nativa está removendo o fundo. Isso pode demorar alguns segundos na primeira vez...");
        
        const imageSource = imgEl.src;
        const imageBlob = await imglyRemoveBackground(imageSource);
        const url = URL.createObjectURL(imageBlob);
        
        const newImg = new Image();
        newImg.onload = () => {
            geminiOriginalImage = newImg;
            geminiFilters.sepia = 0;
            geminiFilters.hueRotate = 0;
            redrawGeminiCanvas();
            if (callback) callback();
        };
        newImg.src = url;
    } catch(e) {
        console.error("Falha ao remover fundo:", e);
        showStudioLoading(false);
        addChatMessage('assistant', "Erro na remoção de fundo: " + e.message);
        if (callback) callback();
    }
}
"""

new_prompt = """
function getApiKey() { return localStorage.getItem('gemini_api_key') || ''; }
function setApiKey(key) { localStorage.setItem('gemini_api_key', key); }

document.addEventListener('DOMContentLoaded', () => {
    const inputKey = document.getElementById('gemini-api-key');
    const btnSaveKey = document.getElementById('btn-save-api-key');
    if (inputKey) inputKey.value = getApiKey();
    if (btnSaveKey) {
        btnSaveKey.addEventListener('click', () => {
            const key = inputKey.value.trim();
            if (key) {
                setApiKey(key);
                alert('Chave API salva com sucesso!');
            }
        });
    }
});

function getBase64Data(imgEl) {
    const canvas = document.createElement('canvas');
    canvas.width = imgEl.naturalWidth || imgEl.width;
    canvas.height = imgEl.naturalHeight || imgEl.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
}

async function handleCustomPrompt() {
    const text = studioChatInput.value.trim();
    if (!text || !geminiOriginalImage) return;
    
    studioChatInput.value = '';
    addChatMessage('user', text);
    showStudioLoading(true, 'A IA está processando sua imagem...');
    
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('fundo') || lowerText.includes('transparente') || lowerText.includes('tirar')) {
        performBgRemoval(geminiOriginalImage, () => {
            showStudioLoading(false);
            addChatMessage('assistant', 'Removi o fundo da imagem utilizando IA nativa!');
        });
        return;
    }
    
    const apiKey = getApiKey();
    if (!apiKey) {
        showStudioLoading(false);
        addChatMessage('assistant', 'Erro: Chave API do Gemini não configurada. Insira sua chave no painel.');
        return;
    }

    try {
        const base64Image = getBase64Data(geminiOriginalImage);
        const requestBody = {
            contents: [{
                parts: [
                    { text: 'Aja como um assistente de edição de imagem profissional. Baseado na requisição do usuário, determine quais ajustes de filtros css devem ser aplicados. RESPONDA SOMENTE COM UM JSON. Filtros disponíveis (todos de 0 a 200, exceto hueRotate que é 0 a 360, grayscale/invert/sepia 0 a 100). Default é 100 para brilho, contraste, saturação. 0 para o resto. Requisição: "' + text + '"' },
                    { inline_data: { mime_type: 'image/jpeg', data: base64Image } }
                ]
            }],
            generationConfig: {
                response_mime_type: 'application/json',
                response_schema: {
                    type: 'OBJECT',
                    properties: {
                        brightness: { type: 'NUMBER', description: '0 to 200' },
                        contrast: { type: 'NUMBER', description: '0 to 200' },
                        saturation: { type: 'NUMBER', description: '0 to 200' },
                        blur: { type: 'NUMBER', description: '0 to 10' },
                        grayscale: { type: 'NUMBER', description: '0 to 100' },
                        invert: { type: 'NUMBER', description: '0 to 100' },
                        sepia: { type: 'NUMBER', description: '0 to 100' },
                        hueRotate: { type: 'NUMBER', description: '0 to 360' },
                        mensagem: { type: 'STRING', description: 'Mensagem para o usuario sobre o que foi feito' }
                    }
                }
            }
        };

        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        
        if (data.error) throw new Error(data.error.message);
        
        const contentStr = data.candidates[0].content.parts[0].text;
        const result = JSON.parse(contentStr);
        
        if (result.brightness !== undefined) geminiFilters.brightness = result.brightness;
        if (result.contrast !== undefined) geminiFilters.contrast = result.contrast;
        if (result.saturation !== undefined) geminiFilters.saturation = result.saturation;
        if (result.blur !== undefined) geminiFilters.blur = result.blur;
        if (result.grayscale !== undefined) geminiFilters.grayscale = result.grayscale;
        if (result.invert !== undefined) geminiFilters.invert = result.invert;
        if (result.sepia !== undefined) geminiFilters.sepia = result.sepia;
        if (result.hueRotate !== undefined) geminiFilters.hueRotate = result.hueRotate;
        
        updateSlidersUI();
        redrawGeminiCanvas();
        showStudioLoading(false);
        addChatMessage('assistant', result.mensagem || 'Filtros aplicados com sucesso pela IA!');
        
    } catch (e) {
        console.error(e);
        showStudioLoading(false);
        addChatMessage('assistant', 'Falha na comunicação com o Gemini: ' + e.message);
    }
}
"""

new_lines = []
i = 0
while i < len(lines):
    if i == 1992:
        new_lines.append(new_bg + '\n')
        i = 2069
    elif i == 2281:
        new_lines.append(new_prompt + '\n')
        i = 2396
    else:
        new_lines.append(lines[i])
        i += 1

with open('C:/Antigravity Projetos/Arte Ideal/web_designer/script.js', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('Success')
