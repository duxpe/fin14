# fin14 — Posicionamento como “ESLint dos 14kB”

## Resumo executivo

O fin14 deve ser posicionado como uma ferramenta pequena, opinativa e determinística para impedir que páginas estáticas fiquem pesadas demais.

A melhor definição curta é:

> **fin14 é um linter de peso para sites estáticos: ele valida se cada página cabe em um orçamento de 14kB comprimidos, antes do deploy.**

O fin14 não deve tentar competir diretamente com Lighthouse, WebPageTest, sitespeed.io ou plataformas completas de performance web. Essas ferramentas medem performance em contexto de browser, rede simulada, métricas Core Web Vitals, execução de JavaScript, renderização e experiência percebida.

O fin14 resolve um problema menor e mais específico:

> **“Esta página está pequena o suficiente para respeitar um budget brutalmente simples?”**

Essa limitação é a força do produto. O fin14 deve ser fácil de entender, rápido de rodar, simples de colocar em CI e suficientemente opinativo para criar disciplina.

---

## 1. A tese central

A tese do fin14 é que muitos sites estáticos ficam pesados por acúmulo silencioso:

- CSS global cresce;
- templates ganham dependências;
- imagens acima da dobra entram sem atenção;
- fontes externas são adicionadas;
- scripts pequenos viram scripts grandes;
- uma página simples passa de documento leve para mini-aplicação sem ninguém perceber.

Ferramentas completas de performance conseguem detectar isso, mas normalmente tarde demais ou com atrito alto demais.

O fin14 quer transformar uma regra de performance em um hábito de desenvolvimento:

```bash
fin14 dist/
```

Resultado esperado:

```text
✓ index.html              8.9 / 14.0 kB
✓ about/index.html        6.1 / 14.0 kB
✗ blog/post-longo.html   18.4 / 14.0 kB
```

A proposta não é “entender toda a performance web”.

A proposta é:

> **impedir regressão estrutural de peso antes que ela vire problema de performance.**

---

## 2. O que o fin14 é

O fin14 é uma CLI de budget para sites estáticos já buildados.

Ele deve operar sobre diretórios como:

- `dist/`
- `_site/`
- `public/`
- `out/`
- qualquer pasta de output gerada por um SSG ou build estático

Ele não precisa saber se o site veio de Hugo, Eleventy, Astro, Jekyll, Next export, templates próprios ou HTML manual.

O trabalho principal do fin14 é:

1. encontrar páginas HTML;
2. coletar os recursos que contam para a primeira visita;
3. medir payload comprimido;
4. somar o custo por página;
5. comparar com o budget;
6. falhar quando a página excede o limite;
7. explicar os principais candidatos de corte.

---

## 3. O que o fin14 não é

O fin14 não deve ser:

- substituto do Lighthouse;
- substituto do WebPageTest;
- substituto de RUM ou Core Web Vitals;
- plataforma completa de observabilidade de performance;
- bundler;
- otimizador automático;
- gerador de site;
- ferramenta universal para qualquer app web.

Essa clareza é essencial.

Se o fin14 tentar ser uma suíte completa de performance, ele perde para ferramentas maduras e muito mais profundas.

Se ele for um **linter de peso estático**, ele tem uma identidade própria.

---

## 4. Por que não usar apenas Lighthouse?

Lighthouse é excelente para auditorias amplas. Ele mede performance, acessibilidade, boas práticas, SEO e outros aspectos da página em contexto de browser.

Mas Lighthouse responde uma pergunta diferente:

> “Esta URL tem boa performance geral em um ambiente de teste?”

O fin14 responde:

> “Esta página está pequena o suficiente para continuar dentro do envelope de 14kB?”

Diferenças importantes:

| Critério | fin14 | Lighthouse |
|---|---|---|
| Unidade mental | página e budget de bytes | auditoria de performance geral |
| Entrada | pasta buildada | URL / página servida |
| Execução | análise estática + medição de recursos | browser/headless + simulação |
| Resultado ideal | passou/falhou | score + métricas + oportunidades |
| Uso principal | CI rápido e hábito local | auditoria, diagnóstico e validação ampla |
| Filosofia | regra estreita e opinativa | análise abrangente |

O fin14 não deve dizer “não use Lighthouse”.

Deve dizer:

> **Use fin14 antes para impedir páginas obesas. Use Lighthouse depois para entender experiência real.**

---

## 5. Por que não fazer análise manual?

Porque análise manual raramente vira disciplina contínua.

Análise manual exige que a pessoa:

