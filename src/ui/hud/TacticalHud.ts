/**
 * Tug of War: Citadels of Aethelgard
 * TacticalHud: Complete Tactical HUD & Interactive Control System (Section 4.5 & GOVERNANCE.md)
 * Manages Tug-of-War Gauge, Royal Mine Treasury, 4x3 Allied Grid, AI Selector, and Speed Controls.
 */

import { GameStateSnapshot, StructureTypeId, AIProfileId } from '../../core/types';
import { STRUCTURES_CATALOG } from '../../core/config/StructuresCatalog';
import { MINE_LEVEL_DEFINITIONS, MINE_MAX_LEVEL } from '../../core/config/EconomyConfig';
import { CITADEL_MAX_HP } from '../../core/config/ArenaConfig';
import { SoundSynthesizer } from '../../renderer/audio/SoundSynthesizer';

export interface TacticalHudCallbacks {
  onBuild: (slotIndex: number, structureId: StructureTypeId) => void;
  onUpgrade: (slotIndex: number) => void;
  onSell: (slotIndex: number) => void;
  onUpgradeMine: () => void;
  onChangeSpeed: (speed: number) => void;
  onTogglePause: () => void;
  onRestartGame: (profile: AIProfileId) => void;
  onToggleMute: () => void;
  onToggleCamera: () => void;
}

export class TacticalHud {
  private readonly container: HTMLElement;
  private readonly callbacks: TacticalHudCallbacks;

  // Track which slot currently has the build menu open (-1 for none)
  private openBuildMenuSlotIndex = -1;

  // DOM Elements cache
  private elPlayerHp!: HTMLElement;
  private elPlayerHpBar!: HTMLElement;
  private elEnemyHp!: HTMLElement;
  private elEnemyHpBar!: HTMLElement;
  private elFrontlineX!: HTMLElement;
  private elFrontlineStatus!: HTMLElement;
  private elGaugeBar!: HTMLElement;
  private elGaugeContainer!: HTMLElement;

  private elGold!: HTMLElement;
  private elMineName!: HTMLElement;
  private elMineIncome!: HTMLElement;
  private elIncomeBar!: HTMLElement;
  private elBtnUpgradeMine!: HTMLButtonElement;

  private elBtnSpeed1x!: HTMLButtonElement;
  private elBtnSpeed2x!: HTMLButtonElement;
  private elBtnSpeed4x!: HTMLButtonElement;
  private elBtnPause!: HTMLButtonElement;
  private elBtnMute!: HTMLButtonElement;
  private elBtnCamera!: HTMLButtonElement;
  private elSelectAi!: HTMLSelectElement;

  private elSlotsGrid!: HTMLElement;
  private elGameOverModal!: HTMLElement;
  private elGameOverTitle!: HTMLElement;
  private elGameOverDesc!: HTMLElement;

  constructor(container: HTMLElement, callbacks: TacticalHudCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.renderInitialMarkup();
    this.cacheDomElements();
    this.bindEvents();
  }

  // =========================================================================
  // INITIAL HTML SKELETON
  // =========================================================================

