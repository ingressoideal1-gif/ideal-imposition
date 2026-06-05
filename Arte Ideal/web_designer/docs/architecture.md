# Arquitetura do Projeto Arte Ideal

## Visão geral
O **Arte Ideal – Web Designer** é uma aplicação front‑end pura que roda no navegador. Toda a lógica está contida em três arquivos principais:

- **index.html** – estrutura da página e inclusão de scripts/estilos.
- **style.css** – stylesheet que define temas, cores, tipografia e animações.
- **script.js** – código JavaScript que gerencia o canvas, exportação, paleta de cores, carregamento de fontes, controle de páginas e interações com o usuário.

## Componentes principais
| Componente | Responsabilidade |
|------------|-------------------|
| **Canvas manager** (`script.js`) | Cria e dimensiona o canvas com base nas configurações de página (largura, altura, sangria). |
| **Exportador** (`script.js`) | Converte o canvas em PNG, JPEG ou PDF, aplicando margens e sangria. |
| **Paleta de cores** (`script.js` + `style.css`) | Gerencia a seleção de cores, aplica temas claro/escuro e permite a customização pelo usuário. |
| **UI (HTML + CSS)** | Layout responsivo, barra de ferramentas, modal de exportação e indicadores de progresso (spinner). |
| **Assets** (`assets/`) | Imagens, ícones e fontes utilizadas pela UI. |

## Fluxo de dados
1. O usuário define as dimensões da página e quantidade de páginas.
2. O script calcula **totalWidthPx**, **totalHeightPx**, **PAGE_GAP_PX** e cria o canvas.
3. As interações (texto, imagens, formas) são desenhadas no canvas.
4. Ao exportar, o canvas é dividido em páginas, aplicando **bleedMM**, e salva‑se o arquivo.

## Tecnologias
- HTML5, CSS3 (variáveis CSS, animações), JavaScript ES6.
- Nenhuma dependência externa; tudo roda no cliente.
- Opcional: um servidor local (`python -m http.server`) para evitar problemas de CORS.

---
*Este documento foi gerado automaticamente por Antigravity.*
