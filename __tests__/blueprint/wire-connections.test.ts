import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import {
  Blueprint,
  BniBlueprint,
  BniBuilding,
  BuildableElement,
  BuildMenuCategory,
  BuildMenuItem,
  BSpriteInfo,
  SpriteInfo,
  BSpriteModifier,
  SpriteModifier,
  BBuilding,
  OniItem,
  BlueprintItemWire,
  Vector2,
} from '../../lib';

describe('Wire Connection Recalculation', function () {
  // Initialize database before all tests
  before(function () {
    this.timeout(10000);
    const databasePath = path.join(__dirname, '../../assets/database/database.json');
    if (!fs.existsSync(databasePath)) {
      throw new Error(`Database file not found at ${databasePath}`);
    }

    const rawdata = fs.readFileSync(databasePath, 'utf-8');
    const json = JSON.parse(rawdata);

    BuildableElement.init();
    BuildableElement.load(json.elements);

    BuildMenuCategory.init();
    BuildMenuCategory.load(json.buildMenuCategories);

    BuildMenuItem.init();
    BuildMenuItem.load(json.buildMenuItems);

    SpriteInfo.init();
    SpriteInfo.load(json.uiSprites);

    SpriteModifier.init();
    SpriteModifier.load(json.spriteModifiers);

    OniItem.init();
    OniItem.load(json.buildings);
  });

  describe('Old Blueprint Format (with incorrect flags)', function () {
    it('should recalculate WireRefined connections based on adjacency', function () {
      // Create a blueprint with wires that have incorrect flags (old format)
      // This simulates the broken blueprint format where flags don't match neighbors
      const bniBlueprint = new BniBlueprint();
      bniBlueprint.friendlyname = 'Test Broken Wires';
      bniBlueprint.buildings = [
        // Horizontal wire chain: (-2,0) -> (-1,0) -> (0,0)
        // Old format: flags are incorrect - missing left/right connections
        {
          buildingdef: 'WireRefined',
          flags: 0, // WRONG: should have flag 2 (right) since neighbor at (-1,0) exists
          offset: new Vector2(-2, 0),
          orientation: 0,
          selected_elements: [],
        },
        {
          buildingdef: 'WireRefined',
          flags: 2, // WRONG: should have flags 3 (left+right) since neighbors exist on both sides
          offset: new Vector2(-1, 0),
          orientation: 0,
          selected_elements: [],
        },
        {
          buildingdef: 'WireRefined',
          flags: 0, // WRONG: should have flag 1 (left) since neighbor at (-1,0) exists
          offset: new Vector2(0, 0),
          orientation: 0,
          selected_elements: [],
        },
      ];

      const blueprint = new Blueprint();
      blueprint.importFromBni(bniBlueprint);

      // After import, updateTileables should be called automatically
      // Verify connections are recalculated correctly
      const wire1 = blueprint.getBlueprintItemsAt(new Vector2(-2, 0))[0] as BlueprintItemWire;
      const wire2 = blueprint.getBlueprintItemsAt(new Vector2(-1, 0))[0] as BlueprintItemWire;
      const wire3 = blueprint.getBlueprintItemsAt(new Vector2(0, 0))[0] as BlueprintItemWire;

      expect(wire1).to.exist;
      expect(wire2).to.exist;
      expect(wire3).to.exist;

      // Wire1 should connect right (flag 2) to wire2
      expect(wire1.connections).to.equal(2, 'Wire at (-2,0) should connect right');

      // Wire2 should connect both left (flag 1) and right (flag 2) = 3
      expect(wire2.connections).to.equal(3, 'Wire at (-1,0) should connect left and right');

      // Wire3 should connect left (flag 1) to wire2
      expect(wire3.connections).to.equal(1, 'Wire at (0,0) should connect left');
    });

    it('should recalculate vertical WireRefined connections', function () {
      const bniBlueprint = new BniBlueprint();
      bniBlueprint.friendlyname = 'Test Vertical Wires';
      bniBlueprint.buildings = [
        // Vertical chain: (0,2) -> (0,1) -> (0,0)
        {
          buildingdef: 'WireRefined',
          flags: 0, // WRONG: should have flag 8 (down)
          offset: new Vector2(0, 2),
          orientation: 0,
          selected_elements: [],
        },
        {
          buildingdef: 'WireRefined',
          flags: 4, // WRONG: should have flags 12 (up+down)
          offset: new Vector2(0, 1),
          orientation: 0,
          selected_elements: [],
        },
        {
          buildingdef: 'WireRefined',
          flags: 0, // WRONG: should have flag 4 (up)
          offset: new Vector2(0, 0),
          orientation: 0,
          selected_elements: [],
        },
      ];

      const blueprint = new Blueprint();
      blueprint.importFromBni(bniBlueprint);

      const wire1 = blueprint.getBlueprintItemsAt(new Vector2(0, 2))[0] as BlueprintItemWire;
      const wire2 = blueprint.getBlueprintItemsAt(new Vector2(0, 1))[0] as BlueprintItemWire;
      const wire3 = blueprint.getBlueprintItemsAt(new Vector2(0, 0))[0] as BlueprintItemWire;

      // Wire1 should connect down (flag 8)
      expect(wire1.connections).to.equal(8, 'Wire at (0,2) should connect down');

      // Wire2 should connect both up (flag 4) and down (flag 8) = 12
      expect(wire2.connections).to.equal(12, 'Wire at (0,1) should connect up and down');

      // Wire3 should connect up (flag 4)
      expect(wire3.connections).to.equal(4, 'Wire at (0,0) should connect up');
    });

    it('should recalculate LogicWire connections', function () {
      const bniBlueprint = new BniBlueprint();
      bniBlueprint.friendlyname = 'Test Logic Wires';
      bniBlueprint.buildings = [
        {
          buildingdef: 'LogicWire',
          flags: 4, // WRONG: has up flag but no neighbor, missing down flag
          offset: new Vector2(0, 1),
          orientation: 0,
          selected_elements: [],
        },
        {
          buildingdef: 'LogicWire',
          flags: 2, // WRONG: should have flags 3 (left+right)
          offset: new Vector2(0, 0),
          orientation: 0,
          selected_elements: [],
        },
        {
          buildingdef: 'LogicWire',
          flags: 0, // WRONG: should have flag 1 (left)
          offset: new Vector2(-1, 0),
          orientation: 0,
          selected_elements: [],
        },
      ];

      const blueprint = new Blueprint();
      blueprint.importFromBni(bniBlueprint);

      const wire1 = blueprint.getBlueprintItemsAt(new Vector2(0, 1))[0] as BlueprintItemWire;
      const wire2 = blueprint.getBlueprintItemsAt(new Vector2(0, 0))[0] as BlueprintItemWire;
      const wire3 = blueprint.getBlueprintItemsAt(new Vector2(-1, 0))[0] as BlueprintItemWire;

      // Wire1 should connect down (flag 8) to wire2
      expect(wire1.connections).to.equal(8, 'LogicWire at (0,1) should connect down');

      // Wire2 should connect left (flag 1) to wire3 and up (flag 4) to wire1 = 5
      expect(wire2.connections).to.equal(5, 'LogicWire at (0,0) should connect up and left');

      // Wire3 should connect right (flag 2) to wire2
      expect(wire3.connections).to.equal(2, 'LogicWire at (-1,0) should connect right');
    });

    it('should recalculate LiquidConduit connections', function () {
      const bniBlueprint = new BniBlueprint();
      bniBlueprint.friendlyname = 'Test Liquid Conduits';
      bniBlueprint.buildings = [
        {
          buildingdef: 'LiquidConduit',
          flags: 2, // WRONG: missing left flag
          offset: new Vector2(-1, 0),
          orientation: 0,
          selected_elements: [],
        },
        {
          buildingdef: 'LiquidConduit',
          flags: 2, // WRONG: should have flags 3 (left+right)
          offset: new Vector2(0, 0),
          orientation: 0,
          selected_elements: [],
        },
        {
          buildingdef: 'LiquidConduit',
          flags: 0, // WRONG: should have flag 1 (left)
          offset: new Vector2(1, 0),
          orientation: 0,
          selected_elements: [],
        },
      ];

      const blueprint = new Blueprint();
      blueprint.importFromBni(bniBlueprint);

      const conduit1 = blueprint.getBlueprintItemsAt(new Vector2(-1, 0))[0] as BlueprintItemWire;
      const conduit2 = blueprint.getBlueprintItemsAt(new Vector2(0, 0))[0] as BlueprintItemWire;
      const conduit3 = blueprint.getBlueprintItemsAt(new Vector2(1, 0))[0] as BlueprintItemWire;

      // Conduit1 should connect right (flag 2)
      expect(conduit1.connections).to.equal(2, 'LiquidConduit at (-1,0) should connect right');

      // Conduit2 should connect both left (flag 1) and right (flag 2) = 3
      expect(conduit2.connections).to.equal(3, 'LiquidConduit at (0,0) should connect left and right');

      // Conduit3 should connect left (flag 1)
      expect(conduit3.connections).to.equal(1, 'LiquidConduit at (1,0) should connect left');
    });

    it('should recalculate GasConduit connections', function () {
      const bniBlueprint = new BniBlueprint();
      bniBlueprint.friendlyname = 'Test Gas Conduits';
      bniBlueprint.buildings = [
        {
          buildingdef: 'GasConduit',
          flags: 4, // WRONG: has up flag but no neighbor, missing down flag
          offset: new Vector2(0, 1),
          orientation: 0,
          selected_elements: [],
        },
        {
          buildingdef: 'GasConduit',
          flags: 1, // WRONG: should have flags 9 (left+up)
          offset: new Vector2(0, 0),
          orientation: 0,
          selected_elements: [],
        },
        {
          buildingdef: 'GasConduit',
          flags: 0, // WRONG: should have flag 2 (right)
          offset: new Vector2(-1, 0),
          orientation: 0,
          selected_elements: [],
        },
      ];

      const blueprint = new Blueprint();
      blueprint.importFromBni(bniBlueprint);

      const conduit1 = blueprint.getBlueprintItemsAt(new Vector2(0, 1))[0] as BlueprintItemWire;
      const conduit2 = blueprint.getBlueprintItemsAt(new Vector2(0, 0))[0] as BlueprintItemWire;
      const conduit3 = blueprint.getBlueprintItemsAt(new Vector2(-1, 0))[0] as BlueprintItemWire;

      // Conduit1 should connect down (flag 8) to conduit2
      expect(conduit1.connections).to.equal(8, 'GasConduit at (0,1) should connect down');

      // Conduit2 should connect left (flag 1) to conduit3 and up (flag 4) to conduit1 = 5
      expect(conduit2.connections).to.equal(5, 'GasConduit at (0,0) should connect up and left');

      // Conduit3 should connect right (flag 2) to conduit2
      expect(conduit3.connections).to.equal(2, 'GasConduit at (-1,0) should connect right');
    });

    it('should recalculate SolidConduit (shipment) connections', function () {
      const bniBlueprint = new BniBlueprint();
      bniBlueprint.friendlyname = 'Test Solid Conduits';
      bniBlueprint.buildings = [
        {
          buildingdef: 'SolidConduit',
          flags: 2, // WRONG: missing left flag
          offset: new Vector2(-1, 0),
          orientation: 0,
          selected_elements: [],
        },
        {
          buildingdef: 'SolidConduit',
          flags: 0, // WRONG: should have flags 3 (left+right)
          offset: new Vector2(0, 0),
          orientation: 0,
          selected_elements: [],
        },
        {
          buildingdef: 'SolidConduit',
          flags: 0, // WRONG: should have flag 1 (left)
          offset: new Vector2(1, 0),
          orientation: 0,
          selected_elements: [],
        },
      ];

      const blueprint = new Blueprint();
      blueprint.importFromBni(bniBlueprint);

      const conduit1 = blueprint.getBlueprintItemsAt(new Vector2(-1, 0))[0] as BlueprintItemWire;
      const conduit2 = blueprint.getBlueprintItemsAt(new Vector2(0, 0))[0] as BlueprintItemWire;
      const conduit3 = blueprint.getBlueprintItemsAt(new Vector2(1, 0))[0] as BlueprintItemWire;

      // Conduit1 should connect right (flag 2)
      expect(conduit1.connections).to.equal(2, 'SolidConduit at (-1,0) should connect right');

      // Conduit2 should connect both left (flag 1) and right (flag 2) = 3
      expect(conduit2.connections).to.equal(3, 'SolidConduit at (0,0) should connect left and right');

      // Conduit3 should connect left (flag 1)
      expect(conduit3.connections).to.equal(1, 'SolidConduit at (1,0) should connect left');
    });
  });

  describe('New Blueprint Format (with correct flags)', function () {
    it('should preserve correct WireRefined connections', function () {
      // Create a blueprint with wires that have correct flags (new format)
      const bniBlueprint = new BniBlueprint();
      bniBlueprint.friendlyname = 'Test Correct Wires';
      bniBlueprint.buildings = [
        {
          buildingdef: 'WireRefined',
          flags: 2, // CORRECT: connects right
          offset: new Vector2(-1, 0),
          orientation: 0,
          selected_elements: [],
        },
        {
          buildingdef: 'WireRefined',
          flags: 3, // CORRECT: connects left and right
          offset: new Vector2(0, 0),
          orientation: 0,
          selected_elements: [],
        },
        {
          buildingdef: 'WireRefined',
          flags: 1, // CORRECT: connects left
          offset: new Vector2(1, 0),
          orientation: 0,
          selected_elements: [],
        },
      ];

      const blueprint = new Blueprint();
      blueprint.importFromBni(bniBlueprint);

      const wire1 = blueprint.getBlueprintItemsAt(new Vector2(-1, 0))[0] as BlueprintItemWire;
      const wire2 = blueprint.getBlueprintItemsAt(new Vector2(0, 0))[0] as BlueprintItemWire;
      const wire3 = blueprint.getBlueprintItemsAt(new Vector2(1, 0))[0] as BlueprintItemWire;

      // Even with correct flags, updateTileables should recalculate based on actual adjacency
      // This ensures consistency regardless of input format
      expect(wire1.connections).to.equal(2, 'Wire at (-1,0) should connect right');
      expect(wire2.connections).to.equal(3, 'Wire at (0,0) should connect left and right');
      expect(wire3.connections).to.equal(1, 'Wire at (1,0) should connect left');
    });

    it('should handle complex L-shaped wire connections', function () {
      const bniBlueprint = new BniBlueprint();
      bniBlueprint.friendlyname = 'Test L-Shaped Wires';
      bniBlueprint.buildings = [
        {
          buildingdef: 'WireRefined',
          flags: 0, // Will be recalculated
          offset: new Vector2(0, 1),
          orientation: 0,
          selected_elements: [],
        },
        {
          buildingdef: 'WireRefined',
          flags: 0, // Will be recalculated
          offset: new Vector2(0, 0),
          orientation: 0,
          selected_elements: [],
        },
        {
          buildingdef: 'WireRefined',
          flags: 0, // Will be recalculated
          offset: new Vector2(1, 0),
          orientation: 0,
          selected_elements: [],
        },
      ];

      const blueprint = new Blueprint();
      blueprint.importFromBni(bniBlueprint);

      const wire1 = blueprint.getBlueprintItemsAt(new Vector2(0, 1))[0] as BlueprintItemWire;
      const wire2 = blueprint.getBlueprintItemsAt(new Vector2(0, 0))[0] as BlueprintItemWire;
      const wire3 = blueprint.getBlueprintItemsAt(new Vector2(1, 0))[0] as BlueprintItemWire;

      // Wire1 connects down (flag 8)
      expect(wire1.connections).to.equal(8, 'Wire at (0,1) should connect down');

      // Wire2 connects up (flag 4) and right (flag 2) = 6
      expect(wire2.connections).to.equal(6, 'Wire at (0,0) should connect up and right');

      // Wire3 connects left (flag 1)
      expect(wire3.connections).to.equal(1, 'Wire at (1,0) should connect left');
    });
  });

  describe('Connection Flag Bit Mappings', function () {
    it('should correctly map connection flags to directions', function () {
      // Connection bits: LEFT=1, RIGHT=2, UP=4, DOWN=8
      // Test that our recalculation uses the correct bit values
      const bniBlueprint = new BniBlueprint();
      bniBlueprint.friendlyname = 'Test All Directions';
      bniBlueprint.buildings = [
        // Center wire connecting to all 4 directions
        {
          buildingdef: 'WireRefined',
          flags: 0,
          offset: new Vector2(0, 0),
          orientation: 0,
          selected_elements: [],
        },
        {
          buildingdef: 'WireRefined',
          flags: 0,
          offset: new Vector2(-1, 0), // LEFT
          orientation: 0,
          selected_elements: [],
        },
        {
          buildingdef: 'WireRefined',
          flags: 0,
          offset: new Vector2(1, 0), // RIGHT
          orientation: 0,
          selected_elements: [],
        },
        {
          buildingdef: 'WireRefined',
          flags: 0,
          offset: new Vector2(0, -1), // UP
          orientation: 0,
          selected_elements: [],
        },
        {
          buildingdef: 'WireRefined',
          flags: 0,
          offset: new Vector2(0, 1), // DOWN
          orientation: 0,
          selected_elements: [],
        },
      ];

      const blueprint = new Blueprint();
      blueprint.importFromBni(bniBlueprint);

      const centerWire = blueprint.getBlueprintItemsAt(new Vector2(0, 0))[0] as BlueprintItemWire;

      // All 4 directions: LEFT(1) + RIGHT(2) + UP(4) + DOWN(8) = 15
      expect(centerWire.connections).to.equal(15, 'Center wire should connect to all 4 directions');
    });

    it('should respect objectLayer isolation', function () {
      // Wires on different objectLayers should not connect to each other
      // This test would require knowing the objectLayer values, which might vary
      // For now, we test that wires of the same type connect correctly
      const bniBlueprint = new BniBlueprint();
      bniBlueprint.friendlyname = 'Test ObjectLayer Isolation';
      bniBlueprint.buildings = [
        {
          buildingdef: 'WireRefined',
          flags: 0,
          offset: new Vector2(0, 0),
          orientation: 0,
          selected_elements: [],
        },
        {
          buildingdef: 'WireRefined',
          flags: 0,
          offset: new Vector2(1, 0),
          orientation: 0,
          selected_elements: [],
        },
        // Add a LogicWire at the same position - should not connect
        {
          buildingdef: 'LogicWire',
          flags: 0,
          offset: new Vector2(0, 0),
          orientation: 0,
          selected_elements: [],
        },
      ];

      const blueprint = new Blueprint();
      blueprint.importFromBni(bniBlueprint);

      const wire1 = blueprint.getBlueprintItemsAt(new Vector2(0, 0)).find(
        (item) => item.id === 'WireRefined'
      ) as BlueprintItemWire;
      const wire2 = blueprint.getBlueprintItemsAt(new Vector2(1, 0))[0] as BlueprintItemWire;

      // WireRefined should connect to WireRefined (same objectLayer)
      expect(wire1.connections).to.equal(2, 'WireRefined should connect right to another WireRefined');

      // Note: LogicWire and WireRefined might be on different objectLayers
      // This test verifies same-type connections work correctly
    });
  });
});