  private renderInitialMarkup(): void {
    this.container.innerHTML = `
      <!-- 1. HEADER: Title, AI Opponent Selector & Quick Simulation Controls -->
      <header style="display:flex; justify-content:space-between; align-items:center; background:#0b0f19; border:1px solid #1e293b; border-radius:8px; padding:10px 16px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:12px; height:12px; border-radius:50%; background:#f59e0b; box-shadow:0 0 10px #f59e0b;"></div>
          <div>
            <h1 style="margin:0; font-size:18px; color:#f8fafc; letter-spacing:1px; text-transform:uppercase;">Tug of War: Citadels of Aethelgard</h1>
            <span style="font-size:11px; color:#94a3b8;">Reino da Coroa Solar vs. Invasores — 60 FPS Interpolado</span>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:10px;">
          <!-- AI Commander Selector -->
          <label style="font-size:12px; color:#cbd5e1; display:flex; align-items:center; gap:6px;">
            <span>Comandante IA:</span>
            <select id="hud-select-ai" style="background:#1e293b; color:#f8fafc; border:1px solid #475569; padding:5px 8px; border-radius:4px; font-size:12px; cursor:pointer;">
              <option value="AGGRESSIVE">Comandante Valerius (Rush)</option>
              <option value="DEFENSIVE">Grão-Marechal Thorne (Cerco)</option>
              <option value="SWARM">Rainha Seline (Enxame)</option>
              <option value="BOSS_ACT1">O Tirano de Ferro (Chefe Ato 1)</option>
            </select>
          </label>

          <!-- Speed Controls -->
          <div style="display:flex; gap:4px; background:#1e293b; padding:2px; border-radius:4px;">
            <button id="hud-btn-speed-1x" style="background:#3b82f6; color:#fff; border:none; padding:4px 9px; border-radius:3px; font-size:11px; font-weight:bold; cursor:pointer;">1x</button>
            <button id="hud-btn-speed-2x" style="background:transparent; color:#94a3b8; border:none; padding:4px 9px; border-radius:3px; font-size:11px; font-weight:bold; cursor:pointer;">2x</button>
            <button id="hud-btn-speed-4x" style="background:transparent; color:#94a3b8; border:none; padding:4px 9px; border-radius:3px; font-size:11px; font-weight:bold; cursor:pointer;">4x</button>
          </div>

          <!-- Pause -->
          <button id="hud-btn-pause" style="background:#334155; color:#f8fafc; border:1px solid #475569; padding:5px 10px; border-radius:4px; font-size:12px; cursor:pointer;">⏸️ Pausar</button>

          <!-- Audio -->
          <button id="hud-btn-mute" style="background:#1e293b; color:#f8fafc; border:1px solid #475569; padding:5px 10px; border-radius:4px; font-size:12px; cursor:pointer;">🔊 Áudio Ligado</button>

          <!-- Camera Toggle -->
          <button id="hud-btn-camera" style="background:#1e293b; color:#f8fafc; border:1px solid #475569; padding:5px 10px; border-radius:4px; font-size:12px; cursor:pointer;">🎥 Visão Geral</button>

          <!-- Restart -->
          <button id="hud-btn-restart" style="background:#b91c1c; color:#fff; border:none; padding:5px 12px; border-radius:4px; font-size:12px; font-weight:bold; cursor:pointer;">Reiniciar</button>
        </div>
      </header>

      <!-- 2. TUG-OF-WAR GAUGE: Dynamic Frontline Bar with Radiant Morale & Desperation alerts -->
      <div id="hud-gauge-container" style="background:#0f172a; border:2px solid #334155; border-radius:8px; padding:10px 16px; display:flex; flex-direction:column; gap:8px; transition:border 0.3s ease, box-shadow 0.3s ease;">
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px;">
          <!-- Player Citadel HP -->
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="color:#60a5fa; font-weight:bold;">Nexus Aliado (X=0):</span>
            <span id="hud-player-hp" style="font-weight:900; color:#38bdf8;">2500 / 2500</span>
            <div style="width:90px; height:8px; background:#1e293b; border-radius:4px; overflow:hidden; border:1px solid #334155;">
              <div id="hud-player-hp-bar" style="height:100%; width:100%; background:#22c55e; transition:width 0.2s;"></div>
            </div>
          </div>

          <!-- Frontline Status -->
          <div style="display:flex; flex-direction:column; align-items:center;">
            <div style="font-size:14px; font-weight:bold; color:#fbbf24;">
              Frente de Batalha: X̄ = <span id="hud-frontline-x">1000</span>
            </div>
            <div id="hud-frontline-status" style="font-size:11px; color:#cbd5e1; margin-top:2px;">
              Zona Neutra Contestada
            </div>
          </div>

          <!-- Enemy Citadel HP -->
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:90px; height:8px; background:#1e293b; border-radius:4px; overflow:hidden; border:1px solid #334155;">
              <div id="hud-enemy-hp-bar" style="height:100%; width:100%; background:#ef4444; transition:width 0.2s;"></div>
            </div>
            <span id="hud-enemy-hp" style="font-weight:900; color:#f87171;">2500 / 2500</span>
            <span style="color:#f87171; font-weight:bold;">:Nexus Inimigo (X=2000)</span>
          </div>
        </div>

        <!-- Horizontal Tug of War Progress Bar -->
        <div style="height:14px; background:#1e293b; border-radius:7px; position:relative; overflow:hidden; border:1px solid #475569;">
          <!-- Allied territory indicator (0..800 = 40%) -->
          <div style="position:absolute; top:0; bottom:0; left:0; width:40%; background:rgba(37, 99, 235, 0.15);"></div>
          <!-- Neutral territory indicator (800..1200 = 20%) -->
          <div style="position:absolute; top:0; bottom:0; left:40%; width:20%; background:rgba(245, 158, 11, 0.08);"></div>
          <!-- Enemy territory indicator (1200..2000 = 40%) -->
          <div style="position:absolute; top:0; bottom:0; left:60%; width:40%; background:rgba(220, 38, 38, 0.15);"></div>

          <!-- Boundary Markers -->
          <div style="position:absolute; top:0; bottom:0; left:40%; width:1px; background:#3b82f6;" title="Limite Aliado (X=800)"></div>
          <div style="position:absolute; top:0; bottom:0; left:50%; width:2px; background:#fbbf24;" title="Centro Neutro (X=1000)"></div>
          <div style="position:absolute; top:0; bottom:0; left:60%; width:1px; background:#ef4444;" title="Limite Inimigo (X=1200)"></div>

          <!-- Dynamic Frontline Marker -->
          <div id="hud-gauge-bar" style="position:absolute; top:0; bottom:0; left:50%; width:6px; background:#f59e0b; border-radius:3px; transform:translateX(-50%); box-shadow:0 0 8px #f59e0b; transition:left 0.08s linear;"></div>
        </div>
      </div>

      <!-- 3. PHASER 3 CANVAS CONTAINER -->
      <div id="phaser-container" style="position:relative; width:100%; height:340px; background:#000; border:2px solid #334155; border-radius:8px; overflow:hidden; box-shadow:inset 0 0 20px rgba(0,0,0,0.8);">
        <!-- Phaser renders here -->
      </div>

      <!-- 4. ROYAL MINE ECONOMIC PANEL -->
      <div style="display:flex; justify-content:space-between; align-items:center; background:#0f172a; border:1px solid #1e293b; border-radius:8px; padding:10px 16px;">
        <div style="display:flex; align-items:center; gap:24px;">
          <!-- Gold -->
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="font-size:20px;">🪙</div>
            <div>
              <div style="font-size:11px; color:#94a3b8; text-transform:uppercase;">Tesouro Régio</div>
              <div style="font-size:18px; font-weight:900; color:#fbbf24;"><span id="hud-gold">120</span> Ouro</div>
            </div>
          </div>

          <!-- Mine Level & Income -->
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="font-size:20px;">⛏️</div>
            <div>
              <div style="font-size:11px; color:#94a3b8;"><span id="hud-mine-name">Tesouraria Base</span> (Nível 0)</div>
              <div style="font-size:14px; font-weight:bold; color:#a7f3d0;">Renda: <span id="hud-mine-income">+12g</span> / 5s</div>
            </div>
          </div>

          <!-- 5.0s Income Tick Progress Bar -->
          <div style="display:flex; flex-direction:column; gap:3px;">
            <div style="font-size:10px; color:#94a3b8; display:flex; justify-content:space-between;">
              <span>Ciclo de Renda (5.0s):</span>
            </div>
            <div style="width:130px; height:8px; background:#1e293b; border-radius:4px; overflow:hidden; border:1px solid #334155;">
              <div id="hud-income-bar" style="height:100%; width:0%; background:#10b981; transition:width 0.05s linear;"></div>
            </div>
          </div>
        </div>

        <!-- Mine Upgrade Button -->
        <div>
          <button id="hud-btn-upgrade-mine" style="background:linear-gradient(135deg, #d97706, #b45309); color:#fff; border:1px solid #f59e0b; padding:8px 16px; border-radius:5px; font-weight:bold; font-size:12px; cursor:pointer; box-shadow:0 2px 6px rgba(217,119,6,0.3); transition:transform 0.1s ease;">
            Aprimorar p/ Mina de Cobre: 60g (+6g)
          </button>
        </div>
      </div>

      <!-- 5. ALLIED 4x3 CONSTRUCTION GRID (12 SLOTS) -->
      <div style="display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <h2 style="margin:0; font-size:14px; color:#cbd5e1; text-transform:uppercase; letter-spacing:0.5px;">
            Grid de Construção da Retaguarda (4 x 3 = 12 Slots de Geradores):
          </h2>
          <span style="font-size:11px; color:#94a3b8;">Construção N1 • Upgrade N2 • Venda com Reembolso de 60%</span>
        </div>

        <!-- 4 Columns x 3 Rows = 12 Slots Grid -->
        <div id="hud-slots-grid" style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px;">
          <!-- 12 slots rendered dynamically -->
        </div>
      </div>

      <!-- 6. GAME OVER MODAL -->
      <div id="hud-gameover-modal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.85); z-index:9999; justify-content:center; align-items:center;">
        <div style="background:#0f172a; border:2px solid #f59e0b; border-radius:12px; padding:32px 48px; text-align:center; max-width:450px; box-shadow:0 0 40px rgba(245,158,11,0.5);">
          <h2 id="hud-gameover-title" style="margin:0 0 12px 0; font-size:28px; color:#ffd700;">VITÓRIA SOLAR!</h2>
          <p id="hud-gameover-desc" style="margin:0 0 24px 0; font-size:14px; color:#cbd5e1;">A Cidadela inimiga foi reduzida a escombros pela glória de Aethelgard.</p>
          <button id="hud-btn-gameover-restart" style="background:#2563eb; color:#fff; border:none; padding:10px 24px; border-radius:6px; font-weight:bold; font-size:14px; cursor:pointer;">
            Jogar Novamente
          </button>
        </div>
      </div>
    `;
  }

