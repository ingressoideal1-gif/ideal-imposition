import json
import shutil
import tempfile
import os
import uvicorn
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

import print_service
import ppd_parser
from engine import ImpositionConfig, ImpositionEngine
import db
from fastapi.responses import FileResponse, JSONResponse

app = FastAPI(title="Local Print Agent", description="Agente local para impressão direta e gerenciamento de PPDs.")

# IMPORTANTE: Configurar CORS para permitir que o site online acesse este agente local.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Para desenvolvimento, permitimos *. Em produção, restringir ao domínio.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "running", "message": "Local Print Agent está ativo"}

@app.get("/api/printers")
def list_printers():
    return print_service.get_printers()

@app.get("/api/ppds")
def list_ppds():
    return print_service.get_ppd_list()

@app.post("/api/ppds/upload")
async def upload_ppd(file: UploadFile = File(...)):
    filename = file.filename
    if not filename.lower().endswith('.ppd'):
        raise HTTPException(status_code=400, detail="Apenas arquivos .ppd são suportados")
    
    dest_path = os.path.join(print_service.PPD_DIR, filename)
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        parser = ppd_parser.PPDParser(dest_path)
        return {
            "filename": filename,
            "nick_name": parser.nick_name,
            "model_name": parser.model_name,
            "options": parser.options
        }
    except Exception as e:
        if os.path.exists(dest_path):
            os.remove(dest_path)
        raise HTTPException(status_code=500, detail=f"Erro ao processar PPD: {e}")

@app.get("/api/printers/ppd-map")
def get_ppd_map():
    return print_service.load_printer_ppd_map()

@app.post("/api/printers/ppd-map")
async def save_ppd_map(request: Request):
    mapping = await request.json()
    print_service.save_printer_ppd_map(mapping)
    return {"status": "success"}

@app.post("/api/print/submit")
async def submit_print_job(
    file: UploadFile = File(...),
    printer_name: str = Form(...),
    options: str = Form(...) # JSON string
):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        shutil.copyfileobj(file.file, tmp)
        pdf_path = tmp.name

    try:
        mapping = print_service.load_printer_ppd_map()
        ppd_file = mapping.get(printer_name)
        
        selected_codes = {}
        if ppd_file:
            ppd_path = os.path.join(print_service.PPD_DIR, ppd_file)
            if os.path.exists(ppd_path):
                parser = ppd_parser.PPDParser(ppd_path)
                selected_options = json.loads(options)
                for opt_key, choice_key in selected_options.items():
                    if opt_key in parser.options and choice_key in parser.options[opt_key]["choices"]:
                        selected_codes[opt_key] = parser.options[opt_key]["choices"][choice_key]["code"]
        
        success, msg = print_service.send_print_job(
            printer_name=printer_name,
            pdf_path=pdf_path,
            selected_options_codes=selected_codes,
            job_title=f"Ideal Imposition - {os.path.basename(file.filename or 'print')}"
        )
        if not success:
            raise HTTPException(status_code=500, detail=msg)
        return {"status": "success", "message": msg}
    finally:
        if os.path.exists(pdf_path):
            os.remove(pdf_path)

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

        formato = data.get("formato") or db.get_formato(data.get("formato_id"))
        saida   = data.get("saida") or db.get_saida(data.get("saida_id"))
        numeracao = data.get("numeracao") or (db.get_numeracao(data.get("numeracao_id")) if data.get("numeracao_id") else None)

        if not formato:
            raise HTTPException(status_code=400, detail="Formato não encontrado.")
        if not saida:
            raise HTTPException(status_code=400, detail="Saída não encontrada.")

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
    print("Iniciando Local Print Agent na porta 9000...")
    uvicorn.run("local_print_agent:app", host="127.0.0.1", port=9000, reload=True, reload_excludes=["venv/*"])
