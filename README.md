# Tug of War: Citadels of Aethelgard

**Tug of War: Citadels of Aethelgard** é um jogo tático de estratégia em tempo real do estilo *Line Auto-Battler* (*Nexus Wars* / *Castle Fight*) integrado com progressão procedural **Roguelike Single-Player** em mapa de nós (*Slay the Spire*), desenvolvido em **TypeScript + Vite + Phaser 3**.

---

## Documentação Oficial (Single Source of Truth)

- **[Game Design Document (GDD v1.1)](./docs/GDD.md):** Especificação completa de gameplay, economia em tempo real, facção *Reino da Coroa Solar*, matriz matemática de combate 4x4, progressão Roguelike em 3 Atos, relíquias, perfis de IA e critérios de QA.
- **[Governança Oficial do Repositório](./docs/GOVERNANCE.md):** Arquitetura de camadas (*Headless Core Engine* vs. *Phaser 3 Renderer/UI*), topologia de subagentes e política de alocação de modelos, fluxo Git, harmonizações canônicas do GDD e portões de qualidade (*Definition of Done*).
- **[Relatório de Entrega & Validação GD — Sprint 1](./docs/SPRINT_1_REPORT.md):** Auditoria seção por seção da Sprint 1 contra o GDD v1.0, decisões de harmonização matemática e resultados das 8 suítes de testes automatizados (57/57 verdes).
- **[Parecer de Sign-off Sprint 1 & Especificação GD — Sprint 2](./docs/SPRINT_2_GD_SPEC.md):** Homologação da Sprint 1 pelo Game Designer, correções P0 de gameplay e especificação matemática estrita das 10 habilidades, 4 perfis de IA e HUD/Phaser 3.
- **[Relatório de Entrega & Validação GD — Sprint 2](./docs/SPRINT_2_REPORT.md):** Relatório executivo da Sprint 2 (resolução dos 3 itens P0, 10 habilidades, 4 perfis de IA, Phaser 3 interpolado a 60 FPS + HUD tático e 111/111 testes verdes).
- **[Parecer de Sign-off Sprint 2 & Especificação GD — Sprint 3](./docs/SPRINT_3_GD_SPEC.md):** Homologação da Sprint 2 pelo Game Designer, correções P0 (Save Gold, Memoização DOM e Pré-filtro de Aura) e especificação das 8 Relíquias Reais e Campanha Roguelike de 7 camadas.
- **[Relatório de Entrega & Validação GD — Sprint 3 (Fechamento MVP)](./docs/SPRINT_3_REPORT.md):** Relatório executivo final do MVP com todas as 3 Sprints concluídas e 150/150 testes automatizados aprovados.

---

## Arquitetura Técnica

1. **Core Simulation Engine (`src/core/`):**
   - Motor determinístico *headless* em TypeScript puro (zero dependências de DOM ou renderizador).
   - Loop de simulação em *Fixed Timestep* (`20 TPS` / `50ms` por tick) com PRNG semeado (`Mulberry32`).
   - Comunicação desacoplada via `DomainEventBus`.
2. **Camada de Visualização & UI (`src/renderer/` e `src/ui/`):**
   - Renderização a `60 FPS` via Phaser 3 / HTML5 Canvas com interpolação linear ($\alpha$) entre snapshots lógicos.
   - Texturas vetoriais procedurais de alta legibilidade tática e áudio sintetizado via Web Audio API.
3. **Qualidade & Testes Automatizados (`tests/`):**
   - Suíte automatizada via Vitest cobrindo invariância matemática da Matriz 4x4, consistência econômica, determinismo bit-a-bit (SHA-256) e stress test de 200 unidades simultâneas (`< 5ms/tick`).

---

## Roadmap de Execução (MVP)

| Marco | Status | Escopo Principal |
| :--- | :---: | :--- |
| **Marco 0: Governança & Fundação Documental** | Concluído | `docs/GDD.md` v1.0 e `docs/GOVERNANCE.md` oficializados no repositório. |
| **Sprint 1: Core Headless & Arena Linear Básica** | Concluído (57/57 testes) | Setup TS/Vite/Vitest, PRNG Mulberry32, Fixed Timestep 20 TPS, Grid 4x3, Economia/Mina Real, Quartel e Arquearia N1/N2, Cidadelas, Cabo de Guerra e suíte de testes determinísticos. |
| **Sprint 2: Arsenal Completo, IA & Phaser 3** | Concluído (111/111 testes) | Correções P0 de GD, 5 Estruturas N1/N2 e 10 habilidades únicas completas, IA oponente (4 perfis + matriz de reação + Guerreiro Colossal), Renderizador Phaser 3 interpolado (60 FPS), Web Audio e HUD tático. |
| **Sprint 3: Metagame Roguelike, Relíquias & Polimento** | Concluído (150/150 testes) | Correções P0 (Save Gold, Memoização DOM, Pré-filtro Aura), 8 Relíquias Reais, Grafo procedural de 7 camadas (Batalha, Elite, Fogueira, Mercador, 3 Eventos, Boss), persistência em `localStorage` e telas completas de campanha. |

---

## Como Executar e Validar

```bash
# Instalar dependências
npm install

# Executar suíte de testes determinísticos e de performance (Vitest)
npm test

# Validar tipagem estrita (TypeScript)
npm run typecheck

# Iniciar servidor de desenvolvimento interativo no navegador
npm run dev

# Gerar bundle de produção
npm run build
```
