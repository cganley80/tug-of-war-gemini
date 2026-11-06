/**
 * Tug of War: Citadels of Aethelgard
 * ProceduralAssetFactory (Section 4.1 & GOVERNANCE.md)
 * Generates stylized, highly legible vector textures for all units, citadels,
 * projectiles, and visual effects directly into Phaser's TextureManager.
 */

import Phaser from 'phaser';
import { UnitTypeId, TeamId } from '../../core/types';

export class ProceduralAssetFactory {
  private static generated = false;

  public static getUnitTextureKey(typeId: UnitTypeId | string, team: TeamId): string {
    // Support aliases if any (e.g. unit_mounted_lancer -> unit_mounted_spearman)
    const normalizedTypeId =
      typeId === 'unit_mounted_lancer' ? 'unit_mounted_spearman' : typeId;
    return `${normalizedTypeId}_${team.toLowerCase()}`;
  }

  public static generateAssets(scene: Phaser.Scene): void {
    if (this.generated) return;

    // Generate units for both teams
    this.generateInfantry(scene);
    this.generateArchery(scene);
    this.generateArcane(scene);
    this.generateCavalry(scene);
    this.generateSiege(scene);
    this.generateBoss(scene);

    // Generate citadels
    this.generateCitadels(scene);

    // Generate projectiles
    this.generateProjectiles(scene);

    // Generate area & status VFX
    this.generateVFX(scene);

    this.generated = true;
  }

  // =========================================================================
  // 1. INFANTRY (Squire N1, Royal Knight N2)
  // =========================================================================
  private static generateInfantry(scene: Phaser.Scene): void {
    for (const team of ['PLAYER', 'ENEMY'] as const) {
      const isPlayer = team === 'PLAYER';
      const primaryColor = isPlayer ? 0x2563eb : 0xdc2626;
      const secondaryColor = isPlayer ? 0x1e3a8a : 0x7f1d1d;
      const trimColor = isPlayer ? 0xf59e0b : 0x1f2937;

      // --- Squire (N1: 32x32) ---
      const squireKey = this.getUnitTextureKey('unit_squire', team);
      if (!scene.textures.exists(squireKey)) {
        const g = scene.make.graphics({ x: 0, y: 0 });
        // Body armor (iron/steel with team secondary tint)
        g.fillStyle(secondaryColor, 1);
        g.fillCircle(16, 16, 9);
        // Helmet
        g.fillStyle(0x94a3b8, 1);
        g.fillCircle(16, 11, 6);
        // Visor slit
        g.fillStyle(0x0f172a, 1);
        g.fillRect(13, 11, 7, 2);
        // Kite shield on front
        g.fillStyle(primaryColor, 1);
        g.fillTriangle(isPlayer ? 22 : 10, 8, isPlayer ? 29 : 3, 15, isPlayer ? 22 : 10, 24);
        g.lineStyle(1.5, trimColor, 1);
        g.strokeTriangle(isPlayer ? 22 : 10, 8, isPlayer ? 29 : 3, 15, isPlayer ? 22 : 10, 24);
        // Sword blade
        g.lineStyle(2, 0xe2e8f0, 1);
        g.lineBetween(isPlayer ? 10 : 22, 22, isPlayer ? 6 : 26, 8);
        // Crossguard
        g.lineStyle(1.5, trimColor, 1);
        g.lineBetween(isPlayer ? 8 : 24, 19, isPlayer ? 13 : 19, 21);

        g.generateTexture(squireKey, 32, 32);
        g.destroy();
      }

      // --- Royal Knight (N2: 38x38 with golden border & elite insignia) ---
      const knightKey = this.getUnitTextureKey('unit_royal_knight', team);
      if (!scene.textures.exists(knightKey)) {
        const g = scene.make.graphics({ x: 0, y: 0 });
        // Outer elite border
        g.lineStyle(2, isPlayer ? 0xffd700 : 0xef4444, 1);
        g.strokeRoundedRect(2, 2, 34, 34, 4);
        // Polished plate armor body
        g.fillStyle(0x64748b, 1);
        g.fillCircle(19, 19, 11);
        // Ornate knight helmet with crest plume
        g.fillStyle(0xcbd5e1, 1);
        g.fillCircle(19, 13, 7);
        // Plume feather
        g.fillStyle(isPlayer ? 0x3b82f6 : 0xb91c1c, 1);
        g.fillTriangle(19, 6, 16, 11, 22, 11);
        // Tower shield
        g.fillStyle(primaryColor, 1);
        g.fillRect(isPlayer ? 24 : 6, 9, 8, 20);
        g.lineStyle(1.5, 0xffd700, 1);
        g.strokeRect(isPlayer ? 24 : 6, 9, 8, 20);
        // Golden sun emblem on shield
        g.fillStyle(0xffd700, 1);
        g.fillCircle(isPlayer ? 28 : 10, 19, 3);
        // Greatsword
        g.lineStyle(2.5, 0xf8fafc, 1);
        g.lineBetween(isPlayer ? 12 : 26, 26, isPlayer ? 8 : 30, 7);
        g.lineStyle(2, 0xffd700, 1);
        g.lineBetween(isPlayer ? 9 : 29, 21, isPlayer ? 15 : 23, 23);

        g.generateTexture(knightKey, 38, 38);
        g.destroy();
      }
    }
  }

