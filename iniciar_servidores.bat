@echo off
title Iniciando Servidores - Ideal Imposition
echo ==============================================
echo Iniciando Servidores do Ideal Imposition...
echo ==============================================

:: Detectar executavel do Python (venv ou global)
set PYTHON_EXE=python
if exist venv\Scripts\python.exe (
    set PYTHON_EXE=venv\Scripts\python.exe
    echo Utilizando ambiente virtual (venv).
) else (
    echo Ambiente virtual nao detectado. Utilizando Python global.
)

echo.
echo [1/2] Iniciando API Principal (app.py) na porta 8000...
start "API Principal - Porta 8000" %PYTHON_EXE% app.py

echo.
echo [2/2] Iniciando Agente de Impressao Local (local_print_agent.py) na porta 9000...
start "Agente de Impressao - Porta 9000" %PYTHON_EXE% local_print_agent.py

echo.
echo Servidores iniciados em janelas separadas.
echo Acesse http://localhost:8000 no seu navegador.
echo Pressione qualquer tecla para fechar este assistente...
pause > nul
