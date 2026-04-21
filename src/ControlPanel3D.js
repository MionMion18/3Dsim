import * as THREE from 'three';

export class ControlPanel3D {
  constructor(scene) {
    this.scene = scene;
    this._t    = 0;
    this._buildMesh();
  }

  _buildMesh() {
    this.group = new THREE.Group();
    // ST2 / ソーター入口脇に設置
    this.group.position.set(2.2, 0, 3.8);
    this.scene.add(this.group);

    const metal  = new THREE.MeshStandardMaterial({ color: 0x3a4a5a, metalness: 0.85, roughness: 0.25 });
    const dark   = new THREE.MeshStandardMaterial({ color: 0x1a2430, metalness: 0.7,  roughness: 0.4  });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.5 });

    // ── キャビネット本体 ──
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.02, 0.42), metal);
    cabinet.position.y = 0.51;
    cabinet.castShadow = true;
    this.group.add(cabinet);

    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.96, 0.03), dark);
    bezel.position.set(0, 0.51, 0.22);
    this.group.add(bezel);

    [[-0.32, -0.32], [-0.32, 0.32], [0.32, -0.32], [0.32, 0.32]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), dark);
      leg.position.set(x, 0.03, z);
      this.group.add(leg);
    });

    // ── モニターグループ (後傾 15°) ──
    const monGroup = new THREE.Group();
    monGroup.position.set(0, 1.06, 0.06);
    monGroup.rotation.x = -0.26;
    this.group.add(monGroup);

    const monFrame = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.48, 0.06), dark);
    monFrame.position.y = 0.24;
    monFrame.castShadow = true;
    monGroup.add(monFrame);

    // スクリーン (レイキャスト対象)
    this._screenMat = new THREE.MeshStandardMaterial({
      map: new THREE.CanvasTexture(this._makeScreenCanvas()),
      emissive: 0x004466,
      emissiveIntensity: 0.45,
    });
    this.screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.38), this._screenMat);
    this.screenMesh.position.set(0, 0.24, 0.034);
    monGroup.add(this.screenMesh);

    // ── キーボードトレイ ──
    const kbd = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.03, 0.24), metal);
    kbd.position.set(0, 1.04, 0.20);
    kbd.castShadow = true;
    this.group.add(kbd);

    const kbdMat = new THREE.MeshStandardMaterial({ color: 0x2a3a4a, roughness: 0.6 });
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 8; col++) {
        const k = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.018, 0.055), kbdMat);
        k.position.set(-0.28 + col * 0.08, 1.06, 0.10 + row * 0.068);
        this.group.add(k);
      }
    }

    // ── インジケータランプ ──
    this._lamps = [];
    [0xff3333, 0xffcc00, 0x33ff88].forEach((c, i) => {
      const mat  = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9 });
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 10), mat);
      lamp.position.set(-0.22 + i * 0.22, 1.02, 0.22);
      this.group.add(lamp);
      this._lamps.push(lamp);
    });

    // ── ビーコンライト ──
    this._beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.034, 0.034, 0.13, 10),
      new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 0.6 })
    );
    this._beacon.position.set(0.28, 1.10, 0);
    this.group.add(this._beacon);

    const beaconBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), metal);
    beaconBase.position.set(0.28, 1.04, 0);
    this.group.add(beaconBase);

    // ── ハザードストライプ ──
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.08, 0.02), yellow);
    stripe.position.set(0, 0.04, 0.22);
    this.group.add(stripe);

    // ── 銘板スプライト ──
    const lCanvas = document.createElement('canvas');
    lCanvas.width = 256; lCanvas.height = 48;
    const lCtx = lCanvas.getContext('2d');
    lCtx.fillStyle = '#ffcc00';
    lCtx.font = 'bold 20px monospace';
    lCtx.textAlign = 'center';
    lCtx.textBaseline = 'middle';
    lCtx.fillText('CONTROL PANEL', 128, 24);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(lCanvas), transparent: true,
    }));
    label.scale.set(0.9, 0.17, 1);
    label.position.set(0, 1.72, 0);
    this.group.add(label);
  }

  _makeScreenCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 320;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#010e1c';
    ctx.fillRect(0, 0, 512, 320);

    // グリッド背景
    ctx.strokeStyle = 'rgba(0,160,200,0.12)';
    ctx.lineWidth = 1;
    for (let y = 0; y < 320; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
    for (let x = 0; x < 512; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 320); ctx.stroke(); }

    // タイトル
    ctx.fillStyle = '#00ccff';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('WAREHOUSE TERMINAL', 256, 48);

    ctx.strokeStyle = '#00aadd';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(30, 62); ctx.lineTo(482, 62); ctx.stroke();

    // ステータス
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    [['#33ff88', '● CRANE   : ONLINE'],
     ['#33ff88', '● SORTER  : ONLINE'],
     ['#33ff88', '● ROBOT   : ONLINE']].forEach(([c, t], i) => {
      ctx.fillStyle = c;
      ctx.fillText(t, 55, 96 + i * 26);
    });

    // 操作プロンプト
    ctx.fillStyle = '#00ccff';
    ctx.font = 'bold 17px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('▶  クリックして操作  ◀', 256, 228);

    ctx.setLineDash([6, 3]);
    ctx.strokeStyle = '#0099cc';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(18, 210, 476, 36);
    ctx.setLineDash([]);

    ctx.fillStyle = '#334455';
    ctx.font = '10px monospace';
    ctx.fillText('WMS v2.0  /  3DSIM', 256, 306);

    return canvas;
  }

  update(dt) {
    this._t += dt;
    this._screenMat.emissiveIntensity = 0.3 + Math.sin(this._t * 2.2) * 0.18;
    this._beacon.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(this._t * 3.5)) * 0.7;
  }
}
