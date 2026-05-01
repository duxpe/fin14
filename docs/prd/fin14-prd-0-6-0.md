# fin14 — Product Requirements Document

**Versão:** 0.6.0  
**Status:** Draft  
**Data:** 2026-04-26  

---

## 1. Visão geral

fin14 é uma CLI de budget para sites estáticos. O princípio central é o limite de **14kB por página** — derivado do tamanho máximo de dados que o TCP slow start transmite na primeira janela de congestionamento. Páginas que cabem nesse limite chegam ao usuário no primeiro round-trip, sem espera adicional de rede.

O fin14 é **agnóstico de SSG**. Ele opera sobre o output já gerado — a pasta `dist/`, `_site/`, `public/` ou qualquer diretório de saída — e mede o que de fato o browser vai baixar na primeira visita. Funciona com Hugo, Eleventy, Astro, Jekyll, ou qualquer ferramenta que produza HTML estático.

O nome vem de `Finch` e `14kB`. `fin14` é também o comando CLI principal. O fin14 faz parte de um ecossistema maior:

| Produto | Nome | Propósito |
|---|---|---|
| Budget tool | **fin14** | Mede e valida o peso de qualquer site estático |
| SSG opinioso | **the14** | Gerador de sites estáticos construído sobre o fin14 |
| CMS | **sam14** | Interface de gestão de conteúdo integrada ao the14 |

Este PRD cobre exclusivamente o **fin14**.

---

## 2. Objetivos

- Tornar trivial verificar se páginas estáticas cabem em 14kB
- Funcionar com qualquer SSG sem configuração específica por ferramenta
- Dar visibilidade em tempo real do orçamento de tamanho durante o desenvolvimento
- Ser simples o suficiente para que qualquer dev consiga começar em menos de 5 minutos
- Ser útil em CI como linter de peso — falha o pipeline se alguma página estourar o budget

---

## 3. Pilares de design

### 3.1 Agnóstico por princípio

O fin14 não sabe — e não precisa saber — como o site foi construído. Ele lê arquivos HTML, CSS, JS e imagens de uma pasta de output e mede. Qualquer SSG que gere arquivos estáticos é compatível por padrão.

### 3.2 Honestidade na medição

O fin14 mede o que de fato trafega pela rede: payload comprimido, recursos externos incluídos, imagens above-the-fold contabilizadas. Não há otimizações automáticas que mascaram o tamanho real — o número reportado é o número real.

### 3.3 Feedback imediato e visual

O feedback sobre o budget deve ser imediato e claro, tanto no terminal (TUI) quanto na página de report no browser. O usuário não precisa entender TCP slow start para entender "9.2 / 14.0 kB ✓".

### 3.4 Resolução de problema real e explicável

O fin14 endereça um problema técnico concreto de forma que qualquer desenvolvedor consiga explicar em uma frase.

---

## 4. Decisões de design (registradas)

