import { describe, it } from 'mocha';
import { expect } from 'chai';
import { CameraService, OniItem, Overlay, Vector2 } from '../../lib/index';
import { loadGameDatabase } from '../helpers/roomFixtures';

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

describe('CameraService.setOverlayForItem', function () {
  // Only the three members setOverlayForItem touches — a real OniItem would drag
  // in the whole element/sprite/database bootstrap.
  const fakeItem = (
    overlay: Overlay,
    opaqueIn: Overlay[]
  ): any => ({
    overlay,
    isOverlayPrimary: (o: Overlay) => opaqueIn.includes(o),
    isOverlaySecondary: (o: Overlay) => o === overlay,
  });

  // Building-layer device: opaque in its viewMode overlay (secondary) and in Base
  // (primary), grey everywhere else — like LogicSwitch / a Logic*Sensor.
  const automationDevice = fakeItem(Overlay.Automation, [Overlay.Base]);
  // Wire: primary in its own overlay only — like LogicWire.
  const automationWire = fakeItem(Overlay.Automation, [Overlay.Automation]);
  // Plain building: Base only — like a Bed or a tile.
  const plainBuilding = fakeItem(Overlay.Base, [Overlay.Base]);
  // Gas building: opaque in Gas only.
  const gasBuilding = fakeItem(Overlay.Gas, [Overlay.Gas]);

  it('switches from the initial None overlay to the item overlay', function () {
    const camera = makeCamera();
    expect(camera.overlay).to.equal(Overlay.None);
    camera.setOverlayForItem(automationDevice);
    expect(camera.overlay).to.equal(Overlay.Automation);
  });

  it('does not leave the Automation overlay when copying an automation wire', function () {
    const camera = makeCamera();
    camera.overlay = Overlay.Automation;
    camera.setOverlayForItem(automationWire);
    expect(camera.overlay).to.equal(Overlay.Automation);
  });

  it('does not leave the Automation overlay when copying an automation device (secondary)', function () {
    const camera = makeCamera();
    camera.overlay = Overlay.Automation;
    camera.setOverlayForItem(automationDevice);
    expect(camera.overlay).to.equal(Overlay.Automation);
  });

  // The case this fix actually changes. A Building-layer device is opaque in
  // Base as well as in its own viewMode overlay, so picking one from the build
  // menu (or copying it) while in Base used to yank the view into Automation /
  // Power / Gas / ... for no benefit — the item was already fully visible.
  // 204 buildings in the database are shaped this way; the other cases in this
  // block pass against the old unconditional `this.overlay = item.overlay` too.
  it('stays in Base when picking a device that is already opaque there', function () {
    const camera = makeCamera();
    camera.overlay = Overlay.Base;
    camera.setOverlayForItem(automationDevice);
    expect(camera.overlay).to.equal(Overlay.Base);
  });

  it('stays in the Room overlay for a device opaque in Base', function () {
    const camera = makeCamera();
    camera.overlay = Overlay.Room;
    camera.setOverlayForItem(automationDevice);
    expect(camera.overlay).to.equal(Overlay.Room);
  });

  it('leaves the Automation overlay when copying a plain building it would grey out', function () {
    const camera = makeCamera();
    camera.overlay = Overlay.Automation;
    camera.setOverlayForItem(plainBuilding);
    expect(camera.overlay).to.equal(Overlay.Base);
  });

  it('switches to the item overlay when the current one would grey it out', function () {
    const camera = makeCamera();
    camera.overlay = Overlay.Power;
    camera.setOverlayForItem(gasBuilding);
    expect(camera.overlay).to.equal(Overlay.Gas);
  });

  it('treats the Room overlay as Base for the compatibility check', function () {
    const camera = makeCamera();
    camera.overlay = Overlay.Room;
    camera.setOverlayForItem(plainBuilding); // opaque in Base -> Room counts as Base
    expect(camera.overlay).to.equal(Overlay.Room);
  });

  // The cases above are only as good as the fakes. Pin each shape to a real
  // building from the shipped database, so a change to isOverlayPrimary (it
  // already carries one objectLayer special case, for the U59 Heavi-Watt joint
  // plates) can't silently leave this block testing a model of the code rather
  // than the code.
  it('models the real database: the three shapes exist and behave as faked', function () {
    loadGameDatabase();
    const shapeOf = (item: OniItem) => ({
      primaryInBase: item.isOverlayPrimary(Overlay.Base),
      primaryInOwn: item.isOverlayPrimary(item.overlay),
      secondaryInOwn: item.isOverlaySecondary(item.overlay),
    });

    // Building-layer device (LogicSwitch, Battery, GasPump, ...): opaque in Base
    // and in its own overlay — matches `automationDevice`.
    for (const id of ['LogicSwitch', 'Battery', 'GasPump']) {
      const item = OniItem.getOniItem(id);
      expect(item.overlay, id).to.not.equal(Overlay.Base);
      expect(shapeOf(item), id).to.deep.equal({
        primaryInBase: true,
        primaryInOwn: false,
        secondaryInOwn: true,
      });
    }

    // Wire / logic gate: primary in its own overlay only — matches
    // `automationWire`, and stays the case the fix must not regress.
    for (const id of ['LogicWire', 'LogicGateOR']) {
      const item = OniItem.getOniItem(id);
      expect(shapeOf(item), id).to.deep.equal({
        primaryInBase: false,
        primaryInOwn: true,
        secondaryInOwn: true,
      });
      expect(item.isOverlaySecondary(Overlay.Base), id).to.equal(false);
    }

    // Plain building — matches `plainBuilding`.
    const tile = OniItem.getOniItem('Tile');
    expect(tile.overlay).to.equal(Overlay.Base);
    expect(shapeOf(tile)).to.deep.equal({
      primaryInBase: true,
      primaryInOwn: true,
      secondaryInOwn: true,
    });

    // The startup bootstrap depends on this: build-tool.component loads a Tile
    // while the camera is still at Overlay.None, and that call is what leaves
    // None. If the gate ever answered "stay", the editor would boot with no
    // overlay at all.
    expect(tile.isOverlayPrimary(Overlay.None) || tile.isOverlaySecondary(Overlay.None)).to.equal(
      false
    );
  });
});
