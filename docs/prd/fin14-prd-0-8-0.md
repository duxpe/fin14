# fin14 — Product Requirements Document

**Versão:** 0.8.0  
**Status:** Draft  
**Data:** 2026-05-01  

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
| D20 | Comando padrão do binário | `fin14 [dir]` executa a validação diretamente — sem subcomando obrigatório | Consistente com ferramentas de função única (eslint, prettier, tsc); `check` existe como alias | 
| D21 | Flags de subcomando vs. globais | `--config` e `--verbose` são globais; `--force`, `--strict`, `--build` são flags do comando padrão e de `audit` | `--force` e `--strict` não fazem sentido em `dev`; `--build` em `dev` é coberto pela tecla R |
| D22 | `fin14 audit` sem argumento | Argumento `<arquivo.html>` obrigatório; `--all [dir]` para auditar todas as páginas | Torna a intenção explícita; evita comportamento silenciosamente diferente |
| D23 | TUI do modo dev | Header fixo com métricas globais + zona de atividade dinâmica; uma linha por página | Escala para sites grandes; densidade alta sem sacrificar legibilidade |
| D24 | Detecção de burst no TUI | Janela de 300ms; eventos simultâneos tratados como lote | Evita flood de atualizações no terminal; cobre rebuilds totais do SSG |
| D25 | Lista paginada pós-burst | Paginação explícita com `←` `→`; ordenação por peso desc → recência → nome | Navegável sem scroll livre; prioriza as violações mais graves |
| D26 | Hint sistêmico de diagnóstico | Se ≥ 30% das páginas estão no vermelho, exibir hint sugerindo verificar templates ou CSS global | Acionável; distingue problema pontual de problema estrutural |
| D27 | HTML parser | parse5 (1 dep: entities) | Spec-compliant WHATWG HTML5; parse5 v8 ativo; traversal manual via walk() — sem querySelector nativo |
| D28 | TOML parser | smol-toml (0 deps) | Native ESM, TOML spec 1.1, 6.8M downloads/semana, atualizado 2026 |
| D29 | CSS `@import` no budget | Incluído — regex recursivo + cycle detection via Set | `@import` é render-blocking e cria cadeia sequencial de fetches; ignorar subestima o budget real |
| D30 | `--strict` thresholds | 2 tipos de warning: (1) recurso externo presente; (2) página > 12.1kB | 12.1kB = limite IPv6 (RFC 8200: MTU mínimo 1280B × 10 segmentos TCP = 12.200B); externo = latência fora do controle |
| D31 | Modelo de concorrência | Páginas: batch 50; fetches externos: 10 por domínio | Seguro no macOS (FD limit 256); sem dependência de p-limit (batching loop nativo) |
| D32 | Error taxonomy | 4 categorias, 17 casos enumerados | Ver Apêndice B; comportamento consistente entre comandos sem ambiguidade |
| D33 | `audit` output format | Breakdown vertical por tipo de recurso + cut candidates | Consistente com painel lateral da report UI; hierarquia clara |
| D34 | Race condition (dev mode) | Adaptive settle delay: default 2s, aprende média dos builds na sessão | SSGs lentos não geram medições parciais; 2s cobre casos frios; adapta para builds rápidos |
| D35 | Port conflict (dev mode) | Próxima porta disponível (4214→4215→…), TUI informa | Zero interrupção; usuário vê qual porta foi alocada |
| D36 | Windows support | Best-effort sem guard | Sem testes específicos; sem promessa de suporte; recomendado WSL2 |

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
│       │   ├── default.js              ← comando padrão: orquestra crawler + budget + output
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

`budget/collector.js` — usa parse5 para parsear o HTML via traversal manual (função `walk()`). Extrai: `<link rel="stylesheet">`, `<script>` (inline, defer, async), `<img>` sem `loading="lazy"`, e URLs absolutas. Para cada CSS encontrado, escaneia `@import` recursivamente com detecção de ciclo via `Set` de caminhos visitados. Recursos `@import` são adicionados à lista de recursos da página antes da medição.

`budget/measurer.js` — recebe um recurso (local ou externo) e devolve seu tamanho comprimido em bytes. Delega leitura de disco ao chamador, fetch ao `external.js`, e compressão ao `compress.js`.