- abra DevTools;
- limpe cache ou configure o teste corretamente;
- recarregue a página;
- confira Network;
- diferencie raw bytes, gzip, brotli e transfer size;
- identifique quais recursos pertencem à página;
- repita isso para várias páginas;
- repita em todo PR;
- explique a regra para o time;
- lembre de fazer tudo isso de novo no futuro.

Isso é possível, mas tem muito atrito.

O papel do fin14 é transformar uma prática manual em uma regra automática:

```bash
fin14 dist/
```

Esse é o mesmo tipo de valor que linters entregam:

- não porque humanos não conseguem revisar código;
- mas porque humanos não fazem isso perfeitamente, sempre, em todo commit.

---

## 6. Por que a ausência de concorrentes diretos não mata a ideia

A falta de ferramentas exatamente iguais pode significar falta de demanda.

Mas também pode indicar que o problema ficou espremido entre duas categorias existentes:

1. ferramentas grandes demais;
2. ferramentas estreitas demais.

### Ferramentas grandes demais

Exemplos:

- Lighthouse CI;
- WebPageTest;
- sitespeed.io;
- Calibre;
- DebugBear;
- outras plataformas de monitoramento.

Elas são boas para auditoria completa, mas podem ser pesadas demais para a pergunta:

> “Essa página está abaixo de 14kB?”

### Ferramentas estreitas demais

Exemplos:

- Size Limit;
- bundlesize;
- BundleWatch;
- budgets de bundlers.

Elas são boas para bundles e assets, especialmente JavaScript.

Mas normalmente não modelam a página estática como um documento completo com HTML, CSS, JS, imagens não-lazy e recursos externos.

O espaço do fin14 fica entre esses dois mundos:

> **mais específico que Lighthouse, mais page-aware que bundlesize.**

---

## 7. Vantagens reais do fin14

## 7.1 Simplicidade brutal

O fin14 tem uma regra que qualquer pessoa entende:

> cada página deve caber em 14kB comprimidos.

Isso é uma vantagem de produto.

Ferramentas complexas dão mais informação, mas também geram mais negociação:

- “qual métrica importa?”
- “esse score está baixo por quê?”
- “isso falhou por CPU, rede, terceiros ou layout?”
- “quanto é aceitável?”

O fin14 reduz a conversa:

> passou ou não passou do orçamento.

## 7.2 Baixo atrito local

O ideal é o usuário conseguir rodar:

```bash
npx fin14 dist/
```

ou:

```bash
npm install -D fin14
fin14 dist/
```

Sem servidor especial, sem browser, sem conta, sem dashboard, sem setup pesado.

## 7.3 Ótimo para CI

O fin14 deve funcionar como trava de regressão:

```bash
fin14 dist/
```

Se alguma página passar do budget, o processo termina com erro.

Isso torna o comportamento parecido com:

- ESLint;
- Prettier check;
- TypeScript `tsc --noEmit`;
- testes unitários;
- validações de bundle size.

## 7.4 Determinismo maior que auditorias de runtime

Métricas de browser podem variar por:

- CPU;
- throttling;
- cache;
- rede;
- servidor;
- terceiros;
- ordem de carregamento;
- estado do ambiente.

Bytes comprimidos de arquivos buildados são mais determinísticos.

Isso não torna o fin14 mais “real” que um browser.

Torna o fin14 melhor para uma regra simples e repetível.

## 7.5 Agnosticismo de SSG

O fin14 não precisa se integrar profundamente com Hugo, Eleventy, Astro, Jekyll ou qualquer outro gerador.

Ele mede a saída.

Isso reduz acoplamento e aumenta o mercado potencial dentro do nicho de sites estáticos.

## 7.6 Educação técnica embutida

A regra de 14kB ensina um conceito:

- payload comprimido importa;
- recursos externos contam;
- imagens acima da dobra custam;
- CSS global pesa;
- JavaScript não é gratuito;
- primeira visita é diferente de navegação cacheada.

Mesmo quando o usuário decide ignorar o limite, a ferramenta o força a ver o custo.

## 7.7 Identidade forte

“Performance budget tool” é genérico.

“ESLint dos 14kB para sites estáticos” é memorável.

O número pode gerar debate, mas debate também pode gerar distribuição.

---

## 8. Riscos reais

## 8.1 O público pode ser pequeno

O maior risco não é técnico.

O maior risco é que pouca gente se importe com performance nesse nível de restrição.

Muitos projetos aceitam páginas de centenas de kB ou vários MB.

