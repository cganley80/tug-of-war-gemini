import { TeamId, UnitTypeId, StructureTypeId } from '../types';

export interface UnitSpawnedEvent {
  readonly type: UnitTypeId;
  readonly unitId: string;
  readonly team: TeamId;
  readonly x: number;
  readonly y: number;
  readonly tick: number;
}

export interface UnitAttackedEvent {
  readonly attackerId: string;
  readonly targetId: string;
  readonly damage: number;
  readonly isCritical: boolean;
  readonly tick: number;
}

export interface UnitDiedEvent {
  readonly unitId: string;
  readonly killerId: string;
  readonly bountyAwarded: number;
  readonly x: number;
  readonly y: number;
  readonly tick: number;
}

export interface StructureBuiltEvent {
  readonly structureId: string;
  readonly slotIndex: number;
  readonly type: StructureTypeId;
  readonly team: TeamId;
  readonly tick: number;
}

export interface StructureUpgradedEvent {
  readonly structureId: string;
  readonly newType: StructureTypeId;
  readonly team: TeamId;
  readonly tick: number;
}

export interface NexusDamagedEvent {
  readonly team: TeamId;
  readonly currentHp: number;
  readonly maxHp: number;
  readonly damage: number;
  readonly tick: number;
}

export interface BattleEndedEvent {
  readonly winnerTeam: TeamId;
  readonly durationInTicks: number;
}

export interface DomainEventsMap {
  UnitSpawned: UnitSpawnedEvent;
  UnitAttacked: UnitAttackedEvent;
  UnitDied: UnitDiedEvent;
  StructureBuilt: StructureBuiltEvent;
  StructureUpgraded: StructureUpgradedEvent;
  NexusDamaged: NexusDamagedEvent;
  BattleEnded: BattleEndedEvent;
}

export type DomainEventName = keyof DomainEventsMap;
export type DomainEventHandler<K extends DomainEventName> = (payload: DomainEventsMap[K]) => void;

export interface EventRecord<K extends DomainEventName = DomainEventName> {
  readonly name: K;
  readonly payload: DomainEventsMap[K];
}

/**
 * Type-safe, headless Domain Event Bus.
 * Connects the headless simulation to renderers, audio systems, and analytics
 * without leaking any view-layer dependencies into the simulation core.
 */
export class DomainEventBus {
  private readonly handlers = new Map<DomainEventName, Set<(payload: never) => void>>();

  private readonly history: EventRecord[] = [];
  private historyEnabled = false;

  public setHistoryTracking(enabled: boolean): void {
    this.historyEnabled = enabled;
  }

  public on<K extends DomainEventName>(eventName: K, handler: DomainEventHandler<K>): void {
    let handlerSet = this.handlers.get(eventName);
    if (!handlerSet) {
      handlerSet = new Set();
      this.handlers.set(eventName, handlerSet);
    }
    handlerSet.add(handler as (payload: never) => void);
  }

  public off<K extends DomainEventName>(eventName: K, handler: DomainEventHandler<K>): void {
    const handlerSet = this.handlers.get(eventName);
    if (handlerSet) {
      handlerSet.delete(handler as (payload: never) => void);
    }
  }

  public emit<K extends DomainEventName>(eventName: K, payload: DomainEventsMap[K]): void {
    if (this.historyEnabled) {
      this.history.push({ name: eventName, payload });
    }

    const handlerSet = this.handlers.get(eventName);
    if (handlerSet) {
      for (const handler of handlerSet) {
        (handler as DomainEventHandler<K>)(payload);
      }
    }
  }

  public getHistory(): readonly EventRecord[] {
    return this.history;
  }

  public clearHistory(): void {
    this.history.length = 0;
  }

  public clear(): void {
    this.handlers.clear();
    this.clearHistory();
  }
}
