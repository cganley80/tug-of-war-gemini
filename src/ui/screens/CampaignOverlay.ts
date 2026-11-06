/**
 * Tug of War: Citadels of Aethelgard
 * CampaignOverlay: Metagame Roguelike Interactive Screen Suite (Sprint 3 & Section 3)
 * Renders the 7-layer Act 1 DAG graph, Campfire resting, Merchant shop,
 * Crossroads narrative events, 3-choice Relic draft, and Run victory/game over.
 */

import { CampaignManager } from '../../core/campaign/CampaignManager';
import { CampaignNode, CampfireActionId } from '../../core/types';
import { RELICS_CATALOG, RelicTypeId, RelicRarity } from '../../core/config/RelicsCatalog';
import { getEventDefinition } from '../../core/config/EventsCatalog';
import { CampaignStorage } from '../storage/CampaignStorage';
import { CITADEL_MAX_HP } from '../../core/config/ArenaConfig';

export interface CampaignOverlayCallbacks {
  onStartBattle: (node: CampaignNode) => void;
  onCampaignReset: () => void;
  onCloseMap?: () => void;
}

type OverlayView =
  | 'MAP'
  | 'CAMPFIRE'
  | 'MERCHANT'
  | 'EVENT'
  | 'RELIC_REWARD'
  | 'RUN_OVER'
  | 'RUN_VICTORY';

interface NodeCoords {
  x: number; // percentage 0..100
  y: number; // percentage 0..100
}

const NODE_POSITIONS: Record<string, NodeCoords> = {
  node_0_0: { x: 7, y: 50 },
  node_1_0: { x: 21, y: 35 },
  node_1_1: { x: 21, y: 65 },
  node_2_0: { x: 35, y: 22 },
  node_2_1: { x: 35, y: 50 },
  node_2_2: { x: 35, y: 78 },
  node_3_0: { x: 50, y: 35 },
  node_3_1: { x: 50, y: 65 },
  node_4_0: { x: 64, y: 50 },
  node_5_0: { x: 78, y: 35 },
  node_5_1: { x: 78, y: 65 },
  node_6_0: { x: 92, y: 50 },
};

export class CampaignOverlay {
  private readonly container: HTMLElement;
  private readonly callbacks: CampaignOverlayCallbacks;
  private campaign: CampaignManager;
  private currentView: OverlayView = 'MAP';

  // Last event result message to display after decision
  private eventResultNotice: string | null = null;

  constructor(
    parentContainer: HTMLElement,
    campaign: CampaignManager,
    callbacks: CampaignOverlayCallbacks
  ) {
    this.campaign = campaign;
    this.callbacks = callbacks;

    this.container = document.createElement('div');
    this.container.id = 'campaign-overlay';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(5, 7, 10, 0.94);
      z-index: 9998;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      overflow-y: auto;
      padding: 16px;
      box-sizing: border-box;
      backdrop-filter: blur(4px);
    `;

    parentContainer.appendChild(this.container);
    this.render();
  }

  public setCampaign(campaign: CampaignManager): void {
    this.campaign = campaign;
    this.eventResultNotice = null;
    this.evaluateAutomaticView();
    this.render();
  }

  public show(view: OverlayView = 'MAP'): void {
    this.container.style.display = 'flex';
    this.currentView = view;
    this.evaluateAutomaticView();
    this.render();
  }

  public hide(): void {
    this.container.style.display = 'none';
  }

  public isVisible(): boolean {
    return this.container.style.display !== 'none';
  }

  /**
   * Evaluates the active node and sets corresponding special screens if applicable.
   */
  private evaluateAutomaticView(): void {
    if (this.campaign.state.isRunOver) {
      this.currentView = this.campaign.state.isVictory ? 'RUN_VICTORY' : 'RUN_OVER';
      return;
    }

    if (this.campaign.rewardRelicChoices.length > 0) {
      this.currentView = 'RELIC_REWARD';
      return;
    }

    const currentNode = this.campaign.getCurrentNode();
    if (this.currentView === 'MAP') {
      // Keep MAP as user default when inspecting
      return;
    }

    if (currentNode.type === 'CAMPFIRE') {
      this.currentView = 'CAMPFIRE';
    } else if (currentNode.type === 'MERCHANT') {
      this.currentView = 'MERCHANT';
    } else if (currentNode.type === 'EVENT') {
      this.currentView = 'EVENT';
    }
  }

  // =========================================================================
  // MAIN RENDER DISPATCHER
  // =========================================================================

  public render(): void {
    this.container.innerHTML = '';

    // 1. Top Persistent Campaign Bar (HUD of the Run)
    const headerEl = this.renderCampaignHeader();
    this.container.appendChild(headerEl);

    // 2. Main Content Body according to active view
    const bodyEl = document.createElement('div');
    bodyEl.style.cssText = `
      width: 100%;
      max-width: 1140px;
      margin-top: 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
    `;

    switch (this.currentView) {
      case 'MAP':
        bodyEl.appendChild(this.renderMapGraphView());
        break;
      case 'CAMPFIRE':
        bodyEl.appendChild(this.renderCampfireView());
        break;
      case 'MERCHANT':
        bodyEl.appendChild(this.renderMerchantView());
        break;
      case 'EVENT':
        bodyEl.appendChild(this.renderEventView());
        break;
      case 'RELIC_REWARD':
        bodyEl.appendChild(this.renderRelicRewardView());
        break;
      case 'RUN_OVER':
        bodyEl.appendChild(this.renderRunOverView(false));
        break;
      case 'RUN_VICTORY':
        bodyEl.appendChild(this.renderRunOverView(true));
        break;
    }

    this.container.appendChild(bodyEl);
  }

  // =========================================================================
  // 1. PERSISTENT CAMPAIGN HEADER
  // =========================================================================

  private renderCampaignHeader(): HTMLElement {
    const state = this.campaign.state;
    const header = document.createElement('div');
    header.style.cssText = `
      width: 100%;
      max-width: 1140px;
      background: #0b0f19;
      border: 2px solid #334155;
      border-radius: 8px;
      padding: 10px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.6);
      box-sizing: border-box;
    `;

    // Citadel HP bar
    const hpRatio = Math.max(0, Math.min(100, (state.playerCitadelHp / CITADEL_MAX_HP) * 100));
    const hpColor = hpRatio > 50 ? '#22c55e' : hpRatio > 25 ? '#f59e0b' : '#ef4444';

    // Relics list
    let relicsHtml = '';
    if (state.activeRelicIds.length === 0) {
      relicsHtml = '<span style="color:#64748b; font-style:italic; font-size:11px;">Nenhuma relíquia</span>';
    } else {
      for (const id of state.activeRelicIds) {
        const def = RELICS_CATALOG[id];
        if (!def) continue;
        const color = this.getRarityColor(def.rarity);
        relicsHtml += `
          <span title="${def.name} (${def.rarity}):\n${def.description}" style="border:1px solid ${color}; color:#f8fafc; background:#1e293b; padding:2px 7px; border-radius:4px; font-size:11px; cursor:help;">
            ✦ ${def.name}
          </span>
        `;
      }
    }

    header.innerHTML = `
      <!-- Left: Act Title & Citadel HP -->
      <div style="display:flex; align-items:center; gap:18px;">
        <div>
          <div style="font-size:11px; color:#94a3b8; text-transform:uppercase; letter-spacing:1px;">Jornada Roguelike</div>
          <div style="font-size:16px; font-weight:bold; color:#ffd700;">Ato 1: Fronteiras de Aethelgard</div>
        </div>