Para esse público, 14kB parece absurdo, não útil.

## 8.2 A regra pode parecer dogmática demais

14kB é uma heurística forte, não uma garantia universal.

Ela se baseia na ideia de caber aproximadamente na primeira janela de congestionamento TCP em condições comuns modernas.

Mas há variações:

- IPv4 vs IPv6;
- MTU menor;
- VPNs;
- mobile;
- QUIC/HTTP/3;
- servidores com configurações diferentes;
- headers;
- TLS;
- múltiplas conexões;
- cache;
- recursos externos.

Então o fin14 não deve prometer:

> “14kB sempre carrega em um round-trip.”

Deve prometer algo mais honesto:

> “14kB é um orçamento conservador e memorável para manter páginas estáticas extremamente leves.”

## 8.3 Pode ser visto como ferramenta “moralista”

Há risco de parecer que o produto está julgando todo site moderno como errado.

Isso seria ruim.

O posicionamento deve ser firme, mas não universalista:

> “Se você quer esse tipo de site, esta ferramenta é para você.”

Não:

> “Todo site deveria seguir isso.”

## 8.4 Medição honesta é difícil

Coletar corretamente o que uma página baixa não é trivial.

Casos difíceis:

- `srcset` e `<picture>`;
- CSS `@import`;
- fontes em CSS;
- background images;
- scripts dinâmicos;
- módulos JS e imports;
- recursos externos;
- `<base href>`;
- preload/prefetch;
- lazy loading real vs declarado;
- diferença entre gzip e brotli;
- cache e redirects.

Se a ferramenta for simples demais, será acusada de medir errado.

Se tentar ser browser-real demais, perde a leveza.

O ideal é ser explícito:

- o que conta;
- o que não conta;
- onde há aproximação;
- onde usar modo audit;
- onde Lighthouse/WebPageTest ainda são necessários.

## 8.5 Concorrentes podem cobrir o caso “bom o suficiente”

Muitos usuários podem dizer:

- “Lighthouse CI já resolve.”
- “sitespeed.io já resolve.”
- “meu bundler já tem budget.”
- “eu só olho DevTools.”

O fin14 precisa vencer pelo atrito baixo e pela clareza, não por profundidade.

## 8.6 O número 14kB pode virar distração

O debate pode ficar preso em:

- “por que 14 e não 20?”
- “isso não considera HTTP/3”;
- “isso não considera cache”;
- “isso não considera headers”;
- “isso é micro-otimização.”

Resposta estratégica:

> O número é uma restrição de design, não uma simulação perfeita da internet.

Assim como 80 colunas, lint rules, cobertura mínima ou limites de bundle, o valor é útil porque cria disciplina.

---

## 9. Público ideal

O fin14 deve mirar explicitamente um público específico.

## 9.1 Perfil primário

Pessoas construindo sites estáticos pequenos e rápidos:

- blogs;
- portfólios;
- documentação;
- páginas pessoais;
- sites editoriais simples;
- landing pages minimalistas;
- sites institucionais leves;
- páginas de projeto open source.

## 9.2 Perfil cultural

Usuários com afinidade por:

- web minimalista;
- low-tech web;
- indieweb;
- performance extrema;
- HTML-first;
- zero ou pouco JavaScript;
- sites duráveis;
- ferramentas simples de linha de comando;
- CI disciplinado.

## 9.3 Perfil técnico

Usuários que já usam ou podem usar:

- Hugo;
- Eleventy;
- Astro em modo estático;
- Jekyll;
- SSG próprio;
- HTML manual;
- Next static export;
- pipelines simples com GitHub Actions, GitLab CI ou similares.

---

## 10. Quem não é o público

O fin14 não deve tentar agradar todo mundo.

Não é o público ideal:

- aplicações React/Vue/Svelte altamente interativas;
- dashboards pesados;
- SaaS app-shell;
- e-commerce complexo;
- sites com personalização client-side pesada;
- projetos que aceitam megabytes de JS como custo normal;
- times que medem performance só por Core Web Vitals;
- times que querem plataforma completa de observabilidade.

Essas pessoas podem até usar fin14 em partes do site, mas não devem definir o produto.

---

## 11. Posicionamento recomendado

## 11.1 Frase principal

> **fin14 é o ESLint dos 14kB para sites estáticos.**

## 11.2 Frase explicativa

> Ele valida o output já buildado do seu site e falha o CI quando uma página passa do budget de 14kB comprimidos.

## 11.3 Versão mais técnica