`budget/external.js` — fetch de recursos externos com cache em disco (`.fin14/cache/`). TTL de 1h. Ao expirar, emite warning e refaz o fetch. Fetches limitados a 10 por domínio via semáforo simples (Map de contadores por hostname).

`budget/validator.js` — recebe a lista de medições de uma página, soma, compara com o limite configurado, e retorna o resultado com diagnóstico de candidatos para corte.

`crawler.js` — varre o output dir recursivamente e retorna a lista de arquivos HTML encontrados. Não tem lógica de budget.

`compress.js` — função pura: recebe bytes e configuração de compressão, devolve bytes comprimidos. Sem I/O.

`dev-server/server.js` — servidor HTTP que serve os arquivos estáticos de `report-ui/`. Se a porta 4214 estiver ocupada, tenta 4215, 4216... até encontrar uma porta disponível. Não interfere com o servidor do SSG.

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
| HTML parser | parse5 v8 | Spec-compliant WHATWG HTML5; 1 dep (entities); traversal via walk() |
| TOML parser | smol-toml | Native ESM; TOML spec 1.1; 0 deps; 6.8M downloads/semana |

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
fin14 [dir]                    # mede e valida budgets do output dir (comando padrão)
fin14 dev [dir]                # watch mode com página de report e TUI no terminal
fin14 audit <arquivo.html>     # relatório detalhado de uma página específica
fin14 audit --all [dir]        # relatório detalhado de todas as páginas do output dir
```

`fin14 check [dir]` existe como alias do comando padrão para retrocompatibilidade.

### 6.2 Flags

**Globais** — válidas em qualquer comando:

```bash
--config <path>             # aponta para um fin14.toml alternativo
--verbose                   # output detalhado de cada etapa
```

**Comando padrão e `audit`** — não aplicáveis em `dev`:

```bash
--force                     # continua mesmo com páginas acima do budget (exit code 0)
--strict                    # trata warnings como erros (útil em CI)
--build                     # executa o build_command antes de medir (override pontual)
```

`--strict` trata dois tipos de warning como erro:

1. **Recurso externo presente no budget** — qualquer recurso referenciado por URL absoluta (Google Fonts, CDN, etc.) gera warning. Externo significa latência fora do controle do projeto.
2. **Página acima de 12.1kB** — o limite de 12.1kB deriva do IPv6 (RFC 8200): MTU mínimo de 1280 bytes × 10 segmentos TCP = 12.200 bytes. É o tamanho máximo que trafega no primeiro round-trip em redes IPv6. Páginas acima desse valor passam no budget padrão de 14kB mas ficam fora do limite IPv6.

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

### 6.4 `fin14 audit` — Formato de output

```
  audit  posts/post-longo/index.html
  ────────────────────────────────────────────────
  total    16.8 / 14.0 kB   ✗  +2.8kB
  ────────────────────────────────────────────────
  HTML     3.8kB   index.html
  CSS      2.4kB   style.css
  JS       —
  Images  10.6kB   hero.jpg            9.1kB
                   thumb.jpg           1.5kB
  Ext      —
  ────────────────────────────────────────────────
  cut candidates
  → hero.jpg        9.1kB  considere lazy load ou redimensionamento
  → style.css       2.4kB  CSS parece grande; considere purge
```

Regras de formatação:

- Tipos com tamanho zero exibem `—` (consistente com TUI)
- Cada recurso individual aparece indentado sob seu tipo
- Recursos externos (Ext) listam hostname + tamanho + warning de latência
- Cut candidates: recursos que, se removidos ou otimizados, resolveriam o overage
- Sem cor por padrão; ANSI colors quando stdout é TTY

---

## 7. Sistema de budget

### 7.1 O que é contabilizado

O budget de 14kB por página inclui **tudo que o browser baixa na primeira visita**:

- HTML da página
- CSS referenciado no `<head>` (inline ou externo)
- Arquivos CSS importados via `@import` dentro de qualquer CSS da página (recursivo)
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

### 7.6 Modelo de concorrência

O fin14 processa páginas em **batches de 50** usando `Promise.all` nativo — sem dependência de p-limit. Isso fica dentro do limite de file descriptors do macOS (256 por processo) e do Linux (1024).

Fetches de recursos externos são limitados a **10 requisições simultâneas por domínio**, implementados via semáforo simples (Map de contadores por hostname). Sem dependência externa.

Se ocorrer EMFILE durante a medição (erro E15), o processo retenta automaticamente com batch de 10 e emite warning.

---

## 8. Modo de desenvolvimento (`fin14 dev`)

### 8.1 Funcionalidades

- Watch do output dir com Chokidar — detecta quando o SSG regenera arquivos
- Página de report de budget em `http://localhost:4214` (ou próxima porta disponível)
- TUI no terminal com header fixo de métricas globais e zona de atividade dinâmica
- Rebuild on-demand via tecla `R` no terminal (executa o `build_command` configurado)
- Comunicação servidor → browser via SSE
- Detecção de burst: mudanças em janela de 300ms tratadas como lote
- Adaptive settle delay para evitar medições sobre output parcial

