import * as THREE from 'three';
import { STATIONS, stationWorldZ } from './Warehouse.js';
import { bayToWorldX, levelToWorldY, sideToForkZ } from './StackerCrane.js';
import { JOB_TYPE } from './JobScheduler.js';

const MOVE_THRESH = 0.05;
const FORK_THRESH = 0.04;
const LIFT_THRESH = 0.03;

// フォーク昇降オフセット
// 下定位置: フォーク爪がパレット底面より下に入る量
// 上定位置: パレットが棚梁から浮く量
const FORK_LIFT = 0.08; // m

export class AutoController {
  constructor(crane, warehouse, loadManager, scheduler, sorterCtrl = null) {
    this.crane       = crane;
    this.warehouse   = warehouse;
    this.loadManager = loadManager;
    this.scheduler   = scheduler;
    this.sorterCtrl  = sorterCtrl;

    this._steps   = [];
    this._stepIdx = 0;
    this._job     = null;
    this.statusText = '待機中';
  }

  update(_dt) {
    if (this.crane.emergency) return;

    const job = this.scheduler.nextJob();
    if (!job) { this.statusText = '待機中'; return; }

    if (this._job !== job) {
      this._job     = job;
      this._steps   = this._buildSteps(job);
      this._stepIdx = 0;
    }

    if (this._stepIdx >= this._steps.length) {
      this.scheduler.completeCurrentJob();
      this._job = null;
      this.statusText = 'ジョブ完了';
      return;
    }

    this._execStep(this._steps[this._stepIdx]);
  }

  _nextStep() { this._stepIdx++; }

  // ── ステップ実行 ──────────────────────────────────────────
  _execStep(step) {
    const crane = this.crane;

    switch (step.type) {

      // 走行 + 昇降 同時移動 (初回のみ指令)
      case 'MOVE': {
        if (!step._sent) {
          crane.travelTo(step.x);
          crane.liftTo(step.y);
          step._sent = true;
        }
        this.statusText = step.label ?? `移動中`;
        if (this._moveReached(step.x, step.y)) this._nextStep();
        break;
      }

      // 昇降のみ (フォーク伸長中の上下動作)
      case 'LIFT_TO': {
        if (!step._sent) {
          crane.liftTo(step.y);
          step._sent = true;
        }
        this.statusText = step.label ?? `昇降中`;
        if (crane.liftMotor.isIdle && Math.abs(crane.pos.y - step.y) < LIFT_THRESH) this._nextStep();
        break;
      }

      // フォーク伸長
      case 'FORK_EXTEND': {
        if (!step._sent) {
          crane.extendFork(step.side);
          step._sent = true;
        }
        this.statusText = step.label ?? `フォーク${step.side < 0 ? '左' : '右'}伸長`;
        const target = sideToForkZ(step.side);
        if (crane.forkMotor.isIdle && Math.abs(crane.pos.fork - target) < FORK_THRESH) this._nextStep();
        break;
      }

      // フォーク収納
      case 'FORK_RETRACT': {
        if (!step._sent) {
          crane.extendFork(0);
          step._sent = true;
        }
        this.statusText = 'フォーク収納';
        if (crane.forkMotor.isIdle && Math.abs(crane.pos.fork) < FORK_THRESH) this._nextStep();
        break;
      }

      // 荷物をフォークにアタッチ (フォークが下定位置で棚梁の下に入った状態)
      case 'PICKUP': {
        this.statusText = '荷物を掴む';
        if (!crane.load) {
          const load = step.fromCell
            ? this._loadFromCell(step.fromCell)
            : this._findNearestLoad(step.sourcePos);
          if (load) {
            crane.attachLoad(load);
            if (step.fromCell) {
              const { side, bay, level } = step.fromCell;
              this.warehouse.clearLoad(side, bay, level);
            }
          }
        }
        this._nextStep();
        break;
      }

      // 荷物をデタッチして棚/ステーションに置く (フォークが下定位置に降りた状態)
      case 'PLACE': {
        this.statusText = '荷物を置く';
        const mesh = crane.detachLoad();
        if (mesh) {
          mesh.position.copy(step.destPos);
          if (step.toCell) {
            const { side, bay, level } = step.toCell;
            this.warehouse.setLoad(side, bay, level, mesh);
          } else if (step.destPort && this.sorterCtrl) {
            // ST2 に降ろした後、仕分けコントローラへ引き継ぎ
            this.sorterCtrl.addSortJob(mesh, step.destPort);
          }
        }
        this._nextStep();
        break;
      }

      default:
        this._nextStep();
    }
  }

  // ── ジョブ → ステップ列 ──────────────────────────────────
  _buildSteps(job) {
    const { type, params } = job;
    if (type === JOB_TYPE.STORE)    return this._storeSteps(params);
    if (type === JOB_TYPE.RETRIEVE) return this._retrieveSteps(params);
    if (type === JOB_TYPE.RELOCATE) return this._relocateSteps(params);
    return [];
  }

