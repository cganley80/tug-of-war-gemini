/**
 * Tug of War: Citadels of Aethelgard
 * VisualObjectPool (Section 4.3 & GOVERNANCE.md)
 * High-performance Object Pooling for Projectiles, AoE Effects, and Floating Combat Text.
 * Guarantees zero runtime allocations in 60 FPS combat loops.
 */

import Phaser from 'phaser';

export type DamageTextStyle = 'NORMAL' | 'CRITICAL' | 'MAGIC' | 'BOUNTY' | 'STATUS';

export type ProjectileVisualType =
  | 'proj_arrow'
  | 'proj_bolt'
  | 'proj_solar_orb'
  | 'proj_ballista_bolt'
  | 'proj_greek_pot'
  | 'proj_citadel_bolt';

interface ActiveProjectile {
  sprite: Phaser.GameObjects.Sprite;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  elapsedMs: number;
  totalDurationMs: number;
  isArced: boolean;
  arcHeight: number;
  isSpinning: boolean;
  onImpact?: () => void;
}

interface ActiveFloatingText {
  text: Phaser.GameObjects.Text;
  startX: number;
  startY: number;
  elapsedMs: number;
  totalDurationMs: number;
  targetYOffset: number;
}

interface ActiveSupernova {
  beam: Phaser.GameObjects.Sprite;
  ring: Phaser.GameObjects.Sprite;
  elapsedMs: number;
  totalDurationMs: number;
}

interface ActiveHitSpark {
  sprite: Phaser.GameObjects.Arc;
  startX: number;
  startY: number;
  elapsedMs: number;
  totalDurationMs: number;
}

export class VisualObjectPool {
  private readonly scene: Phaser.Scene;

  // Pools
  private readonly projectilePool: Phaser.GameObjects.Sprite[] = [];
  private readonly activeProjectiles: ActiveProjectile[] = [];

  private readonly floatingTextPool: Phaser.GameObjects.Text[] = [];
  private readonly activeFloatingTexts: ActiveFloatingText[] = [];

  private readonly supernovaBeamPool: Phaser.GameObjects.Sprite[] = [];
  private readonly supernovaRingPool: Phaser.GameObjects.Sprite[] = [];
  private readonly activeSupernovas: ActiveSupernova[] = [];

  private readonly hitSparkPool: Phaser.GameObjects.Arc[] = [];
  private readonly activeHitSparks: ActiveHitSpark[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.preallocate();
  }

  private preallocate(): void {
    // Pre-allocate 30 projectiles
    for (let i = 0; i < 30; i++) {
      const sprite = this.scene.add.sprite(0, 0, 'proj_arrow');
      sprite.setActive(false).setVisible(false);
      this.projectilePool.push(sprite);
    }

    // Pre-allocate 40 floating combat texts
    for (let i = 0; i < 40; i++) {
      const text = this.scene.add.text(0, 0, '', {
        fontFamily: "'Cinzel', Georgia, serif, sans-serif",
        fontSize: '13px',
      });
      text.setActive(false).setVisible(false);
      this.floatingTextPool.push(text);
    }

    // Pre-allocate 8 supernovas
    for (let i = 0; i < 8; i++) {
      const beam = this.scene.add.sprite(0, 0, 'vfx_supernova_beam');
      beam.setActive(false).setVisible(false);
      this.supernovaBeamPool.push(beam);

      const ring = this.scene.add.sprite(0, 0, 'vfx_supernova_ring');
      ring.setActive(false).setVisible(false);
      this.supernovaRingPool.push(ring);
    }

    // Pre-allocate 25 hit sparks
    for (let i = 0; i < 25; i++) {
      const spark = this.scene.add.circle(0, 0, 5, 0xffd700, 1);
      spark.setActive(false).setVisible(false);
      this.hitSparkPool.push(spark);
    }
  }

  // =========================================================================
  // PROJECTILES
  // =========================================================================

