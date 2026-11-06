/**
 * Tug of War: Citadels of Aethelgard
 * Core Simulation Engine Types & Domain Interfaces
 * Strictly Headless - Zero dependencies on DOM, Phaser, or browser globals.
 */

export type TeamId = 'PLAYER' | 'ENEMY';

export type ArmorType = 'LIGHT' | 'HEAVY' | 'ARCANE' | 'FORTIFIED';

export type DamageType = 'NORMAL' | 'PIERCING' | 'MAGIC' | 'SIEGE';

export type StructureCategory = 'BARRACKS' | 'ARCHERY' | 'ARCANE' | 'STABLE' | 'SIEGE';

export type UnitTypeId =
  | 'unit_squire'
  | 'unit_royal_knight'
  | 'unit_longbowman'
  | 'unit_siege_crossbowman'
  | 'unit_solar_apprentice'
  | 'unit_solar_archmage'
  | 'unit_mounted_spearman'
  | 'unit_dawn_paladin'
  | 'unit_mobile_ballista'
  | 'unit_greek_fire_catapult';

export type StructureTypeId =
  | 'bldg_barracks_1'
  | 'bldg_barracks_2'
  | 'bldg_archery_1'
  | 'bldg_archery_2'
  | 'bldg_arcane_1'
  | 'bldg_arcane_2'
  | 'bldg_stable_1'
  | 'bldg_stable_2'
  | 'bldg_siege_1'
  | 'bldg_siege_2';

export interface UnitDefinition {
  readonly id: UnitTypeId;
  readonly name: string;
  readonly tier: 1 | 2;
  readonly structureId: StructureTypeId;
  readonly maxHp: number;
  readonly armorType: ArmorType;
  readonly flatReduction: number;
  readonly baseDamage: number;
  readonly attackIntervalSec: number;
  readonly attackRangePx: number;
  readonly moveSpeedPxPerSec: number;
  readonly damageType: DamageType;
  readonly bountyGold: number;
  readonly minAttackRangePx?: number;
  readonly aoeRadiusPx?: number;
  readonly isMelee: boolean;
}

export interface StructureDefinition {
  readonly id: StructureTypeId;
  readonly name: string;
  readonly tier: 1 | 2;
  readonly category: StructureCategory;
  readonly buildCostGold: number;
  readonly upgradeCostGold: number;
  readonly upgradesTo?: StructureTypeId;
  readonly spawnCooldownSec: number;
  readonly spawnsUnitId: UnitTypeId;
}

export interface MineLevelDefinition {
  readonly level: number;
  readonly name: string;
  readonly costGold: number;
  readonly incomePerCycle: number;
}

export interface UnitState {
  readonly id: string;
  readonly typeId: UnitTypeId;
  readonly team: TeamId;
  x: number;
  y: number;
  currentHp: number;
  maxHp: number;
  targetUnitId: string | null;
  isTargetingCitadel: boolean;
  attackCooldownTicks: number;
  ticksStationary: number;
  isEngaged: boolean;
  hasRadiantMorale: boolean;
  attackCount: number;
  hasCharged: boolean;
  stunTicksRemaining: number;
}

export interface StructureSlotState {
  readonly slotIndex: number;
  structureId: StructureTypeId | null;
  readonly team: TeamId;
  currentSpawnCooldownTicks: number;
  totalSpawnCooldownTicks: number;
  totalInvestedGold: number;
}

export interface CitadelState {
  readonly team: TeamId;
  readonly x: number;
  currentHp: number;
  readonly maxHp: number;
  readonly armorType: ArmorType;
  readonly flatReduction: number;
  ballistaCooldownTicks: number;
}

export interface TeamEconomyState {
  readonly team: TeamId;
  gold: number;
  mineLevel: number;
  incomeCycleTicksRemaining: number;
  vanguardRewardTicksRemaining: number;
}

export interface FrontlineState {
  frontlineX: number;
  playerVanguardTicks: number;
  playerDesperationTicks: number;
  enemyVanguardTicks: number;
  enemyDesperationTicks: number;
  isPlayerVanguardActive: boolean;
  isPlayerDesperationActive: boolean;
  isEnemyVanguardActive: boolean;
  isEnemyDesperationActive: boolean;
}

export interface GameStateSnapshot {
  readonly tick: number;
  readonly timeSeconds: number;
  readonly isGameOver: boolean;
  readonly winnerTeam: TeamId | null;
  readonly frontline: FrontlineState;
  readonly citadels: Record<TeamId, CitadelState>;
  readonly economy: Record<TeamId, TeamEconomyState>;
  readonly slots: StructureSlotState[];
  readonly units: UnitState[];
  readonly stateHash: string;
}
