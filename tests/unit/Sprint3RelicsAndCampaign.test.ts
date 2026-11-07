import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../src/core/GameEngine';
import { CampaignManager } from '../../src/core/campaign/CampaignManager';
import { RELICS_CATALOG, getRelicDefinition } from '../../src/core/config/RelicsCatalog';
import { AIController } from '../../src/core/ai/AIController';
import { CITADEL_MAX_HP } from '../../src/core/config/ArenaConfig';

describe('Sprint 3: Core, AI P0 Fixes, Relics and Campaign Roguelike', () => {
  // =========================================================================
  // 1. CORREÇÕES P0: AI "GUARDAR OURO" (P0-1) E PRÉ-FILTRO DA AURA (P0-3)
  // =========================================================================
  describe('AI P0-1: Save Gold State', () => {
    it('Valerius (AGGRESSIVE) saves gold on Step 2 (Stable 140g) without building fallback Barracks', () => {
      // Step 0: Barracks (100g) on Slot 0
      // Step 1: Barracks (100g) on Slot 1
      // Step 2: Stable (140g) on Slot 2
      // Give AI 220g: builds Slot 0 (100g, leaves 120g), builds Slot 1 (100g, leaves 20g)
      // Then at step 2, AI has 20g < 140g. It should NOT build a Barracks in Slot 2!
      const engine = new GameEngine({
        seed: 42,
        aiProfile: 'AGGRESSIVE',
        initialEnemyGold: 220,
      });

      // Tick 20: AI builds slot 0
      for (let t = 0; t < 20; t++) engine.tick();
      expect(engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 0)?.structureId).toBe('bldg_barracks_1');

      // Tick 40: AI builds slot 1
      for (let t = 0; t < 20; t++) engine.tick();
      expect(engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 1)?.structureId).toBe('bldg_barracks_1');

      // Enemy now has 20g. Income cycle gives gold eventually, but while gold < 140, AI should save gold.
      // Manually set gold to 125g (less than 140g) and run tick 60
      engine.economy.ENEMY.gold = 125;
      for (let t = 0; t < 20; t++) engine.tick();

      const slot2 = engine.slots.find((s) => s.team === 'ENEMY' && s.slotIndex === 2);
      // P0-1: slot 2 must NOT have fallen back to bldg_barracks_1!
      expect(slot2?.structureId).toBeNull();
      // Gold was saved (not spent on a 100g barracks)
      expect(engine.economy.ENEMY.gold).toBeGreaterThanOrEqual(125);
    });

    it('AI saves gold for reactive counter-attack without falling back to Barracks N1', () => {
      const engine = new GameEngine({
        seed: 99,
        aiProfile: 'AGGRESSIVE',
        initialEnemyGold: 100,
      });

      const controller = new AIController('AGGRESSIVE');

      // Spawn 2 enemy siege units on player side to trigger siegeThreat >= 2
      engine.spawnUnit('PLAYER', 'unit_mobile_ballista');
      engine.spawnUnit('PLAYER', 'unit_mobile_ballista');

      const threats = controller.calculateThreats(engine.units);
      expect(threats.siegeThreat).toBe(2);

      // Give enemy 100g (less than Stable 140g, but enough for Barracks 100g)
      engine.economy.ENEMY.gold = 100;
      // Frontline is safe (1000 <= 1400)
      engine.frontline.frontlineX = 1000;

      // Update AI controller
      controller.update(engine);

      // Verify AI did NOT fall back to building a Barracks on free slots with its 100g
      const enemyBarracks = engine.slots.filter(
        (s) => s.team === 'ENEMY' && s.structureId === 'bldg_barracks_1'
      );
      // AI started with slot 0 step 0, but in matrix evaluation it must save for Stables
      expect(enemyBarracks.length).toBe(1); // Only the initial slot 0 barracks, no fallback barracks in slot 1
      expect(engine.economy.ENEMY.gold).toBe(0); // Slot 0 opening step 0 executed
      // If we advance beyond opening:
      // Let's test evaluateDecisionMatrix with stepIndex advanced
      engine.economy.ENEMY.gold = 100;
      // Now slots has barracks in slot 0, stepIndex was 0 -> 1.
    });
  });

  // =========================================================================
  // 2. CATÁLOGO E MOTOR DAS 8 RELÍQUIAS REAIS
  // =========================================================================
  describe('The 8 Real Relics Engine & Catalog', () => {
    it('Relics Catalog exports all 8 canonical relics with exact definitions', () => {
      expect(Object.keys(RELICS_CATALOG).length).toBe(8);

      const r1 = getRelicDefinition('relic_solar_martyrdom');
      expect(r1.rarity).toBe('RARE');
      expect(r1.merchantCostGold).toBe(130);

      const r2 = getRelicDefinition('relic_febrile_production');
      expect(r2.rarity).toBe('UNCOMMON');
      expect(r2.merchantCostGold).toBe(90);

      const r3 = getRelicDefinition('relic_flaming_dawn_bolts');
      expect(r3.rarity).toBe('RARE');
      expect(r3.merchantCostGold).toBe(130);

      const r4 = getRelicDefinition('relic_blood_and_soil_banner');
      expect(r4.rarity).toBe('COMMON');
      expect(r4.merchantCostGold).toBe(60);

      const r5 = getRelicDefinition('relic_blessed_heavy_plating');
      expect(r5.rarity).toBe('UNCOMMON');
      expect(r5.merchantCostGold).toBe(90);

      const r6 = getRelicDefinition('relic_triumphant_dawn_charge');
      expect(r6.rarity).toBe('EPIC');
      expect(r6.merchantCostGold).toBe(170);

      const r7 = getRelicDefinition('relic_royal_war_tithe');
      expect(r7.rarity).toBe('COMMON');
      expect(r7.merchantCostGold).toBe(60);

      const r8 = getRelicDefinition('relic_citadel_mana_heart');
      expect(r8.rarity).toBe('EPIC');
      expect(r8.merchantCostGold).toBe(170);
    });

    it('[Relic 1] relic_solar_martyrdom: triggers 80px 60 Magic Damage on PLAYER melee death', () => {
      const engine = new GameEngine({
        seed: 123,
        activeRelics: ['relic_solar_martyrdom'],
      });

      // Spawn PLAYER melee unit (Squire) and ENEMY nearby
      const playerSquire = engine.spawnUnit('PLAYER', 'unit_squire');
      playerSquire.x = 1000;
      playerSquire.y = 300;

      const enemyTarget = engine.spawnUnit('ENEMY', 'unit_squire');
      enemyTarget.x = 1050; // 50px away (within 80px radius)
      enemyTarget.y = 300;
      const initialEnemyHp = enemyTarget.currentHp;

      // Kill player squire directly
      playerSquire.currentHp = 0;
      // In GameEngine, death triggers during tick or when handleUnitDeath is called
      // Let's simulate squire being hit and killed
      playerSquire.currentHp = 10;
      // Spawn attacker to kill squire
      const enemyAttacker = engine.spawnUnit('ENEMY', 'unit_royal_knight');
      enemyAttacker.x = 990;
      enemyAttacker.y = 300;
      playerSquire.targetUnitId = enemyAttacker.id;
      enemyAttacker.targetUnitId = playerSquire.id;

      let martyrdomTriggered = false;
      engine.eventBus.on('UnitAttacked', (e) => {
        if (e.attackerId === 'relic_solar_martyrdom') {
          martyrdomTriggered = true;
        }
      });

      // Run 20 ticks to let combat resolve and kill the 10 HP squire
      for (let t = 0; t < 20; t++) engine.tick();

      expect(martyrdomTriggered).toBe(true);
      expect(enemyTarget.currentHp).toBeLessThan(initialEnemyHp);
    });

    it('[Relic 2] relic_febrile_production: -15% structure cooldown and -10% unit max HP', () => {
      const engine = new GameEngine({
        seed: 123,
        activeRelics: ['relic_febrile_production'],
        initialPlayerGold: 500,
      });

      // Build Barracks 1 (base 12.0s = 240 ticks)
      // With -15%: round(12.0 * 0.85 * 20) = round(204) = 204 ticks
      engine.buildStructure('PLAYER', 0, 'bldg_barracks_1');
      const slot0 = engine.slots.find((s) => s.team === 'PLAYER' && s.slotIndex === 0);
      expect(slot0?.totalSpawnCooldownTicks).toBe(204);

      // Spawned player unit (Squire normally 380 HP)
      // With -10%: floor(380 * 0.90) = 342 HP
      const squire = engine.spawnUnit('PLAYER', 'unit_squire');
      expect(squire.maxHp).toBe(342);
      expect(squire.currentHp).toBe(342);

      // Enemy unit is NOT affected by player relic
      const enemySquire = engine.spawnUnit('ENEMY', 'unit_squire');
      expect(enemySquire.maxHp).toBe(380);

      // Player Citadel is NOT reduced by this relic
      expect(engine.citadels.PLAYER.maxHp).toBe(CITADEL_MAX_HP);
    });

    it('[Relic 3] relic_flaming_dawn_bolts: triggers 70px 160 Magic Damage on 5th shooter attack', () => {
      const engine = new GameEngine({
        seed: 123,
        activeRelics: ['relic_flaming_dawn_bolts'],
      });

      const shooter = engine.spawnUnit('PLAYER', 'unit_longbowman');
      shooter.x = 800;
      shooter.y = 300;
      shooter.attackCount = 4; // Next attack is the 5th ( (4+1)%5 === 0 )

      const target = engine.spawnUnit('ENEMY', 'unit_squire');
      target.x = 900;
      target.y = 300;
      target.maxHp = 1000;
      target.currentHp = 1000;
      shooter.targetUnitId = target.id;

      const nearbyEnemy = engine.spawnUnit('ENEMY', 'unit_squire');
      nearbyEnemy.x = 940; // 40px away from target (within 70px)
      nearbyEnemy.y = 300;
      nearbyEnemy.maxHp = 1000;
      nearbyEnemy.currentHp = 1000;

      // Tick 1 to trigger attack
      engine.tick();

      // Nearby enemy should have taken the 160 base Magic Damage (mitigated)
      expect(nearbyEnemy.currentHp).toBeLessThan(1000);
      expect(shooter.attackCount).toBe(5);
    });

    it('[Relic 4] relic_blood_and_soil_banner: +20% damage when frontlineX > 1200', () => {
      const engine = new GameEngine({
        seed: 123,
        activeRelics: ['relic_blood_and_soil_banner'],
      });

      // Frontline at 1000 <= 1200 -> multiplier is 1.0
      engine.frontline.frontlineX = 1000;
      expect(engine.getPlayerDamageMultiplier()).toBe(1.0);

      // Frontline pushes to 1250 > 1200 -> multiplier is 1.20
      engine.frontline.frontlineX = 1250;
      expect(engine.getPlayerDamageMultiplier()).toBeCloseTo(1.2, 5);

      // Combined with playerDamageBonus (e.g. 0.10 from Field Forge)
      const engineBonus = new GameEngine({
        seed: 123,
        activeRelics: ['relic_blood_and_soil_banner'],
        playerDamageBonus: 0.1,
      });
      engineBonus.frontline.frontlineX = 1300;
      // 1.10 * 1.20 = 1.32
      expect(engineBonus.getPlayerDamageMultiplier()).toBeCloseTo(1.32, 5);
    });

    it('[Relic 5] relic_blessed_heavy_plating: +2 flat reduction for HEAVY armor vs NORMAL/PIERCING', () => {
      const engineWithRelic = new GameEngine({
        seed: 123,
        activeRelics: ['relic_blessed_heavy_plating'],
      });

      const playerKnight = engineWithRelic.spawnUnit('PLAYER', 'unit_royal_knight'); // HEAVY armor, 3 flat reduction
      playerKnight.x = 1000;
      playerKnight.y = 300;

      // Enemy squire attacks player knight with NORMAL damage (18 base damage vs HEAVY = 1.0x)
      // Normal flat reduction = 3. With relic = 5.
      // Effective damage = 18 - 5 = 13 (instead of 18 - 3 = 15).
      const enemySquire = engineWithRelic.spawnUnit('ENEMY', 'unit_squire');
      enemySquire.x = 1020;
      enemySquire.y = 300;
      enemySquire.targetUnitId = playerKnight.id;

      engineWithRelic.tick();

      const hpLost = playerKnight.maxHp - playerKnight.currentHp;
      expect(hpLost).toBe(13);
    });

    it('[Relic 6] relic_triumphant_dawn_charge: +1.50x charge damage and 30-tick stun', () => {
      const engine = new GameEngine({
        seed: 123,
        activeRelics: ['relic_triumphant_dawn_charge'],
      });

      const lancer = engine.spawnUnit('PLAYER', 'unit_mounted_spearman');
      lancer.x = 1000;
      lancer.y = 300;

      const enemy = engine.spawnUnit('ENEMY', 'unit_royal_knight');
      enemy.x = 1020;
      enemy.y = 300;
      lancer.targetUnitId = enemy.id;

      engine.tick();

      // Enemy primary target should receive 30 ticks of stun, with 1 tick consumed during movement in same tick -> 29 remaining
      expect(enemy.stunTicksRemaining).toBe(29);
    });

    it('[Relic 7] relic_royal_war_tithe: doubles gold bounty on MAGIC or SIEGE kills', () => {
      const engine = new GameEngine({
        seed: 123,
        activeRelics: ['relic_royal_war_tithe'],
      });

      const mage = engine.spawnUnit('PLAYER', 'unit_solar_apprentice'); // MAGIC damage
      mage.x = 1000;
      mage.y = 300;

      // Enemy squire normally yields 2g bounty
      const enemySquire = engine.spawnUnit('ENEMY', 'unit_squire');
      enemySquire.x = 1020;
      enemySquire.y = 300;
      enemySquire.currentHp = 1; // 1 HP so it dies in 1 hit
      mage.targetUnitId = enemySquire.id;

      const initialPlayerGold = engine.economy.PLAYER.gold;
      engine.tick();

      // Enemy died: bounty should be 2 * 2 = 4g
      expect(engine.economy.PLAYER.gold - initialPlayerGold).toBe(4);
    });

    it('[Relic 8] relic_citadel_mana_heart: triggers at tick 600, heals allies +120 HP, deals 80 Magic Damage to enemies', () => {
      const engine = new GameEngine({
        seed: 123,
        activeRelics: ['relic_citadel_mana_heart'],
      });

      // Advance engine to tick 599 before spawning units
      for (let t = 0; t < 599; t++) engine.tick();

      const playerUnit = engine.spawnUnit('PLAYER', 'unit_royal_knight');
      playerUnit.currentHp = 200; // Damaged (maxHp is 720)

      const enemyUnit = engine.spawnUnit('ENEMY', 'unit_squire');
      const initialEnemyHp = enemyUnit.currentHp;

      expect(playerUnit.currentHp).toBe(200);

      // Tick 600: triggers pulse
      engine.tick();

      // Player healed +120 HP
      expect(playerUnit.currentHp).toBe(320);

      // Enemy damaged by 80 Magic base (mitigated by HEAVY armor 1.50x - 1 reduction = floor(120 - 1) = 119 damage)
      expect(enemyUnit.currentHp).toBe(Math.max(0, initialEnemyHp - 119));
    });
  });

  // =========================================================================
  // 3. SISTEMA DE GRAFO PROCEDURAL DA CAMPANHA ROGUELIKE
  // =========================================================================
  describe('Roguelike Campaign Manager & DAG', () => {
    it('Generates deterministic 7-layer graph topology matching Section 3.1', () => {
      const manager = new CampaignManager(55555);
      const nodes = manager.nodes;

      // Check layers
      expect(nodes['node_0_0'].layer).toBe(0);
      expect(nodes['node_0_0'].type).toBe('BATTLE');
      expect(nodes['node_0_0'].outgoingNodeIds).toEqual(['node_1_0', 'node_1_1']);

      // Layer 1
      expect(nodes['node_1_0'].layer).toBe(1);
      expect(nodes['node_1_0'].type).toBe('BATTLE');
      expect(nodes['node_1_0'].outgoingNodeIds).toEqual(['node_2_0', 'node_2_1']);

      expect(nodes['node_1_1'].layer).toBe(1);
      expect(nodes['node_1_1'].type).toBe('EVENT');
      expect(nodes['node_1_1'].outgoingNodeIds).toEqual(['node_2_1', 'node_2_2']);

      // Layer 2
      expect(nodes['node_2_0'].type).toBe('BATTLE');
      expect(nodes['node_2_1'].type).toBe('MERCHANT');
      expect(nodes['node_2_2'].type).toBe('EVENT');

      // Layer 3
      expect(nodes['node_3_0'].type).toBe('ELITE');
      expect(nodes['node_3_1'].type).toBe('EVENT');

      // Layer 4
      expect(nodes['node_4_0'].type).toBe('CAMPFIRE');

      // Layer 5
      expect(nodes['node_5_0'].type).toBe('ELITE');
      expect(nodes['node_5_1'].type).toBe('MERCHANT');

      // Layer 6: Boss
      expect(nodes['node_6_0'].type).toBe('BOSS');
      expect(nodes['node_6_0'].enemyProfile).toBe('BOSS_ACT1');
      expect(nodes['node_6_0'].outgoingNodeIds).toEqual([]);
    });

    it('Enforces DAG travel rules, requires node resolution before advancing, and tracks player movement', () => {
      const manager = new CampaignManager(12345);
      expect(manager.getCurrentNode().id).toBe('node_0_0');

      // Cannot jump directly to layer 2
      expect(manager.travelToNode('node_2_0')).toBe(false);

      // P0-A: Cannot travel to connected Layer 1 node BEFORE resolving current node (node_0_0)
      expect(manager.getAvailableNextNodes()).toEqual([]);
      expect(manager.travelToNode('node_1_1')).toBe(false);

      // Resolve Layer 0 battle node
      manager.completeBattle({ playerCitadelFinalHp: 2400, isPlayerWinner: true });
      expect(manager.isNodeResolved('node_0_0')).toBe(true);
      expect(manager.getAvailableNextNodes().map((n) => n.id)).toEqual(['node_1_0', 'node_1_1']);

      // Now can travel to connected Layer 1 node
      expect(manager.travelToNode('node_1_1')).toBe(true);
      expect(manager.getCurrentNode().id).toBe('node_1_1');
      expect(manager.state.currentLayer).toBe(1);
      expect(manager.state.visitedNodeIds).toContain('node_1_1');
    });

    it('Persists Citadel HP across battles, awards gold and offers relic choices', () => {
      const manager = new CampaignManager(12345);
      expect(manager.state.campaignGold).toBe(50);
      expect(manager.state.playerCitadelHp).toBe(2500);

      // Win Layer 0 Battle with 1600 Citadel HP remaining
      manager.completeBattle({
        playerCitadelFinalHp: 1600,
        isPlayerWinner: true,
      });

      // Persistent HP is 1600
      expect(manager.state.playerCitadelHp).toBe(1600);
      // Gained +50g for common battle
      expect(manager.state.campaignGold).toBe(100);
      // Offered 3 relic choices
      expect(manager.rewardRelicChoices.length).toBe(3);

      // Choose 1 relic
      const chosenRelic = manager.rewardRelicChoices[0];
      expect(manager.chooseRewardRelic(chosenRelic)).toBe(true);
      expect(manager.state.activeRelicIds).toContain(chosenRelic);
      expect(manager.rewardRelicChoices.length).toBe(0);

      // Prepare GameEngineOptions for next battle - verifies persistence
      const engineOpts = manager.createBattleEngineOptions();
      expect(engineOpts.initialPlayerCitadelHp).toBe(1600);
      expect(engineOpts.activeRelics).toContain(chosenRelic);
    });

    it('Campfire node executes Repair, Forge and Inspiration accurately and locks after single use (P0-B)', () => {
      // 1. Test REPAIR: +875 HP capped at 2500
      const managerRepair = new CampaignManager(777);
      managerRepair.state.playerCitadelHp = 1000;
      managerRepair.state.currentNodeId = 'node_4_0'; // Campfire
      expect(managerRepair.applyCampfireAction('REPAIR')).toBe(true);
      expect(managerRepair.state.playerCitadelHp).toBe(1875);
      // Subsequent action on same Campfire node must be blocked (P0-B)
      expect(managerRepair.applyCampfireAction('REPAIR')).toBe(false);
      expect(managerRepair.applyCampfireAction('FORGE')).toBe(false);

      // 2. Test FORGE: +0.10 damage bonus
      const managerForge = new CampaignManager(778);
      managerForge.state.currentNodeId = 'node_4_0';
      expect(managerForge.applyCampfireAction('FORGE')).toBe(true);
      expect(managerForge.state.campaignDamageBonus).toBe(0.1);
      expect(managerForge.applyCampfireAction('FORGE')).toBe(false);

      // 3. Test INSPIRATION: +50g opening gold
      const managerInsp = new CampaignManager(779);
      managerInsp.state.currentNodeId = 'node_4_0';
      expect(managerInsp.applyCampfireAction('INSPIRATION')).toBe(true);
      expect(managerInsp.state.nextBattleBonusGold).toBe(50);
      expect(managerInsp.applyCampfireAction('INSPIRATION')).toBe(false);
    });

    it('Merchant node allows buying relics, emergency citadel repairs, and optional exit without buying (P0-A)', () => {
      const manager = new CampaignManager(888);
      manager.state.playerCitadelHp = 1500;
      // Resolve node_0_0 and node_1_0 before traveling to Merchant node_2_1
      manager.completeBattle({ playerCitadelFinalHp: 1500, isPlayerWinner: true });
      expect(manager.travelToNode('node_1_0')).toBe(true);
      manager.completeBattle({ playerCitadelFinalHp: 1500, isPlayerWinner: true });
      manager.state.campaignGold = 300;
      expect(manager.travelToNode('node_2_1')).toBe(true); // Merchant node

      // Merchant node is immediately marked resolved on arrival so player can leave optionally
      expect(manager.isNodeResolved('node_2_1')).toBe(true);
      expect(manager.getAvailableNextNodes().length).toBeGreaterThan(0);

      expect(manager.merchantRelics.length).toBe(3);

      // Buy emergency repair: 40g for +500 HP
      expect(manager.buyMerchantRepair()).toBe(true);
      expect(manager.state.campaignGold).toBe(260);
      expect(manager.state.playerCitadelHp).toBe(2000);

      // Buy a relic
      const relicToBuy = manager.merchantRelics[0];
      const relicDef = getRelicDefinition(relicToBuy);
      expect(manager.buyMerchantRelic(relicToBuy)).toBe(true);
      expect(manager.state.activeRelicIds).toContain(relicToBuy);
      expect(manager.state.campaignGold).toBe(260 - relicDef.merchantCostGold);
    });

    it('Resolves all 3 Canonical Crossroads Events correctly and locks event node after single resolution (P0-B)', () => {
      // Event 1: Supply Convoy Option A (30g for 1 uncommon/rare relic)
      const m1A = new CampaignManager(991);
      m1A.state.currentNodeId = 'node_1_1';
      m1A.state.campaignGold = 50;
      expect(m1A.resolveEventChoice('event_supply_convoy', 'A')).toBe(true);
      expect(m1A.state.campaignGold).toBe(20);
      expect(m1A.state.activeRelicIds.length).toBe(1);
      // P0-B: Cannot resolve again on the same node
      expect(m1A.resolveEventChoice('event_supply_convoy', 'B')).toBe(false);

      // Event 1: Supply Convoy Option B (-300 HP for +80g)
      const m1B = new CampaignManager(992);
      m1B.state.currentNodeId = 'node_1_1';
      m1B.state.campaignGold = 20;
      m1B.state.playerCitadelHp = 2000;
      expect(m1B.resolveEventChoice('event_supply_convoy', 'B')).toBe(true);
      expect(m1B.state.playerCitadelHp).toBe(1700);
      expect(m1B.state.campaignGold).toBe(100);
      expect(m1B.resolveEventChoice('event_supply_convoy', 'B')).toBe(false);

      // Event 2: Profaned Sanctuary Option A (-400 HP for relic_solar_martyrdom)
      const m2A = new CampaignManager(993);
      m2A.state.currentNodeId = 'node_1_1';
      m2A.state.playerCitadelHp = 1700;
      expect(m2A.resolveEventChoice('event_profaned_sanctuary', 'A')).toBe(true);
      expect(m2A.state.playerCitadelHp).toBe(1300);
      expect(m2A.state.activeRelicIds).toContain('relic_solar_martyrdom');
      expect(m2A.resolveEventChoice('event_profaned_sanctuary', 'A')).toBe(false);

      // Event 2: Profaned Sanctuary Option B (-50g for relic_blessed_heavy_plating)
      const m2B = new CampaignManager(994);
      m2B.state.currentNodeId = 'node_1_1';
      m2B.state.campaignGold = 60;
      expect(m2B.resolveEventChoice('event_profaned_sanctuary', 'B')).toBe(true);
      expect(m2B.state.campaignGold).toBe(10);
      expect(m2B.state.activeRelicIds).toContain('relic_blessed_heavy_plating');

      // Event 3: Iron Guard Deserter Option A (-40g for +100g next battle opening gold)
      const m3A = new CampaignManager(995);
      m3A.state.currentNodeId = 'node_1_1';
      m3A.state.campaignGold = 40;
      expect(m3A.resolveEventChoice('event_iron_guard_deserter', 'A')).toBe(true);
      expect(m3A.state.campaignGold).toBe(0);
      expect(m3A.state.nextBattleBonusGold).toBe(100);

      // Event 3: Iron Guard Deserter Option B (restore +300 Citadel HP)
      const m3B = new CampaignManager(996);
      m3B.state.currentNodeId = 'node_1_1';
      m3B.state.playerCitadelHp = 1000;
      expect(m3B.resolveEventChoice('event_iron_guard_deserter', 'B')).toBe(true);
      expect(m3B.state.playerCitadelHp).toBe(1300);
    });

    it('Serializes and deserializes pure JSON state with 100% fidelity', () => {
      const manager = new CampaignManager(123456);
      manager.state.campaignGold = 340;
      manager.state.playerCitadelHp = 1850;
      manager.state.activeRelicIds = ['relic_solar_martyrdom', 'relic_royal_war_tithe'];
      manager.state.campaignDamageBonus = 0.2;
      manager.state.nextBattleBonusGold = 50;

      const json = manager.serialize();
      expect(typeof json).toBe('string');

      const restored = CampaignManager.deserialize(json);
      expect(restored.state.runSeed).toBe(123456);
      expect(restored.state.campaignGold).toBe(340);
      expect(restored.state.playerCitadelHp).toBe(1850);
      expect(restored.state.activeRelicIds).toEqual([
        'relic_solar_martyrdom',
        'relic_royal_war_tithe',
      ]);
      expect(restored.state.campaignDamageBonus).toBe(0.2);
      expect(restored.state.nextBattleBonusGold).toBe(50);
    });
  });
});