### 8.2 Fluxo de uso típico

```
Terminal 1: hugo server --watch   (ou qualquer SSG em watch mode)
Terminal 2: fin14 dev public/     (fin14 observa o output e mede)

  — usuário salva um arquivo de conteúdo
  — SSG detecta, rebuilda, atualiza public/
  — Chokidar detecta mudança em public/
  — fin14 aguarda settle delay (adaptive)
  — fin14 remede as páginas afetadas
  — TUI atualiza no terminal
  — SSE notifica a página de report em localhost:4214
```

Alternativamente, com `build_command` configurado:

```
Terminal 1: fin14 dev             (fin14 gerencia o build e o watch)

  — usuário pressiona R no terminal
  — fin14 executa o build_command
  — aguarda settle delay e output dir ser atualizado
  — remede e atualiza TUI e página de report via SSE
```

### 8.3 Adaptive settle delay

O watcher aguarda um período de estabilização após o último evento antes de iniciar a medição. O comportamento é **adaptativo**:

- **Sessão fria (primeiros 3 builds):** settle delay fixo de 2 segundos. Cobre SSGs que levam até 2s para terminar de escrever o output.
- **A partir do 4° build:** settle delay = média dos tempos de build anteriores na sessão × 1.2 (margem de 20%). Limite mínimo de 200ms, máximo de 5s.

O settle delay atual é exibido na linha de status do TUI (`settle 340ms`).

**Por que não um delay fixo:** SSGs variam muito (Hugo < 100ms; Eleventy com muitos posts > 1s). Um delay fixo alto desperdiça tempo em builds rápidos; baixo gera medições parciais em builds lentos.

### 8.4 Página de report (`http://localhost:4214`)

A página de report é servida pelo `dev-server/` do fin14 em uma porta dedicada, independente do servidor do SSG. Se a porta 4214 estiver ocupada, o servidor tenta 4215, 4216... até encontrar uma porta disponível. A porta escolhida é exibida no TUI:

```
  fin14  dist/  watching
  report  http://localhost:4215  (4214 em uso)
```

Não há injeção de script nas páginas do site — zero interferência com o fluxo de desenvolvimento do SSG.

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

### 8.5 TUI no terminal

O TUI é composto por um **header fixo** (sempre visível) e uma **zona de atividade dinâmica** (páginas recentes). A estética segue o padrão de ferramentas como Claude Code e OpenCode: fundo escuro, tipografia monoespaçada densa, cores semânticas, separadores leves, rodapé com controles disponíveis.

**Header fixo (3 linhas):**

```
 fin14  dist/  watching           ✓ 38  ⚠ 3  ✗ 7   48 páginas
 ─────────────────────────────────────────────────────────────
 top offenders   style.css 8.4kB · hero.jpg 6.1kB · Inter (ext) 3.1kB
 hint            7 páginas falhando — style.css parece grande, verifique CSS global
```

Quando o watcher está esperando pelo settle delay:

```
 fin14  dist/  watching           ✓ 38  ⚠ 3  ✗ 7   48 páginas
 ─────────────────────────────────────────────────────────────
 top offenders   style.css 8.4kB · hero.jpg 6.1kB · Inter (ext) 3.1kB
 settle 340ms    aguardando estabilização...
```

- Linha 1: nome da ferramenta, output dir observado, status do watcher, contadores globais (`✓ N ⚠ N ✗ N`), total de páginas
- Linha 2: os 3 assets mais pesados do site inteiro (não de uma página específica), com tamanho individual
- Linha 3: hint textual gerado dinamicamente — exemplos: "7 páginas falhando — style.css parece grande, verifique CSS global"; "recurso externo Inter representa 3.1kB — considere hospedar localmente"; "tudo dentro do budget ✓"

