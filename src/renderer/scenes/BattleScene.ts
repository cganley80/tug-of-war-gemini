/**
 * Tug of War: Citadels of Aethelgard
 * BattleScene: Phaser 3 60 FPS Interpolated Battle Scene (Section 4 & GOVERNANCE.md)
 * Orchestrates rendering corridor, units, HP bars, VFX, hazards, and sound.
 */

import Phaser from 'phaser';
import { GameEngine } from '../../core/GameEngine';
import { GameStateSnapshot, GreekFireHazard, CitadelState, UnitTypeId, TeamId } from '../../core/types';
import {
  TICK_DURATION_SEC,
  ARENA_MIN_X,
  ARENA_MAX_X,
  ARENA_MIN_Y,
  ARENA_MAX_Y,
  NEUTRAL_CENTER_X,
  ALLIED_ZONE_MAX_X,
  ENEMY_ZONE_MIN_X,
  PLAYER_CITADEL_X,
  ENEMY_CITADEL_X,
  CITADEL_MAX_HP,
} from '../../core/config/ArenaConfig';
import { SnapshotInterpolator, InterpolatedUnit } from '../interpolation/SnapshotInterpolator';
import { ProceduralAssetFactory } from '../visuals/ProceduralAssetFactory';
import { VisualObjectPool } from '../visuals/VisualObjectPool';
import { SoundSynthesizer } from '../audio/SoundSynthesizer';

interface UnitVisualContainer {
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBarFg: Phaser.GameObjects.Rectangle;
  stunIcon: Phaser.GameObjects.Sprite;
  flameIcon: Phaser.GameObjects.Sprite;
  devotionAura: Phaser.GameObjects.Sprite;
  moraleRing: Phaser.GameObjects.Arc;
}

export interface BattleSceneConfig {
  engine: GameEngine;
  soundSynthesizer: SoundSynthesizer;
}

export class BattleScene extends Phaser.Scene {
  private engine!: GameEngine;
  private soundSynth!: SoundSynthesizer;
  private pool!: VisualObjectPool;

  private prevSnapshot!: GameStateSnapshot;
  private currSnapshot!: GameStateSnapshot;
  private accumulator = 0;
  private simSpeed = 1;
  private isPaused = false;

  // Visual layers
  private terrainGraphics!: Phaser.GameObjects.Graphics;
  private frontlineGraphics!: Phaser.GameObjects.Graphics;
  private hazardsGraphics!: Phaser.GameObjects.Graphics;
  private playerCitadelSprite!: Phaser.GameObjects.Sprite;
  private enemyCitadelSprite!: Phaser.GameObjects.Sprite;
  private playerCitadelHpBar!: Phaser.GameObjects.Rectangle;
  private enemyCitadelHpBar!: Phaser.GameObjects.Rectangle;
  private playerCitadelText!: Phaser.GameObjects.Text;
  private enemyCitadelText!: Phaser.GameObjects.Text;

  // Unit Visual Pooling
  private activeUnitVisuals = new Map<string, UnitVisualContainer>();
  private unitVisualPool: UnitVisualContainer[] = [];

  // Camera mode
  private cameraMode: 'OVERVIEW' | 'FOLLOW_FRONTLINE' = 'OVERVIEW';

  constructor() {
    super({ key: 'BattleScene' });
  }

  public init(data: Partial<BattleSceneConfig>): void {
    if (data.engine) {
      this.engine = data.engine;
    }
    if (data.soundSynthesizer) {
      this.soundSynth = data.soundSynthesizer;
    } else {
      this.soundSynth = new SoundSynthesizer();
    }
  }

  public preload(): void {
    // Generate all procedural assets into Phaser's TextureManager
    ProceduralAssetFactory.generateAssets(this);
  }

  public create(): void {
    // Initialize snapshot state
    this.currSnapshot = this.engine.getSnapshot();
    this.prevSnapshot = this.currSnapshot;

    // Set world bounds for 2000px corridor + side buffers
    this.cameras.main.setBounds(-80, 0, 2160, 600);

    // Create pools
    this.pool = new VisualObjectPool(this);

    // Create layers
    this.createBattlefieldTerrain();
    this.createCitadels();

    this.frontlineGraphics = this.add.graphics();
    this.frontlineGraphics.setDepth(12);

    this.hazardsGraphics = this.add.graphics();
    this.hazardsGraphics.setDepth(5);

    // Setup Camera
    this.setupCamera();

    // Hook Domain Events
    this.setupDomainEventListeners();
  }

