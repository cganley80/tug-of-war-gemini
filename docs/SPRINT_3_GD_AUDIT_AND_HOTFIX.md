# Auditoria de Game Design da Sprint 3 & Especificação de Hotfix P0 (Fechamento do MVP)
**Projeto:** *Tug of War: Citadels of Aethelgard*  
**De:** Gerente de Game Design (GD)  
**Para:** Gerente de Projetos (GP) & Equipe de Engenharia  
**Data:** 06 de Novembro de 2026  
**Referência Base:** Entrega da Sprint 3 (`1e50248`), Hotfix P0 (`dd38d8a`), [`docs/SPRINT_3_REPORT.md`](./SPRINT_3_REPORT.md) e [`docs/SPRINT_3_GD_SPEC.md`](./SPRINT_3_GD_SPEC.md)  
**Status da Entrega da Sprint 3 & Marco MVP:** **100% APROVADA — SIGN-OFF FINAL DE GAME DESIGN CONCEDIDO**

---

## 1. Resumo Executivo da Auditoria de Game Design (Sprint 3)

A equipe de Game Design e QA auditou a entrega da **Sprint 3** (`1e50248`), validando os **150 testes automatizados** (`12/12` suítes verdes no Vitest), o bundle de produção e a implementação matemática do motor e da interface.

### 1.1 O que foi Validado e Aprovado com Excelência:
1. **Correções P0 herdadas da Sprint 2 (`P0-1`, `P0-2`, `P0-3`):**
   - **P0-1 (`AIController.ts`):** Estado de espera econômica (`WAITING_GOLD`) implementado com precisão. *Valerius* e *Thorne* agora poupam ouro disciplinadamente para erguer cavalaria, arcanos, cerco e upgrades Nível 2 sem desperdiçar recursos no fallback de `100g`.
   - **P0-2 (`TacticalHud.ts`):** Memoização por assinatura (`lastGridSignature`) eliminou a destruição de nós DOM a `60 FPS`, tornando os cliques de construção, upgrade e venda 100% responsivos.
   - **P0-3 (`GameEngine.ts`):** Cache por tick de Paladinos vivos (`refreshAlivePaladins`) reduziu o custo do `StressTest200Units.test.ts` de `~9.32ms/tick` para `~1.5ms–2.5ms/tick` (bem abaixo do orçamento de `5.0ms`).
2. **Catálogo e Matemática das 8 Relíquias (`RelicsCatalog.ts`, `GameEngine.ts`, `CombatResolver.ts`):**
   - Todas as 8 relíquias respeitam rigorosamente o pipeline determinístico de `20 TPS` e os ganchos de combate do GDD v1.1.
3. **Isolamento Arquitetural Headless (`CampaignManager.ts` vs. `CampaignStorage.ts`):**
   - `src/core/campaign/CampaignManager.ts` mantém zero dependências de navegador, serializando de forma determinística via `CampaignStorage.ts`.

---

## 2. Bloqueadores Críticos de Game Design Descobertos na Campanha (`P0-A`, `P0-B`, `P0-C`)

Embora os testes unitários passem, nossa inspeção profunda do **loop real de jogo humano** na Campanha Roguelike ([`CampaignManager.ts`](../src/core/campaign/CampaignManager.ts), [`CampaignOverlay.ts`](../src/ui/screens/CampaignOverlay.ts), [`TacticalHud.ts`](../src/ui/hud/TacticalHud.ts) e [`main.ts`](../src/main.ts)) revelou **3 falhas críticas de progressão e UX** que quebram a experiência do jogador já na primeira partida:

---

### [P0-A] Quebra de Progressão no Mapa: Nós Podem Ser Pulados Sem Resolver OU Farmados Infinitamente
- **Onde ocorre:** [`CampaignManager.ts`](../src/core/campaign/CampaignManager.ts) (`getAvailableNextNodes`, `travelToNode`, `completeBattle`) e [`CampaignOverlay.ts`](../src/ui/screens/CampaignOverlay.ts) (`renderMapScreen`).
- **Diagnóstico de Game Design:**
  1. `CampaignState` rastreia `currentNodeId` e `visitedNodeIds`, mas **não rastreia se o nó atual já foi resolvido/concluído** (`resolvedNodeIds`).
  2. Como `getAvailableNextNodes()` retorna incondicionalmente `current.outgoingNodeIds`, assim que o jogador inicia a Run na Camada 0 (`node_0_0`), os nós da Camada 1 (`node_1_0` e `node_1_1`) **já estão abertos com o botão `➔ Avançar`**. O jogador pode clicar em `➔ Avançar` de nó em nó e chegar até a Cidadela do Chefe sem vencer uma única batalha!
  3. Inversamente, após vencer a batalha de um nó (ex.: `node_0_0`) e escolher sua Relíquia, o jogador volta para o Mapa ainda posicionado em `node_0_0`, e o botão `⚔️ Iniciar Batalha` continua ativo no mesmo nó. Isso permite lutar o `node_0_0` infinitas vezes para farmar ouro infinito (`+50g` por vitória) e todas as 8 Relíquias ainda na Camada 0.