**Zona de atividade (dinâmica):**

Lista as páginas modificadas mais recentemente. Cada página ocupa uma linha. Tipos de recurso com peso zero são omitidos. O número de linhas exibidas é calculado dinamicamente: `process.stdout.rows - 7` (header + separadores + rodapé).

```
 recent
 ✗  posts/post-longo          16.8 / 14.0 kB  +2.8  HTML 3.8  CSS 2.4  Imgs 10.6
 ✓  posts/index                9.2 / 14.0 kB        HTML 4.1  CSS 2.8  Imgs 2.3
 ✓  about/index                7.1 / 14.0 kB        HTML 2.9  CSS 4.2
 ─────────────────────────────────────────────────────────────
 R rebuild · Q quit · ↑↓ navegar · Enter detalhe
```

Quando uma página é atualizada, ela sobe para o topo da zona de atividade. As mais antigas saem pelo fundo.

### 8.6 Modo burst (atualização em lote)

Quando múltiplos arquivos mudam dentro de uma janela de 300ms — comum em rebuilds totais do SSG — o fin14 entra em modo burst. Isso cobre tanto edições de template que afetam centenas de páginas quanto rebuilds completos disparados pelo próprio SSG (que frequentemente regenera o site inteiro independente do que mudou).

**Durante o burst**, o hint do header vira barra de progresso e a zona de atividade exibe apenas páginas com erro à medida que são detectadas:

```
 fin14  dist/  rebuilding        ✓ 38  ⚠ 3  ✗ 7   48 páginas
 ─────────────────────────────────────────────────────────────
 top offenders   style.css 8.4kB · hero.jpg 6.1kB · Inter (ext) 3.1kB
 hint            atualizando 347 páginas...  [████████████░░░░]  214 / 347
 ─────────────────────────────────────────────────────────────
 erros encontrados
 ✗  posts/post-longo          16.8 / 14.0 kB  +2.8  HTML 3.8  CSS 2.4  Imgs 10.6
 ✗  posts/post-b              15.1 / 14.0 kB  +1.1  HTML 3.2  CSS 2.4  Imgs 9.5
```

**Ao terminar o burst**, se não há violações, o TUI retorna ao modo normal. Se há violações:

- Se ≥ 30% das páginas estão no vermelho, o hint atualiza para sugerir verificação de template ou CSS global
- A zona de atividade exibe a lista paginada de páginas com problema

**Lista paginada pós-burst:**

Quando o número de páginas com violação excede a altura disponível da zona de atividade, a lista torna-se paginada com navegação por `←` `→`:

```
 ✗ 89 páginas acima do budget   página 1 / 8   ← →
 ─────────────────────────────────────────────────────────────
 ✗  posts/post-mais-pesado      18.4 / 14.0 kB  +4.4  HTML 3.1  CSS 2.8  Imgs 12.5
 ✗  posts/segundo-post          17.9 / 14.0 kB  +3.9  HTML 3.8  CSS 2.4  Imgs 11.7
 ⚠  posts/proximo-do-limite     13.7 / 14.0 kB        HTML 4.1  CSS 5.2  Imgs 4.4
```

Ordenação: peso decrescente → recência → nome do arquivo.

---

## 9. Uso em CI

O fin14 é projetado para funcionar como linter de peso em pipelines de CI:

```yaml
# GitHub Actions example
- name: Build
  run: npm run build

- name: Check page budget
  run: npx fin14 dist/ --strict
```

`--strict` trata como erros: presença de qualquer recurso externo no budget e páginas acima de 12.1kB (limite IPv6, RFC 8200). Exit code 1 em qualquer violação.

---

## 10. Modelo de distribuição

### 10.1 Para experimentar (sem instalação)

```bash
npx fin14 dist/
npx fin14 audit dist/index.html
```

### 10.2 Para projetos sérios

```bash
npm install -D fin14
```

