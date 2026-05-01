# Fin14 — Product Requirements Document

**Versão:** 0.1.0  
**Status:** Draft  
**Data:** 2026-04-19  

---

## 1. Visão geral

Fin14 é um framework de geração de sites estáticos com foco absoluto em performance de carregamento. O princípio central é o limite de **14kB por página** — derivado do tamanho máximo de dados que o TCP slow start transmite na primeira janela de congestionamento. Páginas que cabem nesse limite chegam ao usuário no primeiro round-trip, sem espera adicional de rede.

O framework é voltado principalmente para **blogs e portfólios**, mas sua arquitetura é flexível o suficiente para qualquer site estático cujas páginas respeitem o orçamento de tamanho.

O nome `fin14` é também o comando CLI principal.

---

## 2. Objetivos

- Tornar trivial construir páginas que cabem em 14kB
- Dar visibilidade em tempo real do orçamento de tamanho durante o desenvolvimento
- Aplicar otimizações automaticamente, sem configuração manual
- Ser simples o suficiente para que qualquer dev consiga começar em menos de 5 minutos

---

## 3. Pilares de design

### 3.1 Simplicidade e código limpo
O framework não deve introduzir abstrações desnecessárias. O output gerado deve ser HTML estático legível. A configuração deve ser mínima e explícita.

### 3.2 Facilidade de uso para o usuário final
O feedback sobre o budget deve ser imediato e visual. O usuário não deve precisar entender as otimizações para se beneficiar delas. O caminho feliz — criar uma página que respeita o limite — deve exigir zero configuração adicional.

### 3.3 Resolução de problemas reais
O Fin14 endereça um problema técnico concreto (page weight e TCP slow start) de forma que qualquer desenvolvedor consiga explicar em uma frase. Isso aumenta as chances de adoção e de viralização orgânica na comunidade.

---

## 4. Decisões de design (registradas)

| # | Decisão | Escolha | Motivo |
|---|---------|---------|--------|
| D1 | Tipo de projeto | Framework standalone | Controle total da stack, sem dependência de decisões de terceiros |
| D2 | Sistema de templates | Markdown + frontmatter para conteúdo; Nunjucks (sintaxe Jinja2) para layouts | Familiar para a maioria dos devs, sintaxe amplamente conhecida |
| D3 | Comportamento ao estourar o budget | Erro por padrão, build falha | Coerente com a proposta; `--force` existe para emergências |
| D4 | Otimizações automáticas | Ativas por padrão, configuráveis via `fin14.toml` | Zero config para começar, sem perder controle |
| D5 | O que conta no budget | Tudo que o browser baixa na primeira visita: HTML + CSS + JS + imagens above-the-fold | Alinhado com a realidade técnica do TCP slow start |
| D6 | Modelo de instalação | `npx` para experimentar, `npm install` para projetos sérios | Menor fricção possível para adoção |
| D7 | Servidor de desenvolvimento | Hot reload + painel visual de budget no browser | Diferencial de DX — feedback imediato e visual |
| D8 | JavaScript no output | Zero JS por padrão | Filosofia estática pura; JS manual é possível mas não encorajado |
| D9 | Coleções de conteúdo | Nativas: posts, projetos, tags com paginação automática | Cobre os casos de uso primários (blog, portfólio) sem workarounds |
| D10 | Licença | MIT | Maximiza adoção e contribuições |

---

## 5. Arquitetura do sistema

### 5.1 Stack tecnológica

| Componente | Tecnologia | Justificativa |
|---|---|---|
| Runtime | Node.js (ESM puro) | Sem transpile em dev, ecossistema npm |
| CLI | Node.js nativo | Sem dependência de framework CLI pesado |
| Templates | Nunjucks | Sintaxe Jinja2 para Node.js, 3kB, madura |
| Conteúdo | Markdown + gray-matter | Padrão da indústria para SSGs |
| Bundling/minificação | esbuild | O mais rápido disponível |
| Otimização de imagens | sharp | Conversão WebP/AVIF, resize, compressão |
| Purge de CSS | PurgeCSS | Remove seletores não-utilizados |
| Servidor de dev | Chokidar + servidor HTTP nativo | Hot reload leve sem dependências pesadas |
| Configuração | TOML (`fin14.toml`) | Legível, sem ambiguidade, sem JSON quirks |

### 5.2 Estrutura de pastas padrão

```
meu-projeto/
├── fin14.toml              ← configuração global e budgets
├── content/
│   ├── posts/              ← coleção de posts (Markdown)
│   │   └── meu-post.md
│   └── projects/           ← coleção de projetos (Markdown)
│       └── meu-projeto.md
├── templates/
│   ├── base.html           ← layout base (Nunjucks)
│   ├── post.html           ← herda de base
│   ├── index.html          ← página inicial
│   └── 404.html
├── static/                 ← assets crus (imagens, fontes, etc.)
└── dist/                   ← output gerado (não commitado)
```

### 5.3 Configuração (`fin14.toml`)