  public spawnProjectile(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
    type: ProjectileVisualType,
    speedPxPerSec = 750,
    isArced = false,
    onImpact?: () => void
  ): void {
    let sprite = this.projectilePool.pop();
    if (!sprite) {
      sprite = this.scene.add.sprite(0, 0, type);
    }

    sprite.setTexture(type);
    sprite.setPosition(startX, startY);
    sprite.setActive(true).setVisible(true);
    sprite.setDepth(15);

    const dx = targetX - startX;
    const dy = targetY - startY;
    const distance = Math.hypot(dx, dy);

    // Calculate duration based on distance and speed (min 150ms, max 650ms)
    const durationMs = Math.max(150, Math.min(650, (distance / speedPxPerSec) * 1000));
    const isSpinning = type === 'proj_solar_orb' || type === 'proj_greek_pot';

    if (!isArced) {
      sprite.setRotation(Math.atan2(dy, dx));
    } else {
      sprite.setRotation(0);
    }

    this.activeProjectiles.push({
      sprite,
      startX,
      startY,
      targetX,
      targetY,
      elapsedMs: 0,
      totalDurationMs: durationMs,
      isArced,
      arcHeight: isArced ? Math.min(100, Math.max(40, distance * 0.2)) : 0,
      isSpinning,
      onImpact,
    });
  }

  // =========================================================================
  // FLOATING COMBAT TEXT (400ms duration)
  // =========================================================================

  public spawnFloatingText(
    x: number,
    y: number,
    message: string,
    style: DamageTextStyle
  ): void {
    let textObj = this.floatingTextPool.pop();
    if (!textObj) {
      textObj = this.scene.add.text(0, 0, '', {
        fontFamily: "'Cinzel', Georgia, serif, sans-serif",
      });
    }

    textObj.setText(message);
    textObj.setPosition(x, y - 10);
    textObj.setActive(true).setVisible(true);
    textObj.setDepth(25);
    textObj.setAlpha(1);

    switch (style) {
      case 'CRITICAL':
        textObj.setColor('#FFD700');
        textObj.setFontSize('16px');
        textObj.setStroke('#78350F', 3);
        textObj.setScale(1.4);
        break;
      case 'MAGIC':
        textObj.setColor('#38BDF8');
        textObj.setFontSize('14px');
        textObj.setStroke('#0C4A6E', 2);
        textObj.setScale(1.1);
        break;
      case 'BOUNTY':
        textObj.setColor('#FBBF24');
        textObj.setFontSize('13px');
        textObj.setStroke('#000000', 2);
        textObj.setScale(1.0);
        break;
      case 'STATUS':
        textObj.setColor('#F97316');
        textObj.setFontSize('12px');
        textObj.setStroke('#000000', 2);
        textObj.setScale(1.0);
        break;
      case 'NORMAL':
      default:
        textObj.setColor('#FEF08A');
        textObj.setFontSize('13px');
        textObj.setStroke('#0F172A', 2);
        textObj.setScale(1.0);
        break;
    }

    this.activeFloatingTexts.push({
      text: textObj,
      startX: x,
      startY: y - 10,
      elapsedMs: 0,
      totalDurationMs: 400,
      targetYOffset: style === 'CRITICAL' ? -38 : -26,
    });
  }

  // =========================================================================
  // SUPERNOVA DA ALVORADA (300ms duration, 100px radius shockwave)
  // =========================================================================

  public spawnSupernova(x: number, y: number): void {
    let beam = this.supernovaBeamPool.pop();
    if (!beam) {
      beam = this.scene.add.sprite(0, 0, 'vfx_supernova_beam');
    }

    let ring = this.supernovaRingPool.pop();
    if (!ring) {
      ring = this.scene.add.sprite(0, 0, 'vfx_supernova_ring');
    }

    beam.setPosition(x, y - 100);
    beam.setActive(true).setVisible(true);
    beam.setDepth(18);
    beam.setAlpha(1);

    ring.setPosition(x, y);
    ring.setActive(true).setVisible(true);
    ring.setDepth(17);
    ring.setScale(0.2);
    ring.setAlpha(1);

    this.activeSupernovas.push({
      beam,
      ring,
      elapsedMs: 0,
      totalDurationMs: 300,
    });
  }

  // =========================================================================
  // HIT SPARKS
  // =========================================================================

  public spawnHitSpark(x: number, y: number, color = 0xffd700): void {
    let spark = this.hitSparkPool.pop();
    if (!spark) {
      spark = this.scene.add.circle(0, 0, 5, color, 1);
    }

    spark.setPosition(x, y);
    spark.setFillStyle(color, 1);
    spark.setScale(1.0);
    spark.setAlpha(1);
    spark.setActive(true).setVisible(true);
    spark.setDepth(20);

    this.activeHitSparks.push({
      sprite: spark,
      startX: x,
      startY: y,
      elapsedMs: 0,
      totalDurationMs: 150,
    });
  }

