// js/main.js — Game initialisation and main loop
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

import { Player }        from './player.js';
import { World }         from './world.js';
import { EnemyManager }  from './enemies.js';
import { CombatSystem }  from './combat.js';
import { HUD }           from './hud.js';

// ──────────────────────────────────────────────────────────────────────────────
// Scene / Renderer
// ──────────────────────────────────────────────────────────────────────────────
const canvas   = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.toneMapping       = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;

const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog        = new THREE.Fog(0x87ceeb, 60, 240);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
scene.add(camera);

// ──────────────────────────────────────────────────────────────────────────────
// Lighting
// ──────────────────────────────────────────────────────────────────────────────
const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfffde7, 1.2);
sun.position.set(60, 100, 40);
sun.castShadow            = true;
sun.shadow.mapSize.width  = 2048;
sun.shadow.mapSize.height = 2048;
sun.shadow.camera.near    = 1;
sun.shadow.camera.far     = 400;
sun.shadow.camera.left    = -150;
sun.shadow.camera.right   = 150;
sun.shadow.camera.top     = 150;
sun.shadow.camera.bottom  = -150;
scene.add(sun);

const hemi = new THREE.HemisphereLight(0x87ceeb, 0x2d6a2d, 0.4);
scene.add(hemi);

// ──────────────────────────────────────────────────────────────────────────────
// Physics world
// ──────────────────────────────────────────────────────────────────────────────
const physWorld = new CANNON.World({
  gravity: new CANNON.Vec3(0, -22, 0),
});
physWorld.broadphase = new CANNON.SAPBroadphase(physWorld);
physWorld.allowSleep = true;

// ──────────────────────────────────────────────────────────────────────────────
// Game objects (initialised on game start)
// ──────────────────────────────────────────────────────────────────────────────
let world, player, enemyMgr, combat, hud;
let gameRunning = false;
let gameOver    = false;

function initGame() {
  // Clear old scene objects if restarting
  scene.children = scene.children.filter(
    c => c instanceof THREE.AmbientLight ||
         c instanceof THREE.DirectionalLight ||
         c instanceof THREE.HemisphereLight ||
         c === camera
  );
  physWorld.bodies.slice().forEach(b => physWorld.removeBody(b));

  world    = new World(scene, physWorld);
  player   = new Player(scene, physWorld, camera);
  enemyMgr = new EnemyManager(scene, physWorld);
  combat   = new CombatSystem(scene, enemyMgr);
  hud      = new HUD();

  // Spawn initial weapon pickups around the map
  for (const pos of world.getWeaponSpawnPositions()) {
    const types = ['pistol', 'rifle', 'shotgun'];
    combat.addWeapon(types[Math.floor(Math.random() * types.length)], pos);
  }

  // Spawn first wave
  enemyMgr.spawnWave(player.mesh.position, 6, null);

  gameRunning = true;
  gameOver    = false;

  document.getElementById('gameover').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
}

// ──────────────────────────────────────────────────────────────────────────────
// Pointer lock
// ──────────────────────────────────────────────────────────────────────────────
function requestLock() {
  canvas.requestPointerLock();
}

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && gameRunning && !gameOver) {
    // Pointer unlocked — show simple reminder
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Resize handler
// ──────────────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ──────────────────────────────────────────────────────────────────────────────
// UI buttons
// ──────────────────────────────────────────────────────────────────────────────
document.getElementById('startBtn').addEventListener('click', () => {
  document.getElementById('overlay').style.display = 'none';
  initGame();
  requestLock();
});

document.getElementById('restartBtn').addEventListener('click', () => {
  initGame();
  requestLock();
});

canvas.addEventListener('click', () => {
  if (gameRunning && !document.pointerLockElement) {
    requestLock();
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Fixed-step physics accumulator
// ──────────────────────────────────────────────────────────────────────────────
const FIXED_DT   = 1 / 60;
let   accumulator = 0;
let   lastTime    = 0;

// ──────────────────────────────────────────────────────────────────────────────
// Main loop
// ──────────────────────────────────────────────────────────────────────────────
function loop(now) {
  requestAnimationFrame(loop);

  if (!gameRunning) {
    renderer.render(scene, camera);
    return;
  }

  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  // Physics (fixed step)
  accumulator += dt;
  while (accumulator >= FIXED_DT) {
    physWorld.step(FIXED_DT);
    accumulator -= FIXED_DT;
  }

  // Player
  player.update(dt);

  // Combat
  combat.update(dt, player);

  // Enemies
  enemyMgr.update(
    dt,
    player.mesh.position,
    (dmg) => {
      player.takeDamage(dmg);
      if (player.isDead && !gameOver) {
        gameOver = true;
        gameRunning = false;
        document.exitPointerLock();
        hud.showGameOver(hud.kills, enemyMgr.wave);
      }
    },
    (zombie) => {
      hud.addKill();
    }
  );

  // HUD sync wave number
  hud.wave = enemyMgr.wave;
  hud.update(player, combat, enemyMgr);

  // Render
  renderer.render(scene, camera);
}

requestAnimationFrame((now) => {
  lastTime = now;
  loop(now);
});
