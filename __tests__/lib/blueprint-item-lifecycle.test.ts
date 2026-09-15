import { describe, it } from 'mocha';
import { expect } from 'chai';
import { BlueprintItem } from '../../lib/index';
import { loadGameDatabase } from '../helpers/roomFixtures';

// A destroyed BlueprintItem used to stay indistinguishable from a live one:
// destroy() left containerCreated = true and the destroyed PIXI container in
// place, so any drawing path that still held a reference hit `container.x =` on
// a null transform. drawPixi runs inside the PIXI ticker, where one throw stops
// every later frame -- the editor simply stops repainting, with no build
// preview and no visible response to anything.
describe('BlueprintItem lifecycle after destroy', function () {
  // Minimal stand-ins: destroy() and drawPixi only touch these members, and a
  // real PIXI container cannot be built under mocha.
  const fakeContainer = () => {
    const calls = { destroyed: 0 };
    return {
      calls,
      destroy() {
        calls.destroyed++;
      },
    };
  };

  const makeItem = () => {
    loadGameDatabase();
    const item = new BlueprintItem('Tile');
    item.cleanUp();
    return item;
  };

  it('drops the PIXI container instead of keeping a destroyed one', function () {
    const item = makeItem();
    const container = fakeContainer();
    item.container = container;
    item.containerCreated = true;

    item.destroy();

    expect(container.calls.destroyed, 'container destroyed').to.equal(1);
    expect(item.container, 'container reference').to.equal(null);
    expect(item.containerCreated, 'containerCreated').to.equal(false);
    expect(item.destroyed).to.equal(true);
  });

  it('destroys and clears the utility sprites', function () {
    const item = makeItem();
    const a = fakeContainer();
    const b = fakeContainer();
    item.utilitySprites = [a, null, b];

    item.destroy();

    expect(a.calls.destroyed).to.equal(1);
    expect(b.calls.destroyed).to.equal(1);
    expect(item.utilitySprites).to.deep.equal([]);
  });

  it('is idempotent', function () {
    const item = makeItem();
    const container = fakeContainer();
    item.container = container;
    item.containerCreated = true;

    item.destroy();
    item.destroy();

    expect(container.calls.destroyed).to.equal(1);
  });

  it('setDrawnVisible toggles the container and the utility sprites', function () {
    const item = makeItem();
    const container: any = { visible: true, destroy() {} };
    const spriteA: any = { visible: true, destroy() {} };
    item.container = container;
    item.utilitySprites = [spriteA, null];

    item.setDrawnVisible(false);
    expect(container.visible).to.equal(false);
    expect(spriteA.visible).to.equal(false);

    item.setDrawnVisible(true);
    expect(container.visible).to.equal(true);
    expect(spriteA.visible).to.equal(true);
  });

  it('setDrawnVisible does not throw when nothing has been drawn', function () {
    const item = makeItem();
    expect(() => item.setDrawnVisible(false)).to.not.throw();
  });

  // The safety net. Without it, clearing the container above would make the
  // next draw build a fresh one and resurrect an item that is meant to be gone.
  it('never draws once destroyed, and does not resurrect its container', function () {
    const item = makeItem();
    item.container = fakeContainer();
    item.containerCreated = true;
    item.destroy();

    const pixiUtil: any = {
      getNewContainer: () => {
        throw new Error('drawPixi rebuilt the container of a destroyed item');
      },
    };
    const camera: any = { overlay: 0, cameraOffset: { x: 0, y: 0 }, currentZoom: 32 };

    expect(() => item.drawPixi(camera, pixiUtil)).to.not.throw();
    expect(item.container).to.equal(null);
    expect(item.containerCreated).to.equal(false);
  });
});
