# Fin14 — Product Requirements Document

**Versão:** 0.4.0  
**Status:** Draft  
**Data:** 2026-04-19  

---

## 1. Visão geral

Fin14 é um framework de geração de sites estáticos com foco absoluto em performance de carregamento. O princípio central é o limite de **14kB por página** — derivado do tamanho máximo de dados que o TCP slow start transmite na primeira janela de congestionamento. Páginas que cabem nesse limite chegam ao usuário no primeiro round-trip, sem espera adicional de rede.

O framework é voltado principalmente para **blogs e portfólios**, mas sua arquitetura é flexível o suficiente para qualquer site estático cujas páginas respeitem o orçamento de tamanho.

O nome `fin14` vem de `Finch` e `14KB`. É também o comando CLI principal.

---

## 2. Objetivos

- Tornar trivial construir páginas que cabem em 14kB
- Dar visibilidade em tempo real do orçamento de tamanho durante o desenvolvimento
- Aplicar otimizações automaticamente, sem configuração manual
- Ser simples o suficiente para que qualquer dev consiga começar em menos de 5 minutos

---

## 3. Pilares de design

### 3.1 Simplicidade e código limpo

O framework não deve introduzir abstrações desnecessárias. O output gerado deve ser HTML estático legível. A configuração deve ser mínima e explícita. O código-fonte do framework deve ser mínimo e simples, optando sempre pela solução mais direta e de alta manutenibilidade.

### 3.2 Facilidade de uso para o usuário final

O feedback sobre o budget deve ser imediato e visual. O usuário não deve precisar entender as otimizações para se beneficiar delas. O caminho feliz — criar uma página que respeita o limite — deve exigir zero configuração adicional e deve ser facilmente visualizável através de interface TUI/CLI ou browser em tempo real.

### 3.3 Resolução de problemas reais

O Fin14 endereça um problema técnico concreto (page weight e TCP slow start) de forma que qualquer desenvolvedor consiga explicar em uma frase. Isso aumenta as chances de adoção e de viralização orgânica na comunidade.

---

## 4. Decisões de design (registradas)

| # | Decisão | Escolha | Motivo |
|---|---------|---------|--------|
| D1 | Tipo de projeto | Framework standalone | Controle total da stack, sem dependência de decisões de terceiros |
| D2 | Sistema de templates | Markdown + frontmatter para conteúdo; LiquidJS para layouts | Sintaxe `{{ }}` / `{% %}` familiar, projeto ativo com 1M+ downloads/semana, TypeScript nativo |
| D3 | Comportamento ao estourar o budget | Erro por padrão, build falha | Coerente com a proposta; `--force` existe para emergências |
| D4 | Otimizações automáticas | Ativas por padrão, configuráveis via `fin14.toml` | Zero config para começar, sem perder controle |
| D5 | O que conta no budget | Tudo que o browser baixa na primeira visita: HTML + CSS + JS + imagens above-the-fold | Alinhado com a realidade técnica do TCP slow start |
| D6 | Modelo de instalação | `npx` para experimentar, `npm install` para projetos sérios | Menor fricção possível para adoção |
| D7 | Servidor de desenvolvimento | Hot reload + painel visual de budget no browser e via TUI/CLI | Diferencial de DX — feedback imediato e visual |
| D8 | JavaScript no output | Zero JS por padrão | Filosofia estática pura; JS manual é possível mas não encorajado |
| D9 | Coleções de conteúdo | Nativas: posts, projetos, tags com paginação automática | Cobre os casos de uso primários (blog, portfólio) sem workarounds |
| D10 | Licença | MIT | Maximiza adoção e contribuições |
| D11 | Estrutura do repositório | Monorepo com `packages/core` e `packages/cli` via npm workspaces | Permite uso programático do core sem a CLI; sem overhead de Turborepo |
| D12 | Scaffolding (`fin14 new`) | Arquivos estáticos em `packages/cli/templates/`, copiados para o projeto do usuário | Simples de inspecionar, manter e contribuir |
| D13 | Rebuild incremental | Grafo de dependências completo desde o v1 | Comportamento correto desde o início; evita regressão futura |
| D14 | Recursos externos no budget | Medidos via fetch durante o build + warning identificando o recurso | Honesto sobre o custo real da página; educa o usuário sem punir |
| D15 | Formato de URL | Clean URLs — `/posts/meu-post/` gera `dist/posts/meu-post/index.html` | Padrão moderno; sem extensão exposta na URL |
| D16 | Parser de Markdown | `gray-matter` (extração de frontmatter) + `marked` (Markdown → HTML) | Simples, diretos, sem configuração; `marked` faz uma coisa só e bem; ecossistema `remark` fica para v2 se precisar de plugins |

