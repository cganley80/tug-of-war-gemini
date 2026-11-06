import {
  CampaignNode,
  CampaignState,
  CampfireActionId,
  AIProfileId,
} from '../types';
import { RelicTypeId, RELICS_CATALOG, getRelicDefinition } from '../config/RelicsCatalog';
import { getEventDefinition } from '../config/EventsCatalog';
import { SeededRNG } from '../prng/SeededRNG';
import { CITADEL_MAX_HP } from '../config/ArenaConfig';
import { INITIAL_GOLD } from '../config/EconomyConfig';
import { GameEngineOptions } from '../GameEngine';

const ALL_RELIC_IDS: RelicTypeId[] = [
  'relic_solar_martyrdom',
  'relic_febrile_production',
  'relic_flaming_dawn_bolts',
  'relic_blood_and_soil_banner',
  'relic_blessed_heavy_plating',
  'relic_triumphant_dawn_charge',
  'relic_royal_war_tithe',
  'relic_citadel_mana_heart',
];

export interface SerializedCampaignData {
  readonly state: CampaignState;
  readonly nodes: Record<string, CampaignNode>;
  readonly rewardRelicChoices: RelicTypeId[];
  readonly merchantRelics: RelicTypeId[];
  readonly rngState: number;
}

export class CampaignManager {
  private rng: SeededRNG;
  public state: CampaignState;
  public nodes: Record<string, CampaignNode>;
  public rewardRelicChoices: RelicTypeId[] = [];
  public merchantRelics: RelicTypeId[] = [];

  constructor(runSeed: number) {
    this.rng = new SeededRNG(runSeed);
    this.nodes = this.generateAct1Graph();

    this.state = {
      runSeed,
      act: 1,
      currentLayer: 0,
      currentNodeId: 'node_0_0',
      visitedNodeIds: ['node_0_0'],
      playerCitadelHp: CITADEL_MAX_HP,
      campaignGold: 50,
      activeRelicIds: [],
      campaignDamageBonus: 0,
      nextBattleBonusGold: 0,
      isRunOver: false,
      isVictory: false,
    };
  }

  /**
   * Generates the deterministic 7-layer DAG for Act 1 according to Section 3.1.
   */
  private generateAct1Graph(): Record<string, CampaignNode> {
    const nodes: Record<string, CampaignNode> = {};

    // Shuffle canonical event IDs deterministically
    const eventPool = [
      'event_supply_convoy',
      'event_profaned_sanctuary',
      'event_iron_guard_deserter',
    ];
    for (let i = eventPool.length - 1; i > 0; i--) {
      const j = this.rng.nextInt(0, i + 1);
      const tmp = eventPool[i];
      eventPool[i] = eventPool[j];
      eventPool[j] = tmp;
    }

    // Layer 0 (1 node): Entry Battle
    const layer0Profile: AIProfileId =
      this.rng.next() < 0.5 ? 'AGGRESSIVE' : 'SWARM';
    nodes['node_0_0'] = {
      id: 'node_0_0',
      layer: 0,
      type: 'BATTLE',
      name: 'Fronteira Solar: Posto Avançado',
      outgoingNodeIds: ['node_1_0', 'node_1_1'],
      enemyProfile: layer0Profile,
    };

    // Layer 1 (2 nodes): 1 Battle, 1 Event
    nodes['node_1_0'] = {
      id: 'node_1_0',
      layer: 1,
      type: 'BATTLE',
      name: 'Garganta dos Renegados',
      outgoingNodeIds: ['node_2_0', 'node_2_1'],
      enemyProfile: 'DEFENSIVE',
    };
    nodes['node_1_1'] = {
      id: 'node_1_1',
      layer: 1,
      type: 'EVENT',
      name: 'Encruzilhada das Brumas',
      outgoingNodeIds: ['node_2_1', 'node_2_2'],
      eventId: eventPool[0],
    };

    // Layer 2 (3 nodes): 1 Battle, 1 Merchant, 1 Event
    nodes['node_2_0'] = {
      id: 'node_2_0',
      layer: 2,
      type: 'BATTLE',
      name: 'Colinas de Cinzas',
      outgoingNodeIds: ['node_3_0'],
      enemyProfile: 'AGGRESSIVE',
    };
    nodes['node_2_1'] = {
      id: 'node_2_1',
      layer: 2,
      type: 'MERCHANT',
      name: 'Bazar do Mercador Errante',
      outgoingNodeIds: ['node_3_0', 'node_3_1'],
    };
    nodes['node_2_2'] = {
      id: 'node_2_2',
      layer: 2,
      type: 'EVENT',
      name: 'Ruínas Esquecidas',
      outgoingNodeIds: ['node_3_1'],
      eventId: eventPool[1],
    };

    // Layer 3 (2 nodes): 1 Elite, 1 Event
    nodes['node_3_0'] = {
      id: 'node_3_0',
      layer: 3,
      type: 'ELITE',
      name: 'Vanguarda de Choque do Tirano',
      outgoingNodeIds: ['node_4_0'],
      enemyProfile: 'AGGRESSIVE',
    };
    nodes['node_3_1'] = {
      id: 'node_3_1',
      layer: 3,
      type: 'EVENT',
      name: 'Santuário Abandonado',
      outgoingNodeIds: ['node_4_0'],
      eventId: eventPool[2],
    };

    // Layer 4 (1 node): Campfire
    nodes['node_4_0'] = {
      id: 'node_4_0',
      layer: 4,
      type: 'CAMPFIRE',
      name: 'Fogueira da Guarda Real',
      outgoingNodeIds: ['node_5_0', 'node_5_1'],
    };

    // Layer 5 (2 nodes): 1 Elite, 1 Merchant
    nodes['node_5_0'] = {
      id: 'node_5_0',
      layer: 5,
      type: 'ELITE',
      name: 'Guarda Pretoriana de Ferro',
      outgoingNodeIds: ['node_6_0'],
      enemyProfile: 'DEFENSIVE',
    };
    nodes['node_5_1'] = {
      id: 'node_5_1',
      layer: 5,
      type: 'MERCHANT',
      name: 'Arsenal dointendente Régio',
      outgoingNodeIds: ['node_6_0'],
    };

    // Layer 6 (1 node): Boss Act 1
    nodes['node_6_0'] = {
      id: 'node_6_0',
      layer: 6,
      type: 'BOSS',
      name: 'Cidadela de Ferro: O Tirano',
      outgoingNodeIds: [],
      enemyProfile: 'BOSS_ACT1',
    };

    return nodes;
  }