| # | Decisão | Escolha | Motivo |
|---|---------|---------|--------|
| D1 | Escopo do produto | Budget tool agnóstica | Clareza de propósito |
| D2 | Integração com SSGs | Opera sobre o output gerado, não sobre o projeto fonte | Zero acoplamento; funciona com qualquer ferramenta |
| D3 | Comportamento ao estourar o budget | Erro por padrão, processo termina com exit code 1 | Útil em CI; `--force` existe para emergências |
| D4 | Otimizações automáticas | Nenhuma — o fin14 mede, não transforma | Honestidade; transformações são responsabilidade do SSG ou de quem faz o site |
| D5 | O que conta no budget | Tudo que o browser baixa na primeira visita: HTML + CSS + JS + imagens above-the-fold + recursos externos | Alinhado com a realidade técnica do TCP slow start |
| D6 | Modelo de instalação | `npx` para experimentar, `npm install -D` para projetos sérios | Menor fricção possível para adoção |
| D7 | Modo de desenvolvimento | Watch do output dir + rebuild on-demand + página de report | Agnóstico de SSG; o usuário controla quando rebuildar |
| D8 | Integração com o build do SSG | `build_command` configurável pelo usuário | O fin14 executa o comando que o usuário declara; não precisa conhecer o SSG |
| D9 | Detecção automática de output dir | Heurística leve baseada em arquivos de config conhecidos | Reduz fricção sem criar dependência de código específico por SSG |
| D10 | Licença | MIT | Maximiza adoção e contribuições |
| D11 | Estrutura do repositório | Monorepo com `packages/core` e `packages/cli` via npm workspaces | Permite uso programático do core sem a CLI |
| D12 | Recursos externos no budget | Medidos via fetch durante a análise + warning identificando o recurso + cache local | Honesto sobre o custo real; educa sem punir |
| D13 | Compressão para medição | gzip nível 6 por padrão; brotli configurável | Alinhado com o default da maioria dos servidores web |
| D14 | Detecção de above-the-fold | Imagens com `loading="lazy"` excluídas; demais incluídas | Controle explícito e previsível pelo usuário |
| D15 | CSS purge | Fora do escopo — o fin14 mede, não transforma | Purge automático seguro requer conhecimento do projeto; escopo do the14 |
| D16 | Visualização no browser | Página de report separada em `localhost:4214` — sem overlay, sem injeção de script | Zero interferência com o servidor do SSG; agnóstico por princípio |
| D17 | Atualização da página de report | SSE — servidor empurra atualização ao detectar mudança no output dir | Sem polling; sem interferência no fluxo do SSG |
| D18 | Cache de recursos externos | `.fin14/cache/` na raiz do projeto; TTL de 1h; warning + refetch ao expirar | Persistente entre sessões sem risco de dados muito desatualizados |
| D19 | Estrutura interna do core | `budget.js` dividido em `budget/` com quatro responsabilidades separadas | Testabilidade independente; evita monolito |

---

## 5. Arquitetura do sistema

### 5.1 Estrutura do repositório (monorepo)

```
fin14/
├── package.json                        ← npm workspaces config
├── packages/
│   ├── core/                           ← @fin14/core
│   │   ├── package.json
│   │   └── src/
│   │       ├── budget/
│   │       │   ├── collector.js        ← parseia HTML, resolve quais recursos entram no budget
│   │       │   ├── measurer.js         ← comprime e mede qualquer recurso (local ou externo)
│   │       │   ├── external.js         ← fetch + cache de recursos externos
│   │       │   └── validator.js        ← agrega medições, aplica limite, gera diagnóstico
│   │       ├── crawler.js              ← varre output dir, lista arquivos HTML
│   │       ├── compress.js             ← gzip/brotli, entrada/saída de bytes
│   │       └── index.js                ← API pública do core
│   └── cli/                            ← fin14 (pacote publicado no npm)
│       ├── package.json
│       ├── bin/
│       │   └── fin14.js                ← entry point, parse de argv
│       ├── commands/
│       │   ├── check.js                ← orquestra crawler + budget + output
│       │   ├── dev.js                  ← orquestrador puro do modo dev
│       │   └── audit.js                ← budget de uma página + output detalhado
│       └── dev-server/
│           ├── watcher.js              ← Chokidar, emite eventos de mudança
│           ├── server.js               ← HTTP + serve report-ui/
│           ├── sse.js                  ← gerencia conexões SSE e broadcast
│           └── report-ui/
│               └── index.html          ← página de report (arquivo estático no pacote)
```

**Responsabilidades por módulo:**

`budget/collector.js` — parseia o HTML de uma página e resolve a lista completa de recursos que entram no budget: CSS referenciado no `<head>`, JS inline ou com `defer`/`async`, imagens sem `loading="lazy"`, e recursos externos por URL absoluta.

`budget/measurer.js` — recebe um recurso (local ou externo) e devolve seu tamanho comprimido em bytes. Delega leitura de disco ao chamador, fetch ao `external.js`, e compressão ao `compress.js`.

