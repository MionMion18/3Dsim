import * as THREE from 'three';

export const RACK_CONFIG = {
  numBays: 20,
  numLevels: 10,
  bayWidth: 1.4,
  levelHeight: 1.2,
  depth: 1.0,
  aisleWidth: 2.0,
  postSize: 0.08,
  beamHeight: 0.08,
};

const C = RACK_CONFIG;

// ステーション定義 (Z = ±(aisleWidth/2 + depth/2) = ±1.5)
export const STATIONS = {
  ST1: { id: 'ST1', label: 'ST1 入庫', side: -1, x: 0.7, y: 1.2 },
  ST2: { id: 'ST2', label: 'ST2 出庫', side:  1, x: 0.7, y: 1.2 },
};

export function stationWorldZ(side) {
  return side * (C.aisleWidth / 2 + C.depth / 2);
}

export class Warehouse {
  constructor(scene, physicsWorld) {
    this.scene = scene;
    this.physics = physicsWorld;
    this.cells = {};

    this._buildFloor();
    this._buildRacks();
    this._buildGuideRails();
    this._buildStations();
  }

  _mat(color, metalness = 0.6, roughness = 0.4) {
    return new THREE.MeshStandardMaterial({ color, metalness, roughness });
  }

  _buildFloor() {
    const totalLength = C.numBays * C.bayWidth + 3;
    const totalWidth  = C.depth * 2 + C.aisleWidth + 2;

    const geo = new THREE.BoxGeometry(totalLength, 0.1, totalWidth);
    const mat = this._mat(0x2a3a4a, 0.2, 0.9);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(totalLength / 2 - 1.5, -0.05, 0);
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    this.physics.createBox(
      [totalLength / 2, 0.05, totalWidth / 2],
      [totalLength / 2 - 1.5, -0.05, 0],
      0
    );

    const grid = new THREE.GridHelper(Math.max(totalLength, totalWidth), 24, 0x1e3050, 0x0d1a28);
    grid.position.set(totalLength / 2 - 1.5, 0.01, 0);
    this.scene.add(grid);
  }

  _buildRacks() {
    const sides = [-1, 1];
    const rackZ = C.aisleWidth / 2 + C.depth / 2;

    sides.forEach(side => {
      for (let bay = 0; bay < C.numBays; bay++) {
        const postX = bay * C.bayWidth;
        const postY = (C.numLevels * C.levelHeight) / 2;
        const postZ = side * rackZ;

        this._addPost(postX, postY, postZ);

        for (let lvl = 0; lvl < C.numLevels; lvl++) {
          const beamY = (lvl + 1) * C.levelHeight;
          const beamX = postX + C.bayWidth / 2;
          this._addBeam(beamX, beamY, postZ);
          this._addCellFloor(beamX, beamY, postZ, side, bay, lvl);
        }
      }
      // 最後のポスト
      this._addPost(
        C.numBays * C.bayWidth,
        (C.numLevels * C.levelHeight) / 2,
        side * rackZ
      );
    });
  }

  _addPost(x, y, z) {
    const geo = new THREE.BoxGeometry(C.postSize, C.numLevels * C.levelHeight, C.postSize);
    const mesh = new THREE.Mesh(geo, this._mat(0x4a6080));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    this.scene.add(mesh);
  }

  _addBeam(x, y, z) {
    const geo = new THREE.BoxGeometry(C.bayWidth, C.beamHeight, C.postSize * 1.5);
    const mesh = new THREE.Mesh(geo, this._mat(0x3a5070));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    this.scene.add(mesh);
  }

  _addCellFloor(x, y, z, side, bay, lvl) {
    const geo = new THREE.BoxGeometry(C.bayWidth * 0.85, 0.02, C.depth * 0.9);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0d1e30, metalness: 0.3, roughness: 0.8,
      transparent: true, opacity: 0.7,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    // セル中心: 棚板の上 + パレット半高さ分
    const key = `${side}_${bay}_${lvl}`;
    this.cells[key] = {
      mesh,
      load: null,
      position: new THREE.Vector3(x, y + 0.22, z),
    };
  }

