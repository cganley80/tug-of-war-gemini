/**
 * Tug of War: Citadels of Aethelgard
 * Main Entry Point — Sprint 3: Roguelike Metagame Integration (Act 1),
 * 60 FPS Phaser 3 Renderer, Web Audio Synthesizer, Persistent Campaign & Tactical HUD.
 */

import Phaser from 'phaser';
import { GameEngine } from './core/GameEngine';
import { AIProfileId, StructureTypeId, CampaignNode } from './core/types';
import { CampaignManager } from './core/campaign/CampaignManager';
import { SoundSynthesizer } from './renderer/audio/SoundSynthesizer';
import { BattleScene } from './renderer/scenes/BattleScene';
import { TacticalHud } from './ui/hud/TacticalHud';
import { CampaignStorage } from './ui/storage/CampaignStorage';
import { CampaignOverlay } from './ui/screens/CampaignOverlay';

const app = document.getElementById('app');
if (!app) {
  throw new Error('Root #app container not found in DOM');
}

// 1. Initialize Native Web Audio Synthesizer
const soundSynthesizer = new SoundSynthesizer();

// 2. Initialize or Restore Roguelike Campaign State
let campaign: CampaignManager = CampaignStorage.load() ?? new CampaignManager(Date.now());
CampaignStorage.save(campaign);

// Track whether the current active battle is part of the Roguelike Campaign or a standalone skirmish
let isCampaignBattle = false;
let hasHandledBattleOutcome = false;

// 3. Initialize Headless Game Engine (Initial default setup)
let currentAiProfile: AIProfileId = 'AGGRESSIVE';
let currentEngine = new GameEngine(
  isCampaignBattle
    ? campaign.createBattleEngineOptions()
    : {
        aiProfile: currentAiProfile,
        seed: 42,
      }
);

// Reference to active Phaser battle scene
let battleScene: BattleScene | null = null;

// 4. Mount Tactical HUD with Event Callbacks
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
    // Quick Skirmish Battle Restart
    isCampaignBattle = false;
    hasHandledBattleOutcome = false;
    currentAiProfile = profile;
    currentEngine = new GameEngine({
      aiProfile: currentAiProfile,
      seed: Math.floor(Math.random() * 1000000),
    });
    hud.invalidateGrid();
    hud.updateCampaignBanner([], 0, 0);
    battleScene?.resetGame(currentEngine);
  },
  onOpenCampaignMap: () => {
    campaignOverlay.show('MAP');
  },
  onResetCampaign: () => {
    if (confirm('Reiniciar a campanha do Ato 1? Seu progresso salvo será redefinido.')) {
      resetCampaignRun();
    }
  },
});

// Sync initial campaign banner state in HUD
syncHudCampaignBanner();

// 5. Mount Roguelike Campaign Overlay Suite
const campaignOverlay = new CampaignOverlay(document.body, campaign, {
  onStartBattle: (node: CampaignNode) => {
    startCampaignNodeBattle(node);
  },
  onCampaignReset: () => {
    resetCampaignRun();
  },
  onCloseMap: () => {
    // If not in battle, user can view the background corridor
  },
});

// Helper: Starts a campaign battle for the given node
function startCampaignNodeBattle(_node: CampaignNode): void {
  isCampaignBattle = true;
  hasHandledBattleOutcome = false;

  const engineOptions = campaign.createBattleEngineOptions();
  currentEngine = new GameEngine(engineOptions);
  hud.invalidateGrid();
  hud.hideGameOverModal();
  syncHudCampaignBanner();

  campaignOverlay.hide();
  battleScene?.resetGame(currentEngine);
}

// Helper: Resets the entire campaign run
function resetCampaignRun(): void {
  CampaignStorage.clear();
  campaign = new CampaignManager(Date.now());
  CampaignStorage.save(campaign);
  campaignOverlay.setCampaign(campaign);
  syncHudCampaignBanner();
  campaignOverlay.show('MAP');
}

// Helper: Updates the tactical HUD campaign modifiers bar
function syncHudCampaignBanner(): void {
  hud.updateCampaignBanner(
    campaign.state.activeRelicIds,
    campaign.state.campaignDamageBonus,
    campaign.state.nextBattleBonusGold
  );
}

// Show the Campaign Map by default when opening the game
campaignOverlay.show('MAP');

// 6. Initialize Phaser 3 Game Instance
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

// 7. Continuous HUD Update Loop & Post-Battle Outcome Resolution
function uiUpdateLoop() {
  if (battleScene) {
    const snapshot = currentEngine.getSnapshot();

    hud.update(
      snapshot,
      soundSynthesizer,
      battleScene.isGamePaused(),
      battleScene.getSimulationSpeed(),
      battleScene.getCameraMode(),
      isCampaignBattle
    );

    // Handle Campaign Post-Battle Lifecycle
    if (snapshot.isGameOver && !hasHandledBattleOutcome) {
      hasHandledBattleOutcome = true;

      if (isCampaignBattle) {
        hud.hideGameOverModal();
        const isPlayerWinner = snapshot.winnerTeam === 'PLAYER';
        const remainingCitadelHp = snapshot.citadels.PLAYER.currentHp;

        // Apply campaign resolution and persist
        campaign.completeBattle({
          isPlayerWinner,
          playerCitadelFinalHp: remainingCitadelHp,
        });
        CampaignStorage.save(campaign);
        syncHudCampaignBanner();

        // Delay slightly for dramatic battle end before opening reward/map screen
        setTimeout(() => {
          if (!isPlayerWinner || campaign.state.playerCitadelHp <= 0) {
            campaignOverlay.show('RUN_OVER');
          } else if (campaign.state.isVictory) {
            campaignOverlay.show('RUN_VICTORY');
          } else if (campaign.rewardRelicChoices.length > 0) {
            campaignOverlay.show('RELIC_REWARD');
          } else {
            campaignOverlay.show('MAP');
          }
        }, 1200);
      }
    }
  }

  requestAnimationFrame(uiUpdateLoop);
}

requestAnimationFrame(uiUpdateLoop);
