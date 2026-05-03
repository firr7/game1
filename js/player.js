// js/player.js — Player controller with TPS camera, physics, stamina & health
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const WALK_SPEED    = 7;
const SPRINT_SPEED  = 13;
const JUMP_VEL      = 9;
const MAX_HEALTH    = 100;
const MAX_STAMINA   = 100;
const STAMINA_DRAIN = 22;   // per second while sprinting
const STAMINA_REGEN = 12;   // per second while idle/walking
const CAM_DIST      = 4.5;
const CAM_HEIGHT    = 1.6;
const CAM_SHOULDER  = 0.55;
const CAM_SENSE     = 0.0022;
const PITCH_MIN     = -0.45;
const PITCH_MAX     = 0.65;

export class Player {
  constructor(scene, physicsWorld, camera) {
    this.scene   = scene;
    this.phys    = physicsWorld;
    this.camera  = camera;

    this.health    = MAX_HEALTH;
    this.maxHealth = MAX_HEALTH;
    this.stamina   = MAX_STAMINA;
    this.maxStamina = MAX_STAMINA;
    this.isDead    = false;

    this.yaw   = 0;
    this.pitch = 0;

    this._keys    = {};
    this._onGround = false;
    this._jumpCooldown = 0;

    this._buildMesh();
    this._buildBody();
    this._bindInput();
  }

  _buildMesh() {
    const group = new THREE.Group();

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.6, 0.8, 0.35);
    const mat      = new THREE.MeshLambertMaterial({ color: 0x1565c0 });
    const torso    = new THREE.Mesh(torsoGeo, mat);
    torso.position.y = 0.4;
    group.add(torso);

    // Head
    const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffcc80 });
    const head    = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.05;
    group.add(head);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.25, 0.7, 0.25);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x37474f });
    const legL   = new THREE.Mesh(legGeo, legMat);
    const legR   = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.17, -0.35, 0);
    legR.position.set( 0.17, -0.35, 0);
    group.add(legL, legR);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
    const armL   = new THREE.Mesh(armGeo, mat);
    const armR   = new THREE.Mesh(armGeo, mat);
    armL.position.set(-0.42, 0.35, 0);
    armR.position.set( 0.42, 0.35, 0);
    group.add(armL, armR);

    group.castShadow = true;
    this.mesh  = group;
    this._legL = legL;
    this._legR = legR;
    this.scene.add(group);
  }

  _buildBody() {
    this.body = new CANNON.Body({
      mass: 70,
      linearDamping: 0.0,
      angularDamping: 1.0,
    });
    this.body.addShape(new CANNON.Sphere(0.55));
    this.body.position.set(0, 3, 0);
    this.body.fixedRotation = true;
    this.body.allowSleep = false; // prevent body from sleeping so velocity changes always apply
    this.body.updateMassProperties();
    this.phys.addBody(this.body);

    // Coyote-time ground detection: collision sets a grace-period timer
    this._groundTimer = 0;
    this.body.addEventListener('collide', (e) => {
      const contact = e.contact;
      // ni points from bi toward bj; negate when this body is bi so we always get
      // the normal pointing away from the surface and toward the player.
      const normalY = (contact.bi === this.body) ? -contact.ni.y : contact.ni.y;
      if (normalY > 0.5) {
        this._groundTimer = 0.18; // 180 ms grace window
      }
    });
  }

  _bindInput() {
    document.addEventListener('keydown', (e) => {
      this._keys[e.code] = true;
      if (e.code === 'Space' && this._onGround && this._jumpCooldown <= 0) {
        this.body.velocity.y = JUMP_VEL;
        this._onGround = false;
        this._jumpCooldown = 0.25;
      }
    });
    document.addEventListener('keyup', (e) => {
      this._keys[e.code] = false;
    });

    document.addEventListener('mousemove', (e) => {
      if (!document.pointerLockElement) return;
      this.yaw   -= e.movementX * CAM_SENSE;
      this.pitch -= e.movementY * CAM_SENSE;
      this.pitch  = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.pitch));
    });
  }

  takeDamage(amount) {
    if (this.isDead) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health === 0) this.isDead = true;
  }

  update(dt) {
    if (this.isDead) return;

    this._jumpCooldown = Math.max(0, this._jumpCooldown - dt);
    this._groundTimer  = Math.max(0, this._groundTimer - dt);
    this._onGround     = this._groundTimer > 0;

    // Movement direction
    const isSprinting = this._keys['ShiftLeft'] || this._keys['ShiftRight'];
    let moving = false;

    const dir = new THREE.Vector3();
    if (this._keys['KeyW'] || this._keys['ArrowUp'])    dir.z -= 1;
    if (this._keys['KeyS'] || this._keys['ArrowDown'])  dir.z += 1;
    if (this._keys['KeyA'] || this._keys['ArrowLeft'])  dir.x -= 1;
    if (this._keys['KeyD'] || this._keys['ArrowRight']) dir.x += 1;

    if (dir.lengthSq() > 0) {
      moving = true;
      dir.normalize();
      // Apply yaw rotation
      dir.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), this.yaw
      ));
    }

    // Stamina
    const canSprint = isSprinting && moving && this.stamina > 0;
    if (canSprint) {
      this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN * dt);
    } else {
      this.stamina = Math.min(MAX_STAMINA, this.stamina + STAMINA_REGEN * dt);
    }

    const speed = canSprint ? SPRINT_SPEED : WALK_SPEED;

    // Apply velocity (preserve Y for gravity/jump)
    this.body.velocity.x = dir.x * speed;
    this.body.velocity.z = dir.z * speed;

    // Sync mesh to body
    this.mesh.position.copy(this.body.position);
    this.mesh.position.y -= 0.55; // offset so feet touch ground

    // Face direction of movement
    if (moving) {
      const targetAngle = Math.atan2(dir.x, dir.z) + Math.PI;
      this.mesh.rotation.y = targetAngle;
    }

    // Leg animation (simple bob)
    if (moving) {
      const t = performance.now() / 1000;
      const freq = canSprint ? 8 : 5;
      if (this._legL && this._legR) {
        this._legL.rotation.x =  Math.sin(t * freq) * 0.5;
        this._legR.rotation.x = -Math.sin(t * freq) * 0.5;
      }
    }

    // Update camera
    this._updateCamera();
  }

  _updateCamera() {
    const playerPos = this.mesh.position.clone();
    playerPos.y += 1.0; // camera pivot at chest height

    // Offset: right shoulder, behind, above
    const offset = new THREE.Vector3(CAM_SHOULDER, CAM_HEIGHT, CAM_DIST);
    const qYaw   = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), this.yaw);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), this.pitch);
    const q      = new THREE.Quaternion().multiplyQuaternions(qYaw, qPitch);
    offset.applyQuaternion(q);

    this.camera.position.copy(playerPos).add(offset);

    // Aim point: build a forward vector that respects BOTH yaw and pitch so
    // the camera always frames the player correctly at any look angle.
    const cosPitch = Math.cos(this.pitch);
    const aimDir = new THREE.Vector3(
      -Math.sin(this.yaw) * cosPitch * 30,
       Math.sin(this.pitch)            * 30,
      -Math.cos(this.yaw) * cosPitch * 30
    );
    this.camera.lookAt(playerPos.clone().add(aimDir));
  }

  getAimDirection() {
    // Direction camera is looking (forward)
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return dir;
  }

  getAimRay() {
    const origin = this.camera.position.clone();
    const dir    = this.getAimDirection();
    return { origin, dir };
  }
}
