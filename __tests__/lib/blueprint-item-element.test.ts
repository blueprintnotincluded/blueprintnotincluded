import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import {
  BlueprintHelpers,
  BlueprintItemElement,
  CameraService,
  Display,
  Overlay,
  SpriteTag,
} from '../../lib/index';
import { loadGameDatabase } from '../helpers/roomFixtures';

// Real elements from the shipped database (verified against
// assets/database/database-2024.json): Oxygen (Gas), Water (Liquid),
// SandStone (Solid), Vacuum (Vacuum).
const OVERLAY_DIMMED_ALPHA = 0.3;

function elementCell(id: string): BlueprintItemElement {
  const item = BlueprintHelpers.createInstance('Element') as BlueprintItemElement;
  item.setElement(id, 0);
  item.cleanUp();
  return item;
}

function cameraFor(overlay: Overlay, display: Display = Display.solid): CameraService {
  const camera = new CameraService(null);
  camera.overlay = overlay;
  camera.display = display;
  return camera;
}

describe('BlueprintItemElement.cameraChanged', function () {
  before(() => loadGameDatabase());

  describe('gas (Oxygen)', function () {
    it('is opaque in Base and Gas, dimmed in every other overlay', function () {
      const cell = elementCell('Oxygen');

      cell.cameraChanged(cameraFor(Overlay.Base));
      expect(cell.alpha).to.equal(1);

      cell.cameraChanged(cameraFor(Overlay.Gas));
      expect(cell.alpha).to.equal(1);

      cell.cameraChanged(cameraFor(Overlay.Power));
      expect(cell.alpha).to.equal(OVERLAY_DIMMED_ALPHA);

      cell.cameraChanged(cameraFor(Overlay.Liquid));
      expect(cell.alpha).to.equal(OVERLAY_DIMMED_ALPHA);
    });

    it('sits below buildings in Base and above dimmed buildings in Gas (one depth rule, not a gas-only hack)', function () {
      const cell = elementCell('Oxygen');
      const zIndex = cell.oniItem.zIndex;

      cell.cameraChanged(cameraFor(Overlay.Base));
      expect(cell.depth).to.equal(zIndex + 100);

      cell.cameraChanged(cameraFor(Overlay.Gas));
      expect(cell.depth).to.equal(zIndex + 50);

      cell.cameraChanged(cameraFor(Overlay.Power));
      expect(cell.depth).to.equal(zIndex);
    });

    it('renders its back+front sprites under solid display and None, but not blueprint display', function () {
      const cell = elementCell('Oxygen');

      cell.cameraChanged(cameraFor(Overlay.Base, Display.solid));
      expect(cell.drawParts.some(p => p.hasTag(SpriteTag.element_back) && p.visible)).to.equal(
        true
      );

      cell.cameraChanged(cameraFor(Overlay.Base, Display.None));
      expect(cell.drawParts.some(p => p.hasTag(SpriteTag.element_back) && p.visible)).to.equal(
        true
      );

      cell.cameraChanged(cameraFor(Overlay.Base, Display.blueprint));
      expect(cell.drawParts.every(p => !p.visible)).to.equal(true);
    });
  });

  describe('liquid (Water)', function () {
    it('is opaque in Base and Liquid, dimmed elsewhere — including Gas', function () {
      const cell = elementCell('Water');

      cell.cameraChanged(cameraFor(Overlay.Base));
      expect(cell.alpha).to.equal(1);

      cell.cameraChanged(cameraFor(Overlay.Liquid));
      expect(cell.alpha).to.equal(1);

      cell.cameraChanged(cameraFor(Overlay.Gas));
      expect(cell.alpha).to.equal(OVERLAY_DIMMED_ALPHA);
    });

    it('gets the same +100/+50/raw depth boost gas gets, in its own overlay', function () {
      const cell = elementCell('Water');
      const zIndex = cell.oniItem.zIndex;

      cell.cameraChanged(cameraFor(Overlay.Base));
      expect(cell.depth).to.equal(zIndex + 100);

      cell.cameraChanged(cameraFor(Overlay.Liquid));
      expect(cell.depth).to.equal(zIndex + 50);

      cell.cameraChanged(cameraFor(Overlay.Gas));
      expect(cell.depth).to.equal(zIndex);
    });
  });

  describe('solid (SandStone)', function () {
    it('is opaque only in Base; always sits at Backwall depth regardless of overlay', function () {
      const cell = elementCell('SandStone');

      cell.cameraChanged(cameraFor(Overlay.Base));
      expect(cell.alpha).to.equal(1);
      const backwallDepth = cell.depth;

      cell.cameraChanged(cameraFor(Overlay.Gas));
      expect(cell.alpha).to.equal(OVERLAY_DIMMED_ALPHA);
      expect(cell.depth).to.equal(backwallDepth);

      cell.cameraChanged(cameraFor(Overlay.Liquid));
      expect(cell.alpha).to.equal(OVERLAY_DIMMED_ALPHA);
      expect(cell.depth).to.equal(backwallDepth);
    });

    it('now renders (dimmed) outside Base instead of disappearing entirely', function () {
      const cell = elementCell('SandStone');
      cell.cameraChanged(cameraFor(Overlay.Power));
      expect(cell.drawParts.some(p => p.hasTag(SpriteTag.element_back) && p.visible)).to.equal(
        true
      );
    });
  });

  describe('vacuum', function () {
    it('shares gas overlay membership: opaque in Base and Gas, dimmed elsewhere', function () {
      const cell = elementCell('Vacuum');

      cell.cameraChanged(cameraFor(Overlay.Base));
      expect(cell.alpha).to.equal(1);

      cell.cameraChanged(cameraFor(Overlay.Gas));
      expect(cell.alpha).to.equal(1);

      cell.cameraChanged(cameraFor(Overlay.Liquid));
      expect(cell.alpha).to.equal(OVERLAY_DIMMED_ALPHA);
    });
  });

  describe('Room overlay', function () {
    it('maps to Base for every state, like BlueprintItem does for buildings', function () {
      const cell = elementCell('Oxygen');
      const zIndex = cell.oniItem.zIndex;

      cell.cameraChanged(cameraFor(Overlay.Room));

      expect(cell.alpha).to.equal(1);
      expect(cell.depth).to.equal(zIndex + 100);
    });
  });
});