- **Regra Canônica Obrigatória (Solução Técnica):**
  - Adicionar `resolvedNodeIds: string[]` ao `CampaignState` (inicializado como `[]` e incluído em `serialize()` / `deserialize()` com fallback `data.state.resolvedNodeIds ? [...data.state.resolvedNodeIds] : []` para retrocompatibilidade).
  - Criar o método `public isNodeResolved(nodeId: string = this.state.currentNodeId): boolean` em `CampaignManager`.
  - **Bloqueio de Avanço Prematuro:** `getAvailableNextNodes()` e `travelToNode(targetNodeId)` só devem liberar a transição para `current.outgoingNodeIds` se `this.isNodeResolved(this.state.currentNodeId)` for `true`.
  - **Marcação de Resolução por Tipo de Nó:**
    - `BATTLE`, `ELITE`, `BOSS`: marcados como resolvidos dentro de `completeBattle()` quando `isPlayerWinner === true` e `this.state.playerCitadelHp > 0`. Se o nó já estiver em `resolvedNodeIds`, `completeBattle()` deve ignorar recompensas duplicadas.
    - `MERCHANT`: marcado como resolvido imediatamente ao entrar no nó dentro de `travelToNode()` (pois o Mercador permite múltiplas compras opcionais enquanto o jogador está estacionado nele e não deve bloquear a saída caso o jogador decida não comprar nada).

---

### [P0-B] Exploit de "Fogueira Infinita" e "Evento Infinito"
- **Onde ocorre:** [`CampaignManager.ts`](../src/core/campaign/CampaignManager.ts) (`applyCampfireAction`, `resolveEventChoice`) e [`CampaignOverlay.ts`](../src/ui/screens/CampaignOverlay.ts).
- **Diagnóstico de Game Design:**
  1. Quando o jogador entra na Fogueira (`node_4_0`) e escolhe uma opção (`REPAIR`, `FORGE` ou `INSPIRATION`), `CampaignOverlay` aplica o bônus e retorna para a tela `MAP`.
  2. Como o `node_4_0` continua sendo o `currentNodeId` e não foi marcado como resolvido, o botão `🔥 Acessar Fogueira` continua visível no Mapa. O jogador pode reabrir a Fogueira dezenas de vezes seguidas, acumulando `+1000%` de dano na Forja, `+2500 HP` na Cidadela e `+1000g` de Ouro Inicial!
  3. O exato mesmo exploit ocorre nos nós de `EVENT` (`resolveEventChoice`): ao voltar ao Mapa, clicar em `❓ Ver Evento` reabre o evento e permite acionar a recompensa infinitamente.
- **Regra Canônica Obrigatória (Solução Técnica):**
  - Em `applyCampfireAction(action)` e `resolveEventChoice(eventId, choice)`:
    - Verificar no início: `if (this.isNodeResolved(node.id)) return false;`.
    - Assim que a ação da Fogueira ou a escolha do Evento for aplicada com sucesso (`return true`), adicionar `node.id` em `this.state.resolvedNodeIds`.
  - Na UI do Mapa (`CampaignOverlay.ts` — `renderMapScreen` e `bindMapEvents`):
    - Se `this.campaign.isNodeResolved(currentNode.id)` for `true` e `currentNode.type !== 'MERCHANT'`, **não exibir** os botões de ação repetida (`⚔️ Iniciar Batalha`, `🔥 Acessar Fogueira`, `❓ Ver Evento`) nem permitir reabrir o modal ao clicar no card do nó atual; em vez disso, exibir o selo `✓ Concluído` no nó atual e orientar o jogador no rodapé a clicar em um dos nós disponíveis da próxima camada (`➔ Avançar`).
    - Para nós `MERCHANT`, mesmo com `isNodeResolved === true` (para liberar o avanço), o jogador ainda pode clicar em `🛒 Abrir Tenda do Mercador` enquanto estiver estacionado no nó do Mercador caso queira gastar mais ouro antes de avançar para a próxima camada.

---

