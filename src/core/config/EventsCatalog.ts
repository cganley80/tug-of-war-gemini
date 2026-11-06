import { CampaignEventDefinition } from '../types';

export const EVENTS_CATALOG: Record<string, CampaignEventDefinition> = {
  event_supply_convoy: {
    id: 'event_supply_convoy',
    title: 'O Comboio de Suprimentos Reais',
    narrative:
      'Nas colinas de Aethelgard, vossos batedores interceptam uma caravana de intendência abandonada, cercada por mercenários famintos.',
    choiceA: {
      text: 'Pagar escolta armada e resgatar o tesouro',
      description:
        'Custo: 30g de Campanha. Ganho: 1 Relíquia Incomum ou Rara aleatória garantida.',
      goldCost: 30,
    },
    choiceB: {
      text: 'Saquear suprimentos de emergência',
      description:
        'Custo: -300 HP da Cidadela. Ganho: +80g de Ouro de Campanha imediatos.',
      citadelHpCost: 300,
    },
  },
  event_profaned_sanctuary: {
    id: 'event_profaned_sanctuary',
    title: 'O Santuário Solar Profanado',
    narrative:
      'Um antigo templo dos Teurgistas Solares arde em chamas corruptas. Os monges suplicam por vosso sangue nobre para purificar o fogo.',
    choiceA: {
      text: 'Sacrificar a fortaleza em devoção mística',
      description:
        'Custo: -400 HP da Cidadela. Ganho: Adquire o Decreto do Martírio Solar (relic_solar_martyrdom).',
      citadelHpCost: 400,
    },
    choiceB: {
      text: 'Financiar a bênção das forjas',
      description:
        'Custo: 50g de Campanha. Ganho: Adquire a Blindagem Benta dos Justos (relic_blessed_heavy_plating).',
      goldCost: 50,
    },
  },
  event_iron_guard_deserter: {
    id: 'event_iron_guard_deserter',
    title: 'O Desertor da Guarda de Ferro',
    narrative:
      'Um veterano renegado do Tirano de Ferro oferece plantas secretas das fortificações inimigas em troca de perdão real.',
    choiceA: {
      text: 'Contratar as plantas de cerco',
      description:
        'Custo: 40g de Campanha. Ganho: +100g de Ouro Tático Inicial na próxima batalha.',
      goldCost: 40,
    },
    choiceB: {
      text: 'Enforcar o traidor para restaurar a disciplina',
      description:
        'Sem custo de ouro. Ganho: Disciplina de ferro restaura +300 HP da Cidadela Aliada.',
    },
  },
};

export function getEventDefinition(id: string): CampaignEventDefinition {
  const event = EVENTS_CATALOG[id];
  if (!event) {
    throw new Error(`[EventsCatalog] Undefined event id: ${id}`);
  }
  return event;
}