`budget/external.js` — fetch de recursos externos com cache em disco (`.fin14/cache/`). TTL de 1h. Ao expirar, emite warning e refaz o fetch.

`budget/validator.js` — recebe a lista de medições de uma página, soma, compara com o limite configurado, e retorna o resultado com diagnóstico de candidatos para corte.

`crawler.js` — varre o output dir recursivamente e retorna a lista de arquivos HTML encontrados. Não tem lógica de budget.

`compress.js` — função pura: recebe bytes e configuração de compressão, devolve bytes comprimidos. Sem I/O.

`dev-server/server.js` — servidor HTTP que serve os arquivos estáticos de `report-ui/`. Não interfere com o servidor do SSG.

`dev-server/sse.js` — gerencia conexões SSE abertas pela página de report e faz broadcast dos dados de medição atualizados quando o watcher detecta mudança.

### 5.2 Stack tecnológica

| Componente | Tecnologia | Justificativa |
|---|---|---|
| Runtime | Node.js (ESM puro) | Sem transpile em dev, ecossistema npm |
| CLI | Node.js nativo | Sem dependência de framework CLI pesado |
| Watch de arquivos | Chokidar | Padrão de fato para watch em Node.js |
| Compressão | zlib nativo (Node.js) | Zero dependências extras; gzip e brotli nativos |
| Servidor de dev | HTTP nativo + SSE | Leve, sem dependências, suficiente para o caso de uso |
| Configuração | TOML (`fin14.toml`) | Legível, sem ambiguidade, sem JSON quirks |

### 5.3 Configuração (`fin14.toml`)

```toml
[project]
output_dir    = "dist"            # pasta de output do SSG
build_command = "npm run build"   # comando para rebuildar (opcional)

[budget]
default           = "14kb"        # limite padrão para todas as páginas
compression       = "gzip"        # opções: "gzip" (padrão), "brotli"
compression_level = 6             # 1–9, apenas para gzip (padrão: 6)
```

O `output_dir` pode ser detectado automaticamente se o projeto contém arquivos de configuração de SSGs conhecidos (ver seção 6.3).

---

## 6. CLI

### 6.1 Comandos

```bash
fin14 check [dir]           # mede e valida budgets do output dir
fin14 dev [dir]             # watch mode com página de report e TUI no terminal
fin14 audit <arquivo.html>  # relatório detalhado de uma página específica
```

### 6.2 Flags globais

```bash
--force                     # continua mesmo com páginas acima do budget (exit code 0)
--strict                    # trata warnings como erros (útil em CI)
--config <path>             # aponta para um fin14.toml alternativo
--verbose                   # output detalhado de cada etapa
--build                     # executa o build_command antes de medir (override pontual)
```

### 6.3 Detecção automática de output dir

Se nenhum `dir` for passado e não houver `fin14.toml`, o fin14 tenta inferir o output dir a partir de arquivos de configuração conhecidos na raiz do projeto:

| Arquivo detectado | Output dir inferido |
|---|---|
| `hugo.toml` / `hugo.yaml` | `public/` |
| `eleventy.config.js` / `.eleventy.js` | `_site/` |
| `astro.config.*` | `dist/` |
| `jekyll.yml` / `_config.yml` | `_site/` |
| `next.config.*` | `out/` (apenas export estático) |
| nenhum detectado | erro + instrução para criar `fin14.toml` |

---

## 7. Sistema de budget

### 7.1 O que é contabilizado

O budget de 14kB por página inclui **tudo que o browser baixa na primeira visita**:

- HTML da página
- CSS referenciado no `<head>` (inline ou externo)
- JavaScript inline ou referenciado no `<head>` / com atributo `defer` / `async`
- Imagens sem `loading="lazy"` (consideradas above-the-fold)
- Recursos externos (fontes, CDNs) — medidos via fetch, identificados com warning

