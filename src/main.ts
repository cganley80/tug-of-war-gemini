/**
 * Tug of War: Citadels of Aethelgard
 * Browser Validation Dashboard (Sprint 1)
 * Renders the headless GameEngine via Canvas 2D & Interactive Controls.
 */

import { GameEngine } from './core/GameEngine';
import { TICK_DURATION_SEC } from './core/config/ArenaConfig';
import { MINE_LEVEL_DEFINITIONS } from './core/config/EconomyConfig';
import { StructureTypeId } from './core/types';

const app = document.getElementById('app');
if (!app) {
  throw new Error('Root #app container not found');
}

// Set up UI layout container
app.style.display = 'flex';
app.style.flexDirection = 'column';
app.style.width = '1100px';
app.style.padding = '16px';
app.style.gap = '12px';
app.style.boxSizing = 'border-box';
app.style.backgroundColor = '#121216';
app.style.color = '#e2e8f0';
app.style.fontFamily = "'Cinzel', Georgia, serif, sans-serif";

app.innerHTML = `
  <header style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #334155; padding-bottom:8px;">
    <div>
      <h2 style="margin:0; font-size:20px; color:#f59e0b;">Tug of War: Citadels of Aethelgard</h2>
      <span style="font-size:12px; color:#94a3b8;">Sprint 1 - Motor de Simulação Headless (Fixed Timestep 20 TPS)</span>
    </div>
    <div style="display:flex; gap:16px; font-size:13px; align-items:center;">
      <span>Tick: <b id="ui-tick" style="color:#38bdf8;">0</b> (<span id="ui-time">0.0</span>s)</span>
      <span>Hash: <code id="ui-hash" style="color:#a855f7; font-size:11px;">--------</code></span>
      <button id="btn-spawn-enemy" style="background:#7f1d1d; color:#fecaca; border:1px solid #b91c1c; padding:4px 10px; border-radius:4px; cursor:pointer;">+ Spawn Inimigo (Quartel)</button>
    </div>
  </header>

  <!-- Tug of War Gauge -->
  <div style="background:#1e293b; border-radius:6px; padding:8px 12px; display:flex; flex-direction:column; gap:6px;">
    <div style="display:flex; justify-content:space-between; font-size:13px;">
      <span style="color:#60a5fa;">Cidadela Aliada: <b id="ui-player-hp">2500</b>/2500 HP</span>
      <span style="color:#fbbf24;">Linha de Frente (X̄): <b id="ui-frontline">1000</b> | <span id="ui-frontline-status">Neutro</span></span>
      <span style="color:#f87171;">Cidadela Inimiga: <b id="ui-enemy-hp">2500</b>/2500 HP</span>
    </div>
    <div style="height:10px; background:#334155; border-radius:5px; position:relative; overflow:hidden;">
      <div id="gauge-bar" style="position:absolute; top:0; bottom:0; left:50%; width:4px; background:#fbbf24; transform:translateX(-50%); transition:left 0.1s linear;"></div>
      <div style="position:absolute; top:0; bottom:0; left:40%; width:1px; background:#475569;"></div>
      <div style="position:absolute; top:0; bottom:0; left:60%; width:1px; background:#475569;"></div>
    </div>
  </div>

  <!-- Battle Arena Canvas -->
  <div style="position:relative; width:100%; height:260px; background:#0f172a; border:2px solid #334155; border-radius:6px; overflow:hidden;">
    <canvas id="arena-canvas" width="1064" height="260" style="display:block; width:100%; height:100%;"></canvas>
  </div>

  <!-- Economy & Controls Bar -->
  <div style="display:flex; justify-content:space-between; align-items:center; background:#1e293b; padding:10px 14px; border-radius:6px;">
    <div style="display:flex; gap:20px; align-items:center;">
      <span style="font-size:15px;">Tesouraria: <b id="ui-gold" style="color:#fbbf24;">120</b> Ouro</span>
      <span style="font-size:13px; color:#cbd5e1;">Mina Real: <b id="ui-mine-name">Tesouraria Base</b> (<b id="ui-mine-income">+12</b> Ouro/5s)</span>
      <button id="btn-upgrade-mine" style="background:#d97706; color:#fff; border:none; padding:5px 12px; border-radius:4px; font-weight:bold; cursor:pointer;">Aprimorar Mina (60g)</button>
    </div>
    <div style="display:flex; gap:8px;">
      <button id="btn-speed-1x" style="background:#334155; color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">1x</button>
      <button id="btn-speed-2x" style="background:#334155; color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">2x</button>
      <button id="btn-speed-5x" style="background:#334155; color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">5x</button>
    </div>
  </div>

  <!-- Player 4x3 Construction Grid -->
  <div>
    <h3 style="margin:0 0 8px 0; font-size:14px; color:#94a3b8;">Grid de Construção da Retaguarda (4 x 3 = 12 Slots):</h3>
    <div id="slots-grid" style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px;"></div>
  </div>
`;