  // =========================================================================
  // 2. ARCHERY (Longbowman N1, Siege Crossbowman N2)
  // =========================================================================
  private static generateArchery(scene: Phaser.Scene): void {
    for (const team of ['PLAYER', 'ENEMY'] as const) {
      const isPlayer = team === 'PLAYER';
      const cloakColor = isPlayer ? 0x15803d : 0x881337;
      const tunicColor = isPlayer ? 0x78350f : 0x374151;

      // --- Longbowman (N1: 32x32) ---
      const bowKey = this.getUnitTextureKey('unit_longbowman', team);
      if (!scene.textures.exists(bowKey)) {
        const g = scene.make.graphics({ x: 0, y: 0 });
        // Body / Tunic
        g.fillStyle(tunicColor, 1);
        g.fillCircle(16, 17, 8);
        // Forest green hooded cloak
        g.fillStyle(cloakColor, 1);
        g.fillTriangle(16, 7, 10, 19, 22, 19);
        g.fillCircle(16, 12, 5);
        // Wooden recurve bow arc
        g.lineStyle(2, 0xb45309, 1);
        g.beginPath();
        g.arc(isPlayer ? 24 : 8, 16, 9, -Math.PI / 2.2, Math.PI / 2.2, !isPlayer);
        g.strokePath();
        // Bowstring
        g.lineStyle(1, 0xe2e8f0, 0.8);
        g.lineBetween(isPlayer ? 24 : 8, 7, isPlayer ? 24 : 8, 25);
        // Arrow notched
        g.lineStyle(1.5, 0xfde047, 1);
        g.lineBetween(isPlayer ? 14 : 18, 16, isPlayer ? 27 : 5, 16);
        // Quiver on back
        g.fillStyle(0x92400e, 1);
        g.fillRect(isPlayer ? 8 : 22, 11, 4, 10);

        g.generateTexture(bowKey, 32, 32);
        g.destroy();
      }

      // --- Siege Crossbowman (N2: 38x38 with golden border) ---
      const xbowKey = this.getUnitTextureKey('unit_siege_crossbowman', team);
      if (!scene.textures.exists(xbowKey)) {
        const g = scene.make.graphics({ x: 0, y: 0 });
        // Outer elite border
        g.lineStyle(2, isPlayer ? 0xffd700 : 0xef4444, 1);
        g.strokeRoundedRect(2, 2, 34, 34, 4);
        // Armored cloak body
        g.fillStyle(cloakColor, 1);
        g.fillCircle(19, 20, 10);
        // Iron helmet / hood
        g.fillStyle(0x64748b, 1);
        g.fillCircle(19, 13, 6);
        // Heavy iron crossbow stock
        g.fillStyle(0x334155, 1);
        g.fillRect(isPlayer ? 15 : 13, 17, 14, 4);
        // Crossbow steel arms
        g.lineStyle(3, 0x94a3b8, 1);
        g.lineBetween(isPlayer ? 26 : 12, 10, isPlayer ? 26 : 12, 28);
        // Steel stirrup at front
        g.lineStyle(1.5, 0xffd700, 1);
        g.strokeCircle(isPlayer ? 30 : 8, 19, 3);
        // Heavy steel bolt loaded
        g.lineStyle(2, 0x38bdf8, 1);
        g.lineBetween(isPlayer ? 16 : 22, 19, isPlayer ? 30 : 8, 19);

        g.generateTexture(xbowKey, 38, 38);
        g.destroy();
      }
    }
  }