Recursos explicitamente lazy **não entram** no cálculo:

- Imagens com `loading="lazy"`
- CSS deferido via `media="print"` ou carregado via JS
- Scripts carregados dinamicamente

### 7.2 Medição

O tamanho é calculado sobre o **payload comprimido**, alinhado com o que de fato trafega pela rede.

**Algoritmo padrão:** gzip nível 6 — default do zlib e da maioria dos servidores web (nginx, Apache, Caddy).

**Configuração disponível via `fin14.toml`:**

- `compression` — `"gzip"` (padrão) ou `"brotli"`
- `compression_level` — nível gzip de 1 a 9 (padrão: 6); ignorado para brotli

Ambas as implementações usam módulos nativos do Node.js (`zlib.gzipSync` e `zlib.brotliCompressSync`) — zero dependências extras.

### 7.3 Detecção de above-the-fold

Imagens com `loading="lazy"` são excluídas automaticamente. Imagens sem essa marcação são consideradas above-the-fold e entram no budget. O controle é explícito e previsível.

### 7.4 Recursos externos

Recursos referenciados por URL absoluta (ex: Google Fonts, CDNs) são tratados da seguinte forma:

- O fin14 faz fetch do recurso e mede seu tamanho comprimido
- O tamanho é somado ao budget da página
- Um warning é emitido identificando o recurso e seu peso
- O resultado do fetch é cacheado em `.fin14/cache/` com TTL de 1h
- Ao expirar, um warning é emitido e o fetch é refeito silenciosamente

```
⚠  fonts.googleapis.com/css2?family=Inter  3.1kB  — recurso externo contabilizado no budget
```

O diretório `.fin14/` deve ser adicionado ao `.gitignore` do projeto.

### 7.5 Comportamento ao estourar

Por padrão, o processo termina com exit code 1 e mensagem de diagnóstico:

```
✗  posts/post-longo/index.html  excedeu o budget: 16.8kB (+2.8kB)

   Candidatos para corte:
   → hero.jpg                          1.9kB  — considere lazy load ou redimensionamento
   → fonts.googleapis.com (externo)    3.1kB  — considere hospedar a fonte localmente
   → style.css                         2.4kB  — CSS parece grande; considere purge

   Use --force para ignorar este erro.
```

O fin14 **sugere** otimizações mas não as executa. A responsabilidade de corrigir é do projeto.

---

## 8. Modo de desenvolvimento (`fin14 dev`)

### 8.1 Funcionalidades

- Watch do output dir com Chokidar — detecta quando o SSG regenera arquivos
- Página de report de budget em `http://localhost:4214`
- Rebuild on-demand via tecla `R` no terminal (executa o `build_command` configurado)
- Comunicação servidor → browser via SSE
- Feedback simultâneo no terminal via TUI com barras de progresso

### 8.2 Fluxo de uso típico

```
Terminal 1: hugo server --watch   (ou qualquer SSG em watch mode)
Terminal 2: fin14 dev public/     (fin14 observa o output e mede)

  — usuário salva um arquivo de conteúdo
  — SSG detecta, rebuilda, atualiza public/
  — Chokidar detecta mudança em public/
  — fin14 remede as páginas afetadas
  — SSE notifica a página de report em localhost:4214
  — página de report atualiza
```

Alternativamente, com `build_command` configurado:

```
Terminal 1: fin14 dev             (fin14 gerencia o build e o watch)

  — usuário pressiona R no terminal
  — fin14 executa o build_command
  — aguarda o output dir ser atualizado
  — remede e atualiza a página de report via SSE
```

### 8.3 Por que rebuild on-demand, não automático por intervalo

Rebuilds automáticos por tempo criam race conditions: se o SSG ainda está gerando arquivos quando o fin14 começa a medir, os resultados são incorretos. O rebuild on-demand garante que a medição sempre ocorre sobre um output estável.

### 8.4 Página de report (`http://localhost:4214`)

