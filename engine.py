import math
import io
import fitz       # PyMuPDF
import qrcode
from PIL import Image

MM2PT = 2.8346   # 1mm em pontos PDF


def _hex_to_rgb(hex_color: str) -> tuple[float, float, float]:
    """Converte #RRGGBB para (r, g, b) normalizados 0-1."""
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = h[0]*2 + h[1]*2 + h[2]*2
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return r / 255.0, g / 255.0, b / 255.0


def _generate_qr(data: str, color_hex: str = "#000000") -> bytes:
    """Gera QR Code PNG em bytes."""
    fill_r, fill_g, fill_b = [int(x * 255) for x in _hex_to_rgb(color_hex)]
    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_L, box_size=10, border=0)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color=(fill_r, fill_g, fill_b), back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _generate_barcode(data: str, width_mm: float, height_mm: float, color_hex: str = "#000000", barcode_format: str = "code128") -> bytes:
    """Gera o código de barras como imagem PNG em bytes usando coloração nativa."""
    try:
        import barcode
        from barcode.writer import ImageWriter
    except ImportError:
        raise ImportError("Instale: pip install python-barcode[images]")

    options = {
        "write_text": False,
        "module_height": 15.0,
        "quiet_zone": 0,
        "dpi": 300,
        "foreground": color_hex,
        "background": "white",
    }

    # Assegurar que o formato está em minúsculas
    fmt = (barcode_format or "code128").lower()

    # Pré-processamento e formatação de dados para simbologias numéricas estritas
    if fmt in ("ean13", "ean8", "upca", "itf"):
        # Manter apenas dígitos
        clean_data = "".join(c for c in data if c.isdigit())
        if not clean_data:
            clean_data = "0"
            
        if fmt == "ean13":
            # EAN-13 precisa de 12 dígitos (o 13º dígito de verificação é calculado pela biblioteca)
            if len(clean_data) < 12:
                clean_data = clean_data.zfill(12)
            elif len(clean_data) > 13:
                clean_data = clean_data[:12]
        elif fmt == "ean8":
            # EAN-8 precisa de 7 dígitos (o 8º dígito de verificação é calculado pela biblioteca)
            if len(clean_data) < 7:
                clean_data = clean_data.zfill(7)
            elif len(clean_data) > 8:
                clean_data = clean_data[:7]
        elif fmt == "upca":
            # UPC-A precisa de 11 dígitos (o 12º dígito de verificação é calculado pela biblioteca)
            if len(clean_data) < 11:
                clean_data = clean_data.zfill(11)
            elif len(clean_data) > 12:
                clean_data = clean_data[:11]
        elif fmt == "itf":
            # ITF (Interleaved 2 of 5) exige comprimento par de dígitos
            if len(clean_data) % 2 != 0:
                clean_data = "0" + clean_data
                
        data = clean_data

    code = barcode.get(fmt, data, writer=ImageWriter())
    buf = io.BytesIO()
    code.write(buf, options)
    return buf.getvalue()


def _rotate_rect(rect: fitz.Rect, angle: int, page: fitz.Page) -> tuple[fitz.Rect, fitz.Matrix]:
    """Retorna a matriz de transformação para rotação em torno do centro do rect."""
    cx = (rect.x0 + rect.x1) / 2
    cy = (rect.y0 + rect.y1) / 2
    mat = fitz.Matrix(1, 0, 0, 1, 0, 0)
    if angle != 0:
        mat = fitz.Matrix(1, 0, 0, 1, -cx, -cy)
        mat = mat * fitz.Matrix(math.cos(math.radians(angle)), -math.sin(math.radians(angle)),
                                math.sin(math.radians(angle)),  math.cos(math.radians(angle)), 0, 0)
        mat = mat * fitz.Matrix(1, 0, 0, 1, cx, cy)
    return mat


