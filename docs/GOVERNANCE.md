# Governança Oficial do Repositório e Engenharia Multi-Agente
# Tug of War: Citadels of Aethelgard

> **Documento Normativo de Gestão de Projeto, Arquitetura e Qualidade**  
> **Repositório Oficial (Single Source of Truth):** `cganley80/tug-of-war-gemini`  
> **Responsável:** Gerente de Projetos (GP) & Arquiteto Chefe  
> **Status:** Ativo — Vigente a partir da Sprint 1  

---

## 1. Princípios de Fonte Única de Verdade (Single Source of Truth)

O repositório `cganley80/tug-of-war-gemini` centraliza toda a especificação, código-fonte, suíte de testes e histórico de decisões do projeto **Tug of War: Citadels of Aethelgard**.

1. **Hierarquia Documental:**
   - [`docs/GDD.md`](./GDD.md): Especificação funcional, regras de negócio, fórmulas matemáticas, tabelas de atributos e roadmap de Sprints.
   - [`docs/GOVERNANCE.md`](./GOVERNANCE.md) *(este documento)*: Regras de arquitetura, topologia do time de subagentes, política de modelos, fluxo Git, portões de qualidade (Quality Gates) e harmonizações canônicas do GDD.
   - [`README.md`](../README.md): Guia executivo do repositório, instruções de setup, execução e comandos de verificação.
2. **Proibição de "Números Mágicos" (No Magic Numbers):**
   - Nenhum atributo de unidade, custo econômico, cooldown ou multiplicador da matriz de combate pode ser escrito de forma literal (*hardcoded*) dentro de algoritmos de execução. Todos os parâmetros do [`docs/GDD.md`](./GDD.md) devem residir em catálogos tipados, puros e imutáveis em `src/core/config/`.

---

## 2. Arquitetura de Diretórios e Isolamento de Camadas

Em cumprimento estrito à **Seção 7.1 do GDD**, o projeto adota separação total entre o **Motor Determinístico de Simulação (Headless)** e a **Camada de Visualização/UI (Navegador)**:

