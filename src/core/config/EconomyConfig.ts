import { MineLevelDefinition } from '../types';

export const INITIAL_GOLD = 120;
export const INCOME_INTERVAL_SEC = 5.0;
export const INCOME_INTERVAL_TICKS = 100; // 5.0s @ 20 TPS
export const SELL_REFUND_RATE = 0.6; // 60% refund on structure total investment

export const MINE_MAX_LEVEL = 4;

export const MINE_LEVEL_DEFINITIONS: Record<number, MineLevelDefinition> = {
  0: {
    level: 0,
    name: 'Tesouraria Base',
    costGold: 0,
    incomePerCycle: 12,
  },
  1: {
    level: 1,
    name: 'Mina de Cobre',
    costGold: 60,
    incomePerCycle: 18,
  },
  2: {
    level: 2,
    name: 'Mina de Prata',
    costGold: 110,
    incomePerCycle: 26,
  },
  3: {
    level: 3,
    name: 'Mina de Ouro',
    costGold: 180,
    incomePerCycle: 36,
  },
  4: {
    level: 4,
    name: 'Tesouro Régio',
    costGold: 270,
    incomePerCycle: 48,
  },
};

export function getMineLevelDefinition(level: number): MineLevelDefinition {
  const def = MINE_LEVEL_DEFINITIONS[level];
  if (!def) {
    throw new Error(`Invalid mine level: ${level}`);
  }
  return def;
}