  public getCurrentNode(): CampaignNode {
    const node = this.nodes[this.state.currentNodeId];
    if (!node) {
      throw new Error(`[CampaignManager] Unknown currentNodeId: ${this.state.currentNodeId}`);
    }
    return node;
  }

  public getNode(nodeId: string): CampaignNode | undefined {
    return this.nodes[nodeId];
  }

  public getAvailableNextNodes(): CampaignNode[] {
    if (this.state.isRunOver) return [];
    const current = this.getCurrentNode();
    return current.outgoingNodeIds.map((id) => this.nodes[id]).filter(Boolean);
  }

  /**
   * Advances the player to a connected node in the DAG.
   */
  public travelToNode(targetNodeId: string): boolean {
    if (this.state.isRunOver) return false;

    const current = this.getCurrentNode();
    if (!current.outgoingNodeIds.includes(targetNodeId)) {
      return false;
    }

    const targetNode = this.nodes[targetNodeId];
    if (!targetNode) return false;

    this.state.currentNodeId = targetNode.id;
    this.state.currentLayer = targetNode.layer;
    this.state.visitedNodeIds.push(targetNode.id);

    // Initialize node specific content
    if (targetNode.type === 'MERCHANT') {
      this.merchantRelics = this.generateRelicPool(3);
    }

    return true;
  }

  /**
   * Generates deterministic relic choices of unowned relics.
   */
  private generateRelicPool(count: number): RelicTypeId[] {
    const unowned = ALL_RELIC_IDS.filter(
      (id) => !this.state.activeRelicIds.includes(id)
    );
    if (unowned.length <= count) {
      return [...unowned];
    }
    const pool = [...unowned];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = this.rng.nextInt(0, i + 1);
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    return pool.slice(0, count);
  }