```json
{
  "scripts": {
    "budget": "fin14 dist/",
    "audit": "fin14 audit dist/index.html"
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
| Suporte nativo a Windows | Best-effort sem garantia; recomendado WSL2 |

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
- O `fin14 dist/` em um site com 100 páginas ≤14kB leva menos de 5 segundos

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
| 0.7.0 | 2026-04-26 | CLI: `fin14 [dir]` torna-se o comando canônico — `check` rebaixado a alias; flags reorganizadas em globais (`--config`, `--verbose`) e flags de comando (`--force`, `--strict`, `--build` — inválidas em `dev`); `audit` passa a exigir `<arquivo.html>` obrigatório, com `--all [dir]` para auditar todas as páginas; exemplos de CI e package.json atualizados. `commands/check.js` renomeado para `commands/default.js`. TUI reformulado: header fixo de 3 linhas (status do watcher + contadores globais + top 3 offenders + hint textual dinâmico); zona de atividade com uma linha por página, tipos com peso zero omitidos, N dinâmico por altura do terminal. Modo burst especificado: janela de 300ms, barra de progresso no hint durante o lote, zona de atividade exibe só erros em tempo real, lista paginada com `←`/`→` pós-burst ordenada por peso desc → recência → nome, hint sistêmico se ≥30% das páginas no vermelho. Decisões D20–D26 adicionadas. |
| 0.8.0 | 2026-05-01 | Decisões de implementação resolvidas (D27–D36): HTML parser (parse5 — spec-compliant, 1 dep); TOML parser (smol-toml — 0 deps, TOML 1.1); CSS `@import` incluído no budget com resolução recursiva e cycle detection; `--strict` thresholds documentados (recurso externo + 12.1kB IPv6 per RFC 8200); modelo de concorrência (batch 50 páginas / 10 fetches por domínio, sem deps extras); error taxonomy completa (17 casos, 4 categorias — ver Apêndice B); `audit` output format especificado (breakdown vertical); adaptive settle delay (default 2s → aprende média dos builds na sessão); port conflict resolvido por próxima porta disponível; Windows suporte best-effort sem guard. Seções 6.4, 7.6, 8.3 adicionadas. Apêndice B adicionado. |

---

## Apêndice B — Taxonomia de erros

### Categoria A — Erros de input

Exit 1. Mensagem clara. Sem medição.

| ID | Condição | Mensagem de exemplo |
|---|---|---|
| E01 | `output_dir` não existe | `error  dist/ não encontrado` |
| E02 | `output_dir` sem nenhum `.html` | `error  nenhum arquivo HTML encontrado em dist/` |
| E03 | `fin14.toml` inválido (parse error) | `error  fin14.toml: parse error na linha 4` |
| E04 | `fin14.toml` com campo desconhecido | `error  fin14.toml: campo desconhecido 'cache_ttl'` |
| E05 | arquivo `.html` passado ao `audit` não existe | `error  arquivo não encontrado: posts/x.html` |

### Categoria B — Erros de medição

Warning emitido. Processo continua. Recurso excluído do budget.

| ID | Condição | Comportamento |
|---|---|---|
| E06 | CSS referenciado no HTML não encontrado no disco | `warn  style.css não encontrado — excluído do budget` |
| E07 | JS referenciado no HTML não encontrado no disco | idem |
| E08 | Imagem referenciada não encontrada no disco | idem |
| E09 | Fetch de recurso externo falhou (timeout / 4xx / 5xx) | `warn  fonts.googleapis.com: fetch falhou — excluído do budget` |
| E10 | `@import` referencia arquivo que não existe no disco | `warn  @import 'tokens.css' não encontrado — excluído` |
| E11 | Ciclo em `@import` (A importa B importa A) | `warn  ciclo detectado em @import: base.css → tokens.css → base.css` |

### Categoria C — Erros de budget

Exit 1 por padrão. Exit 0 com `--force`.

| ID | Condição | Comportamento |
|---|---|---|
| E12 | Página > 14kB | erro; exit 1 |
| E13 | Página > 12.1kB e ≤ 14kB | warning; erro em `--strict` |
| E14 | Recurso externo presente no budget | warning; erro em `--strict` |

### Categoria D — Erros de runtime

| ID | Condição | Comportamento |
|---|---|---|
| E15 | EMFILE (too many open files) | retry automático com batch de 10; warning emitido |
| E16 | Porta 4214 ocupada (dev mode) | tenta próxima porta disponível; TUI informa a porta escolhida |
| E17 | `build_command` falhou (exit ≠ 0) | log do stderr + continua se `output_dir` existe |

---

*Documento atualizado em 2026-05-01 após sessão de decisões de implementação.*
