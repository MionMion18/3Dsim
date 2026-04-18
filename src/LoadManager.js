import * as THREE from 'three';

const PALLET_COLORS = [0xc0392b, 0x27ae60, 0x2980b9, 0xf39c12, 0x8e44ad, 0x16a085];

export class LoadManager {
  constructor(scene) {
    this.scene = scene;
    this.loads = [];
    this._colorIdx = 0;
  }

  createPallet(position) {
    const group = new THREE.Group();

    // パレット板
    const palletGeo = new THREE.BoxGeometry(0.9, 0.14, 0.8);
    const palletMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.9, metalness: 0.0 });
    const pallet = new THREE.Mesh(palletGeo, palletMat);
    pallet.castShadow = true;
    group.add(pallet);

    // 桁 (パレット足)
    const legGeo = new THREE.BoxGeometry(0.9, 0.07, 0.1);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x6B4F10, roughness: 0.9 });
    [-0.3, 0, 0.3].forEach(zo => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(0, -0.1, zo);
      group.add(leg);
    });

    // 積荷 (箱)
    const cartonColor = PALLET_COLORS[this._colorIdx % PALLET_COLORS.length];
    this._colorIdx++;
    const cartonGeo = new THREE.BoxGeometry(0.75, 0.5, 0.65);
    const cartonMat = new THREE.MeshStandardMaterial({ color: cartonColor, roughness: 0.7, metalness: 0.1 });
    const carton = new THREE.Mesh(cartonGeo, cartonMat);
    carton.position.y = 0.32;
    carton.castShadow = true;
    group.add(carton);

    // バーコードラベル風デカール
    const labelGeo = new THREE.PlaneGeometry(0.3, 0.2);
    const labelMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.FrontSide });
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.position.set(0.38, 0.32, 0);
    label.rotation.y = Math.PI / 2;
    group.add(label);

    group.position.copy(position ?? new THREE.Vector3(0, 0.3, 0));
    group.castShadow = true;
    this.scene.add(group);
    this.loads.push(group);
    return group;
  }

  removePallet(mesh) {
    this.scene.remove(mesh);
    this.loads = this.loads.filter(l => l !== mesh);
    mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); });
  }

  // 入荷ポイント (ステーション) の位置
  get stationPosition() {
    return new THREE.Vector3(0.5, 0.3, 0);
  }
}