```text
tug-of-war-gemini/
├── docs/
│   ├── GDD.md                  # Game Design Document v1.0
│   └── GOVERNANCE.md           # Governança Oficial do Repositório
├── src/
│   ├── core/                   # MOTOR HEADLESS (Zero dependências de DOM/Phaser/Window)
│   │   ├── config/             # Catálogos imutáveis (Unidades, Estruturas, Matriz 4x4, Economia, Relíquias)
│   │   ├── prng/               # Gerador Pseudo-Aleatório Semeado (Mulberry32)
│   │   ├── events/             # Domain Event Bus tipado e desacoplado
│   │   ├── entities/           # Modelos de estado (Unit, Structure, Citadel, Projectile, Hazard)
│   │   ├── systems/            # Sistemas do Fixed Timestep (Movement, Targeting, Combat, Economy, Frontline)
│   │   ├── ai/                 # Máquina de Estados e Heurísticas dos 4 Perfis de IA
│   │   ├── campaign/           # Grafo procedural de 3 Atos, Nós, Eventos e Motor de Relíquias
│   │   └── GameEngine.ts       # Orquestrador de Tick Determinístico (20 TPS) e Hash de Estado
│   ├── renderer/               # CAMADA VISUAL & ÁUDIO (Phaser 3 / Canvas / Web Audio API)
│   │   ├── scenes/             # Cenas do Phaser (BattleScene, MapScene, RewardScene)
│   │   ├── visuals/            # Fábrica de renderização procedural tática, VFX e Object Pools
│   │   ├── interpolation/      # Interpolador linear de snapshots (20 TPS -> 60+ FPS)
│   │   └── audio/              # Sintetizador sonoro procedural via Web Audio API
│   ├── ui/                     # OVERLAYS E CONTROLES DE INTERFACE
│   │   ├── hud/                # Barra de Cabo de Guerra, Tesouraria/Mina Real, Grid 4x3
│   │   └── screens/            # Telas de Acampamento, Mercador, Escolha de Relíquias e Fim de Jogo
│   └── main.ts                 # Ponto de entrada da aplicação Web (Vite)
├── tests/
│   ├── unit/                   # Testes de regras de negócio (Matriz 4x4, Economia, Alcance, Passivas)
│   ├── simulation/             # Testes de determinismo bit-a-bit (SHA-256) e Fronteiras
│   └── performance/            # Stress test de 200 unidades simultâneas (< 5ms/tick)
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

> [!CAUTION]
> **Regra de Ouro Arquitetural:** Qualquer importação de `phaser`, `window`, `document`, `localStorage` ou `Math.random()` nativo dentro de `src/core/` constitui violação crítica de governança e reprovação imediata no Quality Gate. Toda aleatoriedade em `src/core/` deve fluir exclusivamente da instância semeada `SeededRNG` (`Mulberry32`).

---

## 3. Topologia de Subagentes e Política de Alocação de Modelos

A execução do projeto utiliza uma estratégia **Híbrida Otimizada** de modelos para maximizar o rigor técnico nas camadas críticas enquanto otimiza velocidade e eficiência nas tarefas mecânicas e visuais:

| Papel do Agente | Tipo / Subagente | Modelo Alocado | Modo de Workspace | Escopo de Responsabilidade |
| :--- | :---: | :---: | :---: | :--- |
| **Gerente de Projetos (GP) & Arquiteto Chefe** | Agente Principal | `Argon / High` | Raiz (`main`) | Planejamento de Sprints, contratos de interfaces, revisão de código (Code Review), integração, validação final de testes e `git push`. |
| **Engenheiro de Core & IA (`core-architect`)** | Subagente Especialista | `pro` | `share` ou `inherit` | Loop determinístico (20 TPS), PRNG Mulberry32, Matemática de Combate, Habilidades de Unidades, Heurística de Mira, IA Inimiga e Determinismo SHA-256. |
| **Engenheiro de Gameplay & UI (`gameplay-ui-engineer`)** | Subagente Especialista | `flash` | `share` ou `inherit` | Renderizador Phaser 3, interpolação 60 FPS, Object Pooling visual, HUD, barra de Cabo de Guerra, telas Roguelike e Web Audio. |
| **Engenheiro de QA Estrutural (`qa-automation`)** | Subagente Especialista | `flash` *(ou `pro` p/ debug)* | `share` ou `inherit` | Implementação da Matriz de Testes da Seção 7.3 do GDD (Vitest), auditoria de cobertura, testes de fronteira e benchmark de performance (< 5ms/tick). |
| **Engenheiro de Scaffolding & Docs (`scaffolder-docs`)** | Subagente Especialista | `flash_lite` | `inherit` | Configuração inicial de pacotes (Vite, TS, Vitest), scripts de build, estrutura de pastas e atualização de documentação. |

### Diretrizes de Orquestração para o GP:
1. **Autonomia por Sprint:** O GP coordena os subagentes de ponta a ponta até que todos os entregáveis e critérios de aceite da Sprint estejam 100% implementados, testados e integrados na `main`, apresentando o relatório executivo ao final de cada Sprint.
2. **Contratos Antes de Implementação:** Antes de acionar subagentes em paralelo, o GP (ou o `core-architect`) estabelece os arquivos de tipos e interfaces (`src/core/types.ts` e `src/core/events/DomainEvents.ts`) para evitar conflitos de integração.
3. **Verificação Independente:** Nenhuma entrega de subagente é considerada pronta sem que o GP (ou o `qa-automation`) execute `npm run typecheck` e `npm test` com sucesso absoluto.

---

## 4. Fluxo Git, Versionamento e Integração Contínua

1. **Política da Branch `main`:**
   - A branch `main` deve estar **sempre compilável e com 100% dos testes passando**.
2. **Fluxo de Integração e Sincronização:**
   - As tarefas de uma Sprint são desenvolvidas, verificadas localmente com a suíte automatizada e consolidadas na `main`.
   - Ao atingir cada marco ou entrega validada (100% dos testes verdes + `typecheck` limpo), o GP realiza o commit seguindo o padrão **Conventional Commits** e executa `git push origin main` para manter o repositório remoto sincronizado como fonte única de verdade.
3. **Padrão de Mensagens de Commit (Conventional Commits):**
   - `feat(core): ...` — Novas mecânicas ou sistemas no motor headless.
   - `feat(renderer): ...` — Recursos visuais, cenas Phaser 3, animações ou áudio.
   - `feat(ui): ...` — Componentes de HUD, menus e fluxo de campanha.
   - `test(qa): ...` — Adição ou expansão de testes unitários, determinísticos ou de stress.
   - `fix(<escopo>): ...` — Correções de bugs matemáticos, visuais ou de estado.
   - `docs(<escopo>): ...` — Atualizações em documentos de design, arquitetura ou governança.
   - `chore(<escopo>): ...` — Configurações de build, dependências e ferramentas.

---

## 5. Estratégia Visual e Sonora para o MVP (TypeScript + Navegador)

Como o [`docs/GDD.md`](./GDD.md) define a stack (`TypeScript + Vite + HTML5 Canvas / Phaser 3`) e a direção temática (*Reino da Coroa Solar*), mas não exige dependência de spritesheets externos proprietários para a validação do MVP, fica estabelecida a seguinte arquitetura visual e sonora:

1. **Renderização Tática Procedural de Alta Legibilidade (*Tactical Vector & Procedural Textures*):**
   - As unidades, estruturas geradoras, projéteis e efeitos de área (como a *Supernova da Alvorada* e a *Poça de Fogo Grego*) serão renderizados no Phaser 3 através de um módulo dedicado (`ProceduralAssetFactory`) que gera texturas vetoriais estilizadas em memória durante o boot:
     - **Paleta de Facção:** Azul Real / Ouro Solar (`#FFD700`, `#1E3A8A`, `#F59E0B`) para o Reino da Coroa Solar vs. Carmesim / Ferro Obsidiana (`#991B1B`, `#1F2937`, `#EF4444`) para as forças inimigas.
     - **Silhuetas Distintas por Papel Tático:** Escudos retangulares/brasões para Infantaria (Quartel), silhuetas angulares com arcos/bestas para Arquearia, losangos/halos luminosos para Torre Arcana, estandartes e montarias alongadas para Cavalaria, e chassis pesados de madeira/metal para Forja de Cerco.
     - **Diferenciação Visual Nível 1 vs. Nível 2:** Unidades Nível 2 recebem borda dourada realçada, escala ligeiramente superior ($1.2\times$) e insígnia de elite.
     - **Desacoplamento via `AssetRegistry`:** O renderizador consulta chaves semânticas (`unit_squire`, `unit_royal_knight`, `bldg_barracks_1`). Caso deseje-se substituir as texturas procedurais por sprites PNG/WebP no futuro, basta carregar os arquivos no `PreloadScene` com as mesmas chaves, sem alterar código de cena ou de jogo.