  // =========================================================================
  // 3. ARCANE TOWER (Solar Apprentice N1, Solar Archmage N2)
  // =========================================================================
  private static generateArcane(scene: Phaser.Scene): void {
    for (const team of ['PLAYER', 'ENEMY'] as const) {
      const isPlayer = team === 'PLAYER';
      const robeColor = isPlayer ? 0x1e1b4b : 0x3b0764;
      const magicColor = isPlayer ? 0xf59e0b : 0xdc2626;
      const haloColor = isPlayer ? 0xfef08a : 0xf87171;

      // --- Solar Apprentice (N1: 32x32) ---
      const apprenticeKey = this.getUnitTextureKey('unit_solar_apprentice', team);
      if (!scene.textures.exists(apprenticeKey)) {
        const g = scene.make.graphics({ x: 0, y: 0 });
        // Robe cone
        g.fillStyle(robeColor, 1);
        g.fillTriangle(16, 10, 8, 27, 24, 27);
        // Hood
        g.fillStyle(0x312e81, 1);
        g.fillCircle(16, 12, 5);
        // Solar halo over head
        g.lineStyle(1.5, haloColor, 0.9);
        g.strokeCircle(16, 7, 4);
        // Staff
        g.lineStyle(2, 0xd97706, 1);
        g.lineBetween(isPlayer ? 23 : 9, 7, isPlayer ? 23 : 9, 27);
        // Glowing solar orb on staff
        g.fillStyle(magicColor, 1);
        g.fillCircle(isPlayer ? 23 : 9, 7, 4);
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(isPlayer ? 23 : 9, 7, 2);

        g.generateTexture(apprenticeKey, 32, 32);
        g.destroy();
      }

      // --- Solar Archmage (N2: 38x38 with golden border & blazing supernova halo) ---
      const archmageKey = this.getUnitTextureKey('unit_solar_archmage', team);
      if (!scene.textures.exists(archmageKey)) {
        const g = scene.make.graphics({ x: 0, y: 0 });
        // Outer elite border
        g.lineStyle(2, isPlayer ? 0xffd700 : 0xef4444, 1);
        g.strokeRoundedRect(2, 2, 34, 34, 4);
        // Blazing celestial halo behind head
        g.fillStyle(haloColor, 0.4);
        g.fillCircle(19, 13, 10);
        g.lineStyle(2, 0xffd700, 1);
        g.strokeCircle(19, 13, 8);
        // Star points on halo
        g.fillStyle(0xffd700, 1);
        g.fillTriangle(19, 2, 17, 7, 21, 7);
        g.fillTriangle(19, 24, 17, 19, 21, 19);
        g.fillTriangle(8, 13, 13, 11, 13, 15);
        g.fillTriangle(30, 13, 25, 11, 25, 15);
        // Archmage flowing robe
        g.fillStyle(robeColor, 1);
        g.fillTriangle(19, 11, 9, 32, 29, 32);
        // Golden rune hem
        g.lineStyle(2, 0xffd700, 1);
        g.lineBetween(9, 32, 29, 32);
        // Staff of dawn
        g.lineStyle(2.5, 0xffd700, 1);
        g.lineBetween(isPlayer ? 28 : 10, 5, isPlayer ? 28 : 10, 32);
        // Large radiant crystal on staff
        g.fillStyle(0x38bdf8, 1);
        g.fillCircle(isPlayer ? 28 : 10, 6, 5);
        g.fillStyle(0xffffff, 1);
        g.fillCircle(isPlayer ? 28 : 10, 6, 2.5);

        g.generateTexture(archmageKey, 38, 38);
        g.destroy();
      }
    }
  }