  /**
   * Applies Campfire Action (Repair, Forge or Inspiration).
   */
  public applyCampfireAction(action: CampfireActionId): boolean {
    const node = this.getCurrentNode();
    if (node.type !== 'CAMPFIRE' || this.state.isRunOver) {
      return false;
    }

    switch (action) {
      case 'REPAIR':
        // Restores +35% Citadel max HP (+875), capped at 2500
        this.state.playerCitadelHp = Math.min(
          CITADEL_MAX_HP,
          this.state.playerCitadelHp + 875
        );
        return true;
      case 'FORGE':
        // +10% persistent damage bonus for remaining run
        this.state.campaignDamageBonus =
          Math.round((this.state.campaignDamageBonus + 0.1) * 100) / 100;
        return true;
      case 'INSPIRATION':
        // +50g opening tactical battle gold for next battle
        this.state.nextBattleBonusGold += 50;
        return true;
    }
  }

  /**
   * Purchases a relic from the merchant node.
   */
  public buyMerchantRelic(relicId: RelicTypeId): boolean {
    const node = this.getCurrentNode();
    if (node.type !== 'MERCHANT' || this.state.isRunOver) {
      return false;
    }

    if (!this.merchantRelics.includes(relicId)) {
      return false;
    }

    if (this.state.activeRelicIds.includes(relicId)) {
      return false;
    }

    const def = getRelicDefinition(relicId);
    if (this.state.campaignGold < def.merchantCostGold) {
      return false;
    }

    this.state.campaignGold -= def.merchantCostGold;
    this.state.activeRelicIds.push(relicId);
    this.merchantRelics = this.merchantRelics.filter((r) => r !== relicId);
    return true;
  }

  /**
   * Emergency Citadel repair at the Merchant (40g for +500 HP).
   */
  public buyMerchantRepair(): boolean {
    const node = this.getCurrentNode();
    if (node.type !== 'MERCHANT' || this.state.isRunOver) {
      return false;
    }

    const cost = 40;
    if (this.state.campaignGold < cost) {
      return false;
    }

    this.state.campaignGold -= cost;
    this.state.playerCitadelHp = Math.min(
      CITADEL_MAX_HP,
      this.state.playerCitadelHp + 500
    );
    return true;
  }

  /**
   * Resolves a Crossroads Event choice ('A' or 'B').
   */
  public resolveEventChoice(eventId: string, choice: 'A' | 'B'): boolean {
    const node = this.getCurrentNode();
    if (node.type !== 'EVENT' || this.state.isRunOver) {
      return false;
    }

    // Ensure event definition is valid
    getEventDefinition(eventId);

    if (eventId === 'event_supply_convoy') {
      if (choice === 'A') {
        const cost = 30;
        if (this.state.campaignGold < cost) return false;
        this.state.campaignGold -= cost;

        // Guaranteed random UNCOMMON or RARE relic
        const unownedQualifying = ALL_RELIC_IDS.filter((id) => {
          if (this.state.activeRelicIds.includes(id)) return false;
          const rDef = RELICS_CATALOG[id];
          return rDef.rarity === 'UNCOMMON' || rDef.rarity === 'RARE';
        });

        if (unownedQualifying.length > 0) {
          const picked =
            unownedQualifying[this.rng.nextInt(0, unownedQualifying.length)];
          this.state.activeRelicIds.push(picked);
        }
        return true;
      } else {
        // Option B: -300 Citadel HP, +80 campaign gold
        this.state.playerCitadelHp = Math.max(0, this.state.playerCitadelHp - 300);
        this.state.campaignGold += 80;
        if (this.state.playerCitadelHp <= 0) {
          this.state.isRunOver = true;
          this.state.isVictory = false;
        }
        return true;
      }
    }

    if (eventId === 'event_profaned_sanctuary') {
      if (choice === 'A') {
        // Option A: -400 Citadel HP, acquire relic_solar_martyrdom
        this.state.playerCitadelHp = Math.max(0, this.state.playerCitadelHp - 400);
        if (!this.state.activeRelicIds.includes('relic_solar_martyrdom')) {
          this.state.activeRelicIds.push('relic_solar_martyrdom');
        }
        if (this.state.playerCitadelHp <= 0) {
          this.state.isRunOver = true;
          this.state.isVictory = false;
        }
        return true;
      } else {
        // Option B: -50 campaign gold, acquire relic_blessed_heavy_plating
        const cost = 50;
        if (this.state.campaignGold < cost) return false;
        this.state.campaignGold -= cost;
        if (!this.state.activeRelicIds.includes('relic_blessed_heavy_plating')) {
          this.state.activeRelicIds.push('relic_blessed_heavy_plating');
        }
        return true;
      }
    }

    if (eventId === 'event_iron_guard_deserter') {
      if (choice === 'A') {
        // Option A: -40 campaign gold, +100g next battle opening gold
        const cost = 40;
        if (this.state.campaignGold < cost) return false;
        this.state.campaignGold -= cost;
        this.state.nextBattleBonusGold += 100;
        return true;
      } else {
        // Option B: 0 gold, restore +300 Citadel HP
        this.state.playerCitadelHp = Math.min(
          CITADEL_MAX_HP,
          this.state.playerCitadelHp + 300
        );
        return true;
      }
    }

    return false;
  }