        <!-- Persistent Citadel HP -->
        <div style="display:flex; flex-direction:column; gap:3px;">
          <div style="font-size:11px; color:#cbd5e1; display:flex; justify-content:space-between; gap:12px;">
            <span>Integridade da Cidadela:</span>
            <b style="color:${hpColor};">${state.playerCitadelHp} / ${CITADEL_MAX_HP} HP</b>
          </div>
          <div style="width:140px; height:8px; background:#1e293b; border-radius:4px; overflow:hidden; border:1px solid #334155;">
            <div style="width:${hpRatio}%; height:100%; background:${hpColor}; transition:width 0.3s;"></div>
          </div>
        </div>
      </div>

      <!-- Center: Persistent Economy & Modifiers -->
      <div style="display:flex; align-items:center; gap:18px;">
        <!-- Campaign Gold -->
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:18px;">🪙</span>
          <div>
            <div style="font-size:10px; color:#94a3b8; text-transform:uppercase;">Ouro Soberano</div>
            <div style="font-size:16px; font-weight:900; color:#fbbf24;">${state.campaignGold}g</div>
          </div>
        </div>

        <!-- Forge Damage Bonus -->
        ${
          state.campaignDamageBonus > 0
            ? `<div style="display:flex; align-items:center; gap:4px; background:#37240c; border:1px solid #d97706; padding:3px 8px; border-radius:4px; font-size:11px; color:#fde68a;">
                <b>⚔️ +${Math.round(state.campaignDamageBonus * 100)}% Dano</b>
              </div>`
            : ''
        }

        <!-- Next Battle Bonus Gold -->
        ${
          state.nextBattleBonusGold > 0
            ? `<div style="display:flex; align-items:center; gap:4px; background:#064e3b; border:1px solid #059669; padding:3px 8px; border-radius:4px; font-size:11px; color:#a7f3d0;">
                <b>💰 +${state.nextBattleBonusGold}g Batalha</b>
              </div>`
            : ''
        }
      </div>

      <!-- Right: Relics Inventory & Navigation Buttons -->
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; max-width:280px;">
          ${relicsHtml}
        </div>

