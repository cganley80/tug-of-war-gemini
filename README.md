# Tug of War: Citadels of Aethelgard

**Tug of War: Citadels of Aethelgard** é um jogo tático de estratégia em tempo real do estilo *Line Auto-Battler* (*Nexus Wars* / *Castle Fight*) integrado com progressão procedural **Roguelike Single-Player** em mapa de nós (*Slay the Spire*), desenvolvido em **TypeScript + Vite + Phaser 3**.

---

## Documentação Oficial (Single Source of Truth)

- **[Game Design Document (GDD v1.0)](./docs/GDD.md):** Especificação completa de gameplay, economia em tempo real, facção *Reino da Coroa Solar*, matriz matemática de combate 4x4, progressão Roguelike em 3 Atos, relíquias, perfis de IA e critérios de QA.
- **[Governança Oficial do Repositório](./docs/GOVERNANCE.md):** Arquitetura de camadas (*Headless Core Engine* vs. *Phaser 3 Renderer/UI*), topologia de subagentes e política de alocação de modelos, fluxo Git, harmonizações canônicas do GDD e portões de qualidade (*Definition of Done*).
- **[Relatório de Entrega & Validação GD — Sprint 1](./docs/SPRINT_1_REPORT.md):** Auditoria seção por seção da Sprint 1 contra o GDD v1.0, decisões de harmonização matemática e resultados das 8 suítes de testes automatizados (57/57 verdes).

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
| **Sprint 2: Arsenal Completo, IA & Phaser 3** | Próximo Marco | 5 Estruturas N1/N2 e habilidades únicas completas, IA oponente (4 perfis + matriz de reação), Renderizador Phaser 3 interpolado (60 FPS) e HUD tático. |
| **Sprint 3: Metagame Roguelike, Relíquias & Polimento** | Planejado | Mapa procedural de nós (7 camadas), 8 Relíquias Reais, Chefe do Ato 1 (*O Tirano de Ferro*), persistência local, áudio procedural e polimento final. |

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