  // =========================================================================
  // 4. CAVALRY (Mounted Spearman N1, Dawn Paladin N2)
  // =========================================================================
  private static generateCavalry(scene: Phaser.Scene): void {
    for (const team of ['PLAYER', 'ENEMY'] as const) {
      const isPlayer = team === 'PLAYER';
      const horseColor = isPlayer ? 0x92400e : 0x1f2937;
      const bardingColor = isPlayer ? 0x2563eb : 0x991b1b;
      const lanceColor = isPlayer ? 0xf59e0b : 0xef4444;

      // --- Mounted Spearman / Lancer (N1: 36x30) ---
      const spearmanKey = this.getUnitTextureKey('unit_mounted_spearman', team);
      if (!scene.textures.exists(spearmanKey)) {
        const g = scene.make.graphics({ x: 0, y: 0 });
        // Horse body
        g.fillStyle(horseColor, 1);
        g.fillRoundedRect(isPlayer ? 6 : 10, 12, 20, 12, 4);
        // Horse neck and head
        g.fillTriangle(
          isPlayer ? 22 : 14, 18,
          isPlayer ? 29 : 7, 7,
          isPlayer ? 24 : 12, 7
        );
        g.fillCircle(isPlayer ? 28 : 8, 7, 4);
        // Horse legs
        g.lineStyle(2, horseColor, 1);
        g.lineBetween(isPlayer ? 9 : 27, 24, isPlayer ? 9 : 27, 29);
        g.lineBetween(isPlayer ? 23 : 13, 24, isPlayer ? 23 : 13, 29);
        // Saddlecloth / Barding
        g.fillStyle(bardingColor, 1);
        g.fillRect(isPlayer ? 10 : 14, 14, 12, 8);
        // Rider torso
        g.fillStyle(0x64748b, 1);
        g.fillCircle(isPlayer ? 16 : 20, 10, 5);
        // Lance extending forward
        g.lineStyle(2, lanceColor, 1);
        g.lineBetween(isPlayer ? 11 : 25, 12, isPlayer ? 35 : 1, 12);
        // Lance tip
        g.fillStyle(0xf8fafc, 1);
        g.fillTriangle(
          isPlayer ? 32 : 4, 10,
          isPlayer ? 36 : 0, 12,
          isPlayer ? 32 : 4, 14
        );

        g.generateTexture(spearmanKey, 36, 30);
        g.destroy();
      }

      // --- Dawn Paladin (N2: 42x34 with golden border & holy caparison) ---
      const paladinKey = this.getUnitTextureKey('unit_dawn_paladin', team);
      if (!scene.textures.exists(paladinKey)) {
        const g = scene.make.graphics({ x: 0, y: 0 });
        // Outer elite border
        g.lineStyle(2, isPlayer ? 0xffd700 : 0xef4444, 1);
        g.strokeRoundedRect(2, 2, 38, 30, 4);
        // Heavily armored holy charger body (white/silver plate)
        g.fillStyle(isPlayer ? 0xe2e8f0 : 0x334155, 1);
        g.fillRoundedRect(isPlayer ? 8 : 14, 14, 20, 13, 4);
        // Horse armored chamfron head
        g.fillTriangle(
          isPlayer ? 24 : 18, 20,
          isPlayer ? 33 : 9, 8,
          isPlayer ? 27 : 15, 8
        );
        g.fillCircle(isPlayer ? 32 : 10, 8, 4);
        // Radiant solar caparison
        g.fillStyle(bardingColor, 1);
        g.fillRect(isPlayer ? 12 : 18, 16, 13, 9);
        g.lineStyle(1.5, 0xffd700, 1);
        g.strokeRect(isPlayer ? 12 : 18, 16, 13, 9);
        // Paladin in gold plate armor
        g.fillStyle(isPlayer ? 0xffd700 : 0x1f2937, 1);
        g.fillCircle(isPlayer ? 18 : 24, 10, 6);
        // Holy halo
        g.lineStyle(1.5, 0xfef08a, 1);
        g.strokeCircle(isPlayer ? 18 : 24, 6, 4);
        // Heavy holy lance
        g.lineStyle(2.5, 0xffd700, 1);
        g.lineBetween(isPlayer ? 13 : 29, 13, isPlayer ? 41 : 1, 13);
        // Swallowtail pennant fluttering on lance
        g.fillStyle(isPlayer ? 0x38bdf8 : 0xdc2626, 1);
        g.fillTriangle(
          isPlayer ? 26 : 16, 13,
          isPlayer ? 32 : 10, 13,
          isPlayer ? 29 : 13, 17
        );

        g.generateTexture(paladinKey, 42, 34);
        g.destroy();
      }
    }
  }

