// js/world.js — Environment generation (Forest + Village biomes)
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createRNG } from './rng.js';

const rng = createRNG(42);

export class World {
  constructor(scene, physicsWorld) {
    this.scene  = scene;
    this.phys   = physicsWorld;
    this._bodies = [];

    this._buildGround();
    this._buildForest();
    this._buildVillage();
    this._buildRocks();
    this._addBoundaryWalls();
  }

  _buildGround() {
    // Three.js ground
    const geo = new THREE.PlaneGeometry(500, 500, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0x2d6a2d });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    // Divider line (visual — village path)
    const pathGeo = new THREE.PlaneGeometry(8, 500);
    const pathMat = new THREE.MeshLambertMaterial({ color: 0x8d6e63 });
    const path = new THREE.Mesh(pathGeo, pathMat);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.01, 0);
    this.scene.add(path);

    // Cannon ground plane
    const groundBody = new CANNON.Body({ type: CANNON.Body.STATIC });
    groundBody.addShape(new CANNON.Plane());
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.phys.addBody(groundBody);
    this._bodies.push(groundBody);

    // Invisible walls (box floor for stability)
    const floorBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(250, 0.5, 250)),
    });
    floorBody.position.set(0, -0.5, 0);
    this.phys.addBody(floorBody);
    this._bodies.push(floorBody);
  }

  _buildForest() {
    // Forest occupies x < -10
    const TREE_COUNT = 120;

    // Trunk: cylinder, Foliage: cone
    const trunkGeo   = new THREE.CylinderGeometry(0.2, 0.3, 2.5, 6);
    const foliageGeo = new THREE.ConeGeometry(1.4, 4, 6);
    const trunkMat   = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
    const foliageMat = new THREE.MeshLambertMaterial({ color: 0x1b5e20 });

    const trunkInst   = new THREE.InstancedMesh(trunkGeo,   trunkMat,   TREE_COUNT);
    const foliageInst = new THREE.InstancedMesh(foliageGeo, foliageMat, TREE_COUNT);
    trunkInst.castShadow = true;
    foliageInst.castShadow = true;

    const dummy = new THREE.Object3D();
    this._treePositions = [];

    for (let i = 0; i < TREE_COUNT; i++) {
      const x = -15 - rng() * 220;
      const z = (rng() - 0.5) * 460;
      this._treePositions.push([x, z]);

      const scale = 0.8 + rng() * 0.8;

      // Trunk
      dummy.position.set(x, 1.25 * scale, z);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.y = rng() * Math.PI * 2;
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);

      // Foliage
      dummy.position.set(x, (2.5 + 2.2) * scale, z);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      foliageInst.setMatrixAt(i, dummy.matrix);

      // Physics cylinder for trunk
      const body = new CANNON.Body({ type: CANNON.Body.STATIC });
      body.addShape(new CANNON.Cylinder(0.25 * scale, 0.35 * scale, 2.5 * scale, 6));
      body.position.set(x, 1.25 * scale, z);
      this.phys.addBody(body);
      this._bodies.push(body);
    }

    trunkInst.instanceMatrix.needsUpdate   = true;
    foliageInst.instanceMatrix.needsUpdate = true;
    this.scene.add(trunkInst, foliageInst);

    // Forest floor color patch
    const fGeo = new THREE.PlaneGeometry(240, 480);
    const fMat = new THREE.MeshLambertMaterial({ color: 0x1b5e20 });
    const fMesh = new THREE.Mesh(fGeo, fMat);
    fMesh.rotation.x = -Math.PI / 2;
    fMesh.position.set(-130, 0.005, 0);
    this.scene.add(fMesh);
  }

  _buildVillage() {
    // Village occupies x > 10
    const HOUSE_CONFIGS = [
      { w: 10, d: 10, h: 6,  color: 0xbcaaa4, roofColor: 0x8d6e63 },
      { w: 8,  d: 12, h: 5,  color: 0xd7ccc8, roofColor: 0x795548 },
      { w: 12, d: 8,  h: 7,  color: 0xffe0b2, roofColor: 0x6d4c41 },
      { w: 6,  d: 6,  h: 4,  color: 0xcfd8dc, roofColor: 0x546e7a },
    ];

    const positions = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        positions.push({ x: 30 + col * 36, z: -90 + row * 40 });
        positions.push({ x: 30 + col * 36, z:  90 + row * 40 });
      }
    }
    // Randomise some in left village half too
    for (let i = 0; i < 8; i++) {
      positions.push({ x: 15 + rng() * 50, z: (rng() - 0.5) * 200 });
    }

    for (const pos of positions) {
      const cfg = HOUSE_CONFIGS[Math.floor(rng() * HOUSE_CONFIGS.length)];
      this._addBuilding(pos.x, pos.z, cfg);
    }

    // Village ground colour
    const vGeo = new THREE.PlaneGeometry(240, 480);
    const vMat = new THREE.MeshLambertMaterial({ color: 0x4e342e });
    const vMesh = new THREE.Mesh(vGeo, vMat);
    vMesh.rotation.x = -Math.PI / 2;
    vMesh.position.set(130, 0.005, 0);
    this.scene.add(vMesh);
  }

  _addBuilding(x, z, cfg) {
    const { w, d, h, color, roofColor } = cfg;

    // Walls
    const wallGeo = new THREE.BoxGeometry(w, h, d);
    const wallMat = new THREE.MeshLambertMaterial({ color });
    const wall    = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(x, h / 2, z);
    wall.castShadow    = true;
    wall.receiveShadow = true;
    this.scene.add(wall);

    // Roof (flat pitched)
    const roofGeo = new THREE.ConeGeometry(Math.max(w, d) * 0.76, h * 0.5, 4);
    const roofMat = new THREE.MeshLambertMaterial({ color: roofColor });
    const roof    = new THREE.Mesh(roofGeo, roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.set(x, h + h * 0.25, z);
    roof.castShadow = true;
    this.scene.add(roof);

    // Physics box
    const body = new CANNON.Body({ type: CANNON.Body.STATIC });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
    body.position.set(x, h / 2, z);
    this.phys.addBody(body);
    this._bodies.push(body);
  }

  _buildRocks() {
    const COUNT = 40;
    const geo   = new THREE.DodecahedronGeometry(1, 0);
    const mat   = new THREE.MeshLambertMaterial({ color: 0x78909c });
    const inst  = new THREE.InstancedMesh(geo, mat, COUNT);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < COUNT; i++) {
      const side = rng() > 0.5 ? 1 : -1;
      const x = side * (20 + rng() * 200);
      const z = (rng() - 0.5) * 400;
      const s = 0.5 + rng() * 1.5;
      dummy.position.set(x, s * 0.5, z);
      dummy.scale.set(s, s * 0.7, s);
      dummy.rotation.set(rng(), rng(), rng());
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);

      const body = new CANNON.Body({ type: CANNON.Body.STATIC });
      body.addShape(new CANNON.Sphere(s * 0.8));
      body.position.set(x, s * 0.5, z);
      this.phys.addBody(body);
      this._bodies.push(body);
    }

    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = true;
    this.scene.add(inst);
  }

  _addBoundaryWalls() {
    const EXTENT = 245;
    const WALL_H = 10;
    const walls = [
      { x:  EXTENT, z: 0,       rx: 0 },
      { x: -EXTENT, z: 0,       rx: 0 },
      { x: 0,       z:  EXTENT, rz: true },
      { x: 0,       z: -EXTENT, rz: true },
    ];
    for (const w of walls) {
      const body = new CANNON.Body({ type: CANNON.Body.STATIC });
      body.addShape(new CANNON.Box(new CANNON.Vec3(w.rz ? 245 : 1, WALL_H, w.rz ? 1 : 245)));
      body.position.set(w.x, WALL_H, w.z);
      this.phys.addBody(body);
      this._bodies.push(body);
    }
  }

  // Return safe spawn positions for enemies spread across the map
  getSpawnPositions(count) {
    const positions = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rng() * 0.5;
      const r     = 40 + rng() * 150;
      positions.push(new THREE.Vector3(
        Math.cos(angle) * r,
        0,
        Math.sin(angle) * r
      ));
    }
    return positions;
  }

  // Weapon spawn positions scattered around the world
  getWeaponSpawnPositions() {
    return [
      new THREE.Vector3(-30,  0,  20),
      new THREE.Vector3(-80,  0, -40),
      new THREE.Vector3( 50,  0,  30),
      new THREE.Vector3( 90,  0, -60),
      new THREE.Vector3(-120, 0,  70),
      new THREE.Vector3( 150, 0,  80),
      new THREE.Vector3(  10, 0, -90),
      new THREE.Vector3( -60, 0,  90),
    ];
  }
}