```toml
[budget]
default = "14kb"        # limite padrão para todas as páginas
index   = "14kb"        # pode ser sobrescrito por tipo
post    = "14kb"

[optimize]
images         = true   # converte para WebP automaticamente
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
- Imagens visíveis without scrolling (above-the-fold), pós-compressão

Recursos carregados de forma lazy (imagens below-the-fold, CSS não-crítico deferido) **não entram** no cálculo do budget da primeira visita.

### 7.2 Medição

O tamanho é calculado sobre o **payload comprimido (gzip)**, que é o que de fato trafega pela rede, alinhado com o comportamento real do TCP slow start.

### 7.3 Comportamento ao estourar

Por padrão, o build falha com mensagem de diagnóstico:

```
✗  blog/post-longo.html  excedeu o budget: 16.8kB (+2.8kB)

   Candidatos para corte:
   → hero.jpg       1.9kB  — considere lazy load ou redimensionamento
   → reset.css      0.4kB  — seletores não-utilizados detectados (rode com css = "purge-aggressive")
   → HTML           0.5kB  — whitespace residual (verifique template base)

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
| Compressão gzip do output | Ativada | sempre ativa na medição; output físico é HTML puro |

---

## 9. Sistema de templates

### 9.1 Engine

Nunjucks com sintaxe Jinja2. O usuário que conhece Jinja2, Django templates ou Liquid vai se sentir em casa imediatamente.

### 9.2 Herança de templates

```html
{# templates/base.html #}
<!DOCTYPE html>
<html lang="{{ lang | default('pt-BR') }}">
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
{# templates/post.html #}
{% extends "base.html" %}

{% block content %}
  <article>
    <h1>{{ title }}</h1>
    <time>{{ date | date("DD/MM/YYYY") }}</time>
    {{ content | safe }}
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
- Uma página individual para cada item (`/posts/meu-post/`)
- Páginas de paginação automáticas (`/posts/page/2/`)
- Páginas de tag (`/tags/performance/`)

### 10.2 Dados disponíveis em templates de listagem

```html
{% for post in collections.posts %}
  <article>
    <h2><a href="{{ post.url }}">{{ post.title }}</a></h2>
    <time>{{ post.date | date("DD/MM/YYYY") }}</time>
  </article>
{% endfor %}

{# Paginação #}
{% if pagination.prev %}
  <a href="{{ pagination.prev }}">← Anterior</a>
{% endif %}
{% if pagination.next %}
  <a href="{{ pagination.next }}">Próximo →</a>
{% endif %}
```

---

## 11. Servidor de desenvolvimento (`fin14 dev`)

### 11.1 Funcionalidades

- Hot reload ao salvar qualquer arquivo de conteúdo ou template
- Painel visual de budget embutido na página (overlay no browser)
- Rebuild incremental — apenas as páginas afetadas pela mudança são reprocessadas
- Sem dependência de browser extension — o painel é injetado via script no modo dev

### 11.2 Painel visual de budget

O painel aparece como overlay fixo no canto inferior direito do browser durante o desenvolvimento. Exibe:

- Barra de progresso do budget (verde → amarelo → vermelho)
- Breakdown por tipo de recurso (HTML / CSS / JS / Imagens)
- Tamanho atual vs. limite
- Indicador de status (dentro do budget / warning / erro)

O painel é **removido automaticamente** no `fin14 build` — não aparece no output final.

### 11.3 Feedback no terminal

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

## 12. JavaScript no output

O Fin14 gera **zero JavaScript por padrão**. Nenhum runtime, nenhum helper, nenhum script de terceiro é injetado nas páginas.

Se o usuário quiser adicionar JavaScript manualmente, pode fazê-lo via frontmatter ou template — mas o JS contará no budget e, se ultrapassar o limite, o build falhará normalmente.

Isso é uma decisão filosófica: o framework não encoraja o uso de JS, mas não impede quem precisa.

---

## 13. Modelo de distribuição

### 13.1 Para experimentar (sem instalação)

```bash
npx fin14 new meu-blog
cd meu-blog
npx fin14 dev
```

### 13.2 Para projetos sérios

```bash
npm install -D fin14

# package.json
{
  "scripts": {
    "dev":   "fin14 dev",
    "build": "fin14 build",
    "check": "fin14 check"
  }
}
```

---

## 14. Fora do escopo (v1)

Os itens abaixo são explicitamente fora do escopo da versão 1 para manter o foco:

- Adaptadores para frameworks externos (Eleventy, Astro, Hugo)
- Islands architecture / componentes interativos nativos
- Suporte a múltiplos idiomas (i18n)
- CMS integrado ou painel de administração
- Deploy automático (Netlify, Vercel, etc.) — o output é HTML estático, qualquer host funciona
- Plugins de terceiros — a API de extensão é v2

---

## 15. Critérios de sucesso

- Um desenvolvedor sem experiência com o Fin14 consegue criar e subir um blog funcional em menos de 30 minutos
- Todas as páginas geradas pelo scaffolding padrão (`fin14 new`) estão dentro do budget sem nenhuma configuração adicional
- O feedback de budget no painel visual é atualizado em menos de 500ms após salvar um arquivo
- O build de um site com 100 posts leva menos de 10 segundos

---

## 16. Licença

MIT — uso livre, incluindo uso comercial, sem restrições.

---

*Documento gerado com base nas decisões tomadas em sessão de definição de requisitos em 19/04/2026.*