> fin14 é uma CLI agnóstica de SSG que mede o payload comprimido por página — HTML, CSS, JS, imagens não-lazy e recursos externos — para impedir regressões de peso em sites estáticos.

## 11.4 Versão mais filosófica

> fin14 transforma performance minimalista em regra automática.

## 11.5 Versão comparativa

> Use Lighthouse para auditoria completa. Use fin14 para impedir que páginas estáticas engordem antes do deploy.

---

## 12. Mensagens que devem ser evitadas

Evitar:

> “Substituto do Lighthouse.”

Motivo: falso e cria comparação ruim.

Evitar:

> “Garante carregamento em um round-trip.”

Motivo: tecnicamente forte demais.

Evitar:

> “Toda página web deveria ter 14kB.”

Motivo: moralista e fácil de atacar.

Evitar:

> “Ferramenta completa de performance.”

Motivo: posicionamento errado.

Evitar:

> “Medida perfeitamente igual ao browser.”

Motivo: análise estática sempre terá limites.

Preferir:

> “Budget brutalmente simples para sites estáticos.”

> “Linter de peso por página.”

> “Trava de CI contra regressão de page weight.”

> “Medição honesta o suficiente para desenvolvimento, não substituto de teste em browser real.”

---

## 13. Como o produto deve se comportar para sustentar esse posicionamento

## 13.1 O comando principal deve ser óbvio

Ideal:

```bash
fin14 dist/
```

Não exigir subcomandos longos para o caso principal.

## 13.2 A saída deve ser densa e clara

Exemplo:

```text
fin14 0.7.0
budget: 14.0 kB gzip
root: dist/

✓ index.html                  8.9 kB
✓ about/index.html            6.1 kB
⚠ posts/intro/index.html     13.8 kB
✗ posts/heavy/index.html     18.4 kB  +4.4 kB

Failed: 1 page over budget
```

## 13.3 O erro deve ser acionável

Ruim:

```text
Page too large.
```

Bom:

```text
✗ posts/heavy/index.html  18.4 / 14.0 kB

Largest contributors:
- hero.jpg         5.2 kB  image counted because loading="lazy" is missing
- /global.css      4.1 kB  stylesheet in head
- analytics.js     2.3 kB  async script still counts as first-visit payload
- Google Fonts     1.8 kB  external resource counted
```

## 13.4 O modo audit deve explicar, não só medir

```bash
fin14 audit dist/posts/heavy/index.html
```

Deve mostrar:

- total comprimido;
- limite;
- recursos locais;
- recursos externos;
- itens excluídos por lazy/defer policy;
- avisos de medição;
- candidatos de corte.

## 13.5 Deve haver modo CI limpo

```bash
fin14 dist/ --strict
```

Com saída previsível e exit code correto.

## 13.6 Deve ser explícito sobre gzip/brotli

Padrão recomendado:

- gzip nível 6 como baseline universal;
- brotli opcional;
- sempre reportar qual compressão foi usada.

## 13.7 Deve evitar otimização automática no fin14

O fin14 deve medir, não transformar.

Se a ferramenta otimiza automaticamente, ela deixa de ser linter e vira build tool.

Isso enfraquece a honestidade.

O ecossistema pode ter outro produto para otimizar ou gerar sites, mas o fin14 deve continuar sendo a régua.

---

## 14. Diferenciação contra ferramentas existentes

## 14.1 Contra Lighthouse CI

Lighthouse CI é mais completo.

fin14 deve ser mais simples, mais rápido de entender e mais determinístico.

Mensagem:

> Lighthouse mostra a performance geral. fin14 impede regressão estrutural de peso.

## 14.2 Contra WebPageTest

WebPageTest é mais realista.

fin14 deve ser mais local, mais simples e mais integrado ao fluxo de build.

Mensagem:

> WebPageTest valida comportamento real. fin14 mantém o output estático dentro do orçamento antes disso.

## 14.3 Contra sitespeed.io

sitespeed.io é mais poderoso e configurável.

fin14 deve ser menor e mais opinativo.

Mensagem:

> sitespeed.io é uma suíte de performance. fin14 é uma regra de page weight.

## 14.4 Contra Size Limit / bundlesize / BundleWatch

Essas ferramentas medem arquivos ou bundles.

fin14 mede páginas.

Mensagem:

> Bundle budgets protegem arquivos. fin14 protege a página que o usuário baixa.

## 14.5 Contra budgets do bundler

Budgets de bundler são acoplados ao pipeline.

fin14 mede o output final, independente da ferramenta.

