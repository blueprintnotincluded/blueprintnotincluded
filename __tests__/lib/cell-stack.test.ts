import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import {
  Blueprint,
  BlueprintHelpers,
  BlueprintItemElement,
  CameraService,
  CellStackEntry,
  CellStackVisibility,
  Display,
  Overlay,
  Vector2,
  cellStack,
} from '../../lib/index';
import { loadGameDatabase, place } from '../helpers/roomFixtures';

// lib/src/blueprint/cell-stack.ts — everything on one cell, top to bottom,
// behind the editor's hover card.

const ALL_VISIBLE: CellStackVisibility = { notes: true, terrain: true, digs: true };

function cameraFor(overlay: Overlay): CameraService {
  const camera = new CameraService(null);
  camera.overlay = overlay;
  camera.display = Display.solid;
  return camera;
}

// Depth is per overlay, set by cameraChanged — the same pass the editor runs.
function applyOverlay(blueprint: Blueprint, overlay: Overlay) {
  const camera = cameraFor(overlay);
  for (const item of blueprint.blueprintItems) item.cameraChanged(camera);
}

function addElementCell(blueprint: Blueprint, id: string, x: number, y: number) {
  const item = BlueprintHelpers.createInstance('Element') as BlueprintItemElement;
  item.setElement(id, 0);
  item.position = new Vector2(x, y);
  item.cleanUp();
  item.prepareBoundingBox();
  blueprint.addBlueprintItem(item);
  return item;
}

function describeStack(entries: CellStackEntry[]): string[] {
  return entries.map(entry => {
    switch (entry.kind) {
      case 'building':
        return `building:${entry.ref.id}`;
      case 'element':
        return `element:${entry.ref.buildableElements[0].id}`;
      default:
        return entry.kind;
    }
  });
}