  // =========================================================================
  // 5. SIEGE (Mobile Ballista N1, Greek Fire Catapult N2)
  // =========================================================================
  private static generateSiege(scene: Phaser.Scene): void {
    for (const team of ['PLAYER', 'ENEMY'] as const) {
      const isPlayer = team === 'PLAYER';
      const woodColor = isPlayer ? 0x78350f : 0x27272a;
      const ironColor = isPlayer ? 0x475569 : 0x52525b;

      // --- Mobile Ballista (N1: 34x30) ---
      const ballistaKey = this.getUnitTextureKey('unit_mobile_ballista', team);
      if (!scene.textures.exists(ballistaKey)) {
        const g = scene.make.graphics({ x: 0, y: 0 });
        // Chassis timber frame
        g.fillStyle(woodColor, 1);
        g.fillRect(isPlayer ? 5 : 9, 13, 20, 8);
        // Twin wheels with iron rim
        g.fillStyle(ironColor, 1);
        g.fillCircle(isPlayer ? 9 : 25, 23, 5);
        g.fillCircle(isPlayer ? 21 : 13, 23, 5);
        g.fillStyle(woodColor, 1);
        g.fillCircle(isPlayer ? 9 : 25, 23, 2);
        g.fillCircle(isPlayer ? 21 : 13, 23, 2);
        // Torsion steel bow limbs
        g.lineStyle(3, 0x94a3b8, 1);
        g.lineBetween(isPlayer ? 20 : 14, 5, isPlayer ? 20 : 14, 21);
        // Long siege bolt mounted
        g.lineStyle(2, 0xf59e0b, 1);
        g.lineBetween(isPlayer ? 9 : 25, 13, isPlayer ? 32 : 2, 13);
        // Iron tip
        g.fillStyle(0xf8fafc, 1);
        g.fillTriangle(
          isPlayer ? 29 : 5, 11,
          isPlayer ? 33 : 1, 13,
          isPlayer ? 29 : 5, 15
        );

        g.generateTexture(ballistaKey, 34, 30);
        g.destroy();
      }

      // --- Greek Fire Catapult (N2: 38x36 with golden border & flame cauldron) ---
      const catapultKey = this.getUnitTextureKey('unit_greek_fire_catapult', team);
      if (!scene.textures.exists(catapultKey)) {
        const g = scene.make.graphics({ x: 0, y: 0 });
        // Outer elite border
        g.lineStyle(2, isPlayer ? 0xffd700 : 0xef4444, 1);
        g.strokeRoundedRect(2, 2, 34, 32, 4);
        // Heavy trestle timber frame
        g.fillStyle(woodColor, 1);
        g.fillRect(isPlayer ? 7 : 11, 18, 20, 8);
        g.fillTriangle(
          isPlayer ? 10 : 28, 24,
          isPlayer ? 18 : 20, 10,
          isPlayer ? 24 : 14, 24
        );
        // Wheels
        g.fillStyle(ironColor, 1);
        g.fillCircle(isPlayer ? 10 : 28, 28, 4);
        g.fillCircle(isPlayer ? 24 : 14, 28, 4);
        // Catapult throwing arm
        g.lineStyle(3, 0x451a03, 1);
        g.lineBetween(isPlayer ? 14 : 24, 20, isPlayer ? 28 : 10, 8);
        // Cauldron bucket brim
        g.fillStyle(0xd97706, 1);
        g.fillCircle(isPlayer ? 28 : 10, 8, 6);
        // Boiling Greek Fire (toxic green & magma)
        g.fillStyle(0x22c55e, 1);
        g.fillCircle(isPlayer ? 28 : 10, 8, 4);
        g.fillStyle(0xf97316, 0.9);
        g.fillCircle(isPlayer ? 28 : 10, 7, 2);

        g.generateTexture(catapultKey, 38, 36);
        g.destroy();
      }
    }
  }

