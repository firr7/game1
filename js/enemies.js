// js/enemies.js — Zombie AI with Patrol / Chase / Attack state machine
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const PATROL_SPEED  = 2.5;
const CHASE_SPEED   = 5.0;
const ATTACK_RANGE  = 1.8;
const CHASE_RANGE   = 22;
const ATTACK_DAMAGE = 12;
const ATTACK_CD     = 1.2;   // seconds between attacks
const ZOMBIE_HP     = 60;

const rng = (() => {
  let s = 123;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
})();

// Simple seeded random vector for patrol waypoints
function randVec(cx, cz, radius) {
  const angle = rng() * Math.PI * 2;
  const r     = rng() * radius;
  return new THREE.Vector3(cx + Math.cos(angle) * r, 0, cz + Math.sin(angle) * r);
}

class Zombie {
  constructor(scene, physicsWorld, position) {
    this.scene = scene;
    this.phys  = physicsWorld;

    this.health   = ZOMBIE_HP;
    this.isDead   = false;
    this.state    = 'patrol';
    this._attackTimer = 0;
    this._patrolTarget = randVec(position.x, position.z, 15);
    this._patrolTimer  = 0;
    this._deathTimer   = 0;

    this._buildMesh(position);
    this._buildBody(position);
  }

  _buildMesh(pos) {
    const group = new THREE.Group();

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.55, 0.8, 0.4);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4a7c59 });
    const body    = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.4;
    group.add(body);

    // Head
    const headGeo = new THREE.BoxGeometry(0.38, 0.38, 0.38);
    const headMat = new THREE.MeshLambertMaterial({ color: 0x558b2f });
    const head    = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.02;
    group.add(head);

    // Eyes (glowing red)
    const eyeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.06);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff1744 });
    const eyeL   = new THREE.Mesh(eyeGeo, eyeMat);
    const eyeR   = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.1, 1.05, 0.2);
    eyeR.position.set( 0.1, 1.05, 0.2);
    group.add(eyeL, eyeR);

    // Arms (outstretched)
    const armGeo = new THREE.BoxGeometry(0.2, 0.55, 0.2);
    const armMat = new THREE.MeshLambertMaterial({ color: 0x4a7c59 });
    const armL   = new THREE.Mesh(armGeo, armMat);
    const armR   = new THREE.Mesh(armGeo, armMat);
    armL.position.set(-0.42, 0.55, 0.1);
    armR.position.set( 0.42, 0.55, 0.1);
    armL.rotation.x = -0.7;
    armR.rotation.x = -0.7;
    group.add(armL, armR);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.22, 0.65, 0.22);
    const legL2  = new THREE.Mesh(legGeo, bodyMat);
    const legR2  = new THREE.Mesh(legGeo, bodyMat);
    legL2.position.set(-0.16, -0.33, 0);
    legR2.position.set( 0.16, -0.33, 0);
    group.add(legL2, legR2);

    group.castShadow = true;
    group.position.copy(pos);
    this.mesh = group;
    this.scene.add(group);

    // Health bar (sprite-like plane)
    const hbGeo = new THREE.PlaneGeometry(0.8, 0.1);
    const hbMat = new THREE.MeshBasicMaterial({ color: 0x00e676, depthTest: false });
    this._hpBar     = new THREE.Mesh(hbGeo, hbMat);
    this._hpBar.position.set(0, 1.6, 0);
    this.mesh.add(this._hpBar);

    const hbBgGeo = new THREE.PlaneGeometry(0.8, 0.1);
    const hbBgMat = new THREE.MeshBasicMaterial({ color: 0x333333, depthTest: false });
    this._hpBarBg  = new THREE.Mesh(hbBgGeo, hbBgMat);
    this._hpBarBg.position.set(0, 1.6, -0.001);
    this.mesh.add(this._hpBarBg);
  }

  _buildBody(pos) {
    this.body = new CANNON.Body({
      mass: 50,
      linearDamping: 0.95,
      angularDamping: 1.0,
    });
    this.body.addShape(new CANNON.Sphere(0.55));
    this.body.position.set(pos.x, 1.0, pos.z);
    this.body.fixedRotation = true;
    this.body.updateMassProperties();
    this.phys.addBody(this.body);
  }

  takeDamage(amount) {
    if (this.isDead) return;
    this.health -= amount;
    // Flash red briefly
    this.mesh.children[0].material.color.setHex(0xff1744);
    setTimeout(() => {
      if (!this.isDead && this.mesh.children[0])
        this.mesh.children[0].material.color.setHex(0x4a7c59);
    }, 120);

    if (this.health <= 0) this._die();
  }

  _die() {
    this.isDead = true;
    this.state  = 'dead';
    // Fall down
    this.mesh.rotation.z = Math.PI / 2;
    this.mesh.position.y = 0;
    this.body.velocity.set(0, 0, 0);
    this.body.type = CANNON.Body.STATIC;
    // Remove health bar
    if (this._hpBar) this._hpBar.visible = false;
    if (this._hpBarBg) this._hpBarBg.visible = false;
  }

  remove() {
    this.scene.remove(this.mesh);
    this.phys.removeBody(this.body);
  }

  update(dt, playerPos, playerHealth, onAttack) {
    if (this.isDead) {
      // Fade out after 8s
      this._deathTimer += dt;
      if (this._deathTimer > 8) this.remove();
      return;
    }

    this._attackTimer = Math.max(0, this._attackTimer - dt);
    this._patrolTimer = Math.max(0, this._patrolTimer - dt);

    const myPos  = new THREE.Vector3(this.body.position.x, 0, this.body.position.z);
    const pPos   = new THREE.Vector3(playerPos.x, 0, playerPos.z);
    const dist   = myPos.distanceTo(pPos);

    // State transitions
    if (dist <= ATTACK_RANGE) {
      this.state = 'attack';
    } else if (dist <= CHASE_RANGE) {
      this.state = 'chase';
    } else {
      this.state = 'patrol';
    }

    switch (this.state) {
      case 'patrol':  this._doPatrol(dt, myPos); break;
      case 'chase':   this._doChase(dt, myPos, pPos); break;
      case 'attack':  this._doAttack(dt, onAttack); break;
    }

    // Sync mesh to physics
    this.mesh.position.x = this.body.position.x;
    this.mesh.position.z = this.body.position.z;
    this.mesh.position.y = this.body.position.y - 0.55;

    // Face movement direction
    const velX = this.body.velocity.x;
    const velZ = this.body.velocity.z;
    if (Math.abs(velX) + Math.abs(velZ) > 0.5) {
      this.mesh.rotation.y = Math.atan2(velX, velZ) + Math.PI;
    }

    // Walk animation
    const t = performance.now() / 1000;
    const speed = this.state === 'chase' ? 8 : 4;
    const legL = this.mesh.children[7];
    const legR = this.mesh.children[8];
    if (legL && legR) {
      legL.rotation.x =  Math.sin(t * speed) * 0.4;
      legR.rotation.x = -Math.sin(t * speed) * 0.4;
    }

    // HP bar always faces camera (billboard)
    if (this._hpBar) {
      const frac = Math.max(0, this.health / ZOMBIE_HP);
      this._hpBar.scale.x = frac;
      this._hpBar.position.x = (frac - 1) * 0.4;
      this._hpBar.material.color.setHex(
        frac > 0.5 ? 0x00e676 : frac > 0.25 ? 0xffb300 : 0xff1744
      );
      // Face along Z axis (rough billboard)
      this._hpBar.lookAt(
        this._hpBar.getWorldPosition(new THREE.Vector3()).clone().add(new THREE.Vector3(0, 0, 1))
      );
    }
  }

  _doPatrol(dt, myPos) {
    if (this._patrolTimer <= 0) {
      // Pick a new patrol target
      this._patrolTarget = randVec(myPos.x, myPos.z, 12);
      this._patrolTimer  = 3 + rng() * 4;
    }

    const dir = new THREE.Vector3(
      this._patrolTarget.x - myPos.x,
      0,
      this._patrolTarget.z - myPos.z
    );
    const len = dir.length();
    if (len > 1.0) {
      dir.normalize().multiplyScalar(PATROL_SPEED);
      this.body.velocity.x = dir.x;
      this.body.velocity.z = dir.z;
    } else {
      this.body.velocity.x = 0;
      this.body.velocity.z = 0;
      this._patrolTimer = 0;
    }
  }

  _doChase(dt, myPos, playerPos) {
    const dir = new THREE.Vector3(
      playerPos.x - myPos.x,
      0,
      playerPos.z - myPos.z
    ).normalize().multiplyScalar(CHASE_SPEED);
    this.body.velocity.x = dir.x;
    this.body.velocity.z = dir.z;
  }

  _doAttack(dt, onAttack) {
    // Stop moving
    this.body.velocity.x *= 0.8;
    this.body.velocity.z *= 0.8;

    if (this._attackTimer <= 0) {
      this._attackTimer = ATTACK_CD;
      onAttack(ATTACK_DAMAGE);
    }
  }
}

