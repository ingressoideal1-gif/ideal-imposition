# Guia de Uso – Arte Ideal

## Pré‑requisitos
- Navegador moderno (Chrome recomendado).
- Opcional: Python 3.x para servidor local (`python -m http.server`).

## Como iniciar a aplicação
1. **Abrir diretamente**
   ```
   file:///C:/Antigravity%20Projetos/Arte%20Ideal/web_designer/index.html
   ```
   *Obs.: pode gerar problemas de CORS ao carregar imagens externas.*
2. **Usar servidor local** (recomendado)
   ```bash
   cd "C:/Antigravity Projetos/Arte Ideal/web_designer"
   python -m http.server 8000
   ```
   Abra <http://localhost:8000> no Chrome.

## Principais funcionalidades
- **Configuração de página** – ajuste de largura/altura em mm, número de páginas e sangria.
- **Paleta de cores** – selecione cores personalizadas ou use o tema claro/escuro.
- **Ferramentas de desenho** – texto, formas e imagens.
- **Exportação** – salve como PNG, JPEG ou PDF com margens e sangria.
- **Spinner de carregamento** – indicador visual durante a exportação.

## Como modificar o projeto
### Estrutura de arquivos
```
web_designer/
├─ index.html      # marcação da UI
├─ style.css       # estilos globais
├─ script.js       # lógica da aplicação
├─ assets/         # imagens, ícones, fontes
└─ docs/           # documentação (este guia, arquitetura, etc.)
```
### Adicionar novas funcionalidades
1. **HTML** – inclua novos elementos no `index.html` dentro da seção apropriada.
2. **CSS** – defina estilos em `style.css`; use variáveis CSS (`--primary-color`, `--bg-dark`, …) para manter consistência.
3. **JavaScript** – adicione funções em `script.js`.  Siga o padrão de módulos:
   ```js
   // Função de exemplo
   function novaFuncao(param) {
       // TODO: implementação
   }
   ```
   Lembre‑se de exportar variáveis necessárias ou adicioná‑las ao objeto global `window` se precisar ser acessível a outros scripts.
4. **Documentação** – atualize o `docs/usage.md` e `docs/architecture.md` sempre que houver mudanças estruturais.

## Boas práticas
- Mantenha o código **limpo** e comentado.
- Use nomes de variáveis claros (ex.: `totalWidthPx`).
- Evite código duplicado – extraia lógica comum em funções reutilizáveis.
- Teste a exportação após cada alteração para garantir que o canvas reflita as novas funcionalidades.

## Depuração
- Abra o console do navegador (F12) para visualizar logs e erros.
- Use o spinner (`showSpinner()`/`hideSpinner()`) para indicar processos longos.
- Caso ocorram problemas de CORS, execute a aplicação via servidor local.

---
*Este documento foi gerado automaticamente por Antigravity.*
