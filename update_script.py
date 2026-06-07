import re

with open('frontend/script.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Event listener
svg_listener = '''    const svgInp = document.getElementById('num-svg-file');
    if (svgInp && !svgInp._listenerSet) {
        svgInp.addEventListener('change', e => {
            if (e.target.files[0]) loadNumSvgFile(e.target.files[0]);
        });
        svgInp._listenerSet = true;
    }'''

pdf_listener = svg_listener + '''

    const pdfInp = document.getElementById('num-pdf-file');
    if (pdfInp && !pdfInp._listenerSet) {
        pdfInp.addEventListener('change', e => {
            if (e.target.files[0]) loadNumPdfFile(e.target.files[0]);
        });
        pdfInp._listenerSet = true;
    }'''

content = content.replace(svg_listener, pdf_listener)

# 2. clearNumPdfFile and loadNumPdfFile
svg_functions = '''        toast('Arquivo SVG carregado com sucesso!', 'success');
    } catch (ex) {
        console.error(ex);
        toast('Erro ao carregar SVG: ' + ex.message, 'error');
    }
}'''

pdf_functions = svg_functions + '''

window.clearNumPdfFile = function () {
    state.numPdfContent = null;
    state.numPdfFilename = "";
    const btn = document.getElementById('btn-remove-num-pdf');
    const name = document.getElementById('num-pdf-file-name');
    const inp = document.getElementById('num-pdf-file');
    if (btn) btn.style.display = 'none';
    if (name) name.textContent = '';
    if (inp) inp.value = '';
    drawCanvas();
};

async function loadNumPdfFile(file) {
    try {
        state.numPdfFilename = file.name;
        const reader = new FileReader();
        reader.onload = e => {
            state.numPdfContent = e.target.result;
            drawCanvas();
        };
        reader.readAsDataURL(file);

        const btn = document.getElementById('btn-remove-num-pdf');
        const name = document.getElementById('num-pdf-file-name');
        if (btn) btn.style.display = 'inline-flex';
        if (name) name.textContent = '📄 ' + file.name;

        toast('Arquivo PDF carregado com sucesso!', 'success');
    } catch (ex) {
        console.error(ex);
        toast('Erro ao carregar PDF: ' + ex.message, 'error');
    }
}'''

content = content.replace(svg_functions, pdf_functions)

# 3. addElement PDF
add_element_svg = '''if (type === 'SVG') Object.assign(base, { width_mm: 20, height_mm: 20, svg_content: state.numSvgContent || '' });'''
add_element_pdf = add_element_svg + '''\n    if (type === 'PDF') Object.assign(base, { pdf_content: state.numPdfContent || '' });'''

content = content.replace(add_element_svg, add_element_pdf)

# 4. typeLabel and typeBadge
type_label_old = '''const typeLabel = { TEXT: '📝 Numeração', FIXED: '📝 Texto Fixo', QR: '📱 QR Code', BARCODE: '🛒 Barcode', SVG: '🎨 SVG', PICOTE: '✂️ Picote' };'''
type_label_new = '''const typeLabel = { TEXT: '📝 Numeração', FIXED: '📝 Texto Fixo', QR: '📱 QR Code', BARCODE: '🛒 Barcode', SVG: '🎨 SVG', PICOTE: '✂️ Picote', PDF: '📄 PDF' };'''

type_badge_old = '''const typeBadge = { TEXT: 'badge-blue', FIXED: 'badge-amber', QR: 'badge-teal', BARCODE: 'badge-purple', SVG: 'badge-green', PICOTE: 'badge-danger' };'''
type_badge_new = '''const typeBadge = { TEXT: 'badge-blue', FIXED: 'badge-amber', QR: 'badge-teal', BARCODE: 'badge-purple', SVG: 'badge-green', PICOTE: 'badge-danger', PDF: 'badge-gray' };'''

content = content.replace(type_label_old, type_label_new)
content = content.replace(type_badge_old, type_badge_new)

# 5. drawVdpElements PDF
draw_svg = '''                    } else if (el.type === 'SVG') {
                        const sz_w = (el.width_mm || 20) * MM2PT * scale;
                        const sz_h = (el.height_mm || 20) * MM2PT * scale;
                        const svgImg = currentNum && currentNum._svgImage;
                        if (svgImg) {
                            ctx.drawImage(svgImg, 0, 0, sz_w, sz_h);
                        } else {
                            ctx.strokeStyle = color;
                            ctx.lineWidth = 0.5 * scale;
                            ctx.strokeRect(0, 0, sz_w, sz_h);
                            ctx.font = ${Math.max(5, sz_h * 0.15)}px Inter, sans-serif;
                            ctx.fillStyle = color;
                            ctx.textAlign = 'center';
                            ctx.fillText('SVG', sz_w / 2, sz_h / 2 + (sz_h * 0.05));
                            ctx.textAlign = 'left';
                        }
                    }'''
draw_pdf = draw_svg + ''' else if (el.type === 'PDF') {
                        const sz_w = 40 * scale; // placeholder size for canvas preview
                        const sz_h = 40 * scale;
                        ctx.strokeStyle = color;
                        ctx.lineWidth = 0.5 * scale;
                        ctx.strokeRect(0, 0, sz_w, sz_h);
                        ctx.font = ${Math.max(5, sz_h * 0.15)}px Inter, sans-serif;
                        ctx.fillStyle = color;
                        ctx.textAlign = 'center';
                        ctx.fillText('PDF', sz_w / 2, sz_h / 2 + (sz_h * 0.05));
                        ctx.textAlign = 'left';
                    }'''

content = content.replace(draw_svg, draw_pdf)

with open('frontend/script.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated script.js")