  /**
   * Finalizes a battle outcome, preserving citadel HP and awarding persistent gold and relic picks.
   */
  public completeBattle(result: {
    playerCitadelFinalHp: number;
    isPlayerWinner: boolean;
  }): void {
    if (this.state.isRunOver) return;

    this.state.playerCitadelHp = result.playerCitadelFinalHp;

    if (!result.isPlayerWinner || this.state.playerCitadelHp <= 0) {
      this.state.playerCitadelHp = Math.max(0, this.state.playerCitadelHp);
      this.state.isRunOver = true;
      this.state.isVictory = false;
      return;
    }

    const current = this.getCurrentNode();
    switch (current.type) {
      case 'BATTLE':
        this.state.campaignGold += 50;
        this.rewardRelicChoices = this.generateRelicPool(3);
        break;
      case 'ELITE':
        this.state.campaignGold += 100;
        this.rewardRelicChoices = this.generateRelicPool(3);
        break;
      case 'BOSS':
        this.state.campaignGold += 150;
        this.state.isVictory = true;
        this.state.isRunOver = true;
        break;
    }

    // Reset single-battle opening bonus gold once consumed
    this.state.nextBattleBonusGold = 0;
  }

  /**
   * Selects 1 relic from post-battle rewards.
   */
  public chooseRewardRelic(relicId: RelicTypeId): boolean {
    if (!this.rewardRelicChoices.includes(relicId)) {
      return false;
    }

    if (!this.state.activeRelicIds.includes(relicId)) {
      this.state.activeRelicIds.push(relicId);
    }
    this.rewardRelicChoices = [];
    return true;
  }

  /**
   * Skips post-battle relic choice.
   */
  public skipRewardRelic(): void {
    this.rewardRelicChoices = [];
  }

  /**
   * Prepares pure GameEngineOptions for the current battle node.
   */
  public createBattleEngineOptions(): GameEngineOptions {
    const current = this.getCurrentNode();
    const isElite = current.type === 'ELITE';

    return {
      seed: this.rng.nextInt(1, 2147483647),
      initialPlayerCitadelHp: this.state.playerCitadelHp,
      initialPlayerGold: INITIAL_GOLD + this.state.nextBattleBonusGold,
      activeRelics: [...this.state.activeRelicIds],
      playerDamageBonus: this.state.campaignDamageBonus,
      aiProfile: current.enemyProfile ?? 'AGGRESSIVE',
      enemyUnitHpMultiplier: isElite ? 1.2 : 1.0,
    };
  }

  /**
   * Serializes campaign manager to pure JSON.
   */
  public serialize(): string {
    const data: SerializedCampaignData = {
      state: {
        ...this.state,
        visitedNodeIds: [...this.state.visitedNodeIds],
        activeRelicIds: [...this.state.activeRelicIds],
      },
      nodes: { ...this.nodes },
      rewardRelicChoices: [...this.rewardRelicChoices],
      merchantRelics: [...this.merchantRelics],
      rngState: this.rng.getState(),
    };
    return JSON.stringify(data);
  }

  /**
   * Deserializes pure JSON into a running CampaignManager instance.
   */
  public static deserialize(json: string): CampaignManager {
    const data = JSON.parse(json) as SerializedCampaignData;
    const manager = new CampaignManager(data.state.runSeed);

    manager.state = {
      ...data.state,
      visitedNodeIds: [...data.state.visitedNodeIds],
      activeRelicIds: [...data.state.activeRelicIds],
    };
    manager.nodes = { ...data.nodes };
    manager.rewardRelicChoices = [...data.rewardRelicChoices];
    manager.merchantRelics = [...data.merchantRelics];
    manager.rng = new SeededRNG(data.rngState);

    return manager;
  }
}