  // =========================================================================
  // 6. BOSS (Colossal Warrior: 48x48)
  // =========================================================================
  private static generateBoss(scene: Phaser.Scene): void {
    for (const team of ['ENEMY', 'PLAYER'] as const) {
      const bossKey = this.getUnitTextureKey('unit_colossal_warrior', team);
      if (!scene.textures.exists(bossKey)) {
        const g = scene.make.graphics({ x: 0, y: 0 });
        // Spiked ominous border
        g.lineStyle(2.5, 0xb91c1c, 1);
        g.strokeRoundedRect(2, 2, 44, 44, 6);
        // Demonic fire aura
        g.fillStyle(0x7f1d1d, 0.35);
        g.fillCircle(24, 24, 20);
        // Massive obsidian plate body
        g.fillStyle(0x0f172a, 1);
        g.fillCircle(24, 24, 15);
        // Spiked horned great-helm
        g.fillStyle(0x1e293b, 1);
        g.fillCircle(24, 14, 9);
        // Horns
        g.fillStyle(0x991b1b, 1);
        g.fillTriangle(15, 14, 11, 4, 18, 10);
        g.fillTriangle(33, 14, 37, 4, 30, 10);
        // Glowing red visor slit
        g.fillStyle(0xef4444, 1);
        g.fillRect(19, 13, 10, 3);
        // Colossal executioner jagged greatsword
        g.lineStyle(4, 0x334155, 1);
        g.lineBetween(32, 38, 42, 6);
        g.lineStyle(2, 0xdc2626, 1);
        g.lineBetween(32, 38, 42, 6);

        g.generateTexture(bossKey, 48, 48);
        g.destroy();
      }
    }
  }

