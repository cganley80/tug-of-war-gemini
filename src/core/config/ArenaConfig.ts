import { ArmorType, DamageType } from '../types';

export const TICK_RATE = 20;
export const TICK_DURATION_SEC = 0.05; // 50ms per tick

export const ARENA_MIN_X = 0;
export const ARENA_MAX_X = 2000;
export const NEUTRAL_CENTER_X = 1000;

export const ARENA_MIN_Y = 100;
export const ARENA_MAX_Y = 500;
export const ARENA_HEIGHT = ARENA_MAX_Y - ARENA_MIN_Y; // 400px

export const SPAWN_MIN_Y = 150;
export const SPAWN_MAX_Y = 450;

export const CITADEL_MAX_HP = 2500;
export const CITADEL_FLAT_REDUCTION = 5;
export const CITADEL_ARMOR_TYPE: ArmorType = 'FORTIFIED';

export const PLAYER_CITADEL_X = 0;
export const ENEMY_CITADEL_X = 2000;

// Battlefield Territorial Zones
export const ALLIED_ZONE_MAX_X = 800;
export const CONTESTED_ZONE_MIN_X = 800;
export const CONTESTED_ZONE_MAX_X = 1200;
export const ENEMY_ZONE_MIN_X = 1200;

// Construction Grid Zones (4x3 = 12 slots each)
export const SLOTS_PER_TEAM = 12;
export const GRID_COLUMNS = 4;
export const GRID_ROWS = 3;

export const PLAYER_BUILD_ZONE_MIN_X = -350;
export const PLAYER_BUILD_ZONE_MAX_X = -50;
export const ENEMY_BUILD_ZONE_MIN_X = 2050;
export const ENEMY_BUILD_ZONE_MAX_X = 2350;

// Frontline Push Mechanics
export const VANGUARD_THRESHOLD_TICKS = 100; // 5.0 seconds @ 20 TPS
export const VANGUARD_MORALE_SPEED_MULTIPLIER = 1.15; // +15% move speed
export const VANGUARD_GOLD_INTERVAL_TICKS = 100; // +1 gold every 5.0 seconds
export const VANGUARD_BONUS_GOLD = 1;

export const DESPERATION_THRESHOLD_TICKS = 100; // 5.0 seconds @ 20 TPS
export const DESPERATION_BALISTA_INTERVAL_TICKS = 40; // 2.0 seconds @ 20 TPS
export const DESPERATION_BALISTA_DAMAGE = 60;
export const DESPERATION_BALISTA_DAMAGE_TYPE: DamageType = 'PIERCING';

// Movement & Separation
export const SOFT_COLLISION_RADIUS = 16;
export const SOFT_COLLISION_FORCE = 0.5;

// Unit Passive thresholds
export const LONGBOWMAN_STATIONARY_TICKS = 60; // 3.0 seconds @ 20 TPS for Rapid Volley
export const LONGBOWMAN_ATTACK_SPEED_MULTIPLIER = 1.15; // +15% attack speed (effective cooldown / 1.15)