  // =========================================================================
  // CAMERA CONFIGURATION
  // =========================================================================

  private setupCamera(): void {
    const cam = this.cameras.main;
    const viewWidth = cam.width;

    if (this.cameraMode === 'OVERVIEW') {
      // Fit 2100px corridor into canvas width
      const zoom = viewWidth / 2100;
      cam.setZoom(zoom);
      cam.centerOn(1000, 300);
    } else {
      cam.setZoom(1.0);
      cam.centerOn(this.currSnapshot.frontline.frontlineX, 300);
    }

    // Enable drag-to-pan
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) {
        cam.scrollX -= (pointer.x - pointer.prevPosition.x) / cam.zoom;
        cam.scrollY -= (pointer.y - pointer.prevPosition.y) / cam.zoom;
      }
    });
  }

  public setCameraMode(mode: 'OVERVIEW' | 'FOLLOW_FRONTLINE'): void {
    this.cameraMode = mode;
    this.setupCamera();
  }

  public getCameraMode(): 'OVERVIEW' | 'FOLLOW_FRONTLINE' {
    return this.cameraMode;
  }

  // =========================================================================
  // BATTLEFIELD TERRAIN & CITADELS
  // =========================================================================

  private createBattlefieldTerrain(): void {
    this.terrainGraphics = this.add.graphics();
    this.terrainGraphics.setDepth(1);

    const g = this.terrainGraphics;

    // Outer battlefield boundary
    g.fillStyle(0x09090b, 1);
    g.fillRect(-100, 0, 2200, 600);

    // Battle Corridor (Y: 100 to 500 = 400px height)
    // Allied Zone: 0 to 800
    g.fillStyle(0x172554, 0.7); // Royal blue tint
    g.fillRect(ARENA_MIN_X, ARENA_MIN_Y, ALLIED_ZONE_MAX_X, ARENA_MAX_Y - ARENA_MIN_Y);

    // Contested Neutral Zone: 800 to 1200
    g.fillStyle(0x0f172a, 0.85); // Neutral scorched dark earth
    g.fillRect(ALLIED_ZONE_MAX_X, ARENA_MIN_Y, ENEMY_ZONE_MIN_X - ALLIED_ZONE_MAX_X, ARENA_MAX_Y - ARENA_MIN_Y);

    // Enemy Zone: 1200 to 2000
    g.fillStyle(0x3b0712, 0.65); // Crimson charred ground
    g.fillRect(ENEMY_ZONE_MIN_X, ARENA_MIN_Y, ARENA_MAX_X - ENEMY_ZONE_MIN_X, ARENA_MAX_Y - ARENA_MIN_Y);

    // Corridor borders (top and bottom stone borders)
    g.lineStyle(4, 0x334155, 1);
    g.lineBetween(ARENA_MIN_X, ARENA_MIN_Y, ARENA_MAX_X, ARENA_MIN_Y);
    g.lineBetween(ARENA_MIN_X, ARENA_MAX_Y, ARENA_MAX_X, ARENA_MAX_Y);

    // Territorial Zone boundary markers
    // X = 800 (Allied front boundary)
    g.lineStyle(2, 0x3b82f6, 0.6);
    g.lineBetween(800, ARENA_MIN_Y, 800, ARENA_MAX_Y);

    // X = 1000 (Neutral center line)
    g.lineStyle(2, 0xf59e0b, 0.5);
    for (let y = ARENA_MIN_Y + 10; y < ARENA_MAX_Y; y += 24) {
      g.lineBetween(NEUTRAL_CENTER_X, y, NEUTRAL_CENTER_X, y + 12);
    }

    // X = 1200 (Enemy front boundary)
    g.lineStyle(2, 0xef4444, 0.6);
    g.lineBetween(1200, ARENA_MIN_Y, 1200, ARENA_MAX_Y);

    // Ground lane guidelines for depth perception
    g.lineStyle(1, 0x1e293b, 0.4);
    for (let y = 175; y <= 425; y += 75) {
      g.lineBetween(ARENA_MIN_X, y, ARENA_MAX_X, y);
    }
  }

  private createCitadels(): void {
    // Player Citadel (X = 0, Y = 300)
    this.playerCitadelSprite = this.add.sprite(PLAYER_CITADEL_X + 24, 300, 'citadel_player');
    this.playerCitadelSprite.setDepth(10);

    // Enemy Citadel (X = 2000, Y = 300)
    this.enemyCitadelSprite = this.add.sprite(ENEMY_CITADEL_X - 24, 300, 'citadel_enemy');
    this.enemyCitadelSprite.setDepth(10);

    // Citadel HP Bars (Width 64, Height 8, anchored above citadel at Y = 220)
    // Player Citadel HP bar
    this.add.rectangle(PLAYER_CITADEL_X + 24, 220, 66, 10, 0x0f172a).setDepth(20);
    this.playerCitadelHpBar = this.add.rectangle(PLAYER_CITADEL_X + 24, 220, 64, 8, 0x22c55e);
    this.playerCitadelHpBar.setDepth(21);
    this.playerCitadelText = this.add.text(PLAYER_CITADEL_X + 24, 204, '2500 / 2500', {
      fontFamily: "'Cinzel', Georgia, serif, sans-serif",
      fontSize: '11px',
      color: '#60a5fa',
    }).setOrigin(0.5).setDepth(22);

    // Enemy Citadel HP bar
    this.add.rectangle(ENEMY_CITADEL_X - 24, 220, 66, 10, 0x0f172a).setDepth(20);
    this.enemyCitadelHpBar = this.add.rectangle(ENEMY_CITADEL_X - 24, 220, 64, 8, 0xef4444);
    this.enemyCitadelHpBar.setDepth(21);
    this.enemyCitadelText = this.add.text(ENEMY_CITADEL_X - 24, 204, '2500 / 2500', {
      fontFamily: "'Cinzel', Georgia, serif, sans-serif",
      fontSize: '11px',
      color: '#f87171',
    }).setOrigin(0.5).setDepth(22);
  }

  // =========================================================================
  // DOMAIN EVENT BUS SUBSCRIPTIONS
  // =========================================================================

  private setupDomainEventListeners(): void {
    const bus = this.engine.eventBus;

    bus.on('UnitAttacked', (e) => {
      const attacker = this.currSnapshot.units.find((u) => u.id === e.attackerId);
      const target = this.currSnapshot.units.find((u) => u.id === e.targetId);

      const targetX = target ? target.x : (attacker?.team === 'PLAYER' ? ENEMY_CITADEL_X : PLAYER_CITADEL_X);
      const targetY = target ? target.y : 300;

      // Determine projectile & sounds
      if (attacker) {
        this.handleAttackVisualsAndAudio(attacker.typeId, attacker.team, attacker.x, attacker.y, targetX, targetY, e.isCritical, e.damage);
      } else if (e.attackerId.startsWith('citadel_')) {
        // Balista shot from Desperation Bulwark
        const startX = e.attackerId.includes('player') ? PLAYER_CITADEL_X : ENEMY_CITADEL_X;
        this.pool.spawnProjectile(startX, 300, targetX, targetY, 'proj_citadel_bolt', 900);
        this.soundSynth.playBallistaShoot();
      }

      // Spawn floating combat text
      const style = e.isCritical ? 'CRITICAL' : (attacker?.typeId.includes('solar') ? 'MAGIC' : 'NORMAL');
      const textMsg = e.isCritical ? `CRÍTICO! -${e.damage}` : `-${e.damage}`;
      this.pool.spawnFloatingText(targetX, targetY - 14, textMsg, style);

      if (e.isCritical) {
        this.cameras.main.shake(120, 0.004);
        this.pool.spawnHitSpark(targetX, targetY, 0xffd700);
      }
    });

    bus.on('UnitDied', (e) => {
      this.pool.spawnFloatingText(e.x, e.y - 20, `+${e.bountyAwarded}g`, 'BOUNTY');
      this.pool.spawnHitSpark(e.x, e.y, 0xef4444);
    });

    bus.on('NexusDamaged', (e) => {
      const isPlayer = e.team === 'PLAYER';
      const nx = isPlayer ? PLAYER_CITADEL_X + 24 : ENEMY_CITADEL_X - 24;
      this.pool.spawnFloatingText(nx, 260, `-${e.damage}`, 'CRITICAL');
      this.pool.spawnHitSpark(nx, 300, 0xff0000);
      this.cameras.main.shake(200, 0.008);
      this.soundSynth.playCitadelAlert();
    });

    bus.on('StructureBuilt', () => {
      this.soundSynth.playStructureBuild();
    });

    bus.on('StructureUpgraded', () => {
      this.soundSynth.playStructureUpgrade();
    });

    bus.on('BattleEnded', (e) => {
      if (e.winnerTeam === 'PLAYER') {
        this.soundSynth.playVictory();
      } else {
        this.soundSynth.playDefeat();
      }
    });
  }

  private handleAttackVisualsAndAudio(
    typeId: UnitTypeId,
    _team: TeamId,
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
    isCritical: boolean,
    _damage: number
  ): void {
    switch (typeId) {
      case 'unit_longbowman':
        this.pool.spawnProjectile(startX, startY, targetX, targetY, 'proj_arrow', 800);
        this.soundSynth.playBowShoot();
        break;

      case 'unit_siege_crossbowman':
        this.pool.spawnProjectile(startX, startY, targetX, targetY, 'proj_bolt', 900);
        this.soundSynth.playBowShoot();
        break;

      case 'unit_solar_apprentice':
        this.pool.spawnProjectile(startX, startY, targetX, targetY, 'proj_solar_orb', 650, false, () => {
          this.pool.spawnHitSpark(targetX, targetY, 0xf59e0b);
        });
        this.soundSynth.playMagicImpact();
        break;

      case 'unit_solar_archmage':
        // Supernova occurs every 4th attack (indicated when isCritical/AoE damage is large)
        if (isCritical || Math.abs(startX - targetX) > 100) {
          this.pool.spawnSupernova(targetX, targetY);
          this.soundSynth.playSupernova();
        } else {
          this.pool.spawnProjectile(startX, startY, targetX, targetY, 'proj_solar_orb', 700);
          this.soundSynth.playMagicImpact();
        }
        break;

      case 'unit_mobile_ballista':
        this.pool.spawnProjectile(startX, startY, targetX, targetY, 'proj_ballista_bolt', 850);
        this.soundSynth.playBallistaShoot();
        break;

      case 'unit_greek_fire_catapult':
        // Arced trajectory for Greek Fire pot
        this.pool.spawnProjectile(startX, startY, targetX, targetY, 'proj_greek_pot', 500, true, () => {
          this.pool.spawnHitSpark(targetX, targetY, 0x22c55e);
        });
        this.soundSynth.playBallistaShoot();
        break;

      case 'unit_mounted_spearman':
      case 'unit_dawn_paladin':
        if (isCritical) {
          this.soundSynth.playCavalryCharge();
        } else {
          this.soundSynth.playPhysicalHit();
        }
        break;

      case 'unit_squire':
      case 'unit_royal_knight':
      case 'unit_colossal_warrior':
      default:
        this.soundSynth.playPhysicalHit();
        break;
    }
  }

  // =========================================================================
  // MAIN 60 FPS GAME LOOP & 20 TPS FIXED TIMESTEP DRIVER
  // =========================================================================

  public override update(time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.1);

    if (!this.isPaused && !this.engine.getIsGameOver()) {
      this.accumulator += dt * this.simSpeed;
      while (this.accumulator >= TICK_DURATION_SEC) {
        this.prevSnapshot = this.currSnapshot;
        this.engine.tick();
        this.currSnapshot = this.engine.getSnapshot();
        this.accumulator -= TICK_DURATION_SEC;
      }
    }

    // Compute interpolation alpha in [0, 1]
    const alpha = Math.max(0, Math.min(1, this.accumulator / TICK_DURATION_SEC));
    const interpolation = SnapshotInterpolator.interpolate(
      this.prevSnapshot,
      this.currSnapshot,
      alpha
    );

    // 1. Render units with linear interpolation at 60 FPS
    this.renderUnits(interpolation.units);

    // 2. Render frontline & territory push
    this.renderFrontline(interpolation.frontlineX);

    // 3. Render ground hazards (Greek Fire pools)
    this.renderHazards(this.currSnapshot.hazards, time);

    // 4. Update Citadel HP bars
    this.renderCitadels(this.currSnapshot.citadels);

    // 5. Update pooled projectiles, AoE effects, and floating texts
    this.pool.update(delta);

    // 6. Camera auto-follow if mode is active
    if (this.cameraMode === 'FOLLOW_FRONTLINE') {
      const cam = this.cameras.main;
      const targetCamX = interpolation.frontlineX;
      cam.scrollX += (targetCamX - (cam.scrollX + cam.width / 2)) * 0.08;
    }
  }

  // =========================================================================
  // UNIT RENDERING & OBJECT POOLING
  // =========================================================================

  private renderUnits(units: InterpolatedUnit[]): void {
    const seenIds = new Set<string>();

    for (const unit of units) {
      seenIds.add(unit.id);
      let visual = this.activeUnitVisuals.get(unit.id);

      if (!visual) {
        visual = this.acquireUnitVisual(unit.typeId, unit.team);
        this.activeUnitVisuals.set(unit.id, visual);
      }

      // Position container at interpolated 60 FPS coordinates
      visual.container.setPosition(unit.renderX, unit.renderY);
      visual.container.setDepth(Math.floor(unit.renderY));

      // Flip sprite based on team (Player faces right, Enemy faces left)
      visual.sprite.setFlipX(unit.team === 'ENEMY');

      // Update HP Bar (30 x 4 px, anchored at Y - 24 px)
      const hpRatio = Math.max(0, Math.min(1, unit.currentHp / unit.maxHp));
      visual.hpBarFg.width = 30 * hpRatio;

      if (hpRatio > 0.5) {
        visual.hpBarFg.setFillStyle(0x22c55e); // Emerald Green
      } else if (hpRatio >= 0.25) {
        visual.hpBarFg.setFillStyle(0xeab308); // Tactical Amber
      } else {
        visual.hpBarFg.setFillStyle(0xef4444); // Critical Crimson
      }

      // Status Indicator: Stun
      if (unit.stunTicksRemaining > 0) {
        visual.stunIcon.setVisible(true);
        visual.stunIcon.rotation += 0.05;
      } else {
        visual.stunIcon.setVisible(false);
      }

      // Status Indicator: Solar Flame (Attack speed debuff)
      visual.flameIcon.setVisible(unit.solarFlameTicksRemaining > 0);

      // Status Indicator: Radiant Morale (+15% move speed)
      visual.moraleRing.setVisible(unit.hasRadiantMorale);

      // Status Indicator: Paladin Devotion Aura
      visual.devotionAura.setVisible(unit.typeId === 'unit_dawn_paladin');
      if (unit.typeId === 'unit_dawn_paladin') {
        visual.devotionAura.rotation += 0.01;
      }
    }

    // Recycle visuals for units that died or disappeared
    for (const [id, visual] of this.activeUnitVisuals.entries()) {
      if (!seenIds.has(id)) {
        visual.container.setActive(false).setVisible(false);
        this.unitVisualPool.push(visual);
        this.activeUnitVisuals.delete(id);
      }
    }
  }

  private acquireUnitVisual(typeId: UnitTypeId, team: TeamId): UnitVisualContainer {
    const textureKey = ProceduralAssetFactory.getUnitTextureKey(typeId, team);
    let visual = this.unitVisualPool.pop();

    if (!visual) {
      const container = this.add.container(0, 0);

      // Devotion aura ring (under unit)
      const devotionAura = this.add.sprite(0, 0, 'vfx_paladin_aura');
      devotionAura.setVisible(false);

      // Morale ring
      const moraleRing = this.add.circle(0, 0, 16, 0xffd700, 0);
      moraleRing.setStrokeStyle(1.5, 0xffd700, 0.8);
      moraleRing.setVisible(false);

      // Unit sprite
      const sprite = this.add.sprite(0, 0, textureKey);

      // HP Bar background (32 x 6 px, dark charcoal)
      const hpBarBg = this.add.rectangle(0, -24, 32, 6, 0x0f172a);
      hpBarBg.setStrokeStyle(1, 0x000000, 1);

      // HP Bar foreground (30 x 4 px)
      const hpBarFg = this.add.rectangle(-15, -24, 30, 4, 0x22c55e);
      hpBarFg.setOrigin(0, 0.5);

      // Stun Stars
      const stunIcon = this.add.sprite(0, -34, 'vfx_stun_stars');
      stunIcon.setVisible(false);

      // Solar Flame icon
      const flameIcon = this.add.sprite(0, 12, 'vfx_solar_flame');
      flameIcon.setVisible(false);

      container.add([devotionAura, moraleRing, sprite, hpBarBg, hpBarFg, stunIcon, flameIcon]);

      visual = {
        container,
        sprite,
        hpBarBg,
        hpBarFg,
        stunIcon,
        flameIcon,
        devotionAura,
        moraleRing,
      };
    } else {
      visual.sprite.setTexture(textureKey);
      visual.container.setActive(true).setVisible(true);
    }

    return visual;
  }

  // =========================================================================
  // FRONTLINE & TERRITORY RENDERING
  // =========================================================================

  private renderFrontline(frontlineX: number): void {
    const g = this.frontlineGraphics;
    g.clear();

    // Determine frontline tactical status
    const isPlayerVanguard = frontlineX > ENEMY_ZONE_MIN_X; // X > 1200
    const isEnemyVanguard = frontlineX < ALLIED_ZONE_MAX_X;  // X < 800

    const color = isPlayerVanguard ? 0xffd700 : (isEnemyVanguard ? 0xef4444 : 0xfbbf24);

    // Frontline glow beam
    g.lineStyle(6, color, 0.3);
    g.lineBetween(frontlineX, ARENA_MIN_Y - 10, frontlineX, ARENA_MAX_Y + 10);

    g.lineStyle(2, color, 0.9);
    g.lineBetween(frontlineX, ARENA_MIN_Y - 10, frontlineX, ARENA_MAX_Y + 10);

    // Crown or Shield marker on top of line
    g.fillStyle(color, 1);
    g.fillTriangle(
      frontlineX - 8, ARENA_MIN_Y - 12,
      frontlineX + 8, ARENA_MIN_Y - 12,
      frontlineX, ARENA_MIN_Y - 2
    );
  }

  // =========================================================================
  // GROUND HAZARDS (Greek Fire Pools)
  // =========================================================================

  private renderHazards(hazards: GreekFireHazard[], time: number): void {
    const g = this.hazardsGraphics;
    g.clear();

    for (const h of hazards) {
      const pulseAlpha = 0.55 + 0.12 * Math.sin(time * 0.006 + h.x);

      // Translucent green & magma hazard disc (radius 120px)
      g.fillStyle(0x15803d, pulseAlpha * 0.6);
      g.fillCircle(h.x, h.y, h.radiusPx);

      g.fillStyle(0x22c55e, pulseAlpha * 0.5);
      g.fillCircle(h.x, h.y, h.radiusPx * 0.7);

      g.fillStyle(0xea580c, pulseAlpha * 0.6);
      g.fillCircle(h.x, h.y, h.radiusPx * 0.35);

      g.lineStyle(2, 0x86efac, pulseAlpha);
      g.strokeCircle(h.x, h.y, h.radiusPx);
    }
  }

  // =========================================================================
  // CITADEL HP BARS
  // =========================================================================

  private renderCitadels(citadels: Record<TeamId, CitadelState>): void {
    const pCitadel = citadels.PLAYER;
    const eCitadel = citadels.ENEMY;

    const pRatio = Math.max(0, pCitadel.currentHp / CITADEL_MAX_HP);
    const eRatio = Math.max(0, eCitadel.currentHp / CITADEL_MAX_HP);

    this.playerCitadelHpBar.width = 64 * pRatio;
    this.enemyCitadelHpBar.width = 64 * eRatio;

    this.playerCitadelText.setText(`${pCitadel.currentHp} / ${CITADEL_MAX_HP}`);
    this.enemyCitadelText.setText(`${eCitadel.currentHp} / ${CITADEL_MAX_HP}`);
  }

  // =========================================================================
  // PUBLIC CONTROLLER HOOKS FOR TACTICAL HUD
  // =========================================================================

  public setSimulationSpeed(speed: number): void {
    this.simSpeed = speed;
  }

  public getSimulationSpeed(): number {
    return this.simSpeed;
  }

  public setPaused(paused: boolean): void {
    this.isPaused = paused;
  }

  public togglePaused(): boolean {
    this.isPaused = !this.isPaused;
    return this.isPaused;
  }

  public isGamePaused(): boolean {
    return this.isPaused;
  }

  public getEngine(): GameEngine {
    return this.engine;
  }

  public getSoundSynthesizer(): SoundSynthesizer {
    return this.soundSynth;
  }

  public resetGame(newEngine: GameEngine): void {
    this.engine = newEngine;
    this.currSnapshot = this.engine.getSnapshot();
    this.prevSnapshot = this.currSnapshot;
    this.accumulator = 0;

    // Clear pools & unit visuals
    this.pool.clear();
    for (const visual of this.activeUnitVisuals.values()) {
      visual.container.setActive(false).setVisible(false);
      this.unitVisualPool.push(visual);
    }
    this.activeUnitVisuals.clear();

    // Re-hook domain event listeners
    this.setupDomainEventListeners();
  }
}