        <!-- Close / Minimize Button (Returns to battle view if run is active) -->
        <button id="overlay-btn-close" style="background:#334155; color:#f8fafc; border:1px solid #475569; padding:6px 12px; border-radius:4px; font-size:12px; font-weight:bold; cursor:pointer;" title="Ver campo de batalha">
          ✕ Fechar
        </button>
      </div>
    `;

    // Hook Close Button
    const btnClose = header.querySelector('#overlay-btn-close') as HTMLButtonElement | null;
    btnClose?.addEventListener('click', () => {
      this.hide();
      this.callbacks.onCloseMap?.();
    });

    return header;
  }

  // =========================================================================
  // 2. DAG MAP GRAPH VIEW (7 LAYERS / COLUMNS 0 TO 6)
  // =========================================================================

  private renderMapGraphView(): HTMLElement {
    const card = document.createElement('div');
    card.style.cssText = `
      width: 100%;
      background: #0f172a;
      border: 2px solid #1e293b;
      border-radius: 10px;
      padding: 20px 24px;
      box-sizing: border-box;
      box-shadow: 0 0 25px rgba(0,0,0,0.8);
      position: relative;
    `;

    // Map Header Instructions
    const currentNode = this.campaign.getCurrentNode();
    const availableNodes = this.campaign.getAvailableNextNodes();

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div>
          <h2 style="margin:0; font-size:18px; color:#f8fafc; letter-spacing:0.5px;">Mapa Estratégico de Avanço</h2>
          <div style="font-size:12px; color:#94a3b8; margin-top:2px;">
            Local Atual: <b style="color:#f59e0b;">${currentNode.name} (${this.getNodeTypeName(currentNode.type)})</b> — Camada ${currentNode.layer} de 6
          </div>
        </div>

        <div style="display:flex; gap:10px;">
          <!-- If current node is a special interactive node, allow reopening it -->
          ${
            currentNode.type === 'CAMPFIRE'
              ? `<button id="map-btn-open-current" style="background:#b45309; color:#fff; border:none; padding:6px 14px; border-radius:4px; font-size:12px; font-weight:bold; cursor:pointer;">🔥 Acessar Fogueira</button>`
              : currentNode.type === 'MERCHANT'
              ? `<button id="map-btn-open-current" style="background:#0284c7; color:#fff; border:none; padding:6px 14px; border-radius:4px; font-size:12px; font-weight:bold; cursor:pointer;">⚖️ Abrir Mercador</button>`
              : currentNode.type === 'EVENT'
              ? `<button id="map-btn-open-current" style="background:#7c3aed; color:#fff; border:none; padding:6px 14px; border-radius:4px; font-size:12px; font-weight:bold; cursor:pointer;">❓ Ver Evento</button>`
              : (currentNode.type === 'BATTLE' || currentNode.type === 'ELITE' || currentNode.type === 'BOSS')
              ? `<button id="map-btn-open-current" style="background:#dc2626; color:#fff; border:none; padding:6px 16px; border-radius:4px; font-size:12px; font-weight:bold; cursor:pointer; box-shadow:0 0 10px #dc2626;">⚔️ Iniciar Batalha</button>`
              : ''
          }
          <button id="map-btn-reset-run" style="background:#1e293b; color:#ef4444; border:1px solid #ef4444; padding:6px 12px; border-radius:4px; font-size:11px; cursor:pointer;">
            Abandonar Run
          </button>
        </div>
      </div>

      <!-- Graph Stage: Relative Container with SVG Paths & Node Buttons -->
      <div id="map-stage" style="position:relative; width:100%; height:460px; background:#070b14; border:1px solid #334155; border-radius:8px; overflow:hidden;">
        <svg id="map-svg-lines" style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none;"></svg>
        <div id="map-nodes-container" style="position:absolute; top:0; left:0; width:100%; height:100%;"></div>
      </div>

      <!-- Footer Legend -->
      <div style="display:flex; justify-content:center; gap:20px; margin-top:14px; font-size:11px; color:#94a3b8;">
        <span>⚔️ Batalha Comum</span>
        <span>💀 Combate de Elite</span>
        <span>🔥 Fogueira da Guarda</span>
        <span>⚖️ Mercador Errante</span>
        <span>❓ Encruzilhada</span>
        <span>👑 O Tirano de Ferro (Chefe)</span>
      </div>
    `;

    // Hook buttons
    card.querySelector('#map-btn-open-current')?.addEventListener('click', () => {
      if (currentNode.type === 'CAMPFIRE') {
        this.currentView = 'CAMPFIRE';
        this.render();
      } else if (currentNode.type === 'MERCHANT') {
        this.currentView = 'MERCHANT';
        this.render();
      } else if (currentNode.type === 'EVENT') {
        this.currentView = 'EVENT';
        this.render();
      } else {
        this.hide();
        this.callbacks.onStartBattle(currentNode);
      }
    });

    card.querySelector('#map-btn-reset-run')?.addEventListener('click', () => {
      if (confirm('Tem certeza que deseja abandonar a campanha atual? Todo o progresso será perdido.')) {
        this.callbacks.onCampaignReset();
      }
    });

    // Populate SVG lines and nodes in stage
    const svgEl = card.querySelector('#map-svg-lines') as SVGElement;
    const nodesContainer = card.querySelector('#map-nodes-container') as HTMLElement;

    this.renderGraphConnections(svgEl);
    this.renderGraphNodes(nodesContainer, currentNode, availableNodes);