// Initialize Headless Game Engine
const engine = new GameEngine({ seed: 42 });

// Build initial enemy structure to provide lively combat for Sprint 1 demo
engine.buildStructure('ENEMY', 0, 'bldg_barracks_1');

// DOM elements
const canvas = document.getElementById('arena-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Could not get 2D canvas context');

const uiTick = document.getElementById('ui-tick')!;
const uiTime = document.getElementById('ui-time')!;
const uiHash = document.getElementById('ui-hash')!;
const uiPlayerHp = document.getElementById('ui-player-hp')!;
const uiEnemyHp = document.getElementById('ui-enemy-hp')!;
const uiFrontline = document.getElementById('ui-frontline')!;
const uiFrontlineStatus = document.getElementById('ui-frontline-status')!;
const gaugeBar = document.getElementById('gauge-bar')!;
const uiGold = document.getElementById('ui-gold')!;
const uiMineName = document.getElementById('ui-mine-name')!;
const uiMineIncome = document.getElementById('ui-mine-income')!;
const btnUpgradeMine = document.getElementById('btn-upgrade-mine') as HTMLButtonElement;
const slotsGrid = document.getElementById('slots-grid')!;
const btnSpawnEnemy = document.getElementById('btn-spawn-enemy') as HTMLButtonElement;

let simSpeed = 1;

document.getElementById('btn-speed-1x')?.addEventListener('click', () => { simSpeed = 1; });
document.getElementById('btn-speed-2x')?.addEventListener('click', () => { simSpeed = 2; });
document.getElementById('btn-speed-5x')?.addEventListener('click', () => { simSpeed = 5; });

btnSpawnEnemy?.addEventListener('click', () => {
  // Find an available enemy slot to build a Barracks or Archery
  const emptySlot = engine.slots.find((s) => s.team === 'ENEMY' && s.structureId === null);
  if (emptySlot) {
    engine.economy.ENEMY.gold += 100;
    engine.buildStructure('ENEMY', emptySlot.slotIndex, 'bldg_barracks_1');
  } else {
    engine.spawnUnit('ENEMY', 'unit_squire');
  }
});

btnUpgradeMine?.addEventListener('click', () => {
  engine.upgradeMine('PLAYER');
  renderUI();
});

// Build Grid UI Slots
function setupSlotsGrid() {
  slotsGrid.innerHTML = '';
  for (let i = 0; i < 12; i++) {
    const slotCard = document.createElement('div');
    slotCard.id = `slot-${i}`;
    slotCard.style.background = '#1e293b';
    slotCard.style.border = '1px solid #334155';
    slotCard.style.borderRadius = '6px';
    slotCard.style.padding = '8px';
    slotCard.style.display = 'flex';
    slotCard.style.flexDirection = 'column';
    slotCard.style.justifyContent = 'space-between';
    slotCard.style.minHeight = '72px';
    slotCard.style.fontSize = '12px';
    slotsGrid.appendChild(slotCard);
  }
}
setupSlotsGrid();

