# Regra Geral de Centralização de Artes (PDF, JPG, PNG, SVG)

Esta documentação detalha a regra de negócio e a lógica de programação aplicadas em todo o ecossistema do **Ideal Imposition** para assegurar que qualquer arte carregada (seja pelo frontend na área de trabalho, seja pelo backend no motor físico) seja centralizada de forma absoluta.

---

## 1. Motivação e Desafio Técnico
Ao exportar artes em PDF a partir de softwares como CorelDraw, Adobe Illustrator ou InDesign, o arquivo gerado frequentemente possui coordenadas de CropBox / MediaBox com origem deslocada (isto é, $x_0 \neq 0$ ou $y_0 \neq 0$). 
Exemplo: Um cartão de visitas de 90x50mm pode estar descrito com coordenadas físicas `Rect(100.0, 150.0, 355.12, 291.73)`.

Se o motor físico de imposição apenas ler as dimensões da página e desenhá-la sem aplicar o mapeamento de recorte (`clip`), ocorrem dois problemas graves:
1. **Deslocamento na Folha (Offset Indesejado)**: O conteúdo é transladado fisicamente na folha física, desalinhando-se das marcas de corte.
2. **Estouro de Célula**: O conteúdo transborda a célula do formato e cobre outras posições adjacentes da grade de imposição.

---

## 2. Implementação da Centralização

### A. Na Área de Trabalho e Preview (Frontend)
Quando uma arte é carregada para a área de trabalho (canvas de numeração) ou para o preview de imposição, utilizamos a biblioteca **PDF.js** para renderizar as páginas no canvas. 
* O viewport da página do PDF.js automaticamente normaliza a origem do CropBox para $(0,0)$, extraindo exatamente a largura (`viewport.width`) e altura (`viewport.height`) úteis do PDF.
* No canvas de desenho, calculamos o ponto superior esquerdo de posicionamento ($drawX$, $drawY$) aplicando a centralização clássica:

```javascript
const drawW = originalW_mm * scale;
const drawH = originalH_mm * scale;
const drawX = (canvasWidth - drawW) / 2;
const drawY = (canvasHeight - drawH) / 2;
```

---

### B. No Motor de Imposição (Backend - PyMuPDF)
No arquivo [engine.py](file:///c:/Users/Junior/.gemini/antigravity/Projetos%20Ingresso%20ideal/ideal-imposition/engine.py), ao impor as páginas individuais do PDF na grade de células da folha de saída:
1. Obtemos a largura (`base_w`) e a altura (`base_h`) da página a partir de `page_base.rect.width` e `page_base.rect.height` (que representam a área útil pós-corte do CropBox).
2. Calculamos o retângulo de destino centralizado na célula física da folha:

```python
# Posição superior esquerda da célula física
cell_x0 = start_x + col * (cfg.item_w + cfg.gap_h)
cell_y0 = start_y + row * (cfg.item_h + cfg.gap_v)

# Centralização da arte na célula
center_x = cell_x0 + (cfg.item_w - base_w) / 2
center_y = cell_y0 + (cfg.item_h - base_h) / 2

# Retângulo final da arte
art_x0 = center_x + cfg.offset_h
art_y0 = center_y - cfg.offset_v
art_x1 = art_x0 + base_w
art_y1 = art_y0 + base_h
rect_art = fitz.Rect(art_x0, art_y0, art_x1, art_y1)
```

3. **Mapeamento de Recorte Explicito (`clip`)**: Na chamada da função `show_pdf_page` do PyMuPDF, passamos explicitamente a propriedade `clip=page_base.rect` (que é o CropBox original do PDF):

```python
out_page.show_pdf_page(rect_art, doc_base, page_idx, clip=page_base.rect)
```

> [!IMPORTANT]
> A passagem de `clip=page_base.rect` força o PyMuPDF a isolar a área útil da página de origem e desenhá-la perfeitamente contida no retângulo `rect_art`, eliminando as coordenadas globais deslocadas da origem e centralizando a arte com precisão milimétrica.