  // =========================================================================
  // DOM ELEMENT CACHING
  // =========================================================================

  private cacheDomElements(): void {
    this.elPlayerHp = document.getElementById('hud-player-hp')!;
    this.elPlayerHpBar = document.getElementById('hud-player-hp-bar')!;
    this.elEnemyHp = document.getElementById('hud-enemy-hp')!;
    this.elEnemyHpBar = document.getElementById('hud-enemy-hp-bar')!;
    this.elFrontlineX = document.getElementById('hud-frontline-x')!;
    this.elFrontlineStatus = document.getElementById('hud-frontline-status')!;
    this.elGaugeBar = document.getElementById('hud-gauge-bar')!;
    this.elGaugeContainer = document.getElementById('hud-gauge-container')!;

    this.elGold = document.getElementById('hud-gold')!;
    this.elMineName = document.getElementById('hud-mine-name')!;
    this.elMineIncome = document.getElementById('hud-mine-income')!;
    this.elIncomeBar = document.getElementById('hud-income-bar')!;
    this.elBtnUpgradeMine = document.getElementById('hud-btn-upgrade-mine') as HTMLButtonElement;

    this.elBtnSpeed1x = document.getElementById('hud-btn-speed-1x') as HTMLButtonElement;
    this.elBtnSpeed2x = document.getElementById('hud-btn-speed-2x') as HTMLButtonElement;
    this.elBtnSpeed4x = document.getElementById('hud-btn-speed-4x') as HTMLButtonElement;
    this.elBtnPause = document.getElementById('hud-btn-pause') as HTMLButtonElement;
    this.elBtnMute = document.getElementById('hud-btn-mute') as HTMLButtonElement;
    this.elBtnCamera = document.getElementById('hud-btn-camera') as HTMLButtonElement;
    this.elSelectAi = document.getElementById('hud-select-ai') as HTMLSelectElement;

    this.elSlotsGrid = document.getElementById('hud-slots-grid')!;
    this.elGameOverModal = document.getElementById('hud-gameover-modal')!;
    this.elGameOverTitle = document.getElementById('hud-gameover-title')!;
    this.elGameOverDesc = document.getElementById('hud-gameover-desc')!;
  }