class ImpositionConfig:
    def __init__(self,
                 base_file: str,
                 out_pdf: str,
                 formato: dict,
                 numeracao: dict | None,
                 saida: dict,
                 seq_start: int = 1,
                 seq_end: int = 100,
                 seq_increment: int = 1,
                 layout_schema: str = "sequential",
                 csv_data: list[dict] | None = None):

        self.base_file = base_file
        self.out_pdf = out_pdf
        self.saida = saida
        self.layout_schema = layout_schema

        # Formato (tamanho do item + grade + gaps)
        self.item_w = formato["width_mm"] * MM2PT
        self.item_h = formato["height_mm"] * MM2PT
        self.cols = formato["cols"]
        self.rows = formato["rows"]
        self.gap_h = formato.get("gap_h_mm", 0) * MM2PT   # espaço horizontal entre cols
        self.gap_v = formato.get("gap_v_mm", 0) * MM2PT   # espaço vertical entre rows
        self.offset_h = formato.get("offset_h_mm", 0) * MM2PT # deslocamento horizontal da arte
        self.offset_v = formato.get("offset_v_mm", 0) * MM2PT # deslocamento vertical da arte

        # Folha de saída
        self.sheet_w = saida["width_mm"] * MM2PT
        self.sheet_h = saida["height_mm"] * MM2PT

        # Sequência
        self.seq_start = seq_start
        self.seq_end = seq_end
        self.seq_increment = seq_increment
        self.csv_data = csv_data
        if csv_data:
            self.total_items = len(csv_data)
        else:
            self.total_items = math.floor((seq_end - seq_start) / seq_increment) + 1

        # Elementos VDP da numeração
        self.elements = []
        if numeracao and "elements" in numeracao:
            for el in numeracao["elements"]:
                e = dict(el)
                # Converter mm → pt para todos os campos de posição/tamanho
                e["_x"] = e.get("x_mm", 0) * MM2PT
                e["_y"] = e.get("y_mm", 0) * MM2PT
                if "size_mm" in e:
                    e["_size"] = e["size_mm"] * MM2PT
                if "width_mm" in e and e["type"] == "BARCODE":
                    e["_w"] = e["width_mm"] * MM2PT
                    e["_h"] = e.get("height_mm", 10) * MM2PT
                self.elements.append(e)


