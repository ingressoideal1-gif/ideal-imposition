import re

with open('frontend/index.html', 'r', encoding='latin-1') as f:
    content = f.read()

svg_upload_block = '''                        <div class="form-group">
                            <label>Desenho Vetorial (SVG)</label>
                            <div style="display:flex; gap:10px; align-items: center; flex-wrap: wrap;">
                                <label class="btn btn-sm btn-secondary" for="num-svg-file" style="margin: 0; cursor: pointer;">
                                    🎨 Upload SVG
                                </label>
                                <input type="file" id="num-svg-file" accept=".svg" style="display:none">
                                <button class="btn btn-sm btn-ghost btn-danger" id="btn-remove-num-svg" style="display:none; padding: 4px 8px;" onclick="clearNumSvgFile()">❌ Remover</button>
                                <span id="num-svg-file-name" style="font-size:0.82rem; color:var(--text-dim)"></span>
                            </div>
                        </div>'''

pdf_upload_block = '''                        <div class="form-group">
                            <label>Desenho Vetorial (SVG)</label>
                            <div style="display:flex; gap:10px; align-items: center; flex-wrap: wrap;">
                                <label class="btn btn-sm btn-secondary" for="num-svg-file" style="margin: 0; cursor: pointer;">
                                    🎨 Upload SVG
                                </label>
                                <input type="file" id="num-svg-file" accept=".svg" style="display:none">
                                <button class="btn btn-sm btn-ghost btn-danger" id="btn-remove-num-svg" style="display:none; padding: 4px 8px;" onclick="clearNumSvgFile()">❌ Remover</button>
                                <span id="num-svg-file-name" style="font-size:0.82rem; color:var(--text-dim)"></span>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Arquivo PDF</label>
                            <div style="display:flex; gap:10px; align-items: center; flex-wrap: wrap;">
                                <label class="btn btn-sm btn-secondary" for="num-pdf-file" style="margin: 0; cursor: pointer;">
                                    📄 Upload PDF
                                </label>
                                <input type="file" id="num-pdf-file" accept=".pdf" style="display:none">
                                <button class="btn btn-sm btn-ghost btn-danger" id="btn-remove-num-pdf" style="display:none; padding: 4px 8px;" onclick="clearNumPdfFile()">❌ Remover</button>
                                <span id="num-pdf-file-name" style="font-size:0.82rem; color:var(--text-dim)"></span>
                            </div>
                        </div>'''

content = content.replace(svg_upload_block.encode('utf-8').decode('latin-1'), pdf_upload_block.encode('utf-8').decode('latin-1'))

add_svg_btn = '''<button class="btn btn-sm btn-secondary" onclick="addElement('SVG')">🎨 SVG</button>'''
add_pdf_btn = '''<button class="btn btn-sm btn-secondary" onclick="addElement('SVG')">🎨 SVG</button>
                            <button class="btn btn-sm btn-secondary" onclick="addElement('PDF')">📄 PDF</button>'''

content = content.replace(add_svg_btn.encode('utf-8').decode('latin-1'), add_pdf_btn.encode('utf-8').decode('latin-1'))

with open('frontend/index.html', 'w', encoding='latin-1') as f:
    f.write(content)
print("Updated index.html")