---

## 5. Arquitetura do sistema

### 5.1 Estrutura do repositório (monorepo)

```
fin14/                          ← raiz do monorepo
├── package.json                ← npm workspaces config
├── packages/
│   ├── core/                   ← @fin14/core
│   │   ├── package.json
│   │   └── src/
│   │       ├── pipeline.js     ← transformação Markdown → HTML
│   │       ├── budget.js       ← medição e validação de budget
│   │       ├── optimizer.js    ← minificação, purge CSS, imagens
│   │       ├── collections.js  ← coleções, paginação, tags
│   │       ├── graph.js        ← grafo de dependências de templates
│   │       └── index.js        ← API pública do core
│   └── cli/                    ← fin14 (pacote publicado no npm)
│       ├── package.json
│       ├── bin/
│       │   └── fin14.js        ← entry point do comando CLI
│       ├── commands/
│       │   ├── new.js
│       │   ├── dev.js
│       │   ├── build.js
│       │   ├── check.js
│       │   └── audit.js
│       ├── dev-server/
│       │   ├── server.js       ← servidor HTTP + SSE para hot reload
│       │   └── overlay.js      ← painel de budget injetado no browser
│       └── templates/          ← arquivos estáticos do scaffolding
│           ├── fin14.toml
│           ├── content/
│           │   └── posts/
│           │       └── hello-world.md
│           ├── templates/
│           │   ├── base.html
│           │   ├── post.html
│           │   └── index.html
│           └── static/
```

### 5.2 Stack tecnológica

| Componente | Tecnologia | Justificativa |
|---|---|---|
| Runtime | Node.js (ESM puro) | Sem transpile em dev, ecossistema npm |
| CLI | Node.js nativo | Sem dependência de framework CLI pesado |
| Templates | LiquidJS | Sintaxe Liquid compatível com Jinja2, TypeScript nativo, ativamente mantido |
| Frontmatter | gray-matter | Extrai YAML do topo do `.md`, separa do conteúdo |
| Markdown → HTML | marked | Simples, rápido, zero configuração; remark fica para v2 |
| Bundling/minificação | esbuild | O mais rápido disponível |
| Otimização de imagens | sharp | Conversão WebP/AVIF, resize, compressão |
| Purge de CSS | PurgeCSS | Remove seletores não-utilizados |
| Servidor de dev | Chokidar + servidor HTTP nativo + SSE | Hot reload leve; SSE para comunicação com o painel no browser |
| Configuração | TOML (`fin14.toml`) | Legível, sem ambiguidade, sem JSON quirks |

### 5.3 Estrutura de pastas de um projeto usando Fin14

```
meu-projeto/
├── fin14.toml              ← configuração global e budgets
├── content/
│   ├── posts/              ← coleção de posts (Markdown)
│   │   └── meu-post.md
│   └── projects/           ← coleção de projetos (Markdown)
│       └── meu-projeto.md
├── templates/
│   ├── base.html           ← layout base (LiquidJS)
│   ├── post.html           ← herda de base
│   ├── index.html          ← página inicial
│   └── 404.html
├── static/                 ← assets crus (imagens, fontes, etc.)
└── dist/                   ← output gerado (não commitado)
```

### 5.4 Configuração (`fin14.toml`)

```toml
[budget]
default = "14kb"        # limite padrão para todas as páginas
index   = "14kb"        # pode ser sobrescrito por tipo
post    = "14kb"

[optimize]
images         = true   # converte para WebP automaticamente com compressão moderada
css            = "purge" # opções: "purge", "minify", "none"
html           = "minify" # opções: "minify", "none"
js             = "minify" # opções: "minify", "none"
critical_css   = true   # inline CSS above-the-fold

[collections]
posts.dir      = "content/posts"
posts.sort     = "date"
posts.per_page = 10

projects.dir   = "content/projects"
projects.sort  = "date"
```

---

## 6. CLI

### 6.1 Comandos