class ImpositionEngine:
    def __init__(self, config: ImpositionConfig):
        self.cfg = config

    def _load_base_as_pdf(self) -> fitz.Document:
        """Abre o arquivo base (PDF, JPG, PNG) como documento fitz."""
        f = self.cfg.base_file.lower()
        if f.endswith(".pdf"):
            return fitz.open(self.cfg.base_file)
        else:
            # Imagem → converter para PDF temporário em memória
            img = Image.open(self.cfg.base_file)
            
            # Obter o DPI da imagem (usando 300 como padrão padrão de impressão)
            dpi = img.info.get("dpi", (300, 300))
            if not isinstance(dpi, tuple) or len(dpi) < 2 or dpi[0] <= 0 or dpi[1] <= 0:
                dpi = (300, 300)
                
            buf = io.BytesIO()
            # Salvar usando a resolução correta para obter as dimensões físicas corretas no PDF
            img.save(buf, format="PDF", resolution=dpi[0])
            buf.seek(0)
            return fitz.open(stream=buf.read(), filetype="pdf")

    def _render_element(self, page: fitz.Page, el: dict, cell_x0: float, cell_y0: float, val: int, csv_row: dict | None = None):
        """Renderiza um elemento VDP na posição absoluta da célula."""
        el_x = cell_x0 + el["_x"]
        el_y = cell_y0 + el["_y"]
        color = el.get("color", "#000000")
        rgb = _hex_to_rgb(color)
        angle = el.get("rotation", 0)

        # Montar valor string
        if el.get("fixed", False):
            val_str = str(el.get("fixed_value", ""))
        elif el.get("source") == "database" and csv_row is not None:
            col_name = el.get("csv_column", "")
            val_str = str(csv_row.get(col_name, ""))
        else:
            pad = int(el.get("pad", 0) or 0)
            prefix = str(el.get("prefix", "") or "")
            suffix = str(el.get("suffix", "") or "")
            raw = str(val).zfill(pad) if pad > 0 else str(val)
            val_str = f"{prefix}{raw}{suffix}"

        t = el["type"]

        if t in ("TEXT", "FIXED"):
            font_size = el.get("font_size", 12)
            font_name = el.get("font_name", "helv")
            # Ponto de inserção Y em PyMuPDF é baseline; ajustamos pela font_size
            if angle != 0:
                # Para rotação, usamos insert_text com morph
                origin = fitz.Point(el_x, el_y + font_size)
                pivot = fitz.Point(el_x, el_y + font_size / 2)
                page.insert_text(
                    origin,
                    val_str,
                    fontsize=font_size,
                    fontname=font_name,
                    color=rgb,
                    morph=(pivot, fitz.Matrix(math.cos(math.radians(angle)), -math.sin(math.radians(angle)),
                                              math.sin(math.radians(angle)),  math.cos(math.radians(angle))))
                )
            else:
                page.insert_text(
                    (el_x, el_y + font_size),
                    val_str,
                    fontsize=font_size,
                    fontname=font_name,
                    color=rgb,
                )

        elif t == "QR":
            size = el.get("_size", 42.5)
            qr_bytes = _generate_qr(val_str, color)
            rect = fitz.Rect(el_x, el_y, el_x + size, el_y + size)
            if angle != 0:
                mat = _rotate_rect(rect, angle, page)
                page.insert_image(rect, stream=qr_bytes, rotate=angle)
            else:
                page.insert_image(rect, stream=qr_bytes)

        elif t == "BARCODE":
            w_pt = el.get("_w", 60 * MM2PT)
            h_pt = el.get("_h", 12 * MM2PT)
            w_mm = el.get("width_mm", 60)
            h_mm = el.get("height_mm", 12)
            bc_format = el.get("barcode_format", "code128")
            bc_bytes = _generate_barcode(val_str, w_mm, h_mm, color, bc_format)
            rect = fitz.Rect(el_x, el_y, el_x + w_pt, el_y + h_pt)
            page.insert_image(rect, stream=bc_bytes, rotate=angle, keep_proportion=False)

        elif t == "SVG":
            svg_content = el.get("svg_content") or ""
            if svg_content:
                w_pt = el.get("width_mm", 20) * MM2PT
                h_pt = el.get("height_mm", 20) * MM2PT
                rect = fitz.Rect(el_x, el_y, el_x + w_pt, el_y + h_pt)
                try:
                    svg_doc = fitz.open(stream=svg_content.encode("utf-8"), filetype="svg")
                    pdf_bytes = svg_doc.convert_to_pdf()
                    pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                    page.show_pdf_page(rect, pdf_doc, 0, keep_proportion=False, rotate=angle)
                except Exception as ex:
                    print(f"Erro ao impor SVG: {ex}")

    def process(self):
        cfg = self.cfg
        cols = cfg.cols
        rows = cfg.rows
        poses_per_sheet = cols * rows

        # Calcular área total usada na folha (itens + gaps)
        used_w = cols * cfg.item_w + (cols - 1) * cfg.gap_h
        used_h = rows * cfg.item_h + (rows - 1) * cfg.gap_v

        if used_w > cfg.sheet_w or used_h > cfg.sheet_h:
            err = (
                f"O formato de entrada (Matriz {cols}×{rows}) não cabe na folha de saída! "
                f"Necessário: {used_w/MM2PT:.1f}×{used_h/MM2PT:.1f}mm. "
                f"Disponível: {cfg.sheet_w/MM2PT:.1f}×{cfg.sheet_h/MM2PT:.1f}mm."
            )
            raise ValueError(err)

        # Centralizar bloco na folha
        start_x = (cfg.sheet_w - used_w) / 2
        start_y = (cfg.sheet_h - used_h) / 2

        total_sheets = math.ceil(cfg.total_items / poses_per_sheet)

        doc_out = fitz.open()
        doc_base = self._load_base_as_pdf()
        page_base = doc_base[0]
        base_w = page_base.rect.width
        base_h = page_base.rect.height

        for S in range(total_sheets):
            out_page = doc_out.new_page(width=cfg.sheet_w, height=cfg.sheet_h)

            for row in range(rows):
                for col in range(cols):
                    P = row * cols + col

                    if cfg.layout_schema == "cut_stack":
                        item_index = (P * total_sheets) + S
                    elif cfg.layout_schema == "sequential":
                        item_index = (S * poses_per_sheet) + P
                    elif cfg.layout_schema == "step_repeat":
                        item_index = S
                    else:
                        item_index = (S * poses_per_sheet) + P

                    if item_index >= cfg.total_items:
                        continue

                    # Posição da célula (canto superior esquerdo)
                    cell_x0 = start_x + col * (cfg.item_w + cfg.gap_h)
                    cell_y0 = start_y + row * (cfg.item_h + cfg.gap_v)
                    cell_x1 = cell_x0 + cfg.item_w
                    cell_y1 = cell_y0 + cfg.item_h

                    # Arte em 100% escala original, centralizada na célula + offset
                    # Centralizar: deslocar pelo delta entre tamanho do item e tamanho original da arte
                    center_x = cell_x0 + (cfg.item_w - base_w) / 2
                    center_y = cell_y0 + (cfg.item_h - base_h) / 2

                    # Aplicar offset (positivo H = direita, positivo V = para cima → negar Y no PDF)
                    art_x0 = center_x + cfg.offset_h
                    art_y0 = center_y - cfg.offset_v
                    art_x1 = art_x0 + base_w
                    art_y1 = art_y0 + base_h

                    rect_art = fitz.Rect(art_x0, art_y0, art_x1, art_y1)
                    out_page.show_pdf_page(rect_art, doc_base, 0)

                    # Renderizar elementos VDP
                    val = cfg.seq_start + (item_index * cfg.seq_increment)
                    csv_row = cfg.csv_data[item_index] if cfg.csv_data else None
                    for el in cfg.elements:
                        self._render_element(out_page, el, cell_x0, cell_y0, val, csv_row)

        doc_out.save(cfg.out_pdf, garbage=3, deflate=True)
        doc_base.close()
        doc_out.close()
        print(f"[engine] Gerado: {cfg.out_pdf} ({total_sheets} folha(s), {cfg.total_items} itens)")
