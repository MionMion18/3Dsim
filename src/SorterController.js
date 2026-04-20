export class SorterController {
  constructor(sorter) {
    this.sorter = sorter;
    this._queue = [];
    this._cur   = null;
    this._state = 'IDLE';
    this.statusText     = '仕分待機';
    this.onPortComplete = null; // (label, mesh) コールバック
  }

  // AutoController の PLACE ステップから呼ばれる
  addSortJob(pallet, portLabel) {
    if (!portLabel) return;
    this._queue.push({ pallet, portLabel });
  }

  update(_dt) {
    if (this._state === 'IDLE') {
      if (!this._queue.length) { this.statusText = '仕分待機'; return; }
      this._cur   = this._queue.shift();
      this._state = 'TO_INPUT';
      this.sorter.moveToInput();
      this.statusText = 'カート→入力点';
    }

    const { pallet, portLabel } = this._cur;
    const portIdx = this.sorter.getPortIndex(portLabel);

    switch (this._state) {
      case 'TO_INPUT': {
        if (this.sorter.isAtInput()) {
          this.sorter.attachLoad(pallet);
          this.sorter.moveToPort(portIdx);
          this._state = 'TO_PORT';
          this.statusText = `ポート${portLabel}へ搬送中`;
        }
        break;
      }
      case 'TO_PORT': {
        if (this.sorter.isAtPort(portIdx)) {
          this.sorter.ejectToPort(portIdx);
          this.onPortComplete?.(portLabel, pallet);
          this._state = 'RETURN';
          this.sorter.moveToInput();
          this.statusText = `ポート${portLabel}排出 → 復帰中`;
        }
        break;
      }
      case 'RETURN': {
        if (this.sorter.isAtInput()) {
          this._state = 'IDLE';
          this._cur   = null;
          this.statusText = '仕分完了';
        }
        break;
      }
    }
  }

  get isIdle()      { return this._state === 'IDLE'; }
  get queueLength() { return this._queue.length; }
}