  // 入庫: ST1 → targetCell
  _storeSteps({ targetSide, targetBay, targetLevel }) {
    const st1    = STATIONS.ST1;
    const st1Z   = stationWorldZ(st1.side);
    const srcPos = new THREE.Vector3(st1.x, st1.y + 0.28, st1Z);

    const cellX   = bayToWorldX(targetBay);
    const cellY   = levelToWorldY(targetLevel);
    const cellZ   = sideToForkZ(targetSide);
    const destPos = new THREE.Vector3(cellX, cellY + 0.20, cellZ);

    return [
      // ST1 下定位置: フォーク爪をパレット底面より下に差し込む
      { type: 'MOVE',         x: st1.x,  y: st1.y - FORK_LIFT,  label: 'ST1 下定位置へ' },
      { type: 'FORK_EXTEND',  side: st1.side,                    label: 'ST1へフォーク伸長' },
      { type: 'PICKUP',       sourcePos: srcPos },
      // 上定位置へ昇降: パレットを ST1 プラットフォームから浮かせる
      { type: 'LIFT_TO',      y: st1.y + FORK_LIFT,              label: 'ST1から持ち上げ' },
      { type: 'FORK_RETRACT' },
      // セル 上定位置: パレットを棚梁より上で持ち込む
      { type: 'MOVE',         x: cellX,  y: cellY + FORK_LIFT,   label: `セル ${this._addr(targetSide,targetBay,targetLevel)} 上定位置へ` },
      { type: 'FORK_EXTEND',  side: targetSide,                  label: 'セルへフォーク伸長' },
      // 下定位置へ降ろす: パレットを棚梁に着座させる
      { type: 'LIFT_TO',      y: cellY - FORK_LIFT,              label: '棚に降ろす' },
      { type: 'PLACE',        destPos, toCell: { side: targetSide, bay: targetBay, level: targetLevel } },
      { type: 'FORK_RETRACT' },
    ];
  }

  // 出庫: sourceCell → ST2 → (任意) ソーター
  _retrieveSteps({ sourceSide, sourceBay, sourceLevel, destPort }) {
    const st2    = STATIONS.ST2;
    const st2Z   = stationWorldZ(st2.side);

    const cellX   = bayToWorldX(sourceBay);
    const cellY   = levelToWorldY(sourceLevel);
    const destPos = new THREE.Vector3(st2.x, st2.y + 0.20, st2Z);

    return [
      // セル 下定位置: フォーク爪をパレット底面より下に差し込む
      { type: 'MOVE',         x: cellX,  y: cellY - FORK_LIFT,   label: `セル ${this._addr(sourceSide,sourceBay,sourceLevel)} 下定位置へ` },
      { type: 'FORK_EXTEND',  side: sourceSide,                  label: 'セルへフォーク伸長' },
      { type: 'PICKUP',       fromCell: { side: sourceSide, bay: sourceBay, level: sourceLevel } },
      // 上定位置へ昇降: パレットを棚梁から浮かせる
      { type: 'LIFT_TO',      y: cellY + FORK_LIFT,              label: '棚から持ち上げ' },
      { type: 'FORK_RETRACT' },
      // ST2 上定位置: パレットをプラットフォームより上で持ち込む
      { type: 'MOVE',         x: st2.x,  y: st2.y + FORK_LIFT,   label: 'ST2 上定位置へ' },
      { type: 'FORK_EXTEND',  side: st2.side,                    label: 'ST2へフォーク伸長' },
      // 下定位置へ降ろす: パレットを ST2 に着座させる
      { type: 'LIFT_TO',      y: st2.y - FORK_LIFT,              label: 'ST2に降ろす' },
      { type: 'PLACE',        destPos, destPort: destPort ?? null },
      { type: 'FORK_RETRACT' },
    ];
  }

  // 移動: sourceCell → targetCell
  _relocateSteps({ sourceSide, sourceBay, sourceLevel, targetSide, targetBay, targetLevel }) {
    const srcX = bayToWorldX(sourceBay),  srcY = levelToWorldY(sourceLevel);
    const dstX = bayToWorldX(targetBay),  dstY = levelToWorldY(targetLevel);
    const destPos = new THREE.Vector3(dstX, dstY + 0.20, sideToForkZ(targetSide));

    return [
      { type: 'MOVE',         x: srcX,   y: srcY - FORK_LIFT,   label: `移元 ${this._addr(sourceSide,sourceBay,sourceLevel)} 下定位置へ` },
      { type: 'FORK_EXTEND',  side: sourceSide },
      { type: 'PICKUP',       fromCell: { side: sourceSide, bay: sourceBay, level: sourceLevel } },
      { type: 'LIFT_TO',      y: srcY + FORK_LIFT,               label: '棚から持ち上げ' },
      { type: 'FORK_RETRACT' },
      { type: 'MOVE',         x: dstX,   y: dstY + FORK_LIFT,   label: `移先 ${this._addr(targetSide,targetBay,targetLevel)} 上定位置へ` },
      { type: 'FORK_EXTEND',  side: targetSide },
      { type: 'LIFT_TO',      y: dstY - FORK_LIFT,               label: '棚に降ろす' },
      { type: 'PLACE',        destPos, toCell: { side: targetSide, bay: targetBay, level: targetLevel } },
      { type: 'FORK_RETRACT' },
    ];
  }

  // ── ヘルパー ─────────────────────────────────────────────
  _moveReached(tx, ty) {
    return this.crane.travelMotor.isIdle &&
           this.crane.liftMotor.isIdle &&
           Math.abs(this.crane.pos.x - tx) < MOVE_THRESH &&
           Math.abs(this.crane.pos.y - ty) < MOVE_THRESH;
  }

  // 棚セルのロードを直接取得 (距離検索より確実)
  _loadFromCell({ side, bay, level }) {
    return this.warehouse.cells[`${side}_${bay}_${level}`]?.load ?? null;
  }

  _findNearestLoad(pos) {
    const loads = this.loadManager.loads.filter(l => l !== this.crane.load);
    if (!pos || !loads.length) return loads[0] ?? null;
    return loads.sort((a, b) => a.position.distanceTo(pos) - b.position.distanceTo(pos))[0];
  }

  _addr(side, bay, level) {
    return `${side < 0 ? 'L' : 'R'}-${bay + 1}-${level + 1}`;
  }
}