A página de report é servida pelo `dev-server/` do fin14 em uma porta dedicada, independente do servidor do SSG. Não há injeção de script nas páginas do site — zero interferência com o fluxo de desenvolvimento do SSG.

**Mapa de budget (topo da página):**

No topo da página, antes da lista, um mapa de quadrados representa todas as páginas do site — inspirado no gráfico de contribuições do GitHub. Cada quadrado é uma página. As cores são fixas:

- Verde — dentro do budget (< 13.6kB)
- Amarelo — próximo do limite (≥ 13.6kB e ≤ 14.0kB)
- Vermelho — acima do budget (> 14.0kB)

Clicar em um quadrado faz scroll suave até a linha correspondente na lista abaixo, onde o usuário pode clicar para abrir o painel lateral com o detalhe completo da página.

**Visão geral (lista de páginas):**

Cada página aparece em uma linha com:
- Status visual (✓ pass / ⚠ warning / ✗ fail)
- Tamanho atual vs. limite (ex: `9.2 / 14.0 kB`)

A lista é ordenada por peso (maior primeiro) para que violações apareçam no topo.

**Detalhe por página (painel lateral):**

Ao clicar em uma página, um painel lateral abre com o breakdown completo por tipo de recurso: HTML / CSS / JS / Imagens / Externos. Recursos externos são identificados individualmente com seu peso e warning associado.

**Atualização:**

A página mantém uma conexão SSE com o servidor. Quando o watcher detecta mudança no output dir e a remedição termina, o servidor empurra os dados atualizados e a página re-renderiza sem reload.

**Histórico:**

Apenas snapshot atual — sem histórico entre medições. A página reflete sempre o estado mais recente do output dir.

### 8.5 Feedback no terminal (TUI)

```
[fin14 dev] Watching dist/ · Report em http://localhost:4214
[fin14 dev] Pressione R para rebuildar · Q para sair

[fin14] posts/index.html
  ████████░░░░░░░░  9.2 / 14.0 kB  ✓
  HTML 4.1kB  CSS 2.8kB  JS 0kB  Imgs 2.3kB

[fin14] posts/post-exemplo/index.html
  ████████████████  16.8 / 14.0 kB  ✗ +2.8kB
  HTML 3.8kB  CSS 2.4kB  JS 0kB  Imgs 10.6kB
```

---

## 9. Uso em CI

O fin14 é projetado para funcionar como linter de peso em pipelines de CI:

```yaml
# GitHub Actions example
- name: Build
  run: npm run build

- name: Check page budget
  run: npx fin14 check dist/ --strict
```

O `--strict` trata warnings (recursos externos grandes, CSS provavelmente não purgado) como erros. Exit code 1 em qualquer violação.

---

## 10. Modelo de distribuição

### 10.1 Para experimentar (sem instalação)

```bash
npx fin14 check dist/
npx fin14 audit dist/index.html
```

### 10.2 Para projetos sérios

```bash
npm install -D fin14
```

```json
{
  "scripts": {
    "check": "fin14 check dist/",
    "audit": "fin14 audit"
  }
}
```

---

## 11. Fora do escopo (fin14 v1)

| Item | Onde pertence |
|---|---|
| Geração de sites estáticos | the14 (produto separado) |
| CSS purge automático | the14 (contexto controlado) |
| Templates, coleções, paginação | the14 |
| Overlay injetado nas páginas do site | the14 (controla o servidor) |
| CMS / painel de administração | sam14 (produto separado) |
| Deploy automático | fora do ecossistema v1 |
| API de plugins | prevista para v2 |
| i18n | fora do escopo |
| Adaptadores específicos por SSG | desnecessários pela arquitetura agnóstica |
| Histórico persistente de medições | fora do escopo v1 |

---

## 12. Roadmap do ecossistema

O fin14 é o primeiro produto de um ecossistema planejado. Cada fase resolve um problema específico e apoia a seguinte.

