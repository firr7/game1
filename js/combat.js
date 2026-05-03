// js/combat.js — Weapon definitions, pickup, shooting, impact effects
import * as THREE from 'three';

const WEAPON_DEFS = {
  pistol: {
    name: 'Pistol',
    damage: 25,
    ammo: 12,
    reserve: 60,
    fireRate: 0.4,    // seconds between shots
    reloadTime: 1.5,
    range: 80,
    color: 0x607d8b,
  },
  rifle: {
    name: 'Assault Rifle',
    damage: 18,
    ammo: 30,
    reserve: 120,
    fireRate: 0.1,
    reloadTime: 2.2,
    range: 120,
    color: 0x3e2723,
  },
  shotgun: {
    name: 'Shotgun',
    damage: 15,    // per pellet × 6
    ammo: 8,
    reserve: 32,
    fireRate: 0.8,
    reloadTime: 2.5,
    range: 30,
    pellets: 6,
    color: 0x4e342e,
  },
};

class DroppedWeapon {
  constructor(scene, type, position) {
    this.type = type;
    this.def  = WEAPON_DEFS[type];
    this._buildMesh(scene, position);
  }

  _buildMesh(scene, pos) {
    const geo  = new THREE.BoxGeometry(0.5, 0.15, 0.15);
    const mat  = new THREE.MeshLambertMaterial({ color: this.def.color });
    this.mesh  = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(pos);
    this.mesh.position.y = 0.4;
    scene.add(this.mesh);

    // Floating ring
    const ringGeo = new THREE.TorusGeometry(0.3, 0.03, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffb300 });
    this._ring    = new THREE.Mesh(ringGeo, ringMat);
    this._ring.rotation.x = Math.PI / 2;
    this.mesh.add(this._ring);
  }

  update(dt) {
    this.mesh.rotation.y += dt * 1.5;
    this.mesh.position.y  = 0.4 + Math.sin(performance.now() / 600) * 0.12;
  }

  remove(scene) {
    scene.remove(this.mesh);
  }
}

class EquippedWeapon {
  constructor(def) {
    this.name       = def.name;
    this.damage     = def.damage;
    this.ammo       = def.ammo;
    this.reserve    = def.reserve;
    this.fireRate   = def.fireRate;
    this.reloadTime = def.reloadTime;
    this.range      = def.range;
    this.pellets    = def.pellets || 1;
    this.reloading  = false;
    this._fireCooldown  = 0;
    this._reloadTimer   = 0;
  }

  canFire()    { return this.ammo > 0 && !this.reloading && this._fireCooldown <= 0; }
  isEmpty()    { return this.ammo === 0 && this.reserve === 0; }
  getMaxAmmo() { return this.pellets > 1 ? 8 : (this.fireRate < 0.15 ? 30 : 12); }

  fire() {
    if (!this.canFire()) return false;
    this.ammo--;
    this._fireCooldown = this.fireRate;
    if (this.ammo === 0 && this.reserve > 0) this.startReload();
    return true;
  }

  startReload() {
    if (this.reloading || this.reserve === 0) return;
    this.reloading     = true;
    this._reloadTimer  = this.reloadTime;
  }

  update(dt) {
    this._fireCooldown = Math.max(0, this._fireCooldown - dt);
    if (this.reloading) {
      this._reloadTimer -= dt;
      if (this._reloadTimer <= 0) {
        const maxAmmo = this.getMaxAmmo();
        const fill    = Math.min(this.reserve, maxAmmo - this.ammo);
        this.ammo    += fill;
        this.reserve -= fill;
        this.reloading = false;
      }
    }
  }
}

export class CombatSystem {
  constructor(scene, enemyManager) {
    this.scene          = scene;
    this.enemyMgr       = enemyManager;
    this.equippedWeapon = null;
    this.droppedWeapons = [];
    this.nearbyWeapon   = null;

    this._muzzleFlash   = this._createMuzzleFlash();
    this._flashTimer    = 0;
    this._shootPressed  = false;

    this._bindInput();
  }