  // =========================================================================
  // 7. CITADELS (Player: 48x120, Enemy: 48x120)
  // =========================================================================
  private static generateCitadels(scene: Phaser.Scene): void {
    // --- Player Citadel (Solar Fortress) ---
    if (!scene.textures.exists('citadel_player')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      // Stone bastion tower
      g.fillStyle(0x334155, 1);
      g.fillRect(4, 20, 40, 96);
      // Crenelated battlements
      g.fillRect(0, 10, 48, 14);
      g.fillStyle(0x1e293b, 1);
      g.fillRect(8, 10, 8, 6);
      g.fillRect(24, 10, 8, 6);
      g.fillRect(40, 10, 8, 6);
      // Royal blue banners with gold crown
      g.fillStyle(0x2563eb, 1);
      g.fillRect(12, 40, 24, 45);
      g.fillStyle(0xffd700, 1);
      g.fillTriangle(24, 48, 18, 56, 30, 56);
      g.fillCircle(24, 60, 4);
      // Apex solar power crystal
      g.fillStyle(0x38bdf8, 1);
      g.fillTriangle(24, 0, 16, 10, 32, 10);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(24, 6, 3);
      // Ballista defense port
      g.fillStyle(0x0f172a, 1);
      g.fillRect(36, 28, 8, 6);
      g.lineStyle(2, 0xf59e0b, 1);
      g.lineBetween(40, 31, 48, 31);

      g.generateTexture('citadel_player', 48, 120);
      g.destroy();
    }

    // --- Enemy Citadel (Obsidian Dread Bastion) ---
    if (!scene.textures.exists('citadel_enemy')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      // Basalt obsidian stone
      g.fillStyle(0x18181b, 1);
      g.fillRect(4, 20, 40, 96);
      // Jagged demonic battlements
      g.fillRect(0, 10, 48, 14);
      g.fillStyle(0x7f1d1d, 1);
      g.fillTriangle(4, 10, 8, 2, 12, 10);
      g.fillTriangle(20, 10, 24, 2, 28, 10);
      g.fillTriangle(36, 10, 40, 2, 44, 10);
      // Blood crimson banners
      g.fillStyle(0x991b1b, 1);
      g.fillRect(12, 40, 24, 45);
      g.fillStyle(0x000000, 1);
      g.fillCircle(24, 58, 6);
      // Pulsating demonic core
      g.fillStyle(0xef4444, 1);
      g.fillTriangle(24, 0, 16, 10, 32, 10);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(24, 6, 3);
      // Iron ballista port
      g.fillStyle(0x000000, 1);
      g.fillRect(4, 28, 8, 6);
      g.lineStyle(2, 0xdc2626, 1);
      g.lineBetween(0, 31, 8, 31);

      g.generateTexture('citadel_enemy', 48, 120);
      g.destroy();
    }
  }

  // =========================================================================
  // 8. PROJECTILES
  // =========================================================================
  private static generateProjectiles(scene: Phaser.Scene): void {
    // Arrow (16x4)
    if (!scene.textures.exists('proj_arrow')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.lineStyle(1.5, 0x92400e, 1);
      g.lineBetween(0, 2, 13, 2);
      g.fillStyle(0xf8fafc, 1);
      g.fillTriangle(11, 0, 16, 2, 11, 4);
      g.fillStyle(0x22c55e, 1);
      g.fillRect(0, 0, 3, 4);
      g.generateTexture('proj_arrow', 16, 4);
      g.destroy();
    }

    // Heavy Crossbow Bolt (18x5)
    if (!scene.textures.exists('proj_bolt')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.lineStyle(2, 0x64748b, 1);
      g.lineBetween(0, 2.5, 14, 2.5);
      g.fillStyle(0x38bdf8, 1);
      g.fillTriangle(13, 0, 18, 2.5, 13, 5);
      g.fillStyle(0xd97706, 1);
      g.fillRect(0, 0.5, 3, 4);
      g.generateTexture('proj_bolt', 18, 5);
      g.destroy();
    }

    // Solar Arcane Orb (16x16)
    if (!scene.textures.exists('proj_solar_orb')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x38bdf8, 0.4);
      g.fillCircle(8, 8, 8);
      g.fillStyle(0xf59e0b, 0.8);
      g.fillCircle(8, 8, 5);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(8, 8, 2.5);
      g.generateTexture('proj_solar_orb', 16, 16);
      g.destroy();
    }

    // Ballista Siege Bolt (28x6)
    if (!scene.textures.exists('proj_ballista_bolt')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.lineStyle(3, 0x78350f, 1);
      g.lineBetween(0, 3, 22, 3);
      g.fillStyle(0x94a3b8, 1);
      g.fillTriangle(20, 0, 28, 3, 20, 6);
      g.generateTexture('proj_ballista_bolt', 28, 6);
      g.destroy();
    }