export class EnemyManager {
  constructor(scene, physicsWorld) {
    this.scene    = scene;
    this.phys     = physicsWorld;
    this.zombies  = [];
    this._wave    = 1;
    this._waveTimer = 0;
    this._wavePause = 8;  // seconds between waves
    this._inWave    = false;
    this._waveActive = false;
  }

  spawnWave(playerPos, count, spawnFn) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rng() * 0.3;
      const r     = 35 + rng() * 30;
      const pos   = new THREE.Vector3(
        playerPos.x + Math.cos(angle) * r,
        1,
        playerPos.z + Math.sin(angle) * r
      );
      this.zombies.push(new Zombie(this.scene, this.phys, pos));
    }
    this._waveActive = true;
  }

  aliveCount() {
    return this.zombies.filter(z => !z.isDead).length;
  }

  get wave() { return this._wave; }

  update(dt, playerPos, onPlayerHit, onKill) {
    // Remove long-dead zombies
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      if (z.isDead && z._deathTimer > 8) {
        this.zombies.splice(i, 1);
      }
    }

    // Update alive zombies
    for (const z of this.zombies) {
      const wasAlive = !z.isDead;
      z.update(dt, playerPos, null, (dmg) => onPlayerHit(dmg));
      if (wasAlive && z.isDead) onKill(z);
    }

    // Wave management
    if (this._waveActive && this.aliveCount() === 0) {
      this._waveActive = false;
      this._waveTimer  = this._wavePause;
    }

    if (!this._waveActive) {
      this._waveTimer -= dt;
      if (this._waveTimer <= 0) {
        this._wave++;
        const count = 5 + this._wave * 2;
        this.spawnWave(playerPos, Math.min(count, 30), null);
      }
    }
  }

  // Raycast hit test — returns first zombie hit within maxDist
  raycastHit(origin, direction, maxDist) {
    const ray = new THREE.Ray(origin, direction.clone().normalize());
    let closest = null;
    let closestDist = maxDist;

    for (const z of this.zombies) {
      if (z.isDead) continue;
      const sphere = new THREE.Sphere(z.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 0.65);
      const point  = new THREE.Vector3();
      if (ray.intersectSphere(sphere, point)) {
        const d = origin.distanceTo(point);
        if (d < closestDist) {
          closestDist = d;
          closest     = z;
        }
      }
    }
    return closest;
  }
}
