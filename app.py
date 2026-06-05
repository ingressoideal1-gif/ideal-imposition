import json
import shutil
import tempfile
import os
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from engine import ImpositionConfig, ImpositionEngine
import db

app = FastAPI(title="Ideal Imposition API", description="Sistema de Imposição Gráfica com Dados Variáveis")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/app", StaticFiles(directory="frontend", html=True), name="frontend")

# ─── ROTAS UTILITÁRIAS ────────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
def root_redirect():
    """Redireciona a raiz para o frontend."""
    return RedirectResponse(url="/app/index.html")

@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    """Retorna 204 para evitar erros de favicon no console."""
    from fastapi.responses import Response
    return Response(status_code=204)

# ─── FORMATOS ─────────────────────────────────────────────────────────────────

@app.get("/api/formatos")
def list_formatos():
    return db.get_formatos()

@app.get("/api/formatos/{fmt_id}")
def get_formato(fmt_id: str):
    f = db.get_formato(fmt_id)
    if not f:
        raise HTTPException(status_code=404, detail="Formato não encontrado")
    return f

@app.post("/api/formatos")
async def create_formato(request: Request):
    data = await request.json()
    new_id = db.add_formato(data)
    return {"id": new_id, "status": "success"}

@app.put("/api/formatos/{fmt_id}")
async def update_formato(fmt_id: str, request: Request):
    data = await request.json()
    ok = db.update_formato(fmt_id, data)
    if not ok:
        raise HTTPException(status_code=404, detail="Formato não encontrado")
    return {"status": "success"}

@app.delete("/api/formatos/{fmt_id}")
def delete_formato(fmt_id: str):
    db.delete_formato(fmt_id)
    return {"status": "success"}

# ─── NUMERAÇÕES ───────────────────────────────────────────────────────────────

@app.get("/api/numeracoes")
def list_numeracoes():
    return db.get_numeracoes()

@app.get("/api/numeracoes/{num_id}")
def get_numeracao(num_id: str):
    n = db.get_numeracao(num_id)
    if not n:
        raise HTTPException(status_code=404, detail="Numeração não encontrada")
    return n

@app.post("/api/numeracoes")
async def create_numeracao(request: Request):
    data = await request.json()
    new_id = db.add_numeracao(data)
    return {"id": new_id, "status": "success"}

@app.put("/api/numeracoes/{num_id}")
async def update_numeracao(num_id: str, request: Request):
    data = await request.json()
    ok = db.update_numeracao(num_id, data)
    if not ok:
        raise HTTPException(status_code=404, detail="Numeração não encontrada")
    return {"status": "success"}

@app.delete("/api/numeracoes/{num_id}")
def delete_numeracao(num_id: str):
    db.delete_numeracao(num_id)
    return {"status": "success"}

# ─── SAÍDAS ───────────────────────────────────────────────────────────────────

@app.get("/api/saidas")
def list_saidas():
    return db.get_saidas()

@app.get("/api/saidas/{sai_id}")
def get_saida(sai_id: str):
    s = db.get_saida(sai_id)
    if not s:
        raise HTTPException(status_code=404, detail="Saída não encontrada")
    return s

@app.post("/api/saidas")
async def create_saida(request: Request):
    data = await request.json()
    new_id = db.add_saida(data)
    return {"id": new_id, "status": "success"}

@app.put("/api/saidas/{sai_id}")
async def update_saida(sai_id: str, request: Request):
    data = await request.json()
    ok = db.update_saida(sai_id, data)
    if not ok:
        raise HTTPException(status_code=404, detail="Saída não encontrada")
    return {"status": "success"}

@app.delete("/api/saidas/{sai_id}")
def delete_saida(sai_id: str):
    db.delete_saida(sai_id)
    return {"status": "success"}

# ─── IMPOSIÇÃO ────────────────────────────────────────────────────────────────

@app.post("/api/impose")
async def impose_file(
    file: UploadFile = File(...),
    csv_file: UploadFile | None = File(None),
    payload: str = Form(...)
):
    try:
        import csv
        import io
        data = json.loads(payload)

        formato = db.get_formato(data["formato_id"])
        saida   = db.get_saida(data["saida_id"])
        numeracao = db.get_numeracao(data.get("numeracao_id")) if data.get("numeracao_id") else None

        if not formato:
            raise HTTPException(status_code=400, detail="Formato não encontrado.")
        if not saida:
            raise HTTPException(status_code=400, detail="Saída não encontrada.")

        # Ler e parsear CSV se fornecido, caso contrário usar o CSV embutido na numeração se disponível
        csv_data = None
        if csv_file and csv_file.filename:
            content = await csv_file.read()
            try:
                decoded = content.decode("utf-8-sig")
            except UnicodeDecodeError:
                decoded = content.decode("latin-1")
            
            reader = csv.DictReader(io.StringIO(decoded))
            csv_data = [row for row in reader]
        elif numeracao and "csv_data" in numeracao and numeracao["csv_data"]:
            csv_data = numeracao["csv_data"]

        # Detectar extensão do arquivo enviado
        original_name = file.filename or "upload.pdf"
        ext = os.path.splitext(original_name)[1].lower() or ".pdf"
        if ext not in [".pdf", ".jpg", ".jpeg", ".png"]:
            raise HTTPException(status_code=400, detail=f"Formato de arquivo não suportado: {ext}")

        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp_in:
            shutil.copyfileobj(file.file, tmp_in)
            base_file_path = tmp_in.name

        out_pdf_path = base_file_path.rsplit(".", 1)[0] + "_imposed.pdf"

        config = ImpositionConfig(
            base_file=base_file_path,
            out_pdf=out_pdf_path,
            formato=formato,
            numeracao=numeracao,
            saida=saida,
            seq_start=data.get("seq_start", 1),
            seq_end=data.get("seq_end", 100),
            seq_increment=data.get("seq_increment", 1),
            layout_schema=data.get("schema", "sequential"),
            csv_data=csv_data,
        )

        engine = ImpositionEngine(config)
        engine.process()

        suffix_fn = f"CSV_{len(csv_data)}" if csv_data else f"{data.get('seq_start', 1)}-{data.get('seq_end', 100)}"

        return FileResponse(
            out_pdf_path,
            media_type="application/pdf",
            filename=f"VDP_{formato['name'].replace(' ', '_')}_{suffix_fn}.pdf"
        )

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    db.init_db()
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True, reload_excludes=["venv/*"])