```bash
fin14 new <nome>        # scaffolding de novo projeto
fin14 dev               # servidor local com hot reload e painel de budget
fin14 build             # build completo para dist/
fin14 check             # valida budgets sem fazer build
fin14 audit <página>    # relatório detalhado de uma página específica
```

### 6.2 Flags globais

```bash
--force                 # continua o build mesmo com páginas acima do budget
--strict                # trata warnings como erros (útil em CI)
--config <path>         # aponta para um fin14.toml alternativo
--verbose               # output detalhado de cada etapa
```

---

## 7. Sistema de budget

### 7.1 O que é contabilizado

O budget de 14kB por página inclui **tudo que o browser baixa na primeira visita**:

- HTML da página (pós-minificação)
- CSS crítico / above-the-fold (inline ou externo)
- JavaScript inline (se houver, via `--force`)
- Imagens visíveis sem scroll (above-the-fold), pós-compressão
- Recursos externos (fontes, CDNs) — medidos via fetch, identificados com warning

Recursos carregados de forma lazy (imagens below-the-fold, CSS não-crítico deferido) **não entram** no cálculo do budget da primeira visita.

### 7.2 Medição

O tamanho é calculado sobre o **payload comprimido (gzip)**, que é o que de fato trafega pela rede, alinhado com o comportamento real do TCP slow start. O valor é uma estimativa fiel — o tamanho gzip real pode variar ligeiramente dependendo do servidor de produção.

### 7.3 Detecção de above-the-fold

Imagens marcadas com `loading="lazy"` são excluídas automaticamente do cálculo. Imagens sem essa marcação são consideradas above-the-fold e entram no budget. O usuário tem controle explícito e previsível sobre o que é contabilizado.

### 7.4 Recursos externos

Recursos referenciados por URL absoluta (ex: Google Fonts, CDNs) são tratados da seguinte forma:

- O Fin14 faz fetch do recurso durante o build e mede seu tamanho comprimido
- O tamanho é somado ao budget da página normalmente
- Um warning é emitido identificando o recurso e seu peso
- O resultado do fetch é cacheado localmente entre rebuilds para não repetir requisições

```
⚠  fonts.googleapis.com/css2?family=Inter  3.1kB  — recurso externo contabilizado no budget
```

### 7.5 Comportamento ao estourar

Por padrão, o build falha com mensagem de diagnóstico:

```
✗  blog/post-longo.html  excedeu o budget: 16.8kB (+2.8kB)

   Candidatos para corte:
   → hero.jpg                          1.9kB  — considere lazy load ou redimensionamento
   → fonts.googleapis.com (externo)    3.1kB  — considere hospedar a fonte localmente
   → reset.css                         0.4kB  — seletores não-utilizados detectados
   → HTML                              0.5kB  — whitespace residual (verifique template base)

   Use --force para ignorar este erro.
```

---

## 8. Otimizações automáticas

Todas as otimizações são aplicadas automaticamente no build. O comportamento padrão pode ser alterado em `fin14.toml`.

| Otimização | Padrão | Configuração |
|---|---|---|
| Minificação de HTML | Ativada | `html = "minify"` / `"none"` |
| Minificação de CSS | Ativada | `css = "minify"` / `"purge"` / `"purge-aggressive"` / `"none"` |
| Minificação de JS | Ativada | `js = "minify"` / `"none"` |
| Conversão de imagens para WebP | Ativada | `images = true` / `false` |
| CSS crítico inline | Ativado | `critical_css = true` / `false` |
| Compressão gzip do output | Sempre ativa na medição | output físico é HTML puro |

---

## 9. Sistema de templates

### 9.1 Engine

LiquidJS — implementação JavaScript do Liquid (mesma sintaxe usada pelo GitHub Pages, Jekyll e Shopify). A sintaxe `{{ }}` para variáveis e `{% %}` para tags é familiar para quem vem de Jinja2, Django templates ou qualquer SSG moderno. O projeto é TypeScript-nativo, ativamente mantido e recebe mais de 1 milhão de downloads por semana.

**Diferença relevante em relação ao Jinja2:** Liquid não suporta macros nem execução arbitrária de código nos templates — o que para o Fin14 é uma vantagem, pois mantém os templates seguros e simples por padrão.

### 9.2 Herança de templates

```html
<!-- templates/base.html -->
<!DOCTYPE html>
<html lang="{{ lang | default: 'pt-BR' }}">
<head>
  <meta charset="UTF-8">
  <title>{{ title }}</title>
  {% block head %}{% endblock %}
</head>
<body>
  {% block content %}{% endblock %}
</body>
</html>
```