    return card;
  }

  private renderGraphConnections(svg: SVGElement): void {
    const visitedSet = new Set(this.campaign.state.visitedNodeIds);
    const currentNodeId = this.campaign.state.currentNodeId;

    let svgLines = '';

    for (const [nodeId, node] of Object.entries(this.campaign.nodes)) {
      const fromPos = NODE_POSITIONS[nodeId];
      if (!fromPos) continue;

      for (const targetId of node.outgoingNodeIds) {
        const toPos = NODE_POSITIONS[targetId];
        if (!toPos) continue;

        // Determine edge visual style
        const isTraversed = visitedSet.has(nodeId) && visitedSet.has(targetId);
        const isNextStep = nodeId === currentNodeId;

        let stroke = '#334155';
        let strokeWidth = '2';
        let dash = 'none';

        if (isTraversed) {
          stroke = '#22c55e';
          strokeWidth = '3';
        } else if (isNextStep) {
          stroke = '#38bdf8';
          strokeWidth = '2.5';
          dash = '4 3';
        }

        svgLines += `
          <line
            x1="${fromPos.x}%"
            y1="${fromPos.y}%"
            x2="${toPos.x}%"
            y2="${toPos.y}%"
            stroke="${stroke}"
            stroke-width="${strokeWidth}"
            stroke-dasharray="${dash}"
          />
        `;
      }
    }

    svg.innerHTML = svgLines;
  }

  private renderGraphNodes(
    container: HTMLElement,
    currentNode: CampaignNode,
    availableNodes: CampaignNode[]
  ): void {
    const visitedSet = new Set(this.campaign.state.visitedNodeIds);
    const availableIds = new Set(availableNodes.map((n) => n.id));

    for (const [nodeId, node] of Object.entries(this.campaign.nodes)) {
      const pos = NODE_POSITIONS[nodeId];
      if (!pos) continue;

      const isCurrent = nodeId === currentNode.id;
      const isVisited = visitedSet.has(nodeId);
      const isAvailable = availableIds.has(nodeId);

      const nodeButton = document.createElement('div');
      nodeButton.style.cssText = `
        position: absolute;
        left: ${pos.x}%;
        top: ${pos.y}%;
        transform: translate(-50%, -50%);
        width: 104px;
        min-height: 52px;
        background: ${isCurrent ? '#1e3a8a' : isVisited ? '#111827' : isAvailable ? '#0f2942' : '#090d16'};
        border: ${isCurrent ? '2px solid #ffd700' : isAvailable ? '2px solid #38bdf8' : isVisited ? '1px solid #059669' : '1px solid #1e293b'};
        border-radius: 8px;
        padding: 6px 8px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        cursor: ${isAvailable || isCurrent ? 'pointer' : 'default'};
        box-shadow: ${isCurrent ? '0 0 16px rgba(255, 215, 0, 0.6)' : isAvailable ? '0 0 12px rgba(56, 189, 248, 0.4)' : 'none'};
        opacity: ${isVisited && !isCurrent ? '0.7' : isAvailable || isCurrent ? '1.0' : '0.45'};
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      `;

      const icon = this.getNodeIcon(node.type);
      const typeLabel = this.getNodeTypeName(node.type);

      nodeButton.innerHTML = `
        <div style="font-size:16px;">${icon}</div>
        <div style="font-size:10px; font-weight:bold; color:${isCurrent ? '#ffd700' : isAvailable ? '#38bdf8' : '#e2e8f0'}; line-height:1.2; margin-top:2px;">
          ${node.name}
        </div>
        <div style="font-size:9px; color:#94a3b8; margin-top:1px;">
          ${isCurrent ? '⭐ Atual' : isVisited ? '✓ Visitado' : isAvailable ? '➔ Avançar' : typeLabel}
        </div>
      `;

      // Hover effect for interactive nodes
      if (isAvailable || isCurrent) {
        nodeButton.onmouseenter = () => {
          nodeButton.style.transform = 'translate(-50%, -50%) scale(1.08)';
        };
        nodeButton.onmouseleave = () => {
          nodeButton.style.transform = 'translate(-50%, -50%) scale(1.0)';
        };

        nodeButton.onclick = () => {
          if (isCurrent) {
            // Re-open current special screen or start battle
            if (node.type === 'CAMPFIRE') {
              this.currentView = 'CAMPFIRE';
              this.render();
            } else if (node.type === 'MERCHANT') {
              this.currentView = 'MERCHANT';
              this.render();
            } else if (node.type === 'EVENT') {
              this.currentView = 'EVENT';
              this.render();
            } else {
              this.hide();
              this.callbacks.onStartBattle(node);
            }
          } else if (isAvailable) {
            // Travel to clicked connected node
            const success = this.campaign.travelToNode(node.id);
            if (success) {
              CampaignStorage.save(this.campaign);

              if (node.type === 'CAMPFIRE') {
                this.currentView = 'CAMPFIRE';
                this.render();
              } else if (node.type === 'MERCHANT') {
                this.currentView = 'MERCHANT';
                this.render();
              } else if (node.type === 'EVENT') {
                this.currentView = 'EVENT';
                this.render();
              } else {
                // Battle, Elite or Boss node: open battle immediately
                this.hide();
                this.callbacks.onStartBattle(node);
              }
            }
          }
        };
      }

      container.appendChild(nodeButton);
    }
  }

  // =========================================================================
  // 3. CAMPFIRE VIEW (3 CANONICAL CHOICES)
  // =========================================================================

  private renderCampfireView(): HTMLElement {
    const card = document.createElement('div');
    card.style.cssText = `
      width: 100%;
      max-width: 860px;
      background: #0f172a;
      border: 2px solid #b45309;
      border-radius: 12px;
      padding: 28px 36px;
      box-sizing: border-box;
      box-shadow: 0 0 30px rgba(180, 83, 9, 0.4);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    `;

    const state = this.campaign.state;
    const projectedHp = Math.min(CITADEL_MAX_HP, state.playerCitadelHp + 875);
    const projectedDmgPct = Math.round((state.campaignDamageBonus + 0.1) * 100);
    const projectedGold = state.nextBattleBonusGold + 50;

    card.innerHTML = `
      <div style="font-size:36px; margin-bottom:8px;">🔥</div>
      <h2 style="margin:0 0 6px 0; font-size:24px; color:#f59e0b;">Fogueira da Guarda Real</h2>
      <p style="margin:0 0 24px 0; font-size:13px; color:#cbd5e1; max-width:620px;">
        As brasas sagradas trazem consolo aos vossos soldados exaustos na fronteira hostil de Aethelgard. Escolhei uma bênção estratégica para a vossa armada antes de retomar a marcha:
      </p>

      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; width:100%; margin-bottom:24px;">
        <!-- Choice 1: Repair -->
        <div style="background:#111827; border:1px solid #334155; border-radius:8px; padding:16px; display:flex; flex-direction:column; justify-content:space-between; text-align:left;">
          <div>
            <div style="font-size:24px; margin-bottom:6px;">🛡️</div>
            <div style="font-size:15px; font-weight:bold; color:#38bdf8; margin-bottom:6px;">Reparar Muralhas</div>
            <div style="font-size:12px; color:#94a3b8; line-height:1.4;">
              Engenheiros reforçam os blocos de pedra do Nexus. Restaura <b style="color:#22c55e;">+875 HP</b> (máx 2500).
            </div>
            <div style="font-size:12px; color:#38bdf8; margin-top:10px;">
              Vida resultante: <b>${projectedHp} / 2500 HP</b>
            </div>
          </div>
          <button id="btn-campfire-repair" style="margin-top:16px; background:#0284c7; color:#fff; border:none; padding:8px 12px; border-radius:4px; font-weight:bold; font-size:12px; cursor:pointer;">
            Escolher Reparo
          </button>
        </div>

        <!-- Choice 2: Field Forge -->
        <div style="background:#111827; border:1px solid #334155; border-radius:8px; padding:16px; display:flex; flex-direction:column; justify-content:space-between; text-align:left;">
          <div>
            <div style="font-size:24px; margin-bottom:6px;">⚔️</div>
            <div style="font-size:15px; font-weight:bold; color:#f59e0b; margin-bottom:6px;">Forja de Campo</div>
            <div style="font-size:12px; color:#94a3b8; line-height:1.4;">
              Armeiros afiam lanças e temperam armaduras. Concede <b style="color:#f59e0b;">+10% Dano Permanente</b> cumulativo para todas as tropas até o fim da Run.
            </div>
            <div style="font-size:12px; color:#f59e0b; margin-top:10px;">
              Bônus total: <b>+${projectedDmgPct}% Dano</b>
            </div>
          </div>
          <button id="btn-campfire-forge" style="margin-top:16px; background:#d97706; color:#fff; border:none; padding:8px 12px; border-radius:4px; font-weight:bold; font-size:12px; cursor:pointer;">
            Escolher Forja
          </button>
        </div>

        <!-- Choice 3: Sovereign Inspiration -->
        <div style="background:#111827; border:1px solid #334155; border-radius:8px; padding:16px; display:flex; flex-direction:column; justify-content:space-between; text-align:left;">
          <div>
            <div style="font-size:24px; margin-bottom:6px;">💰</div>
            <div style="font-size:15px; font-weight:bold; color:#34d399; margin-bottom:6px;">Inspiração Soberana</div>
            <div style="font-size:12px; color:#94a3b8; line-height:1.4;">
              A caravana real reorganiza a intendência. A próxima batalha começará com <b style="color:#34d399;">+50g de Ouro Tático Inicial</b>.
            </div>
            <div style="font-size:12px; color:#34d399; margin-top:10px;">
              Saldo de abertura: <b>${120 + projectedGold}g</b>
            </div>
          </div>
          <button id="btn-campfire-inspiration" style="margin-top:16px; background:#059669; color:#fff; border:none; padding:8px 12px; border-radius:4px; font-weight:bold; font-size:12px; cursor:pointer;">
            Escolher Ouro
          </button>
        </div>
      </div>

      <button id="btn-campfire-return-map" style="background:#334155; color:#cbd5e1; border:1px solid #475569; padding:6px 14px; border-radius:4px; font-size:12px; cursor:pointer;">
        Voltar ao Mapa (Escolher Mais Tarde)
      </button>
    `;

    // Hook choices
    const handleAction = (act: CampfireActionId) => {
      this.campaign.applyCampfireAction(act);
      CampaignStorage.save(this.campaign);
      this.currentView = 'MAP';
      this.render();
    };

    card.querySelector('#btn-campfire-repair')?.addEventListener('click', () => handleAction('REPAIR'));
    card.querySelector('#btn-campfire-forge')?.addEventListener('click', () => handleAction('FORGE'));
    card.querySelector('#btn-campfire-inspiration')?.addEventListener('click', () => handleAction('INSPIRATION'));

    card.querySelector('#btn-campfire-return-map')?.addEventListener('click', () => {
      this.currentView = 'MAP';
      this.render();
    });

    return card;
  }

  // =========================================================================
  // 4. MERCHANT VIEW (3 RELICS CATALOG & REPAIR)
  // =========================================================================

  private renderMerchantView(): HTMLElement {
    const card = document.createElement('div');
    card.style.cssText = `
      width: 100%;
      max-width: 900px;
      background: #0f172a;
      border: 2px solid #0284c7;
      border-radius: 12px;
      padding: 24px 32px;
      box-sizing: border-box;
      box-shadow: 0 0 30px rgba(2, 132, 199, 0.35);
      display: flex;
      flex-direction: column;
      align-items: center;
    `;

    const state = this.campaign.state;
    const merchantRelics = this.campaign.merchantRelics;

    let relicsHtml = '';
    for (const relicId of merchantRelics) {
      const def = RELICS_CATALOG[relicId];
      if (!def) continue;

      const isOwned = state.activeRelicIds.includes(relicId);
      const canAfford = state.campaignGold >= def.merchantCostGold;
      const rarityColor = this.getRarityColor(def.rarity);

      relicsHtml += `
        <div style="background:#111827; border:1px solid ${rarityColor}; border-radius:8px; padding:16px; display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box;">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
              <span style="font-size:14px; font-weight:bold; color:#f8fafc;">${def.name}</span>
              <span style="font-size:10px; font-weight:bold; color:${rarityColor}; border:1px solid ${rarityColor}; padding:1px 6px; border-radius:3px;">
                ${def.rarity}
              </span>
            </div>
            <div style="font-size:11px; color:#cbd5e1; line-height:1.4; margin-bottom:12px;">
              ${def.description}
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; border-top:1px solid #1e293b; padding-top:10px;">
            <b style="color:#fbbf24; font-size:14px;">🪙 ${def.merchantCostGold}g</b>
            ${
              isOwned
                ? `<span style="font-size:11px; color:#22c55e; font-weight:bold;">Já Adquirido</span>`
                : `<button data-buy-relic="${relicId}" ${canAfford ? '' : 'disabled'} style="background:${canAfford ? '#0284c7' : '#374151'}; color:${canAfford ? '#fff' : '#9ca3af'}; border:none; padding:6px 12px; border-radius:4px; font-weight:bold; font-size:11px; cursor:${canAfford ? 'pointer' : 'not-allowed'};">
                    Comprar
                  </button>`
            }
          </div>
        </div>
      `;
    }

    const canAffordRepair = state.campaignGold >= 40 && state.playerCitadelHp < CITADEL_MAX_HP;

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:18px;">
        <div style="text-align:left;">
          <h2 style="margin:0; font-size:22px; color:#38bdf8;">Bazar do Mercador Errante</h2>
          <div style="font-size:12px; color:#94a3b8; margin-top:2px;">Artefatos arcanos e consertos de intendência régia</div>
        </div>
        <div style="background:#1e293b; border:1px solid #f59e0b; padding:6px 16px; border-radius:6px; font-size:16px; font-weight:bold; color:#fbbf24;">
          Tesouro: 🪙 ${state.campaignGold}g
        </div>
      </div>

      <!-- 3 Relics for Sale -->
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:14px; width:100%; margin-bottom:20px;">
        ${relicsHtml || '<div style="grid-column:span 3; color:#64748b; font-style:italic;">Estoque de relíquias esgotado!</div>'}
      </div>

      <!-- Emergency Citadel Repair Offer -->
      <div style="background:#111827; border:1px dashed #38bdf8; border-radius:8px; padding:14px 20px; width:100%; box-sizing:border-box; display:flex; justify-content:space-between; align-items:center; margin-bottom:22px;">
        <div style="text-align:left;">
          <b style="color:#38bdf8; font-size:13px;">🛠️ Reparo Emergencial de Engenharia</b>
          <div style="font-size:11px; color:#94a3b8; margin-top:2px;">
            Contrata artífices locais para restaurar <b style="color:#22c55e;">+500 HP</b> da Cidadela (máx 2500).
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:14px;">
          <b style="color:#fbbf24; font-size:14px;">🪙 40g</b>
          <button id="btn-merchant-repair" ${canAffordRepair ? '' : 'disabled'} style="background:${canAffordRepair ? '#059669' : '#374151'}; color:${canAffordRepair ? '#fff' : '#9ca3af'}; border:none; padding:6px 14px; border-radius:4px; font-weight:bold; font-size:11px; cursor:${canAffordRepair ? 'pointer' : 'not-allowed'};">
            ${state.playerCitadelHp >= CITADEL_MAX_HP ? 'Cidadela Intacta' : 'Reparar (+500 HP)'}
          </button>
        </div>
      </div>

      <!-- Exit Button -->
      <button id="btn-merchant-leave" style="background:linear-gradient(135deg, #1e3a8a, #0284c7); color:#fff; border:1px solid #38bdf8; padding:8px 24px; border-radius:6px; font-weight:bold; font-size:13px; cursor:pointer;">
        Concluir Compras & Seguir Viagem ➔
      </button>
    `;

    // Hook relic purchase buttons
    card.querySelectorAll('[data-buy-relic]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const relicId = (btn as HTMLElement).getAttribute('data-buy-relic') as RelicTypeId;
        if (relicId) {
          const success = this.campaign.buyMerchantRelic(relicId);
          if (success) {
            CampaignStorage.save(this.campaign);
            this.render();
          }
        }
      });
    });

    // Hook repair button
    card.querySelector('#btn-merchant-repair')?.addEventListener('click', () => {
      const success = this.campaign.buyMerchantRepair();
      if (success) {
        CampaignStorage.save(this.campaign);
        this.render();
      }
    });

    // Hook leave button
    card.querySelector('#btn-merchant-leave')?.addEventListener('click', () => {
      CampaignStorage.save(this.campaign);
      this.currentView = 'MAP';
      this.render();
    });

    return card;
  }

  // =========================================================================
  // 5. CROSSROADS EVENT VIEW (CHOICE A VS B)
  // =========================================================================

  private renderEventView(): HTMLElement {
    const card = document.createElement('div');
    card.style.cssText = `
      width: 100%;
      max-width: 820px;
      background: #0f172a;
      border: 2px solid #7c3aed;
      border-radius: 12px;
      padding: 28px 36px;
      box-sizing: border-box;
      box-shadow: 0 0 30px rgba(124, 58, 237, 0.4);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    `;

    const currentNode = this.campaign.getCurrentNode();
    const eventId = currentNode.eventId ?? 'event_supply_convoy';
    const eventDef = getEventDefinition(eventId);
    const state = this.campaign.state;

    // Check affordability of Choice A and B
    const canAffordA = !eventDef.choiceA.goldCost || state.campaignGold >= eventDef.choiceA.goldCost;
    const canAffordB = !eventDef.choiceB.goldCost || state.campaignGold >= eventDef.choiceB.goldCost;

    card.innerHTML = `
      <div style="font-size:36px; margin-bottom:8px;">❓</div>
      <h2 style="margin:0 0 8px 0; font-size:24px; color:#c084fc;">${eventDef.title}</h2>

      <div style="background:#111827; border-left:3px solid #7c3aed; padding:14px 18px; border-radius:4px; font-size:13px; font-style:italic; color:#cbd5e1; line-height:1.5; margin-bottom:24px; text-align:left; width:100%; box-sizing:border-box;">
        "${eventDef.narrative}"
      </div>

      ${
        this.eventResultNotice
          ? `
            <div style="background:#064e3b; border:1px solid #10b981; color:#a7f3d0; padding:12px 18px; border-radius:6px; font-size:13px; font-weight:bold; margin-bottom:20px; width:100%; box-sizing:border-box;">
              ${this.eventResultNotice}
            </div>
            <button id="btn-event-continue" style="background:#059669; color:#fff; border:none; padding:10px 24px; border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer;">
              Continuar Viagem no Mapa ➔
            </button>
          `
          : `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; width:100%; margin-bottom:20px;">
              <!-- Option A -->
              <div style="background:#111827; border:1px solid #334155; border-radius:8px; padding:16px; display:flex; flex-direction:column; justify-content:space-between; text-align:left;">
                <div>
                  <b style="font-size:14px; color:#38bdf8;">Opção A: ${eventDef.choiceA.text}</b>
                  <p style="font-size:12px; color:#94a3b8; line-height:1.4; margin:8px 0 0 0;">
                    ${eventDef.choiceA.description}
                  </p>
                </div>
                <button id="btn-event-choice-a" ${canAffordA ? '' : 'disabled'} style="margin-top:16px; background:${canAffordA ? '#0284c7' : '#374151'}; color:${canAffordA ? '#fff' : '#9ca3af'}; border:none; padding:8px 12px; border-radius:4px; font-weight:bold; font-size:12px; cursor:${canAffordA ? 'pointer' : 'not-allowed'};">
                  ${canAffordA ? 'Escolher Opção A' : 'Ouro Insuficiente'}
                </button>
              </div>

              <!-- Option B -->
              <div style="background:#111827; border:1px solid #334155; border-radius:8px; padding:16px; display:flex; flex-direction:column; justify-content:space-between; text-align:left;">
                <div>
                  <b style="font-size:14px; color:#fbbf24;">Opção B: ${eventDef.choiceB.text}</b>
                  <p style="font-size:12px; color:#94a3b8; line-height:1.4; margin:8px 0 0 0;">
                    ${eventDef.choiceB.description}
                  </p>
                </div>
                <button id="btn-event-choice-b" ${canAffordB ? '' : 'disabled'} style="margin-top:16px; background:${canAffordB ? '#d97706' : '#374151'}; color:${canAffordB ? '#fff' : '#9ca3af'}; border:none; padding:8px 12px; border-radius:4px; font-weight:bold; font-size:12px; cursor:${canAffordB ? 'pointer' : 'not-allowed'};">
                  ${canAffordB ? 'Escolher Opção B' : 'Ouro Insuficiente'}
                </button>
              </div>
            </div>
          `
      }
    `;

    // Hook choices
    card.querySelector('#btn-event-choice-a')?.addEventListener('click', () => {
      const ok = this.campaign.resolveEventChoice(eventId, 'A');
      if (ok) {
        CampaignStorage.save(this.campaign);
        this.eventResultNotice = `✓ Decisão tomada! Opção A executada com sucesso.`;
        this.render();
      }
    });

    card.querySelector('#btn-event-choice-b')?.addEventListener('click', () => {
      const ok = this.campaign.resolveEventChoice(eventId, 'B');
      if (ok) {
        CampaignStorage.save(this.campaign);
        this.eventResultNotice = `✓ Decisão tomada! Opção B executada com sucesso.`;
        this.render();
      }
    });

    card.querySelector('#btn-event-continue')?.addEventListener('click', () => {
      this.eventResultNotice = null;
      this.currentView = 'MAP';
      this.render();
    });

    return card;
  }

  // =========================================================================
  // 6. POST-BATTLE RELIC REWARD DRAFT (CHOOSE 1 OF 3)
  // =========================================================================

  private renderRelicRewardView(): HTMLElement {
    const card = document.createElement('div');
    card.style.cssText = `
      width: 100%;
      max-width: 900px;
      background: #0f172a;
      border: 2px solid #ffd700;
      border-radius: 12px;
      padding: 28px 36px;
      box-sizing: border-box;
      box-shadow: 0 0 35px rgba(255, 215, 0, 0.4);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    `;

    const choices = this.campaign.rewardRelicChoices;

    let relicsHtml = '';
    for (const relicId of choices) {
      const def = RELICS_CATALOG[relicId];
      if (!def) continue;

      const rarityColor = this.getRarityColor(def.rarity);

      relicsHtml += `
        <div style="background:#111827; border:2px solid ${rarityColor}; border-radius:8px; padding:20px; display:flex; flex-direction:column; justify-content:space-between; text-align:left; box-shadow:0 0 15px rgba(0,0,0,0.5);">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-size:15px; font-weight:bold; color:#f8fafc;">${def.name}</span>
              <span style="font-size:10px; font-weight:bold; color:${rarityColor}; border:1px solid ${rarityColor}; padding:2px 6px; border-radius:4px;">
                ${def.rarity}
              </span>
            </div>
            <div style="font-size:12px; color:#cbd5e1; line-height:1.5; margin-bottom:14px;">
              ${def.description}
            </div>
          </div>

          <button data-pick-relic="${relicId}" style="background:linear-gradient(135deg, #d97706, #b45309); color:#fff; border:none; padding:8px 14px; border-radius:4px; font-weight:bold; font-size:12px; cursor:pointer;">
            Reclamar Esta Relíquia
          </button>
        </div>
      `;
    }

    card.innerHTML = `
      <div style="font-size:36px; margin-bottom:8px;">👑</div>
      <h2 style="margin:0 0 6px 0; font-size:24px; color:#ffd700;">Espólios de Vitória Real</h2>
      <p style="margin:0 0 24px 0; font-size:13px; color:#cbd5e1; max-width:620px;">
        Vossas forças prevaleceram no campo de batalha! Escolhei uma Relíquia Sagrada para conceder poderes determinísticos permanentes à vossa armada:
      </p>

      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; width:100%; margin-bottom:24px;">
        ${relicsHtml || '<div style="grid-column:span 3; color:#64748b;">Nenhuma relíquia elegível disponível.</div>'}
      </div>

      <button id="btn-relic-skip" style="background:#334155; color:#cbd5e1; border:1px solid #475569; padding:8px 20px; border-radius:4px; font-size:12px; cursor:pointer;">
        Pular Recompensa (Avançar sem Relíquia)
      </button>
    `;

    // Hook relic picks
    card.querySelectorAll('[data-pick-relic]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const relicId = (btn as HTMLElement).getAttribute('data-pick-relic') as RelicTypeId;
        if (relicId) {
          this.campaign.chooseRewardRelic(relicId);
          CampaignStorage.save(this.campaign);
          this.currentView = 'MAP';
          this.render();
        }
      });
    });

    // Hook skip
    card.querySelector('#btn-relic-skip')?.addEventListener('click', () => {
      this.campaign.skipRewardRelic();
      CampaignStorage.save(this.campaign);
      this.currentView = 'MAP';
      this.render();
    });

    return card;
  }

  // =========================================================================
  // 7. RUN OVER / VICTORY SUMMARY VIEW
  // =========================================================================

  private renderRunOverView(isVictory: boolean): HTMLElement {
    const card = document.createElement('div');
    card.style.cssText = `
      width: 100%;
      max-width: 650px;
      background: #0f172a;
      border: 2px solid ${isVictory ? '#ffd700' : '#ef4444'};
      border-radius: 12px;
      padding: 36px 44px;
      box-sizing: border-box;
      box-shadow: 0 0 40px ${isVictory ? 'rgba(255, 215, 0, 0.5)' : 'rgba(239, 68, 68, 0.5)'};
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    `;

    const state = this.campaign.state;

    card.innerHTML = `
      <div style="font-size:48px; margin-bottom:12px;">${isVictory ? '👑' : '💀'}</div>
      <h2 style="margin:0 0 10px 0; font-size:28px; color:${isVictory ? '#ffd700' : '#ef4444'};">
        ${isVictory ? 'VITÓRIA SUPREMA DO ATO 1!' : 'FIM DA JORNADA: DERROTA'}
      </h2>
      <p style="margin:0 0 24px 0; font-size:14px; color:#cbd5e1; line-height:1.5;">
        ${
          isVictory
            ? 'O Tirano de Ferro sucumbiu perante o poder da Coroa Solar! As fronteiras de Aethelgard foram libertadas e vossa lenda ecoará pelas eras.'
            : 'O Nexus da Cidadela sucumbiu aos invasores. As cinzas de Aethelgard aguardam um novo comandante para erguer o estandarte sagrado.'
        }
      </p>

      <!-- Stats Summary -->
      <div style="background:#111827; border:1px solid #334155; border-radius:8px; padding:16px 20px; width:100%; box-sizing:border-box; margin-bottom:28px; text-align:left;">
        <div style="font-size:12px; color:#94a3b8; text-transform:uppercase; margin-bottom:10px; font-weight:bold;">
          Estatísticas da Campanha:
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:13px; color:#e2e8f0;">
          <div>Nós Percorridos: <b>${state.visitedNodeIds.length} / 7</b></div>
          <div>Relíquias Coletadas: <b>${state.activeRelicIds.length}</b></div>
          <div>HP Final da Cidadela: <b>${state.playerCitadelHp} / ${CITADEL_MAX_HP}</b></div>
          <div>Ouro Soberano Restante: <b>🪙 ${state.campaignGold}g</b></div>
        </div>
      </div>

      <button id="btn-run-new-game" style="background:${isVictory ? '#2563eb' : '#b91c1c'}; color:#fff; border:none; padding:12px 32px; border-radius:6px; font-weight:bold; font-size:14px; cursor:pointer; box-shadow:0 0 15px rgba(0,0,0,0.5);">
        Iniciar Nova Campanha (Reset Run)
      </button>
    `;

    card.querySelector('#btn-run-new-game')?.addEventListener('click', () => {
      this.callbacks.onCampaignReset();
    });

    return card;
  }

  // =========================================================================
  // HELPER METHODS
  // =========================================================================

  private getNodeIcon(type: CampaignNode['type']): string {
    switch (type) {
      case 'BATTLE':
        return '⚔️';
      case 'ELITE':
        return '💀';
      case 'CAMPFIRE':
        return '🔥';
      case 'MERCHANT':
        return '⚖️';
      case 'EVENT':
        return '❓';
      case 'BOSS':
        return '👑';
    }
  }

  private getNodeTypeName(type: CampaignNode['type']): string {
    switch (type) {
      case 'BATTLE':
        return 'Batalha';
      case 'ELITE':
        return 'Elite';
      case 'CAMPFIRE':
        return 'Fogueira';
      case 'MERCHANT':
        return 'Mercador';
      case 'EVENT':
        return 'Encruzilhada';
      case 'BOSS':
        return 'Chefe Final';
    }
  }

  private getRarityColor(rarity: RelicRarity): string {
    switch (rarity) {
      case 'COMMON':
        return '#94a3b8';
      case 'UNCOMMON':
        return '#22c55e';
      case 'RARE':
        return '#3b82f6';
      case 'EPIC':
        return '#a855f7';
    }
  }
}
