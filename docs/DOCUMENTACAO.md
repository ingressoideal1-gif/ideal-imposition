# Ideal Imposition — Documentação Técnica Completa

Bem-vindo à documentação do **Ideal Imposition**, um sistema profissional e moderno para imposição gráfica e impressão de dados variáveis (VDP).

---

## 🏗️ Arquitetura do Sistema

A aplicação é dividida de forma simples e eficiente entre uma API REST em Python no backend e um painel de editor gráfico no frontend:

```
imposicao/
├── app.py            # API FastAPI (Rotas REST, gerenciamento de arquivos e inicialização)
├── engine.py         # Motor de imposição e VDP baseado no PyMuPDF (fitz)
├── db.py             # Módulo de persistência local em arquivo JSON (database simples)
├── formats_db.json   # Banco de dados local armazenando formatos, numerações e saídas
├── requirements.txt  # Dependências do projeto (FastAPI, PyMuPDF, python-barcode, qrcode, etc)
├── venv/             # Ambiente virtual Python
├── frontend/         # Pasta pública do Frontend
│   ├── index.html    # Estrutura HTML do editor e painel
│   ├── style.css     # Estilos e design premium (esquema escuro, glassmorphism)
│   └── script.js     # Lógica do editor, manipulação do canvas, VDP e requests
└── docs/
    └── DOCUMENTACAO.md # Esta documentação técnica
```

---

## 🚀 Como Rodar o Projeto

1. Certifique-se de ter as dependências instaladas através do ambiente virtual:
   ```bash
   .\venv\Scripts\pip install -r requirements.txt
   ```
2. Inicialize o servidor uvicorn:
   ```bash
   .\venv\Scripts\python.exe app.py
   ```
3. Acesse a aplicação no seu navegador em: **`http://localhost:8000`** (redireciona automaticamente para o painel em `/app/index.html`).

---

## 📊 Mecanismo de Dados Variáveis (VDP) e Imposição

O sistema processa dinamicamente a sobreposição de dados em layouts de imposição em grade com as seguintes estratégias:

### 1. Simbologias e Elementos de VDP Suportados

*   **🔤 Numeração (TEXTO):** Renderiza dados sequenciais ou colunas de CSV. Permite customização de prefixo, sufixo, tamanho da fonte, família de fontes padrão do PDF e ajuste de zeros à esquerda (`pad` dinâmico).
*   **🔠 Texto Fixo:** Ideal para rotular informações estáticas como lotes, instruções ou marcas de dobra fixas.
*   **📱 QR Code:** Gera imagens dinâmicas baseadas nas sequências ou links contidos nas colunas do banco de dados (CSV).
*   **▌▌ Código de Barras (Barcode):** Suporta múltiplos formatos através da biblioteca `python-barcode` (`code128`, `ean13`, `ean8`, `upca`, `code39`, `itf`, `codabar`).
*   **🖼️ SVG Dinâmico:** Permite o upload de um arquivo SVG global para a numeração, podendo instanciar múltiplos elementos SVG no canvas com informações independentes de redimensionamento (largura/altura) e posicionamento livre, inclusive podendo duplicá-los.
*   **✂️ Picote:** Linha pontilhada visual que serve como guia no canvas do editor (inicializa por padrão em **X = 25mm**), mas que é ignorada na renderização do PDF final.

### 2. Esquemas de Distribuição e Imposição

*   **Sequencial (Standard):** Distribui a sequência linha por linha, coluna por coluna na folha.
*   **Corte e Empilhamento (Cut & Stack):** Distribui as sequências de modo que, ao cortar as pilhas impressas, a sequência numérica esteja perfeitamente ordenada de forma vertical de baixo para cima ao empilhar as sub-folhas.

---

## 🎨 Funcionalidades de Destaque no Frontend

*   **Ajuda Dinâmica de Zeros (pad):** Ao alterar os dígitos no campo "Zeros (pad)" de uma Numeração, QR ou Barcode, a interface exibe dinamicamente o número total de dígitos e um preview do formato resultante (ex: `(5 dígitos = 00001)`, `(8 dígitos = 00000001)`). A atualização é feita de maneira a não perder o foco do input.
*   **Arte de Fundo Centralizada:** Ao fazer o upload de uma arte de fundo (PDF/PNG/JPG), ela é centralizada no canvas nos eixos horizontal e vertical, ajustando-se dinamicamente com base nas proporções do formato selecionado.
*   **Reset de Cache do CSV:** Permite remover um banco de dados e adicioná-lo novamente (mesmo arquivo ou arquivos diferentes) limpando o seletor físico do navegador para evitar problemas de cache de upload.

---

## 🔌 API REST (FastAPI)

### **1. Gerenciamento de Formatos (`/api/formatos`)**
*   `GET /api/formatos`: Lista todos os formatos cadastrados.
*   `POST /api/formatos`: Cadastra um novo formato.
*   `PUT /api/formatos/{id}`: Atualiza um formato existente.
*   `DELETE /api/formatos/{id}`: Remove um formato.

### **2. Gerenciamento de Numerações (`/api/numeracoes`)**
*   `GET /api/numeracoes`: Lista as configurações de dados variáveis/numerações cadastradas.
*   `POST /api/numeracoes`: Salva uma nova configuração de VDP.
*   `PUT /api/numeracoes/{id}`: Atualiza a numeração cadastrada.
*   `DELETE /api/numeracoes/{id}`: Exclui a numeração.

### **3. Imposição e Geração de PDF (`/api/impose`)**
*   `POST /api/impose` (Multipart Form):
    *   `base_pdf`: Arquivo PDF original a ser imposicionado.
    *   `csv_file` (Opcional): Arquivo CSV com a tabela de dados dinâmicos.
    *   `config`: String JSON contendo os parâmetros de imposição (`formato_id`, `numeracao_id`, `saida_id`, lógica de sequência, etc.).
    *   *Retorno:* Arquivo PDF montado com imposição e dados dinâmicos aplicados.