```html
<!-- templates/post.html -->
{% layout "base.html" %}

{% block content %}
  <article>
    <h1>{{ title }}</h1>
    <time>{{ date | date: "%d/%m/%Y" }}</time>
    {{ content }}
  </article>
{% endblock %}
```

### 9.3 Frontmatter (Markdown)

```markdown
---
title: Meu primeiro post
date: 2026-04-19
tags: [web, performance]
template: post.html
---

Conteúdo do post em Markdown.
```

### 9.4 Variáveis disponíveis nos templates

| Variável | Descrição |
|---|---|
| `title` | Título da página (do frontmatter) |
| `date` | Data (do frontmatter) |
| `content` | Conteúdo renderizado do Markdown |
| `collections.posts` | Lista de todos os posts |
| `collections.projects` | Lista de todos os projetos |
| `pagination` | Dados de paginação (page, total, prev, next) |
| `tags` | Tags da página atual |
| `site` | Dados globais do `fin14.toml` |

---

## 10. Coleções de conteúdo

### 10.1 Comportamento

Coleções são diretórios de arquivos Markdown agrupados por tipo. O Fin14 gera automaticamente:

- Uma página de listagem para cada coleção (`/posts/`, `/projects/`)
- Uma página individual para cada item (`/posts/meu-post/` → `dist/posts/meu-post/index.html`)
- Páginas de paginação automáticas (`/posts/page/2/`)
- Páginas de tag (`/tags/performance/`)

### 10.2 Dados disponíveis em templates de listagem

```html
{% for post in collections.posts %}
  <article>
    <h2><a href="{{ post.url }}">{{ post.title }}</a></h2>
    <time>{{ post.date | date: "%d/%m/%Y" }}</time>
  </article>
{% endfor %}

{% if pagination.prev %}
  <a href="{{ pagination.prev }}">← Anterior</a>
{% endif %}
{% if pagination.next %}
  <a href="{{ pagination.next }}">Próximo →</a>
{% endif %}
```

---

## 11. Grafo de dependências de templates

### 11.1 Propósito

Para suportar rebuild incremental correto, o core mantém um grafo que mapeia cada template aos arquivos que dependem dele. Quando um arquivo muda, apenas as páginas afetadas são reprocessadas.

### 11.2 Como é construído

Durante o build inicial, o core faz um parse leve de cada template Liquid para extrair referências a layouts e partials (`{% layout %}`, `{% render %}`). O resultado é um mapa invertido:

```
base.html     → [index.html, post.html, 404.html]
post.html     → [posts/meu-post/, posts/outro-post/]
index.html    → [/]
```

### 11.3 Regras de invalidação

| Arquivo alterado | Páginas invalidadas |
|---|---|
| Arquivo de conteúdo (`.md`) | Apenas a página correspondente |
| Template de página (`post.html`) | Todas as páginas que usam esse template |
| Layout base (`base.html`) | Todas as páginas que herdam do layout |
| Partial | Todas as páginas que renderizam o partial |
| `fin14.toml` | Rebuild completo |
| Asset estático (`static/`) | Nenhuma página — arquivo copiado diretamente |

---

## 12. Servidor de desenvolvimento (`fin14 dev`)

### 12.1 Funcionalidades

- Hot reload ao salvar qualquer arquivo de conteúdo ou template
- Painel visual de budget embutido na página (overlay no browser)
- Rebuild incremental via grafo de dependências
- Comunicação servidor → browser via SSE (Server-Sent Events)
- Sem dependência de browser extension — o painel é injetado via script no modo dev
- Feedback simultâneo no terminal via TUI

### 12.2 Fluxo de hot reload

```
Usuário salva arquivo
  → Chokidar detecta evento (com debounce de ~50ms)
  → Core consulta grafo e identifica páginas afetadas
  → Pipeline processa apenas essas páginas
  → Budget é medido e validado
  → Servidor envia evento SSE para o browser
  → Browser recarrega a página atual
  → Painel de budget atualiza com os novos dados
```

### 12.3 Painel visual de budget (browser)

O painel aparece como overlay fixo no canto inferior direito do browser durante o desenvolvimento. Exibe:

- Barra de progresso do budget (verde → amarelo → vermelho)
- Breakdown por tipo de recurso (HTML / CSS / JS / Imagens / Externos)
- Tamanho atual vs. limite
- Indicador de status (dentro do budget / warning / erro)