### the14 — SSG opinioso

Gerador de sites estáticos construído sobre o fin14. Enquanto o fin14 é agnóstico, o the14 é deliberadamente opinioso: escolhe a stack (Markdown, templates, coleções) e aplica otimizações que o fin14 não pode fazer com segurança de forma agnóstica — como CSS purge e critical CSS inline. Todo site gerado pelo the14 nasce dentro do budget.

Escopo previsto: Markdown + frontmatter, engine de templates, coleções nativas (posts, projetos, tags), paginação automática, hot reload com overlay de budget integrado, zero JS por padrão.

### sam14 — CMS

Interface de gestão de conteúdo integrada ao the14. Resolve o problema de quem quer manter um blog ou portfólio sem editar arquivos Markdown diretamente. O sam14 se apoia no the14 para build e no fin14 para validação de budget — o limite de 14kB é aplicado mesmo via interface visual.

Escopo previsto: editor de conteúdo web, gestão de posts e projetos, preview em tempo real com budget visível, publicação integrada.

### Plataforma de hospedagem (fase futura)

Se o ecossistema ganhar adoção suficiente, uma plataforma de hospedagem dedicada a sites dentro do limite de 14kB fecha o ciclo: criar, medir, publicar — tudo dentro do mesmo ecossistema. Sem configuração de servidor, sem preocupação com compressão ou CDN.

---

## 13. Critérios de sucesso (fin14 v1)

- Um desenvolvedor consegue integrar o fin14 em um projeto existente em menos de 5 minutos
- O fin14 funciona corretamente com Hugo, Eleventy e Astro sem configuração específica por SSG
- A página de report atualiza em menos de 500ms após o SSG regenerar um arquivo
- O `fin14 check` em um site com 100 páginas ≤14kB leva menos de 5 segundos

---

## 14. Licença

MIT — uso livre, incluindo uso comercial, sem restrições.

---

## Apêndice A — Histórico de versões

| Versão | Data | Alterações |
|---|---|---|
| 0.1.0 | 2026-04-19 | Versão inicial |
| 0.2.0 | 2026-04-19 | Substituição de Nunjucks por LiquidJS; detecção de above-the-fold; pilares de design |
| 0.3.0 | 2026-04-19 | Monorepo, scaffolding, rebuild incremental com grafo, recursos externos, clean URLs |
| 0.4.0 | 2026-04-19 | Parser de Markdown: gray-matter + marked; compressão para medição: gzip nível 6 padrão, brotli configurável |
| 0.5.0 | 2026-04-25 | Reescrita completa: fin14 redefinido como budget tool agnóstica. SSG (the14) e CMS (sam14) separados em produtos distintos. Removidas seções de templates, coleções, URLs, pipeline de Markdown e grafo de dependências — pertencem ao PRD do the14. Adicionadas seções de integração com SSGs externos, detecção automática de output dir, uso em CI, modo dev agnóstico e roadmap do ecossistema. |
| 0.6.0 | 2026-04-26 | Estrutura interna do core refatorada: `budget.js` dividido em `budget/` (collector, measurer, external, validator); `external.js` movido para dentro de `budget/`. CLI: overlay removido — substituído por página de report separada em `localhost:4214`; `server.js` dividido em `server.js` + `sse.js`; `report-ui/index.html` adicionado como arquivo estático. Especificados: conteúdo e comportamento da página de report (mapa de budget no topo com quadrados por página em verde/amarelo/vermelho + scroll ao clicar; status + tamanho na lista; painel lateral no detalhe; snapshot atual; atualização via SSE); cache de recursos externos (`.fin14/cache/`, TTL 1h, warning + refetch ao expirar); TUI no terminal mantida com barras de progresso; teclas R/Q mantidas. Porta 4214 definida para o servidor de dev. |

---

*Documento atualizado em 2026-04-26 após sessão de definição de arquitetura e UX do modo dev.*