  // =========================================================================
  // EVENT BINDINGS
  // =========================================================================

  private bindEvents(): void {
    // Speed buttons
    this.elBtnSpeed1x.addEventListener('click', () => this.callbacks.onChangeSpeed(1));
    this.elBtnSpeed2x.addEventListener('click', () => this.callbacks.onChangeSpeed(2));
    this.elBtnSpeed4x.addEventListener('click', () => this.callbacks.onChangeSpeed(4));

    // Pause button
    this.elBtnPause.addEventListener('click', () => this.callbacks.onTogglePause());

    // Mute button
    this.elBtnMute.addEventListener('click', () => this.callbacks.onToggleMute());

    // Camera toggle button
    this.elBtnCamera.addEventListener('click', () => this.callbacks.onToggleCamera());

    // Restart button
    document.getElementById('hud-btn-restart')?.addEventListener('click', () => {
      this.callbacks.onRestartGame(this.elSelectAi.value as AIProfileId);
    });

    // GameOver restart button
    document.getElementById('hud-btn-gameover-restart')?.addEventListener('click', () => {
      this.elGameOverModal.style.display = 'none';
      this.callbacks.onRestartGame(this.elSelectAi.value as AIProfileId);
    });

    // AI Selector change
    this.elSelectAi.addEventListener('change', () => {
      this.callbacks.onRestartGame(this.elSelectAi.value as AIProfileId);
    });

    // Mine Upgrade Button
    this.elBtnUpgradeMine.addEventListener('click', () => {
      this.callbacks.onUpgradeMine();
    });

    // Click Delegation for Grid actions
    this.elSlotsGrid.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.getAttribute('data-action');
      const slotIdxAttr = target.getAttribute('data-slot');

      if (!action || slotIdxAttr === null) return;
      const slotIndex = parseInt(slotIdxAttr, 10);

      if (action === 'toggle-build-menu') {
        this.openBuildMenuSlotIndex = this.openBuildMenuSlotIndex === slotIndex ? -1 : slotIndex;
      } else if (action === 'build-structure') {
        const typeId = target.getAttribute('data-type') as StructureTypeId;
        if (typeId) {
          this.callbacks.onBuild(slotIndex, typeId);
          this.openBuildMenuSlotIndex = -1;
        }
      } else if (action === 'upgrade-structure') {
        this.callbacks.onUpgrade(slotIndex);
      } else if (action === 'sell-structure') {
        this.callbacks.onSell(slotIndex);
      }
    });
  }

  // =========================================================================
  // MAIN UPDATE HOOK (Called every frame from main loop)
  // =========================================================================

  public update(
    snapshot: GameStateSnapshot,
    soundSynth: SoundSynthesizer,
    isPaused: boolean,
    currentSpeed: number,
    cameraMode: 'OVERVIEW' | 'FOLLOW_FRONTLINE'
  ): void {
    this.updateHeaderControls(soundSynth, isPaused, currentSpeed, cameraMode);
    this.updateTugOfWarGauge(snapshot);
    this.updateEconomyPanel(snapshot);
    this.updateConstructionGrid(snapshot);
    this.updateGameOver(snapshot);
  }

  // =========================================================================
  // COMPONENT UPDATES
  // =========================================================================

  private updateHeaderControls(
    soundSynth: SoundSynthesizer,
    isPaused: boolean,
    currentSpeed: number,
    cameraMode: 'OVERVIEW' | 'FOLLOW_FRONTLINE'
  ): void {
    // Speed buttons active styling
    this.elBtnSpeed1x.style.background = currentSpeed === 1 ? '#3b82f6' : 'transparent';
    this.elBtnSpeed1x.style.color = currentSpeed === 1 ? '#ffffff' : '#94a3b8';

    this.elBtnSpeed2x.style.background = currentSpeed === 2 ? '#3b82f6' : 'transparent';
    this.elBtnSpeed2x.style.color = currentSpeed === 2 ? '#ffffff' : '#94a3b8';

    this.elBtnSpeed4x.style.background = currentSpeed === 4 ? '#3b82f6' : 'transparent';
    this.elBtnSpeed4x.style.color = currentSpeed === 4 ? '#ffffff' : '#94a3b8';

    // Pause text
    this.elBtnPause.textContent = isPaused ? '▶️ Retomar' : '⏸️ Pausar';
    this.elBtnPause.style.background = isPaused ? '#166534' : '#334155';

    // Audio text
    const isMuted = soundSynth.isSoundMuted();
    this.elBtnMute.textContent = isMuted ? '🔇 Mudo' : '🔊 Áudio Ligado';
    this.elBtnMute.style.color = isMuted ? '#f87171' : '#a7f3d0';

    // Camera text
    this.elBtnCamera.textContent = cameraMode === 'OVERVIEW' ? '🎥 Visão Geral' : '🎯 Foco na Frente';
  }

  private updateTugOfWarGauge(snapshot: GameStateSnapshot): void {
    const pCitadel = snapshot.citadels.PLAYER;
    const eCitadel = snapshot.citadels.ENEMY;

    this.elPlayerHp.textContent = `${pCitadel.currentHp} / ${CITADEL_MAX_HP}`;
    this.elEnemyHp.textContent = `${eCitadel.currentHp} / ${CITADEL_MAX_HP}`;

    const pRatio = Math.max(0, Math.min(100, (pCitadel.currentHp / CITADEL_MAX_HP) * 100));
    const eRatio = Math.max(0, Math.min(100, (eCitadel.currentHp / CITADEL_MAX_HP) * 100));

    this.elPlayerHpBar.style.width = `${pRatio}%`;
    this.elEnemyHpBar.style.width = `${eRatio}%`;

    const frontX = snapshot.frontline.frontlineX;
    this.elFrontlineX.textContent = frontX.toFixed(0);

    // Frontline Gauge percentage in [0, 100]%
    const gaugePct = Math.max(0, Math.min(100, (frontX / 2000) * 100));
    this.elGaugeBar.style.left = `${gaugePct}%`;

    // Visual highlights for Vanguard Momentum (> 1200) and Desperation Bulwark (< 800)
    if (frontX > 1200) {
      this.elGaugeContainer.style.border = '2px solid #ffd700';
      this.elGaugeContainer.style.boxShadow = '0 0 16px rgba(255, 215, 0, 0.4)';
      this.elFrontlineStatus.innerHTML = '<b style="color:#ffd700;">👑 ÍMPETO DA VANGUARDA / MORAL RADIANTE (+15% Vel, +1g/5s)</b>';
    } else if (frontX < 800) {
      this.elGaugeContainer.style.border = '2px solid #ef4444';
      this.elGaugeContainer.style.boxShadow = '0 0 16px rgba(239, 68, 68, 0.4)';
      this.elFrontlineStatus.innerHTML = '<b style="color:#ef4444;">🛡️ BALUARTE DO DESESPERO (Balistas Defensivas Ativas)</b>';
    } else {
      this.elGaugeContainer.style.border = '2px solid #334155';
      this.elGaugeContainer.style.boxShadow = 'none';
      this.elFrontlineStatus.innerHTML = '<span style="color:#cbd5e1;">⚔️ Zona Neutra Contestada (X = 1000)</span>';
    }
  }

  private updateEconomyPanel(snapshot: GameStateSnapshot): void {
    const eco = snapshot.economy.PLAYER;
    this.elGold.textContent = eco.gold.toString();

    const mineDef = MINE_LEVEL_DEFINITIONS[eco.mineLevel];
    this.elMineName.textContent = mineDef.name;
    this.elMineIncome.textContent = `+${mineDef.incomePerCycle}g`;

    // Continuous progress bar for next 5.0s income tick (100 ticks total)
    const incomeProgressPct = Math.max(0, Math.min(100, ((100 - eco.incomeCycleTicksRemaining) / 100) * 100));
    this.elIncomeBar.style.width = `${incomeProgressPct}%`;

    // Upgrade Button
    if (eco.mineLevel < MINE_MAX_LEVEL) {
      const nextLevel = eco.mineLevel + 1;
      const nextDef = MINE_LEVEL_DEFINITIONS[nextLevel];
      const deltaIncome = nextDef.incomePerCycle - mineDef.incomePerCycle;
      const cost = nextDef.costGold;

      this.elBtnUpgradeMine.textContent = `Aprimorar p/ ${nextDef.name}: ${cost}g (+${deltaIncome}g)`;
      this.elBtnUpgradeMine.disabled = eco.gold < cost;
      this.elBtnUpgradeMine.style.opacity = eco.gold < cost ? '0.6' : '1.0';
      this.elBtnUpgradeMine.style.cursor = eco.gold < cost ? 'not-allowed' : 'pointer';
    } else {
      this.elBtnUpgradeMine.textContent = 'Tesouraria no Nível Máximo (N4)';
      this.elBtnUpgradeMine.disabled = true;
      this.elBtnUpgradeMine.style.opacity = '0.5';
      this.elBtnUpgradeMine.style.cursor = 'default';
    }
  }

  private updateConstructionGrid(snapshot: GameStateSnapshot): void {
    const playerSlots = snapshot.slots.filter((s) => s.team === 'PLAYER');
    const playerGold = snapshot.economy.PLAYER.gold;

    let html = '';

    for (const slot of playerSlots) {
      const i = slot.slotIndex;
      const isMenuOpen = this.openBuildMenuSlotIndex === i;

      if (!slot.structureId) {
        // --- EMPTY SLOT ---
        if (!isMenuOpen) {
          html += `
            <div style="background:#111827; border:1px dashed #334155; border-radius:6px; padding:10px; display:flex; flex-direction:column; justify-content:space-between; min-height:88px; box-sizing:border-box;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:11px; color:#64748b; font-weight:bold;">Slot ${i + 1}</span>
                <span style="font-size:10px; color:#475569;">Vazio</span>
              </div>
              <button data-action="toggle-build-menu" data-slot="${i}" style="background:#1e293b; color:#38bdf8; border:1px solid #0284c7; padding:6px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer;">
                + Construir Estrutura
              </button>
            </div>
          `;
        } else {
          // OPEN BUILD SELECTION MENU (The 5 Tier-1 structures)
          html += `
            <div style="background:#0f172a; border:1px solid #38bdf8; border-radius:6px; padding:8px; display:flex; flex-direction:column; gap:4px; min-height:88px; box-sizing:border-box; box-shadow:0 0 10px rgba(56,189,248,0.25);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                <b style="font-size:11px; color:#38bdf8;">Escolha a Estrutura:</b>
                <button data-action="toggle-build-menu" data-slot="${i}" style="background:none; border:none; color:#ef4444; font-size:12px; cursor:pointer; font-weight:bold;">✕</button>
              </div>
              <div style="display:flex; flex-direction:column; gap:3px;">
                ${this.renderBuildOptionButton(i, 'bldg_barracks_1', 'Quartel da Guarda (Escudeiro)', 100, playerGold)}
                ${this.renderBuildOptionButton(i, 'bldg_archery_1', 'Campo Arquearia (Arqueiro)', 90, playerGold)}
                ${this.renderBuildOptionButton(i, 'bldg_arcane_1', 'Torre Arcana (Aprendiz Solar)', 125, playerGold)}
                ${this.renderBuildOptionButton(i, 'bldg_stable_1', 'Estábulo (Lanceiro Montado)', 140, playerGold)}
                ${this.renderBuildOptionButton(i, 'bldg_siege_1', 'Forja de Cerco (Balista Móvel)', 160, playerGold)}
              </div>
            </div>
          `;
        }
      } else {
        // --- OCCUPIED SLOT (Tier 1 or Tier 2) ---
        const def = STRUCTURES_CATALOG[slot.structureId];
        const isTier2 = def.tier === 2;

        // Spawn progress calculation (0% to 100%)
        const progressPct = slot.totalSpawnCooldownTicks > 0
          ? Math.max(0, Math.min(100, Math.round(((slot.totalSpawnCooldownTicks - slot.currentSpawnCooldownTicks) / slot.totalSpawnCooldownTicks) * 100)))
          : 0;

        // 60% Sell Refund
        const refundGold = Math.floor(slot.totalInvestedGold * 0.6);

        // Upgrade availability
        const canUpgrade = !isTier2 && def.upgradesTo !== undefined;
        const nextDef = canUpgrade && def.upgradesTo ? STRUCTURES_CATALOG[def.upgradesTo] : null;
        const upgradeCost = nextDef ? nextDef.upgradeCostGold : 0;
        const canAffordUpgrade = playerGold >= upgradeCost;

        const borderStyle = isTier2
          ? 'border:2px solid #ffd700; box-shadow:0 0 8px rgba(255,215,0,0.3);'
          : 'border:1px solid #334155;';

        html += `
          <div style="background:#111827; ${borderStyle} border-radius:6px; padding:8px 10px; display:flex; flex-direction:column; justify-content:space-between; min-height:88px; box-sizing:border-box;">
            <!-- Header: Name & Elite badge -->
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <div>
                <div style="font-size:12px; font-weight:bold; color:${isTier2 ? '#ffd700' : '#e2e8f0'};">
                  ${isTier2 ? '⭐ ' : ''}${def.name}
                </div>
                <div style="font-size:10px; color:#94a3b8;">${def.tier === 1 ? 'Tier 1' : 'Elite Tier 2'}</div>
              </div>
              <button data-action="sell-structure" data-slot="${i}" style="background:#7f1d1d; color:#fecaca; border:1px solid #b91c1c; padding:2px 6px; border-radius:3px; font-size:10px; cursor:pointer;" title="Reembolso de 60% do total investido">
                Vender (+${refundGold}g)
              </button>
            </div>

            <!-- Spawn Cooldown Progress Bar -->
            <div style="margin:4px 0;">
              <div style="display:flex; justify-content:space-between; font-size:9px; color:#94a3b8; margin-bottom:2px;">
                <span>Progresso Spawn:</span>
                <span>${progressPct}%</span>
              </div>
              <div style="height:5px; background:#0f172a; border-radius:3px; overflow:hidden; border:1px solid #1e293b;">
                <div style="height:100%; width:${progressPct}%; background:${isTier2 ? '#ffd700' : '#38bdf8'}; transition:width 0.05s linear;"></div>
              </div>
            </div>

            <!-- Footer: Upgrade button or MAX indicator -->
            <div style="display:flex; justify-content:flex-end;">
              ${canUpgrade ? `
                <button data-action="upgrade-structure" data-slot="${i}" ${canAffordUpgrade ? '' : 'disabled'} style="background:${canAffordUpgrade ? '#d97706' : '#374151'}; color:${canAffordUpgrade ? '#fff' : '#9ca3af'}; border:none; padding:3px 8px; border-radius:3px; font-size:10px; font-weight:bold; cursor:${canAffordUpgrade ? 'pointer' : 'not-allowed'};">
                  Upgrade (${upgradeCost}g)
                </button>
              ` : `
                <span style="font-size:10px; font-weight:bold; color:#ffd700; letter-spacing:0.5px;">MAX (Tier 2)</span>
              `}
            </div>
          </div>
        `;
      }
    }

    this.elSlotsGrid.innerHTML = html;
  }

  private renderBuildOptionButton(
    slotIndex: number,
    structureId: StructureTypeId,
    name: string,
    cost: number,
    playerGold: number
  ): string {
    const canAfford = playerGold >= cost;
    return `
      <button data-action="build-structure" data-slot="${slotIndex}" data-type="${structureId}" ${canAfford ? '' : 'disabled'} style="background:${canAfford ? '#1e3a8a' : '#1f2937'}; color:${canAfford ? '#bfdbfe' : '#6b7280'}; border:1px solid ${canAfford ? '#3b82f6' : '#374151'}; padding:3px 6px; border-radius:3px; font-size:10px; display:flex; justify-content:space-between; align-items:center; cursor:${canAfford ? 'pointer' : 'not-allowed'}; text-align:left;">
        <span>${name}</span>
        <b style="color:${canAfford ? '#fbbf24' : '#6b7280'};">${cost}g</b>
      </button>
    `;
  }

  private updateGameOver(snapshot: GameStateSnapshot): void {
    if (snapshot.isGameOver && this.elGameOverModal.style.display !== 'flex') {
      this.elGameOverModal.style.display = 'flex';
      const isPlayerWinner = snapshot.winnerTeam === 'PLAYER';

      if (isPlayerWinner) {
        this.elGameOverTitle.textContent = '👑 VITÓRIA SOLAR!';
        this.elGameOverTitle.style.color = '#ffd700';
        this.elGameOverDesc.textContent = `A Cidadela inimiga caiu após ${snapshot.timeSeconds.toFixed(1)} segundos de combate glorioso!`;
      } else {
        this.elGameOverTitle.textContent = '💀 DERROTA!';
        this.elGameOverTitle.style.color = '#ef4444';
        this.elGameOverDesc.textContent = `O Nexus de Aethelgard sucumbiu às forças inimigas aos ${snapshot.timeSeconds.toFixed(1)} segundos.`;
      }
    }
  }

  public getSelectedAIProfile(): AIProfileId {
    return this.elSelectAi.value as AIProfileId;
  }
}
