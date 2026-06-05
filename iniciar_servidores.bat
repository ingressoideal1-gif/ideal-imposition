@echo off
title Iniciando Servidores - Ideal Imposition
echo ==============================================
echo Iniciando Servidores do Ideal Imposition...
echo ==============================================

cd /d imposicao

:: Detectar executavel do Python (venv ou global)
set PYTHON_EXE=python
if exist venv\Scripts\python.exe (
    set PYTHON_EXE=venv\Scripts\python.exe
    echo Utilizando ambiente virtual (venv).
) else (
    echo Ambiente virtual nao detectado. Utilizando Python global.
)

echo.
echo [1/1] Iniciando Agente de Impressao Local (local_print_agent.py) na porta 9000...
start "Agente de Impressao - Porta 9000" %PYTHON_EXE% local_print_agent.py

echo.
echo Agente de Impressao iniciado na porta 9000.
echo Acesse a aplicacao online em: https://ideal-arte-e64f6.web.app
echo Pressione qualquer tecla para fechar este assistente...
pause > nul