describe('cellStack', function () {
  before(() => loadGameDatabase());

  it('is empty on an empty cell', () => {
    expect(cellStack(new Blueprint(), { x: 3, y: 3 }, ALL_VISIBLE)).to.deep.equal([]);
  });

  it('lists note, terrain, buildings, dig, then the cell contents', () => {
    const blueprint = new Blueprint();
    place(blueprint, 'Tile', 0, 0);
    place(blueprint, 'Wire', 0, 0);
    place(blueprint, 'GasConduit', 0, 0);
    addElementCell(blueprint, 'Oxygen', 0, 0);
    blueprint.worldNotes = [{ x: 0, y: 0, type: 0, title: 'Here' }];
    blueprint.terrainFeatures = [{ id: 'GeyserGeneric_steam', x: 0, y: -1 }];
    blueprint.digCommands = [{ x: 0, y: 0 }];
    applyOverlay(blueprint, Overlay.Base);

    const stack = cellStack(blueprint, { x: 0, y: 0 }, ALL_VISIBLE);

    expect(stack.map(entry => entry.kind)).to.deep.equal([
      'note',
      'terrain',
      'building',
      'building',
      'building',
      'dig',
      'element',
    ]);
  });

  it('orders the buildings frontmost first, as the Select click cycle does', () => {
    const blueprint = new Blueprint();
    place(blueprint, 'Tile', 0, 0);
    place(blueprint, 'Wire', 0, 0);
    place(blueprint, 'GasConduit', 0, 0);

    for (const overlay of [Overlay.Base, Overlay.Power, Overlay.Gas]) {
      applyOverlay(blueprint, overlay);
      const buildings = cellStack(blueprint, { x: 0, y: 0 }, ALL_VISIBLE).filter(
        entry => entry.kind === 'building'
      );
      const depths = buildings.map(entry => entry.ref.depth);
      expect(depths, Overlay[overlay]).to.deep.equal([...depths].sort((a, b) => b - a));
    }

    applyOverlay(blueprint, Overlay.Power);
    expect(describeStack(cellStack(blueprint, { x: 0, y: 0 }, ALL_VISIBLE))[0]).to.equal(
      'building:Wire'
    );
    applyOverlay(blueprint, Overlay.Gas);
    expect(describeStack(cellStack(blueprint, { x: 0, y: 0 }, ALL_VISIBLE))[0]).to.equal(
      'building:GasConduit'
    );
  });

  it('keeps a gas cell at the bottom although it draws above the buildings in Base', () => {
    const blueprint = new Blueprint();
    place(blueprint, 'Wire', 0, 0);
    const oxygen = addElementCell(blueprint, 'Oxygen', 0, 0);
    applyOverlay(blueprint, Overlay.Base);
    expect(oxygen.depth).to.be.greaterThan(blueprint.blueprintItems[0].depth);

    expect(describeStack(cellStack(blueprint, { x: 0, y: 0 }, ALL_VISIBLE))).to.deep.equal([
      'building:Wire',
      'element:Oxygen',
    ]);
  });

  it('lists an element note with the cell contents and a text note on top', () => {
    const blueprint = new Blueprint();
    place(blueprint, 'Wire', 0, 0);
    place(blueprint, 'Wire', 1, 0);
    blueprint.worldNotes = [
      { x: 0, y: 0, type: 1, id: 1, mass: 1, temp: 300 },
      { x: 1, y: 0, type: 0, title: 'Hello' },
    ];
    applyOverlay(blueprint, Overlay.Base);

    expect(describeStack(cellStack(blueprint, { x: 0, y: 0 }, ALL_VISIBLE))).to.deep.equal([
      'building:Wire',
      'elementNote',
    ]);
    expect(describeStack(cellStack(blueprint, { x: 1, y: 0 }, ALL_VISIBLE))).to.deep.equal([
      'note',
      'building:Wire',
    ]);
  });

  it('finds a 2x2 building from each of its cells', () => {
    const blueprint = new Blueprint();
    place(blueprint, 'GasPump', 4, 4);
    applyOverlay(blueprint, Overlay.Base);

    for (const cell of [
      { x: 4, y: 4 },
      { x: 5, y: 4 },
      { x: 4, y: 5 },
      { x: 5, y: 5 },
    ])
      expect(describeStack(cellStack(blueprint, cell, ALL_VISIBLE)), JSON.stringify(cell)).to.deep.equal([
        'building:GasPump',
      ]);
    expect(cellStack(blueprint, { x: 6, y: 4 }, ALL_VISIBLE)).to.deep.equal([]);
    expect(cellStack(blueprint, { x: 4, y: 6 }, ALL_VISIBLE)).to.deep.equal([]);
  });

  it('finds a terrain feature from any cell of its footprint', () => {
    const blueprint = new Blueprint();
    blueprint.terrainFeatures = [{ id: 'GeyserGeneric_steam', x: 10, y: 10 }];

    // A Cool Steam Vent is 2x4, anchored bottom-left.
    for (const cell of [
      { x: 10, y: 10 },
      { x: 11, y: 13 },
    ])
      expect(describeStack(cellStack(blueprint, cell, ALL_VISIBLE))).to.deep.equal(['terrain']);
    expect(cellStack(blueprint, { x: 12, y: 10 }, ALL_VISIBLE)).to.deep.equal([]);
    expect(cellStack(blueprint, { x: 10, y: 14 }, ALL_VISIBLE)).to.deep.equal([]);
  });

  it('leaves out the layers the view hides, but never a building', () => {
    const blueprint = new Blueprint();
    place(blueprint, 'Wire', 0, 0);
    blueprint.worldNotes = [{ x: 0, y: 0, type: 0, title: 'Here' }];
    blueprint.terrainFeatures = [{ id: 'GeyserGeneric_steam', x: 0, y: 0 }];
    blueprint.digCommands = [{ x: 0, y: 0 }];
    applyOverlay(blueprint, Overlay.Base);
    const at = (visibility: CellStackVisibility) =>
      describeStack(cellStack(blueprint, { x: 0, y: 0 }, visibility));

    expect(at({ notes: false, terrain: true, digs: true })).to.deep.equal([
      'terrain',
      'building:Wire',
      'dig',
    ]);
    expect(at({ notes: true, terrain: false, digs: true })).to.deep.equal([
      'note',
      'building:Wire',
      'dig',
    ]);
    expect(at({ notes: true, terrain: true, digs: false })).to.deep.equal([
      'note',
      'terrain',
      'building:Wire',
    ]);
    expect(at({ notes: false, terrain: false, digs: false })).to.deep.equal(['building:Wire']);
  });

  it('hides an element note with the notes layer', () => {
    const blueprint = new Blueprint();
    blueprint.worldNotes = [{ x: 0, y: 0, type: 1, id: 1, mass: 1, temp: 300 }];
    expect(cellStack(blueprint, { x: 0, y: 0 }, { ...ALL_VISIBLE, notes: false })).to.deep.equal(
      []
    );
  });
});