function updateSlotsUI() {
  for (let i = 0; i < 12; i++) {
    const slotState = engine.slots.find((s) => s.team === 'PLAYER' && s.slotIndex === i);
    const card = document.getElementById(`slot-${i}`);
    if (!card || !slotState) continue;

    if (!slotState.structureId) {
      card.innerHTML = `
        <div style="color:#64748b; font-weight:bold;">Slot ${i + 1} (Vazio)</div>
        <div style="display:flex; gap:4px; margin-top:6px;">
          <button data-action="build" data-slot="${i}" data-type="bldg_barracks_1" style="flex:1; background:#1e3a8a; color:#bfdbfe; border:1px solid #3b82f6; padding:3px; border-radius:3px; cursor:pointer; font-size:10px;">Quartel (100g)</button>
          <button data-action="build" data-slot="${i}" data-type="bldg_archery_1" style="flex:1; background:#065f46; color:#a7f3d0; border:1px solid #10b981; padding:3px; border-radius:3px; cursor:pointer; font-size:10px;">Arquearia (90g)</button>
        </div>
      `;
    } else {
      const isBarracks = slotState.structureId.includes('barracks');
      const name = isBarracks
        ? slotState.structureId.endsWith('_2') ? 'Quartel Real (N2)' : 'Quartel da Guarda (N1)'
        : slotState.structureId.endsWith('_2') ? 'Guarnição Besteiros (N2)' : 'Campo Arquearia (N1)';

      const progressPct = slotState.totalSpawnCooldownTicks > 0
        ? Math.round(((slotState.totalSpawnCooldownTicks - slotState.currentSpawnCooldownTicks) / slotState.totalSpawnCooldownTicks) * 100)
        : 0;

      const canUpgrade = slotState.structureId.endsWith('_1');
      const upgrCost = isBarracks ? 130 : 120;

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <b style="color:${isBarracks ? '#93c5fd' : '#a7f3d0'};">${name}</b>
          <button data-action="sell" data-slot="${i}" style="background:#7f1d1d; color:#fecaca; border:none; padding:1px 5px; border-radius:3px; cursor:pointer; font-size:9px;">Vender (60%)</button>
        </div>
        <div style="height:4px; background:#0f172a; border-radius:2px; margin:6px 0; overflow:hidden;">
          <div style="height:100%; width:${progressPct}%; background:#38bdf8;"></div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px;">
          <span style="color:#94a3b8;">Spawn: ${progressPct}%</span>
          ${canUpgrade ? `<button data-action="upgrade" data-slot="${i}" style="background:#d97706; color:#fff; border:none; padding:2px 6px; border-radius:3px; cursor:pointer; font-size:9px;">Upgrade (${upgrCost}g)</button>` : '<span style="color:#f59e0b;">MAX</span>'}
        </div>
      `;
    }
  }
}

// Click Delegation for Grid actions
slotsGrid.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const action = target.getAttribute('data-action');
  const slotIdx = Number(target.getAttribute('data-slot'));
  if (action === 'build') {
    const type = target.getAttribute('data-type') as StructureTypeId;
    if (type) engine.buildStructure('PLAYER', slotIdx, type);
  } else if (action === 'upgrade') {
    engine.upgradeStructure('PLAYER', slotIdx);
  } else if (action === 'sell') {
    engine.sellStructure('PLAYER', slotIdx);
  }
  renderUI();
});

function renderUI() {
  uiTick.textContent = engine.getTick().toString();
  uiTime.textContent = engine.getTimeSeconds().toFixed(1);
  uiHash.textContent = engine.computeStateHash().slice(0, 12);

  const playerHp = engine.citadels.PLAYER.currentHp;
  const enemyHp = engine.citadels.ENEMY.currentHp;
  uiPlayerHp.textContent = playerHp.toString();
  uiEnemyHp.textContent = enemyHp.toString();

  const frontX = engine.frontline.frontlineX;
  uiFrontline.textContent = frontX.toFixed(0);

  // Status label
  if (engine.frontline.isPlayerVanguardActive) {
    uiFrontlineStatus.innerHTML = '<b style="color:#38bdf8;">Ímpeto da Vanguarda (+15% Vel, +1g/5s)</b>';
  } else if (engine.frontline.isPlayerDesperationActive) {
    uiFrontlineStatus.innerHTML = '<b style="color:#ef4444;">Baluarte do Desespero (Balistas Ativas)</b>';
  } else {
    uiFrontlineStatus.textContent = frontX > 1200 ? 'Avanço Aliado' : frontX < 800 ? 'Pressão Inimiga' : 'Zona Central Neutra';
  }

  // Gauge bar position (0..2000 mapped to 0..100%)
  const gaugePct = Math.max(0, Math.min(100, (frontX / 2000) * 100));
  gaugeBar.style.left = `${gaugePct}%`;

  // Economy
  const eco = engine.economy.PLAYER;
  uiGold.textContent = eco.gold.toString();
  const mineDef = MINE_LEVEL_DEFINITIONS[eco.mineLevel];
  uiMineName.textContent = mineDef.name;
  uiMineIncome.textContent = `+${mineDef.incomePerCycle}`;

  if (eco.mineLevel < 4) {
    const nextCost = MINE_LEVEL_DEFINITIONS[eco.mineLevel + 1].costGold;
    btnUpgradeMine.textContent = `Aprimorar Mina (${nextCost}g)`;
    btnUpgradeMine.disabled = eco.gold < nextCost;
  } else {
    btnUpgradeMine.textContent = 'Mina no Nível Máximo';
    btnUpgradeMine.disabled = true;
  }

  updateSlotsUI();
}

function renderArena() {
  const w = canvas.width;
  const h = canvas.height;

  ctx!.clearRect(0, 0, w, h);

  // Coordinate mapping: Game X: 0..2000 -> Canvas X: 40..w-40
  // Game Y: 100..500 -> Canvas Y: 20..h-20
  const arenaWidth = w - 80;
  const mapX = (x: number) => 40 + (x / 2000) * arenaWidth;
  const mapY = (y: number) => 20 + ((y - 100) / 400) * (h - 40);

  // Background zones
  // Allied Zone: 0..800
  ctx!.fillStyle = '#1e293b';
  ctx!.fillRect(40, 20, (800 / 2000) * arenaWidth, h - 40);

  // Contested Zone: 800..1200
  ctx!.fillStyle = '#0f172a';
  ctx!.fillRect(mapX(800), 20, (400 / 2000) * arenaWidth, h - 40);

  // Enemy Zone: 1200..2000
  ctx!.fillStyle = '#2d1820';
  ctx!.fillRect(mapX(1200), 20, (800 / 2000) * arenaWidth, h - 40);

  // Neutral Center Line
  ctx!.strokeStyle = '#475569';
  ctx!.setLineDash([4, 4]);
  ctx!.beginPath();
  ctx!.moveTo(mapX(1000), 20);
  ctx!.lineTo(mapX(1000), h - 20);
  ctx!.stroke();
  ctx!.setLineDash([]);

  // Citadels
  // Player Citadel (X = 0)
  ctx!.fillStyle = '#3b82f6';
  ctx!.fillRect(10, 30, 24, h - 60);
  ctx!.fillStyle = '#ffffff';
  ctx!.font = '10px sans-serif';
  ctx!.fillText('NEXUS', 5, 24);

  // Enemy Citadel (X = 2000)
  ctx!.fillStyle = '#ef4444';
  ctx!.fillRect(w - 34, 30, 24, h - 60);
  ctx!.fillStyle = '#ffffff';
  ctx!.fillText('INIMIGO', w - 42, 24);

  // Frontline dynamic line
  const frontCanvasX = mapX(engine.frontline.frontlineX);
  ctx!.strokeStyle = '#fbbf24';
  ctx!.lineWidth = 2;
  ctx!.beginPath();
  ctx!.moveTo(frontCanvasX, 10);
  ctx!.lineTo(frontCanvasX, h - 10);
  ctx!.stroke();

  // Render Units
  for (const unit of engine.units) {
    if (unit.currentHp <= 0) continue;

    const ux = mapX(unit.x);
    const uy = mapY(unit.y);
    const isPlayer = unit.team === 'PLAYER';

    // Unit Body
    ctx!.beginPath();
    ctx!.arc(ux, uy, 7, 0, Math.PI * 2);
    ctx!.fillStyle = isPlayer ? (unit.typeId.includes('longbow') ? '#10b981' : '#3b82f6') : '#dc2626';
    ctx!.fill();
    ctx!.strokeStyle = unit.hasRadiantMorale ? '#fbbf24' : '#ffffff';
    ctx!.lineWidth = unit.hasRadiantMorale ? 2 : 1;
    ctx!.stroke();

    // HP Bar
    const hpRatio = Math.max(0, unit.currentHp / unit.maxHp);
    ctx!.fillStyle = '#000000';
    ctx!.fillRect(ux - 10, uy - 12, 20, 3);
    ctx!.fillStyle = isPlayer ? '#22c55e' : '#f87171';
    ctx!.fillRect(ux - 10, uy - 12, 20 * hpRatio, 3);
  }
}

// Fixed Timestep Accumulator Loop
let lastTime = performance.now();
let accumulator = 0;

function gameLoop(time: number) {
  const dt = Math.min((time - lastTime) / 1000, 0.2); // Cap at 200ms
  lastTime = time;

  accumulator += dt * simSpeed;
  while (accumulator >= TICK_DURATION_SEC) {
    engine.tick();
    accumulator -= TICK_DURATION_SEC;
  }

  renderUI();
  renderArena();

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