    // Greek Fire Pot (16x16)
    if (!scene.textures.exists('proj_greek_pot')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xb45309, 1);
      g.fillCircle(8, 8, 6);
      g.fillStyle(0x22c55e, 1);
      g.fillCircle(8, 7, 4);
      g.fillStyle(0xf97316, 0.9);
      g.fillCircle(8, 6, 2);
      g.generateTexture('proj_greek_pot', 16, 16);
      g.destroy();
    }

    // Citadel Ballista Bolt (24x6)
    if (!scene.textures.exists('proj_citadel_bolt')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.lineStyle(2.5, 0x38bdf8, 1);
      g.lineBetween(0, 3, 18, 3);
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(17, 0, 24, 3, 17, 6);
      g.generateTexture('proj_citadel_bolt', 24, 6);
      g.destroy();
    }
  }

  // =========================================================================
  // 9. AREA EFFECTS & STATUS ICONS (VFX)
  // =========================================================================
  private static generateVFX(scene: Phaser.Scene): void {
    // Supernova 100px Radius Ring (200x200)
    if (!scene.textures.exists('vfx_supernova_ring')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xfef08a, 0.25);
      g.fillCircle(100, 100, 96);
      g.lineStyle(4, 0xffd700, 1);
      g.strokeCircle(100, 100, 96);
      g.lineStyle(2, 0xffffff, 0.8);
      g.strokeCircle(100, 100, 70);
      g.generateTexture('vfx_supernova_ring', 200, 200);
      g.destroy();
    }

    // Supernova Vertical Light Beam (40x240)
    if (!scene.textures.exists('vfx_supernova_beam')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xfef08a, 0.4);
      g.fillRect(4, 0, 32, 240);
      g.fillStyle(0xffffff, 0.85);
      g.fillRect(12, 0, 16, 240);
      g.generateTexture('vfx_supernova_beam', 40, 240);
      g.destroy();
    }

    // Greek Fire Hazard Pool 120px Radius (240x240)
    if (!scene.textures.exists('vfx_greek_fire_pool')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x15803d, 0.45);
      g.fillCircle(120, 120, 116);
      g.fillStyle(0x22c55e, 0.55);
      g.fillCircle(120, 120, 80);
      g.fillStyle(0xea580c, 0.5);
      g.fillCircle(120, 120, 45);
      g.lineStyle(3, 0x86efac, 0.8);
      g.strokeCircle(120, 120, 116);
      g.generateTexture('vfx_greek_fire_pool', 240, 240);
      g.destroy();
    }

    // Paladin Devotion Aura 120px Radius (240x240)
    if (!scene.textures.exists('vfx_paladin_aura')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x38bdf8, 0.08);
      g.fillCircle(120, 120, 116);
      g.lineStyle(2, 0x38bdf8, 0.6);
      g.strokeCircle(120, 120, 116);
      g.lineStyle(1, 0xffd700, 0.5);
      g.strokeCircle(120, 120, 100);
      g.generateTexture('vfx_paladin_aura', 240, 240);
      g.destroy();
    }

    // Stun Stars (24x24)
    if (!scene.textures.exists('vfx_stun_stars')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xffd700, 1);
      g.fillCircle(6, 6, 3);
      g.fillCircle(18, 6, 3);
      g.fillCircle(12, 16, 3.5);
      g.lineStyle(1, 0xffffff, 0.9);
      g.lineBetween(6, 6, 18, 6);
      g.lineBetween(18, 6, 12, 16);
      g.lineBetween(12, 16, 6, 6);
      g.generateTexture('vfx_stun_stars', 24, 24);
      g.destroy();
    }

    // Solar Flame debuff icon (20x20)
    if (!scene.textures.exists('vfx_solar_flame')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xf97316, 0.9);
      g.fillTriangle(10, 1, 4, 18, 16, 18);
      g.fillStyle(0xfde047, 1);
      g.fillTriangle(10, 6, 6, 17, 14, 17);
      g.generateTexture('vfx_solar_flame', 20, 20);
      g.destroy();
    }
  }
}
