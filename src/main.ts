/**
 * Tug of War: Citadels of Aethelgard
 * Main Entry Point — Sprint 2: 60 FPS Phaser 3 Renderer, Web Audio & Tactical HUD
 */

import Phaser from 'phaser';
import { GameEngine } from './core/GameEngine';
import { AIProfileId, StructureTypeId } from './core/types';
import { SoundSynthesizer } from './renderer/audio/SoundSynthesizer';
import { BattleScene } from './renderer/scenes/BattleScene';
import { TacticalHud } from './ui/hud/TacticalHud';

const app = document.getElementById('app');
if (!app) {
  throw new Error('Root #app container not found in DOM');
}

// 1. Initialize Native Web Audio Synthesizer
const soundSynthesizer = new SoundSynthesizer();

// 2. Initialize Headless Game Engine (Default: Aggressive Rush AI profile)
let currentAiProfile: AIProfileId = 'AGGRESSIVE';
let currentEngine = new GameEngine({
  aiProfile: currentAiProfile,
  seed: 42,
});

// Reference to active battle scene
let battleScene: BattleScene | null = null;

// 3. Mount Tactical HUD with Event Callbacks
const hud = new TacticalHud(app, {
  onBuild: (slotIndex: number, structureId: StructureTypeId) => {
    currentEngine.buildStructure('PLAYER', slotIndex, structureId);
  },
  onUpgrade: (slotIndex: number) => {
    currentEngine.upgradeStructure('PLAYER', slotIndex);
  },
  onSell: (slotIndex: number) => {
    currentEngine.sellStructure('PLAYER', slotIndex);
  },
  onUpgradeMine: () => {
    currentEngine.upgradeMine('PLAYER');
  },
  onChangeSpeed: (speed: number) => {
    battleScene?.setSimulationSpeed(speed);
  },
  onTogglePause: () => {
    battleScene?.togglePaused();
  },
  onToggleMute: () => {
    soundSynthesizer.setMuted(!soundSynthesizer.isSoundMuted());
  },
  onToggleCamera: () => {
    if (battleScene) {
      const curMode = battleScene.getCameraMode();
      battleScene.setCameraMode(curMode === 'OVERVIEW' ? 'FOLLOW_FRONTLINE' : 'OVERVIEW');
    }
  },
  onRestartGame: (profile: AIProfileId) => {
    currentAiProfile = profile;
    currentEngine = new GameEngine({
      aiProfile: currentAiProfile,
      seed: Math.floor(Math.random() * 1000000),
    });
    battleScene?.resetGame(currentEngine);
  },
});

// 4. Initialize Phaser 3 Game Instance
const phaserContainer = document.getElementById('phaser-container');
if (!phaserContainer) {
  throw new Error('#phaser-container element not found');
}

const phaserConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'phaser-container',
  width: 1148,
  height: 340,
  backgroundColor: '#09090b',
  physics: {
    default: 'none',
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

const game = new Phaser.Game(phaserConfig);

// Add and start BattleScene with initial engine & audio synthesizer
game.scene.add('BattleScene', BattleScene, true, {
  engine: currentEngine,
  soundSynthesizer,
});

// Cache reference to scene when ready
const checkSceneReady = () => {
  const sceneInstance = game.scene.getScene('BattleScene') as BattleScene | null;
  if (sceneInstance) {
    battleScene = sceneInstance;
  } else {
    setTimeout(checkSceneReady, 50);
  }
};
checkSceneReady();

// 5. Continuous HUD Update Loop
function uiUpdateLoop() {
  if (battleScene) {
    hud.update(
      currentEngine.getSnapshot(),
      soundSynthesizer,
      battleScene.isGamePaused(),
      battleScene.getSimulationSpeed(),
      battleScene.getCameraMode()
    );
  }
  requestAnimationFrame(uiUpdateLoop);
}

requestAnimationFrame(uiUpdateLoop);