### [P0-C] Conflito de Modal `z-index` no Fim da Batalha de Campanha e Ejeção Acidental para Skirmish
- **Onde ocorre:** [`TacticalHud.ts`](../src/ui/hud/TacticalHud.ts) (`#hud-gameover-modal`, `updateGameOver`), [`CampaignOverlay.ts`](../src/ui/screens/CampaignOverlay.ts) (`#campaign-overlay-root`) e [`main.ts`](../src/main.ts) (`uiUpdateLoop`).
- **Diagnóstico de UX / Game Design:**
  1. Ao término de qualquer batalha da Campanha (`snapshot.isGameOver === true`), o `hud.update()` chama `TacticalHud.updateGameOver(snapshot)`, que exibe imediatamente o `#hud-gameover-modal` com **`z-index: 9999`** e o botão `"Jogar Novamente"`.
  2. `1200ms` depois (`main.ts#L221`), o `campaignOverlay.show('RELIC_REWARD' | 'RUN_OVER' | 'RUN_VICTORY')` abre com **`z-index: 9998`** — ficando **escondido atrás** do `#hud-gameover-modal` (`z-index: 9999`)!
  3. Pior ainda: como o único botão visível na frente é `"Jogar Novamente"` do `#hud-gameover-modal`, quando o jogador clica nele, o callback `onRestartGame` define `isCampaignBattle = false` (`main.ts#L78`) e **ejeta o jogador da sua Campanha para uma partida avulsa (Skirmish)**!
  4. Além disso, `startCampaignNodeBattle()` não ocultava `#hud-gameover-modal` caso uma partida avulsa anterior tivesse terminado.
- **Regra Canônica Obrigatória (Solução Técnica):**
  1. Em `TacticalHud.ts`:
     - Adicionar um método público `public hideGameOverModal(): void { this.elGameOverModal.style.display = 'none'; }` e chamá-lo dentro de `invalidateGrid()` (ou ao iniciar qualquer batalha em `main.ts`).
     - Adicionar o parâmetro opcional `suppressGameOverModal: boolean = false` em `hud.update(..., suppressGameOverModal)` (ou `updateGameOver(snapshot, suppressGameOverModal)`). Quando `isCampaignBattle === true` em `main.ts`, passar `suppressGameOverModal = true` para que o `#hud-gameover-modal` de Skirmish **nunca** apareça em batalhas da Campanha.
  2. Em `CampaignOverlay.ts`:
     - Elevar o `z-index` de `#campaign-overlay-root` de `9998` para `10000`.

---

## 3. Critérios de Aceite do Hotfix P0 (Checklist de Fechamento do MVP — Validado em `dd38d8a`)

- [x] **CA-Hotfix-1 (`CampaignManager.ts`):** Um jogador recém-iniciado em `node_0_0` (`isNodeResolved('node_0_0') === false`) recebe `[]` em `getAvailableNextNodes()` e `false` ao tentar `travelToNode('node_1_0')` antes de vencer a batalha de `node_0_0`.
- [x] **CA-Hotfix-2 (`CampaignManager.ts`):** Após vencer `node_0_0`, `isNodeResolved('node_0_0')` passa a ser `true`, `getAvailableNextNodes()` libera `node_1_0` e `node_1_1`, e chamadas subsequentes a `completeBattle()` no mesmo `node_0_0` não concedem ouro nem relíquias duplicadas.
- [x] **CA-Hotfix-3 (`CampaignManager.ts`):** Em nós `CAMPFIRE` e `EVENT`, a primeira execução de `applyCampfireAction` ou `resolveEventChoice` resolve o nó (`isNodeResolved === true`) e libera o avanço; uma segunda tentativa no mesmo nó retorna `false` sem acumular bônus duplicados.
- [x] **CA-Hotfix-4 (`CampaignManager.ts`):** Ao viajar para um nó `MERCHANT` via `travelToNode`, o nó já permite avançar para a camada seguinte (`isNodeResolved === true`), mas continua permitindo compras (`buyMerchantRelic`, `buyMerchantRepair`) enquanto o jogador permanecer estacionado nele.
- [x] **CA-Hotfix-5 (`CampaignOverlay.ts` & `TacticalHud.ts` & `main.ts`):** Ao vencer ou perder uma batalha de Campanha, o `#hud-gameover-modal` de Skirmish não é exibido, e após `1200ms` o `CampaignOverlay` (`z-index: 10000`) abre diretamente na tela `RELIC_REWARD`, `RUN_VICTORY` ou `RUN_OVER`.
- [x] **CA-Hotfix-6 (Testes Automatizados):** Novos testes cobrindo os bloqueios `P0-A`, `P0-B` e `P0-C` adicionados à suíte Vitest com 100% de aprovação (`156/156` testes verdes em `npm test`, `npm run typecheck`, `npm run build`).

---
*Assinado:*  
**Gerente de Game Design (GD)**  
*Tug of War: Citadels of Aethelgard*
