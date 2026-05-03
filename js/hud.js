// js/hud.js — HUD manager
export class HUD {
  constructor() {
    this._healthFill   = document.getElementById('health-fill');
    this._staminaFill  = document.getElementById('stamina-fill');
    this._ammoCurrent  = document.getElementById('ammo-current');
    this._ammoReserve  = document.getElementById('ammo-reserve');
    this._weaponName   = document.getElementById('weapon-name');
    this._noWeapon     = document.getElementById('no-weapon');
    this._armed        = document.getElementById('armed');
    this._killsEl      = document.getElementById('kills');
    this._waveText     = document.getElementById('wave-text');
    this._enemyCount   = document.getElementById('enemy-count');
    this._killfeed     = document.getElementById('killfeed');
    this._pickupPrompt = document.getElementById('pickup-prompt');
    this._reloadFlash  = document.getElementById('reload-flash');
    this._finalScore   = document.getElementById('final-score');

    this._canvas = document.getElementById('minimap-canvas');
    this._ctx    = this._canvas.getContext('2d');

    this.kills   = 0;
    this.wave    = 1;
  }

  update(player, combat, enemyMgr) {
    // Health bar
    const hp = Math.max(0, player.health / player.maxHealth * 100);
    this._healthFill.style.width = hp + '%';
    if (hp < 25) {
      this._healthFill.style.background = '#e53935';
    } else if (hp < 50) {
      this._healthFill.style.background = 'linear-gradient(90deg,#ff6f00,#ffcc02)';
    } else {
      this._healthFill.style.background = 'linear-gradient(90deg,#e53935,#ef9a9a)';
    }

    // Stamina bar
    const st = Math.max(0, player.stamina / player.maxStamina * 100);
    this._staminaFill.style.width = st + '%';

    // Weapon / ammo
    const w = combat.equippedWeapon;
    if (w) {
      this._noWeapon.style.display = 'none';
      this._armed.style.display    = 'block';
      this._weaponName.textContent = w.name.toUpperCase();
      this._ammoCurrent.textContent = w.ammo;
      this._ammoReserve.textContent = '/ ' + w.reserve;
      this._ammoCurrent.style.color = w.ammo === 0 ? '#e53935' : '#fff';
    } else {
      this._noWeapon.style.display = 'block';
      this._armed.style.display    = 'none';
    }

    // Kills / wave
    this._killsEl.textContent  = 'Kills: ' + this.kills;
    this._waveText.textContent  = 'Wave ' + this.wave;
    this._enemyCount.textContent = 'Enemies: ' + enemyMgr.aliveCount();

    // Reload flash
    this._reloadFlash.style.display = (w && w.reloading) ? 'block' : 'none';

    // Pickup prompt
    this._pickupPrompt.style.display = combat.nearbyWeapon ? 'block' : 'none';

    // Minimap
    this._drawMinimap(player, enemyMgr, combat);
  }

  addKill() {
    this.kills++;
    const msg = document.createElement('div');
    msg.className = 'kill-msg';
    msg.textContent = '☠ Zombie eliminated';
    this._killfeed.appendChild(msg);
    setTimeout(() => msg.remove(), 2600);
  }

  showGameOver(kills, wave) {
    const go = document.getElementById('gameover');
    this._finalScore.textContent = `Wave ${wave} — ${kills} kills`;
    go.style.display = 'flex';
  }

  _drawMinimap(player, enemyMgr, combat) {
    const ctx = this._ctx;
    const W = 140, R = W / 2;
    const RANGE = 80; // world units visible on minimap

    ctx.clearRect(0, 0, W, W);

    // Background
    ctx.fillStyle = 'rgba(10,30,10,0.85)';
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, Math.PI * 2);
    ctx.fill();

    const toScreen = (wx, wz) => {
      const dx = wx - player.mesh.position.x;
      const dz = wz - player.mesh.position.z;
      // Rotate by player facing (camera yaw)
      const cos = Math.cos(-player.yaw);
      const sin = Math.sin(-player.yaw);
      const rx = dx * cos - dz * sin;
      const rz = dx * sin + dz * cos;
      return [R + (rx / RANGE) * R, R + (rz / RANGE) * R];
    };

    // Draw weapon pickups
    for (const wp of combat.droppedWeapons) {
      const [sx, sy] = toScreen(wp.mesh.position.x, wp.mesh.position.z);
      ctx.fillStyle = '#ffb300';
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw zombies
    for (const z of enemyMgr.zombies) {
      if (z.isDead) continue;
      const [sx, sy] = toScreen(z.mesh.position.x, z.mesh.position.z);
      ctx.fillStyle = z.state === 'chase' ? '#ff1744' : '#ff6e40';
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player dot (center, pointing up)
    ctx.fillStyle = '#4caf50';
    ctx.beginPath();
    ctx.arc(R, R, 5, 0, Math.PI * 2);
    ctx.fill();
    // Arrow for player direction
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(R, R - 8);
    ctx.lineTo(R, R);
    ctx.stroke();

    // Clip to circle
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
