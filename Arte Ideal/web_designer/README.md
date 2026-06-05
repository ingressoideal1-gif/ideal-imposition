# Arte Ideal – Web Designer

## Visão geral
Este projeto é um **designer de impressão** baseado em web que permite ao usuário criar layouts de impressão personalizados, ajustar dimensões de página, margens, sangria, escolher cores, inserir texto e exportar o resultado como imagem.

## Estrutura de diretórios
```
web_designer/
├── index.html           # página principal da aplicação
├── style.css            # estilos globais e temas
├── script.js            # lógica JavaScript da aplicação
├── assets/              # imagens, ícones e fontes usadas
└── docs/                # documentação do projeto
    ├── architecture.md  # descrição da arquitetura e componentes
    └── usage.md         # instruções de uso e desenvolvimento
```

## Como executar
1. **Instalação rápida** – abra o diretório no terminal e execute:
   ```bash
   python -m http.server 8000
   ```
   Em seguida abra <http://localhost:8000> no Chrome.
2. **Alternativa** – simplesmente abra o arquivo `index.html` no Chrome (ex.: `file:///C:/Antigravity%20Projetos/Arte%20Ideal/web_designer/index.html`).

## Desenvolvimento
- **Requisitos** – Node.js não é necessário; tudo roda no navegador.
- **Estilos** – `style.css` usa variáveis CSS para temas claros e escuros.
- **JavaScript** – `script.js` contém a lógica de gerenciamento de canvas, exportação, paleta de cores e manipulação de texto.
- **Servidor de desenvolvimento** – recomenda‑se usar `python -m http.server` ou a extensão *Live Server* do VS Code para evitar problemas de CORS.

## Como fazer alterações
| Área | Arquivo(s) | O que mudar |
|------|------------|-------------|
| Layout da página | `index.html` | Estrutura HTML, inclusão de novos componentes. |
| Estilos | `style.css` | Variáveis CSS, novos seletores, animações. |
| Lógica | `script.js` | Funções de exportação, gerenciamento de estado, módulos auxiliares. |
| Documentação | `docs/*.md` | Atualizar descrições de funcionalidades ou fluxos. |

## Documentação adicional
- **Arquitetura** – veja `docs/architecture.md`.
- **Guia de uso** – veja `docs/usage.md`.
- **Histórico de mudanças** – mantenha um `CHANGELOG.md` na raiz para registrar versões.

## Licença
Este projeto está licenciado sob a licença MIT. Consulte o arquivo `LICENSE` (a ser criado) para mais detalhes.

---
*Gerado automaticamente por Antigravity.*