O painel é **removido automaticamente** no `fin14 build` — não aparece no output final.

### 12.4 Feedback no terminal

```
[fin14 dev] Servidor em http://localhost:3000

[fin14] blog/index.html
  ████████░░░░░░░░  9.2 / 14.0 kB  ✓
  HTML 4.1kB  CSS 2.8kB  JS 0kB  Imgs 2.3kB

[fin14] blog/post-exemplo.html
  ████████████████  14.0 / 14.0 kB  ⚠ limite atingido
  HTML 3.8kB  CSS 2.8kB  JS 0kB  Imgs 7.4kB
```

---

## 13. URLs e estrutura de output

Todas as páginas usam clean URLs. O mapeamento entre URL e arquivo gerado é:

| Conteúdo | URL | Arquivo em `dist/` |
|---|---|---|
| `content/posts/meu-post.md` | `/posts/meu-post/` | `dist/posts/meu-post/index.html` |
| `content/index.md` | `/` | `dist/index.html` |
| Listagem de posts (p.1) | `/posts/` | `dist/posts/index.html` |
| Listagem de posts (p.2) | `/posts/page/2/` | `dist/posts/page/2/index.html` |
| Tag | `/tags/performance/` | `dist/tags/performance/index.html` |
| 404 | — | `dist/404.html` |

O servidor de dev resolve `/posts/meu-post/` servindo `dist/posts/meu-post/index.html` automaticamente.

---

## 14. JavaScript no output

O Fin14 gera **zero JavaScript por padrão**. Nenhum runtime, nenhum helper, nenhum script de terceiro é injetado nas páginas.

Se o usuário quiser adicionar JavaScript manualmente, pode fazê-lo via frontmatter ou template — mas o JS contará no budget e, se ultrapassar o limite, o build falhará normalmente.

Isso é uma decisão filosófica: o framework não encoraja o uso de JS, mas não impede quem precisa.

---

## 15. Modelo de distribuição

### 15.1 Para experimentar (sem instalação)

```bash
npx fin14 new meu-blog
cd meu-blog
npx fin14 dev
```

### 15.2 Para projetos sérios

```bash
npm install -D fin14
```

```json
{
  "scripts": {
    "dev":   "fin14 dev",
    "build": "fin14 build",
    "check": "fin14 check"
  }
}
```

---

## 16. Fora do escopo (v1)

Os itens abaixo são explicitamente fora do escopo da versão 1 para manter o foco:

- Adaptadores para frameworks externos (Eleventy, Astro, Hugo)
- Islands architecture / componentes interativos nativos
- Suporte a múltiplos idiomas (i18n)
- CMS integrado ou painel de administração
- Deploy automático (Netlify, Vercel, etc.) — o output é HTML estático, qualquer host funciona
- API de plugins de terceiros — prevista para v2

---

## 17. Critérios de sucesso

- Um desenvolvedor sem experiência com o Fin14 consegue criar e subir um blog funcional em menos de 30 minutos
- Todas as páginas geradas pelo scaffolding padrão (`fin14 new`) estão dentro do budget sem nenhuma configuração adicional
- O feedback de budget no painel visual é atualizado em menos de 500ms após salvar um arquivo
- O build de um site com 100 posts leva menos de 10 segundos

---

## 18. Licença

MIT — uso livre, incluindo uso comercial, sem restrições.

---

## Apêndice A — Histórico de versões

| Versão | Data | Alterações |
|---|---|---|
| 0.1.0 | 2026-04-19 | Versão inicial |
| 0.2.0 | 2026-04-19 | Substituição de Nunjucks por LiquidJS (D2); adição da seção 7.3 sobre detecção de above-the-fold; ajustes nos pilares 3.1 e 3.2; sintaxe de templates atualizada para Liquid |
| 0.3.0 | 2026-04-19 | D11–D15: monorepo, scaffolding estático, rebuild incremental com grafo, recursos externos medidos com warning, clean URLs; seções 5.1, 11, 12, 13 adicionadas ou expandidas |
| 0.4.0 | 2026-04-19 | D16: parser de Markdown definido como gray-matter + marked; stack tecnológica detalhada com as duas libs separadas |

---

*Documento gerado com base nas decisões tomadas em sessão de definição de requisitos em 19/04/2026.*
