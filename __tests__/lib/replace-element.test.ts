import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import {
  applyElementReplacement,
  BlueprintHelpers,
  BlueprintItem,
  BuildableElement,
  elementsInSelection,
  planElementReplacement,
  replacementCandidates,
} from '../../lib/index';
import { loadGameDatabase } from '../helpers/roomFixtures';

// Real buildings from the shipped database (assets/database/database-2024.json):
//   Wire            ["Metal"]              - ores only (Cuprite, Cobaltite, ...)
//   LiquidValve     ["Metal"]              - ores only
//   LiquidConduit   ["Plumbable&Metal"]    - ores plus Plumbable raw minerals (SandStone)
//   FishTrap        ["Plastic"]            - Plastic only
//   Ladder          ["BuildableRaw&BuildingWood"] - raw minerals (SandStone), no metals
//   GasConduitDiseaseSensor ["RefinedMetal","Plastic"] - two slots
function building(id: string, ...elements: string[]): BlueprintItem {
  const item = BlueprintHelpers.createInstance(id)!;
  item.cleanUp();
  elements.forEach((element, index) => item.setElement(element, index));
  return item;
}

describe('replace-element', function () {
  let cuprite: BuildableElement;
  let cobaltite: BuildableElement;
  let sandStone: BuildableElement;
  let plastic: BuildableElement;
  let copper: BuildableElement;

  before(() => {
    loadGameDatabase();
    cuprite = BuildableElement.getElement('Cuprite');
    cobaltite = BuildableElement.getElement('Cobaltite');
    sandStone = BuildableElement.getElement('SandStone');
    plastic = BuildableElement.getElement('Polypropylene');
    copper = BuildableElement.getElement('Copper');
  });

  describe('elementsInSelection', function () {
    it('lists each material once, in first-seen order, across every slot', function () {
      const items = [
        building('Wire', 'Cobaltite'),
        building('LiquidConduit', 'Cuprite'),
        building('Wire', 'Cobaltite'),
        building('GasConduitDiseaseSensor', 'Copper', 'Polypropylene'),
      ];
      expect(elementsInSelection(items)).to.deep.equal([cobaltite, cuprite, copper, plastic]);
    });

    it('ignores element annotations, which are not built of anything', function () {
      const cell = BlueprintHelpers.createInstance('Element')!;
      cell.setElement('Oxygen', 0);
      cell.cleanUp();
      expect(elementsInSelection([cell, building('Wire', 'Cuprite')])).to.deep.equal([cuprite]);
    });
  });

  describe('planElementReplacement', function () {
    it('rewrites only the slots holding X, on every building type in the selection', function () {
      const items = [
        building('Wire', 'Cobaltite'),
        building('LiquidValve', 'Cobaltite'),
        building('LiquidConduit', 'Cobaltite'),
        building('LiquidConduit', 'SandStone'),
      ];
      const plan = planElementReplacement(items, cobaltite, cuprite);
      expect(plan.changes.map(change => change.item)).to.deep.equal(items.slice(0, 3));
      expect(plan.changes.every(change => change.slots.length == 1 && change.slots[0] == 0)).to.equal(true);
      expect(plan.skipped).to.deep.equal([]);
    });

    it('skips buildings whose X slot cannot be made of Y', function () {
      const ladder = building('Ladder', 'SandStone');
      const pipe = building('LiquidConduit', 'SandStone');
      const plan = planElementReplacement([ladder, pipe], sandStone, cuprite);
      expect(plan.changes.map(change => change.item)).to.deep.equal([pipe]);
      expect(plan.skipped).to.deep.equal([ladder]);
    });

    it('touches only the slot that holds X on a multi-slot building', function () {
      const sensor = building('GasConduitDiseaseSensor', 'Copper', 'Polypropylene');
      const plan = planElementReplacement([sensor], plastic, copper);
      // Plastic sits in slot 1, whose category (Plastic) does not admit Copper.
      expect(plan.changes).to.deep.equal([]);
      expect(plan.skipped).to.deep.equal([sensor]);
    });

    it('is a no-op when X and Y are the same element', function () {
      const plan = planElementReplacement([building('Wire', 'Cuprite')], cuprite, cuprite);
      expect(plan.changes).to.deep.equal([]);
      expect(plan.skipped).to.deep.equal([]);
    });
  });

  describe('applyElementReplacement', function () {
    it('writes Y into the planned slots and nothing else', function () {
      const wire = building('Wire', 'Cobaltite');
      const pipe = building('LiquidConduit', 'SandStone');
      const trap = building('FishTrap', 'Polypropylene');
      wire.buildingData = [{ Key: 'Switch', Value: 1 } as any];

      const result = applyElementReplacement(
        planElementReplacement([wire, pipe, trap], cobaltite, cuprite)
      );

      expect(result.changes.map(change => change.item)).to.deep.equal([wire]);
      expect(wire.buildableElements[0]).to.equal(cuprite);
      expect(pipe.buildableElements[0]).to.equal(sandStone);
      expect(trap.buildableElements[0]).to.equal(plastic);
      expect(wire.buildingData).to.deep.equal([{ Key: 'Switch', Value: 1 }]);
      expect(wire.reloadCamera).to.equal(true);
    });
  });

  describe('replacementCandidates', function () {
    it('offers every element some X slot can take, X excluded, with a skip count', function () {
      const items = [
        building('Ladder', 'SandStone'),
        building('LiquidConduit', 'SandStone'),
        building('Wire', 'Cuprite'), // not made of X: contributes nothing
      ];
      const candidates = replacementCandidates(items, sandStone);
      const byId = new Map(candidates.map(candidate => [candidate.element.id, candidate.skipped]));

      expect(byId.has('SandStone')).to.equal(false);
      // Cuprite fits the pipe (Metal) but not the ladder: one skip.
      expect(byId.get('Cuprite')).to.equal(1);
      // A raw mineral both can take is skip-free.
      expect(byId.get('Granite')).to.equal(0);
      // Plastic fits neither, so it is not offered at all.
      expect(byId.has('Polypropylene')).to.equal(false);
    });

    it('is empty when nothing in the selection is made of X', function () {
      expect(replacementCandidates([building('Wire', 'Cuprite')], plastic)).to.deep.equal([]);
    });
  });
});