Mensagem:

> O fin14 não se importa como você gerou o site. Ele mede o que saiu.

---

## 15. Critério de sucesso do produto

O fin14 é bem-sucedido se virar uma etapa natural em projetos estáticos minimalistas:

```bash
npm run build
fin14 dist/
```

Ou:

```yaml
- run: npm run build
- run: npx fin14 dist/
```

O sucesso não deve ser medido por adoção universal em toda web.

Deve ser medido por:

- adoção em comunidades de static sites;
- menções em templates minimalistas;
- uso em CI de blogs/docs/portfólios;
- integração com SSGs;
- issues/discussões sobre manter páginas pequenas;
- clareza de diagnóstico;
- confiança na medição.

---

## 16. Estratégia de adoção

## 16.1 Começar pelo nicho certo

Não vender para todo mundo.

Vender para quem já sente a dor:

- “meu site está ficando pesado”;
- “quero um blog absurdamente rápido”;
- “quero impedir tema/template de crescer”;
- “quero CI para peso de página”;
- “quero manter HTML-first.”

## 16.2 Criar exemplos concretos

Exemplos fortes:

- Eleventy blog com fin14;
- Hugo docs site com fin14;
- Astro static site com fin14;
- GitHub Actions falhando quando imagem sem lazy passa do limite;
- antes/depois mostrando Google Fonts ou imagem hero quebrando o budget.

## 16.3 Usar comparação visual simples

Exemplo:

```text
Before:
✗ index.html  42.7 / 14.0 kB

After:
✓ index.html  9.8 / 14.0 kB
```

Isso comunica melhor que um relatório longo.

## 16.4 Tornar o audit educativo

O usuário deve aprender olhando o resultado.

Exemplo:

```text
Why this failed:
- CSS global is shared by every page and costs 6.4 kB gzip.
- The hero image is counted because it is not lazy-loaded.
- The external font CSS redirects to 2 font files.
```

## 16.5 Permitir budgets customizados sem matar a marca

O padrão deve ser 14kB.

Mas projetos podem precisar de:

```toml
[budget]
default = "20kb"
```

Mesmo assim, a identidade pública deve continuar sendo 14kB.

Comparação:

- ESLint permite configurar regras;
- mas ainda tem identidade de linting.

---

## 17. Decisão estratégica recomendada

O fin14 deve assumir o nicho.

Não tentar suavizar demais.

A tese forte é justamente:

> “Sites estáticos deveriam poder ser pequenos o suficiente para caber em um orçamento brutal.”

Mas a comunicação deve ser honesta:

- não é universal;
- não substitui browser testing;
- não garante performance real sozinho;
- não serve para todo app;
- não pretende agradar quem aceita páginas pesadas.

O melhor posicionamento final:

> **fin14 é uma CLI de CI/dev para pessoas que querem manter sites estáticos extremamente leves. Ele funciona como um ESLint dos 14kB: mede o output final, aponta o que pesa e falha quando uma página passa do budget.**

---

## 18. Conclusão

A pergunta “por que ninguém fez isso antes?” é válida.

Ela indica que o mercado pode ser pequeno ou que a dor não é amplamente reconhecida.

Mas também indica uma oportunidade: performance tooling ficou dividido entre suítes completas de browser e verificadores estreitos de bundle.

O fin14 pode ocupar um espaço intermediário:

- pequeno;
- local;
- CI-friendly;
- agnóstico de SSG;
- page-aware;
- opinativo;
- educativo;
- brutalmente simples.

A chave é não superprometer.

O fin14 não deve dizer:

> “Eu resolvo performance web.”

Deve dizer:

> **“Eu impeço páginas estáticas de engordarem silenciosamente.”**

Esse é um problema menor.

Mas é um problema real para o público certo.

---

## Fontes e ferramentas relacionadas

- Lighthouse / Lighthouse CI: https://github.com/GoogleChrome/lighthouse-ci
- Lighthouse overview: https://developer.chrome.com/docs/lighthouse/overview/
- sitespeed.io performance budgets: https://www.sitespeed.io/documentation/sitespeed.io/performance-budget/
- WebPageTest documentation: https://docs.webpagetest.org/
- Size Limit: https://github.com/ai/size-limit
- bundlesize: https://github.com/siddharthkp/bundlesize
- BundleWatch: https://github.com/bundlewatch/bundlewatch
- Calibre developer/performance tooling: https://calibreapp.com/for/developers
- DebugBear performance budgets: https://www.debugbear.com/blog/working-with-performance-budgets
