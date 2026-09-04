import { describe, it } from 'mocha';
import { expect } from 'chai';
import { CameraService, Vector2 } from '../../lib/index';

// Pure camera math — no PIXI needed: the constructor only stores the
// container reference, and pinchZoom/updateZoom/changeZoom never touch it.
const makeCamera = () => new CameraService(null);

describe('CameraService.pinchZoom', function () {
  it('scales currentZoom multiplicatively', function () {
    const camera = makeCamera();
    camera.setHardZoom(32);
    camera.pinchZoom(1.5, new Vector2(100, 100));
    expect(camera.currentZoom).to.be.closeTo(48, 1e-9);
  });

  it('keeps the tile under the gesture center fixed (the pinch anchor)', function () {
    const camera = makeCamera();
    camera.setHardZoom(32);
    camera.cameraOffset.x = 3;
    camera.cameraOffset.y = 7;

    const center = new Vector2(250, 180);
    const before = camera.getTileCoordsForZoom(center);
    camera.pinchZoom(1.4, center);
    const after = camera.getTileCoordsForZoom(center);

    expect(after.x).to.be.closeTo(before.x, 1e-9);
    expect(after.y).to.be.closeTo(before.y, 1e-9);
  });

  it('is not fought by the per-frame zoom animation (the pinch-drift regression)', function () {
    // updateZoom() runs every render frame and eases currentZoom toward
    // targetZoom around lastZoomCenter. Before the fix, a pinch moved only
    // currentZoom, so every frame the camera zoomed back toward the stale
    // target around a stale center — reading as a simultaneous zoom + pan
    // away from the fingers.
    const camera = makeCamera();
    camera.setHardZoom(32);
    camera.pinchZoom(1.7, new Vector2(300, 200));

    const zoomAfterPinch = camera.currentZoom;
    const offsetAfterPinch = new Vector2(camera.cameraOffset.x, camera.cameraOffset.y);

    for (let frame = 0; frame < 60; frame++) camera.updateZoom();

    expect(camera.currentZoom).to.equal(zoomAfterPinch);
    expect(camera.cameraOffset.x).to.equal(offsetAfterPinch.x);
    expect(camera.cameraOffset.y).to.equal(offsetAfterPinch.y);
  });

  it('clamps to the wheel zoom range', function () {
    const minZoom = 16;
    const maxZoom = 128;

    const camera = makeCamera();
    camera.setHardZoom(32);
    camera.pinchZoom(0.01, new Vector2(0, 0));
    expect(camera.currentZoom).to.equal(minZoom);

    camera.setHardZoom(90);
    camera.pinchZoom(100, new Vector2(0, 0));
    expect(camera.currentZoom).to.equal(maxZoom);
  });

  it('ignores degenerate scales', function () {
    const camera = makeCamera();
    camera.setHardZoom(32);
    for (const scale of [0, -1, NaN, Infinity]) {
      camera.pinchZoom(scale, new Vector2(0, 0));
      expect(camera.currentZoom).to.equal(32);
    }
  });

  it('re-anchors the wheel/keyboard step index, so the next step is adjacent to the pinched zoom', function () {
    const camera = makeCamera();
    camera.setHardZoom(32);
    // Pinch to 50 px/tile — between the 45 and 54 steps, nearest is 54.
    camera.pinchZoom(50 / 32, new Vector2(0, 0));
    expect(camera.currentZoom).to.be.closeTo(50, 1e-9);

    // One wheel step up should ease to 64 (the level above 54), not to
    // wherever the index sat before the pinch.
    camera.zoom(1, new Vector2(0, 0));
    for (let frame = 0; frame < 300; frame++) camera.updateZoom();
    expect(camera.currentZoom).to.be.closeTo(64, 1e-6);
  });
});
