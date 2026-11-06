export type RelicRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC';

export type RelicTypeId =
  | 'relic_solar_martyrdom'
  | 'relic_febrile_production'
  | 'relic_flaming_dawn_bolts'
  | 'relic_blood_and_soil_banner'
  | 'relic_blessed_heavy_plating'
  | 'relic_triumphant_dawn_charge'
  | 'relic_royal_war_tithe'
  | 'relic_citadel_mana_heart';

export interface RelicDefinition {
  readonly id: RelicTypeId;
  readonly name: string;
  readonly rarity: RelicRarity;
  readonly merchantCostGold: number;
  readonly description: string;
}

export const RELICS_CATALOG: Record<RelicTypeId, RelicDefinition> = {
  relic_solar_martyrdom: {
    id: 'relic_solar_martyrdom',
    name: 'Decreto do Martírio Solar',
    rarity: 'RARE',
    merchantCostGold: 130,
    description:
      'Quando uma unidade melee aliada morre, emite uma explosão radial de 80px causando 60 de Dano Mágico base em todos os inimigos.',
  },
  relic_febrile_production: {
    id: 'relic_febrile_production',
    name: 'Doutrina da Produção Febril',
    rarity: 'UNCOMMON',
    merchantCostGold: 90,
    description:
      'Reduz o cooldown de spawn de estruturas aliadas em -15%, mas reduz o HP máximo das unidades geradas em -10%.',
  },
  relic_flaming_dawn_bolts: {
    id: 'relic_flaming_dawn_bolts',
    name: 'Virotes da Alvorada Flamejante',
    rarity: 'RARE',
    merchantCostGold: 130,
    description:
      'A cada 5º ataque de atiradores aliados, causa uma explosão ígnea de 70px no alvo infligindo 160 de Dano Mágico base.',
  },
  relic_blood_and_soil_banner: {
    id: 'relic_blood_and_soil_banner',
    name: 'Estandarte de Sangue e Solo',
    rarity: 'COMMON',
    merchantCostGold: 60,
    description:
      'Enquanto a frente de combate avançar em território inimigo (X > 1200), tropas aliadas causam +20% de dano global.',
  },
  relic_blessed_heavy_plating: {
    id: 'relic_blessed_heavy_plating',
    name: 'Blindagem Benta dos Justos',
    rarity: 'UNCOMMON',
    merchantCostGold: 90,
    description:
      'Unidades aliadas de Armadura Pesada recebem +2 de redução plana adicional contra dano Normal e Perfurante.',
  },
  relic_triumphant_dawn_charge: {
    id: 'relic_triumphant_dawn_charge',
    name: 'Carga da Alvorada Triunfante',
    rarity: 'EPIC',
    merchantCostGold: 170,
    description:
      'Primeiro impacto de carga de cavalaria aliada ganha +1.50x ao multiplicador de dano e atordoa o alvo por 1.5s.',
  },
  relic_royal_war_tithe: {
    id: 'relic_royal_war_tithe',
    name: 'Dízimo de Guerra Régio',
    rarity: 'COMMON',
    merchantCostGold: 60,
    description:
      'Abates de tropas inimigas desferidos com Dano Mágico ou de Cerco concedem +100% de ouro de recompensa.',
  },
  relic_citadel_mana_heart: {
    id: 'relic_citadel_mana_heart',
    name: 'Coração de Mana da Cidadela',
    rarity: 'EPIC',
    merchantCostGold: 170,
    description:
      'A cada 30 segundos: cura +120 HP de todas as tropas aliadas e desfecha 80 de Dano Mágico em todas as tropas inimigas em campo.',
  },
};

export function getRelicDefinition(id: RelicTypeId): RelicDefinition {
  const relic = RELICS_CATALOG[id];
  if (!relic) {
    throw new Error(`[RelicsCatalog] Undefined relic type id: ${id}`);
  }
  return relic;
}