  _createMuzzleFlash() {
    const geo  = new THREE.SphereGeometry(0.15, 6, 6);
    const mat  = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    this.scene.add(mesh);
    return mesh;
  }

  _bindInput() {
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0 && document.pointerLockElement) {
        this._shootPressed = true;
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._shootPressed = false;
    });
    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyR' && this.equippedWeapon && !this.equippedWeapon.reloading) {
        const maxAmmo = this.equippedWeapon.getMaxAmmo();
        if (this.equippedWeapon.ammo < maxAmmo) {
          this.equippedWeapon.startReload();
        }
      }
      if (e.code === 'KeyE' && this.nearbyWeapon) {
        this._pickupWeapon(this.nearbyWeapon);
      }
    });
  }

  addWeapon(type, position) {
    this.droppedWeapons.push(new DroppedWeapon(this.scene, type, position));
  }

  _pickupWeapon(dropped) {
    const def = WEAPON_DEFS[dropped.type];
    this.equippedWeapon = new EquippedWeapon(def);
    dropped.remove(this.scene);
    const idx = this.droppedWeapons.indexOf(dropped);
    if (idx !== -1) this.droppedWeapons.splice(idx, 1);
    this.nearbyWeapon = null;
  }

  shoot(player, onHit) {
    if (!this.equippedWeapon) return;
    if (!this.equippedWeapon.fire()) return;

    const ray    = player.getAimRay();
    const pellets = this.equippedWeapon.pellets;

    for (let p = 0; p < pellets; p++) {
      // Spread for shotgun
      const spread = pellets > 1 ? 0.06 : 0.005;
      const dir = ray.dir.clone().add(
        new THREE.Vector3(
          (Math.random() - 0.5) * spread,
          (Math.random() - 0.5) * spread,
          (Math.random() - 0.5) * spread
        )
      ).normalize();

      const hit = this.enemyMgr.raycastHit(ray.origin, dir, this.equippedWeapon.range);
      if (hit) {
        hit.takeDamage(this.equippedWeapon.damage);
        onHit && onHit(hit);
        this._spawnImpact(ray.origin.clone().add(dir.clone().multiplyScalar(
          ray.origin.distanceTo(hit.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)))
        )));
      } else {
        // Bullet tracer
        this._spawnImpact(ray.origin.clone().add(dir.clone().multiplyScalar(
          Math.min(this.equippedWeapon.range, 30)
        )));
      }
    }

    // Muzzle flash
    this._muzzleFlash.position.copy(ray.origin).add(ray.dir.clone().multiplyScalar(0.5));
    this._muzzleFlash.visible = true;
    this._flashTimer = 0.06;
  }

  _spawnImpact(pos) {
    const geo  = new THREE.SphereGeometry(0.08, 4, 4);
    const mat  = new THREE.MeshBasicMaterial({ color: 0xffe082 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    setTimeout(() => this.scene.remove(mesh), 150);
  }

  update(dt, player) {
    // Update equipped weapon cooldowns / reload
    if (this.equippedWeapon) {
      this.equippedWeapon.update(dt);
    }

    // Auto-fire (hold mouse)
    if (this._shootPressed && this.equippedWeapon) {
      this.shoot(player, null);
    }

    // Muzzle flash timeout
    this._flashTimer -= dt;
    if (this._flashTimer <= 0) this._muzzleFlash.visible = false;

    // Update dropped weapons
    for (const w of this.droppedWeapons) w.update(dt);

    // Nearby weapon detection
    if (!player) return;
    const pPos = player.mesh.position;
    this.nearbyWeapon = null;
    for (const w of this.droppedWeapons) {
      const d = pPos.distanceTo(w.mesh.position);
      if (d < 3.0) { this.nearbyWeapon = w; break; }
    }
  }
}