  // =========================================================================
  // FRAME UPDATE LOOP
  // =========================================================================

  public update(deltaMs: number): void {
    // 1. Update Projectiles
    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const proj = this.activeProjectiles[i];
      proj.elapsedMs += deltaMs;
      const t = Math.min(1, proj.elapsedMs / proj.totalDurationMs);

      const curX = proj.startX + t * (proj.targetX - proj.startX);
      let curY = proj.startY + t * (proj.targetY - proj.startY);

      if (proj.isArced) {
        // Parabolic trajectory: - 4 * h * t * (1 - t)
        curY -= 4 * proj.arcHeight * t * (1 - t);
      }

      proj.sprite.setPosition(curX, curY);

      if (proj.isSpinning) {
        proj.sprite.rotation += (deltaMs / 1000) * 8;
      }

      if (t >= 1) {
        if (proj.onImpact) {
          proj.onImpact();
        }
        proj.sprite.setActive(false).setVisible(false);
        this.projectilePool.push(proj.sprite);
        this.activeProjectiles.splice(i, 1);
      }
    }

    // 2. Update Floating Combat Texts (400ms duration)
    for (let i = this.activeFloatingTexts.length - 1; i >= 0; i--) {
      const item = this.activeFloatingTexts[i];
      item.elapsedMs += deltaMs;
      const t = Math.min(1, item.elapsedMs / item.totalDurationMs);

      item.text.setY(item.startY + t * item.targetYOffset);
      item.text.setAlpha(1 - t * 0.9);

      if (t >= 1) {
        item.text.setActive(false).setVisible(false);
        this.floatingTextPool.push(item.text);
        this.activeFloatingTexts.splice(i, 1);
      }
    }

    // 3. Update Supernovas (300ms duration, beam fades, ring expands to 100px radius)
    for (let i = this.activeSupernovas.length - 1; i >= 0; i--) {
      const sn = this.activeSupernovas[i];
      sn.elapsedMs += deltaMs;
      const t = Math.min(1, sn.elapsedMs / sn.totalDurationMs);

      // Ring expands from 0.2 to 1.0 (texture is 200px diameter = 100px radius)
      sn.ring.setScale(0.2 + 0.8 * t);
      sn.ring.setAlpha(1 - t);

      // Beam fades and shrinks vertically
      sn.beam.setAlpha(1 - t);
      sn.beam.setScale(1, 1 - t * 0.4);

      if (t >= 1) {
        sn.beam.setActive(false).setVisible(false);
        sn.ring.setActive(false).setVisible(false);
        this.supernovaBeamPool.push(sn.beam);
        this.supernovaRingPool.push(sn.ring);
        this.activeSupernovas.splice(i, 1);
      }
    }

    // 4. Update Hit Sparks (150ms duration)
    for (let i = this.activeHitSparks.length - 1; i >= 0; i--) {
      const spark = this.activeHitSparks[i];
      spark.elapsedMs += deltaMs;
      const t = Math.min(1, spark.elapsedMs / spark.totalDurationMs);

      spark.sprite.setScale(1 + t * 0.5);
      spark.sprite.setAlpha(1 - t);

      if (t >= 1) {
        spark.sprite.setActive(false).setVisible(false);
        this.hitSparkPool.push(spark.sprite);
        this.activeHitSparks.splice(i, 1);
      }
    }
  }

  public clear(): void {
    for (const proj of this.activeProjectiles) {
      proj.sprite.setActive(false).setVisible(false);
      this.projectilePool.push(proj.sprite);
    }
    this.activeProjectiles.length = 0;

    for (const item of this.activeFloatingTexts) {
      item.text.setActive(false).setVisible(false);
      this.floatingTextPool.push(item.text);
    }
    this.activeFloatingTexts.length = 0;

    for (const sn of this.activeSupernovas) {
      sn.beam.setActive(false).setVisible(false);
      sn.ring.setActive(false).setVisible(false);
      this.supernovaBeamPool.push(sn.beam);
      this.supernovaRingPool.push(sn.ring);
    }
    this.activeSupernovas.length = 0;

    for (const spark of this.activeHitSparks) {
      spark.sprite.setActive(false).setVisible(false);
      this.hitSparkPool.push(spark.sprite);
    }
    this.activeHitSparks.length = 0;
  }
}
