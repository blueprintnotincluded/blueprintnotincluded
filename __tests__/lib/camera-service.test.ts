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
  // ONI's InterfaceTool.OnActivateTool switches the overlay whenever the
  // BuildingDef declares one (`viewMode != OverlayModes.None.ID`) and leaves it
  // alone when it does not. Our importer maps "no viewMode" to Overlay.Base, so
  // `item.overlay` is the only member the gate reads -- a real OniItem would drag
  // in the whole element/sprite/database bootstrap.
  const fakeItem = (overlay: Overlay): any => ({ overlay });

  // Declares an overlay: LogicSwitch / Battery / GasPump and the wires.
  const automationItem = fakeItem(Overlay.Automation);
  const gasItem = fakeItem(Overlay.Gas);
  // Declares none -- ONI's ViewMode == None. Bed, Ladder, Tile, and the
  // synthesized Element brush.
  const plainBuilding = fakeItem(Overlay.Base);

  it('switches to the item overlay when the item declares one', function () {
    const camera = makeCamera();
    camera.overlay = Overlay.Power;
    camera.setOverlayForItem(gasItem);
    expect(camera.overlay).to.equal(Overlay.Gas);
  });

  it('switches out of Base for an item that declares an overlay', function () {
    // The case PR #232 proposed suppressing, on the theory that a Building-layer
    // device is already opaque in Base so the switch buys nothing. The game
    // switches anyway, so we do too.
    const camera = makeCamera();
    camera.overlay = Overlay.Base;
    camera.setOverlayForItem(automationItem);
    expect(camera.overlay).to.equal(Overlay.Automation);
  });

  it('switches out of the Room overlay for an item that declares one', function () {
    const camera = makeCamera();
    camera.overlay = Overlay.Room;
    camera.setOverlayForItem(automationItem);
    expect(camera.overlay).to.equal(Overlay.Automation);
  });

  it('stays put when re-picking an item whose overlay is already current', function () {
    const camera = makeCamera();
    camera.overlay = Overlay.Automation;
    camera.setOverlayForItem(automationItem);
    expect(camera.overlay).to.equal(Overlay.Automation);
  });

  // The behaviour this change adds. A building with no viewMode used to drag the
  // view to Base from wherever you were -- the original report's complaint.
  it('stays in Automation when picking a building that declares no overlay', function () {
    const camera = makeCamera();
    camera.overlay = Overlay.Automation;
    camera.setOverlayForItem(plainBuilding);
    expect(camera.overlay).to.equal(Overlay.Automation);
  });

  it('stays in Power when picking a building that declares no overlay', function () {
    const camera = makeCamera();
    camera.overlay = Overlay.Power;
    camera.setOverlayForItem(plainBuilding);
    expect(camera.overlay).to.equal(Overlay.Power);
  });

  it('stays in the Room overlay when picking a building that declares no overlay', function () {
    const camera = makeCamera();
    camera.overlay = Overlay.Room;
    camera.setOverlayForItem(plainBuilding);
    expect(camera.overlay).to.equal(Overlay.Room);
  });

  // The element brush routes through BuildTool.changeItem like any building, and
  // the synthesized Element OniItem carries Overlay.Base, so it now leaves you
  // wherever you were -- where elements render at 0.3 alpha. Pinned so the
  // consequence is visible rather than discovered.
  it('leaves the element brush in the current overlay, where elements are greyed', function () {
    const camera = makeCamera();
    camera.overlay = Overlay.Automation;
    camera.setOverlayForItem(plainBuilding); // the Element OniItem's overlay
    expect(camera.overlay).to.equal(Overlay.Automation);
  });

  // Overlay.None is not a neutral state: nothing is primary or secondary there,
  // so BlueprintItem.cameraChanged renders the whole blueprint at 0.3 alpha on
  // bare zIndex, and a Tile declares no overlay. The editor does not depend on
  // this -- component-canvas sets Overlay.Base on init, so the camera has left
  // None before oniItemsLoaded() seeds its Tile -- but the constructor's default
  // is None and nothing enforces that ordering, so the method must not strand a
  // camera there.
  it('leaves the initial None overlay even for an item that declares none', function () {
    const camera = makeCamera();
    expect(camera.overlay).to.equal(Overlay.None);
    camera.setOverlayForItem(plainBuilding);
    expect(camera.overlay).to.equal(Overlay.Base);
  });

  // The cases above are only as good as the fakes. Pin each shape to real
  // buildings from the shipped database, so the gate is tested against the
  // overlays items actually carry rather than against a model of them.
  it('models the real database: both shapes exist and carry the faked overlays', function () {
    loadGameDatabase();

    // ONI ViewMode == None -- the game does not switch, and now neither do we.
    for (const id of ['Tile', 'Bed', 'Ladder']) {
      expect(OniItem.getOniItem(id).overlay, id).to.equal(Overlay.Base);
    }

    // Declares a viewMode we render -- unchanged by this gate.
    const declared: [string, Overlay][] = [
      ['GasPump', Overlay.Gas],
      ['LogicSwitch', Overlay.Automation],
      ['Battery', Overlay.Power],
      ['LogicWire', Overlay.Automation],
    ];
    for (const [id, overlay] of declared) {
      expect(OniItem.getOniItem(id).overlay, id).to.equal(overlay);
    }

    // The gate is wider than ONI's test: OniItem.getRealOverlay collapses the
    // overlays this site does not render (Rooms here) into Base, so those
    // buildings also stop switching. The game would switch for them.
    expect(OniItem.getOniItem('CreatureDeliveryPoint').overlay).to.equal(Overlay.Base);

    // No item can carry Overlay.None, so the None exception above only ever
    // fires for the camera's own initial state.
    for (const item of OniItem.oniItems) {
      expect(item.overlay, item.id).to.not.equal(Overlay.None);
    }
  });
});