2. **Áudio Sintetizado via Web Audio API (`SoundSynthesizer`):**
   - Efeitos sonoros de impacto de espada, disparo de arco, explosão solar, carga de cavalaria, construção e alertas de Cidadela serão gerados proceduralmente via osciladores e filtros de ruído da **Web Audio API** nativa do navegador, garantindo zero latência de carregamento e independência de arquivos `.mp3`/`.wav` externos.

---

## 6. Harmonizações Técnicas Canônicas do GDD v1.0

Após auditoria técnica cruzada do [`docs/GDD.md`](./GDD.md), ficam oficializadas as seguintes interpretações canônicas para eliminar qualquer ambiguidade durante a codificação e os testes:

1. **Atributos Defensivos das Cidadelas (Nexus Aliado e Inimigo):**
   - *Contexto:* A Seção 2.1 menciona qualitativamente "25% de mitigação contra dano comum", enquanto a Seção 4.1 (Matriz Oficial) e a Seção 4.2 (Exemplo Prático de Teste Unitário 3) definem matematicamente a Cidadela com **Armadura Fortificada** e **Redução Plana = 5**.
   - **Regra Canônica:** Ambas as Cidadelas possuem `maxHp = 2500`, `armorType = 'FORTIFIED'` (Multiplicadores da Seção 4.1: Normal `0.50`, Perfurante `0.35`, Mágico `0.50`, Cerco `2.00`) e `flatReduction = 5`, reproduzindo exatamente o Teste Unitário 3 da Seção 4.2 ($\lfloor 160 \times 2.00 - 5 \rfloor = 315$).
2. **Catapulta de Fogo Grego contra a Cidadela:**
   - *Contexto:* A Seção 3.2 afirma que a Catapulta "Causa 200% de dano contra o Nexus inimigo".
   - **Regra Canônica:** Conforme provado pelo Exemplo 3 da Seção 4.2, esse valor de $200\%$ refere-se ao próprio multiplicador da matriz `Cerco vs. Fortificada` ($M_{\text{tipo}} = 2.00$), não devendo ser multiplicado em duplicidade.
3. **Demolição / Venda de Estruturas no Grid 4x3:**
   - *Contexto:* A Seção 7.3 exige o **Teste de Reembolso de Venda** ($60\%$ do ouro investido).
   - **Regra Canônica:** O jogador pode vender qualquer estrutura construída em seu grid $4 \times 3$. O reembolso é calculado como $\lfloor 0.60 \times (\text{Custo Construção N1} + \text{Custo Upgrade N2 se aplicável}) \rfloor$, liberando imediatamente o slot para nova construção.
4. **Frequência Oficial do Fixed Timestep:**
   - *Contexto:* A Seção 7.1 permite 20 TPS ou 30 TPS.
   - **Regra Canônica:** Fica padronizado **`TICK_RATE = 20` (20 Ticks Por Segundo, $\Delta t = 50\text{ ms} = 0.05\text{ s}$ por tick)** como base determinística oficial de todo o motor headless.

---

## 7. Portões de Qualidade (Definition of Done por Sprint)

Nenhuma Sprint será dada como concluída pelo Gerente de Projetos sem cumprir integralmente o checklist abaixo:

- [ ] **Compilação Estrita:** `tsc --noEmit` executa com zero erros (`strict: true`, `noImplicitAny: true`).
- [ ] **Isolamento Headless Verificado:** Nenhum arquivo em `src/core/` importa módulos visuais ou de navegador.
- [ ] **Suíte de Testes 100% Verde:** Todos os testes unitários e de integração em `tests/` passam sem falhas (`vitest run`).
- [ ] **Determinismo Comprovado:** Duas execuções headless com mesma `seed` e mesma sequência de comandos produzem exatamente o mesmo hash SHA-256 de estado final.
- [ ] **Build de Produção Limpo:** `vite build` gera o bundle web sem erros ou avisos bloqueantes.
- [ ] **Sincronização no Repositório:** Código commitado em Conventional Commits e enviado via `git push origin main`.