  _buildGuideRails() {
    const length = C.numBays * C.bayWidth + 2.5;
    const railMat = this._mat(0x8aaac0, 0.8, 0.2);
    [0.04, C.numLevels * C.levelHeight + 0.4].forEach(y => {
      const geo = new THREE.BoxGeometry(length, 0.06, 0.06);
      const mesh = new THREE.Mesh(geo, railMat);
      mesh.position.set(length / 2 - 1.25, y, 0);
      this.scene.add(mesh);
    });
  }

  _buildStations() {
    Object.values(STATIONS).forEach(st => {
      const z     = stationWorldZ(st.side);
      const isST1 = st.side === -1;
      const color = isST1 ? 0xd4a017 : 0x1a8a3a;
      const top   = st.y; // プラットフォーム上面高さ

      // ST2 はコンベア連結のためプラットフォーム視覚を描画しない
      if (isST1) {
        // ── 支持柱 (4隅、床から top まで) ──
        const colMat = this._mat(0x3a5070, 0.8, 0.3);
        [[-0.38, -0.38], [-0.38, 0.38], [0.38, -0.38], [0.38, 0.38]].forEach(([dx, dz]) => {
          const col = new THREE.Mesh(
            new THREE.BoxGeometry(0.07, top, 0.07),
            colMat
          );
          col.position.set(st.x + dx, top / 2, z + dz * C.depth * 0.44);
          col.castShadow = true;
          this.scene.add(col);
        });

        // ── プラットフォーム本体 ──
        const platMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.15, C.depth * 0.9),
          this._mat(color, 0.3, 0.7)
        );
        platMesh.position.set(st.x, top - 0.075, z);
        platMesh.receiveShadow = true;
        this.scene.add(platMesh);

        // ── 安全柵 ──
        const railMat = this._mat(0xffcc00, 0.5, 0.5);
        [0.08, 0.18].forEach(ry => {
          [-C.depth * 0.44, C.depth * 0.44].forEach(dz => {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.03), railMat);
            rail.position.set(st.x, top + ry, z + dz);
            this.scene.add(rail);
          });
        });

        // ── ストライプ（安全ライン）──
        const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        [-0.35, 0, 0.35].forEach(zOff => {
          const s = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.01, 0.05), stripeMat);
          s.position.set(st.x, top, z + zOff);
          this.scene.add(s);
        });
      }

      // ── ポイントライト ──
      const light = new THREE.PointLight(isST1 ? 0xffcc44 : 0x44ff88, 0.8, 3);
      light.position.set(st.x, top + 0.5, z);
      this.scene.add(light);

      // ── ラベルスプライト ──
      this._addLabel(st.label, new THREE.Vector3(st.x, top + 0.8, z), isST1 ? '#d4a017' : '#1a8a3a');

      // ── 物理床 (高架) ──
      this.physics.createBox([0.45, 0.075, 0.45], [st.x, top - 0.075, z], 0);

      st.worldZ = z;
    });
  }

  _addLabel(text, pos, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.roundRect(4, 4, 248, 56, 8);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 42);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.2, 0.3, 1);
    sprite.position.copy(pos);
    this.scene.add(sprite);
  }

  getCellWorldPos(side, bay, level) {
    return this.cells[`${side}_${bay}_${level}`]?.position.clone() ?? null;
  }

  isCellOccupied(side, bay, level) {
    return !!this.cells[`${side}_${bay}_${level}`]?.load;
  }

  setLoad(side, bay, level, loadMesh) {
    const c = this.cells[`${side}_${bay}_${level}`];
    if (c) c.load = loadMesh;
  }

  clearLoad(side, bay, level) {
    const c = this.cells[`${side}_${bay}_${level}`];
    if (c) c.load = null;
  }

  getRandomEmptyCell() {
    const keys = Object.keys(this.cells).filter(k => !this.cells[k].load);
    if (!keys.length) return null;
    const [side, bay, lvl] = keys[Math.floor(Math.random() * keys.length)].split('_').map(Number);
    return { side, bay, lvl };
  }

  getRandomOccupiedCell() {
    const keys = Object.keys(this.cells).filter(k => !!this.cells[k].load);
    if (!keys.length) return null;
    const [side, bay, lvl] = keys[Math.floor(Math.random() * keys.length)].split('_').map(Number);
    return { side, bay, lvl };
  }
}
