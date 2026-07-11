import { expect } from 'chai';
import {
  Blueprint,
  Cavity,
  detectRooms,
  MAX_ROOM_SIZE,
  ROOM_DEFINITIONS,
  ROOM_TYPE_IDS,
  roomSearchTags,
  RoomTypeId,
} from '../../lib';
import {
  addRoomShell,
  blueprintFromAscii,
  loadGameDatabase,
  place,
  roomBlueprint,
  Placement,
} from '../helpers/roomFixtures';

// Detected room types of a blueprint, in cavity order.
const detectedTypes = (blueprint: Blueprint): RoomTypeId[] =>
  detectRooms(blueprint).rooms.map(r => r.type);

// Single enclosed cavity of the blueprint (fails if there isn't exactly one).
const singleCavity = (blueprint: Blueprint): Cavity => {
  const result = detectRooms(blueprint);
  expect(result.status).to.equal('ok');
  expect(result.cavities).to.have.length(1);
  return result.cavities[0];
};

describe('room detector', function () {
  before(function () {
    loadGameDatabase();
  });

  describe('definitions table', () => {
    it('covers all 18 room type ids exactly once', () => {
      expect(ROOM_DEFINITIONS.map(d => d.id).sort()).to.deep.equal([...ROOM_TYPE_IDS].sort());
    });

    it('override targets are valid room type ids', () => {
      for (const def of ROOM_DEFINITIONS)
        for (const target of def.overrides ?? [])
          expect(ROOM_TYPE_IDS).to.include(target);
    });
  });

  describe('statuses and caps', () => {
    it('empty blueprint -> status empty', () => {
      const result = detectRooms(new Blueprint());
      expect(result.status).to.equal('empty');
      expect(result.rooms).to.deep.equal([]);
      expect(result.cavities).to.deep.equal([]);
    });

    it('bounding box beyond MAX_DETECTION_AREA -> status too-large, nothing computed', () => {
      const blueprint = new Blueprint();
      place(blueprint, 'Tile', 0, 0);
      place(blueprint, 'Tile', 300, 300); // 301×301 bbox > 65,536 cells
      const result = detectRooms(blueprint);
      expect(result.status).to.equal('too-large');
      expect(result.rooms).to.deep.equal([]);
      expect(result.cavities).to.deep.equal([]);
    });

    it(`cavity over ${MAX_ROOM_SIZE} cells -> too-large-for-room, no rule evaluation`, () => {
      // 26×5 interior = 130 cells with a park sign that would otherwise match.
      const blueprint = roomBlueprint(26, 5, [{ id: 'ParkSign', x: 0, y: 0 }]);
      const cavity = singleCavity(blueprint);
      expect(cavity.size).to.equal(130);
      expect(cavity.result).to.equal('too-large-for-room');
      expect(cavity.matchedTypes).to.deep.equal([]);
      expect(detectedTypes(blueprint)).to.deep.equal([]);
    });

    it('cavity of exactly 120 cells still evaluates (nature reserve)', () => {
      const blueprint = roomBlueprint(24, 5, [{ id: 'ParkSign', x: 0, y: 0 }]);
      expect(detectedTypes(blueprint)).to.deep.equal(['natureReserve']);
    });
  });

  describe('enclosure (flood fill)', () => {
    const sealedRows = [
      'WWWWWWWW',
      'W......W',
      'W......W',
      'Wb.....W',
      'WWWWWWWW',
    ];

    it('sealed room detects, one-tile wall gap leaks to outside', () => {
      const sealed = blueprintFromAscii(sealedRows, { b: 'Bed' });
      expect(detectedTypes(sealed)).to.deep.equal(['barracks']);

      const leaky = blueprintFromAscii(
        sealedRows.map((row, i) => (i === 0 ? 'WWWW.WWW' : row)),
        { b: 'Bed' }
      );
      const result = detectRooms(leaky);
      expect(result.status).to.equal('ok');
      expect(result.rooms).to.deep.equal([]);
      expect(result.cavities).to.deep.equal([]); // everything reached the outside
    });

    it('a wire does not seal a gap (only foundations bound rooms)', () => {
      const wired = blueprintFromAscii(
        sealedRows.map((row, i) => (i === 0 ? 'WWWWcWWW' : row)),
        { b: 'Bed', c: 'Wire' }
      );
      expect(detectRooms(wired).rooms).to.deep.equal([]);
    });

    it('a door seals the room and its cells do not count toward size', () => {
      // Right wall has a 2-cell gap; the pneumatic door (1×2) fills it exactly.
      const rows = [
        'WWWWWWWW',
        'W......W',
        'W.......',
        'Wb.....D',
        'WWWWWWWW',
      ];
      const withDoor = blueprintFromAscii(rows, { b: 'Bed', D: 'Door' });
      const result = detectRooms(withDoor);
      expect(result.rooms.map(r => r.type)).to.deep.equal(['barracks']);
      expect(result.rooms[0].size).to.equal(18); // 6×3 interior, door cells excluded

      const doorless = blueprintFromAscii(rows, { b: 'Bed', D: 'Wire' });
      expect(detectRooms(doorless).rooms).to.deep.equal([]);
    });

    it('all curated door prefabs bound rooms', () => {
      for (const door of ['Door', 'WoodenDoor', 'ManualPressureDoor', 'PressureDoor', 'InsulatedDoor']) {
        const blueprint = blueprintFromAscii(
          [
            'WWWWWWWW',
            'W......W',
            'W.......',
            'Wb.....D',
            'WWWWWWWW',
          ],
          { b: 'Bed', D: door }
        );
        expect(detectedTypes(blueprint), door).to.deep.equal(['barracks']);
      }
    });
  });

  describe('room types (minimal pass per type)', () => {
    const cases: { type: RoomTypeId; w: number; h: number; contents: Placement[] }[] = [
      {
        type: 'latrine',
        w: 4,
        h: 3,
        contents: [
          { id: 'Outhouse', x: 0, y: 0 },
          { id: 'WashBasin', x: 2, y: 0 },
        ],
      },
      {
        type: 'washroom',
        w: 4,
        h: 3,
        contents: [
          { id: 'FlushToilet', x: 0, y: 0 },
          { id: 'WashSink', x: 2, y: 0 },
        ],
      },
      { type: 'barracks', w: 4, h: 3, contents: [{ id: 'Bed', x: 0, y: 0 }] },
      {
        type: 'luxuryBarracks',
        w: 6,
        h: 4,
        contents: [
          { id: 'LuxuryBed', x: 0, y: 0 },
          { id: 'FlowerVase', x: 4, y: 0 },
        ],
      },
      { type: 'messHall', w: 4, h: 3, contents: [{ id: 'DiningTable', x: 0, y: 0 }] },
      {
        type: 'greatHall',
        w: 8,
        h: 4,
        contents: [
          { id: 'DiningTable', x: 0, y: 0 },
          { id: 'WaterCooler', x: 1, y: 0 },
          { id: 'ItemPedestal', x: 3, y: 0 },
        ],
      },
      {
        type: 'banquetHall',
        w: 8,
        h: 4,
        contents: [
          { id: 'MultiMinionDiningTable', x: 0, y: 0 },
          { id: 'Shelf', x: 6, y: 0 },
        ],
      },
      {
        type: 'massageClinic',
        w: 4,
        h: 3,
        contents: [
          { id: 'MassageTable', x: 0, y: 0 },
          { id: 'FlowerVase', x: 2, y: 0 },
        ],
      },
      {
        type: 'hospital',
        w: 6,
        h: 3,
        contents: [
          { id: 'MedicalCot', x: 0, y: 0 },
          { id: 'Outhouse', x: 3, y: 0 },
          { id: 'DiningTable', x: 5, y: 0 },
        ],
      },
      {
        type: 'recreationRoom',
        w: 4,
        h: 3,
        contents: [
          { id: 'WaterCooler', x: 0, y: 0 },
          { id: 'FlowerVase', x: 2, y: 0 },
        ],
      },
      { type: 'park', w: 4, h: 3, contents: [{ id: 'ParkSign', x: 0, y: 0 }] },
      { type: 'natureReserve', w: 13, h: 5, contents: [{ id: 'ParkSign', x: 0, y: 0 }] },
      {
        type: 'kitchen',
        w: 6,
        h: 3,
        contents: [
          { id: 'SpiceGrinder', x: 0, y: 0 },
          { id: 'CookingStation', x: 2, y: 0 },
          { id: 'Refrigerator', x: 5, y: 0 },
        ],
      },
      { type: 'powerPlant', w: 4, h: 3, contents: [{ id: 'MachineShop', x: 0, y: 0 }] },
      { type: 'greenhouse', w: 4, h: 3, contents: [{ id: 'FarmStation', x: 0, y: 0 }] },
      {
        type: 'laboratory',
        w: 8,
        h: 4,
        contents: [
          { id: 'ResearchCenter', x: 0, y: 0 },
          { id: 'AdvancedResearchCenter', x: 2, y: 0 },
        ],
      },
      { type: 'stable', w: 4, h: 3, contents: [{ id: 'RanchStation', x: 0, y: 0 }] },
    ];

    for (const c of cases) {
      it(`${c.type} (${c.w}×${c.h})`, () => {
        expect(detectedTypes(roomBlueprint(c.w, c.h, c.contents))).to.deep.equal([c.type]);
      });
    }

    it('privateBedroom (luxury bed + 2 decor + ceiling 4 + full backwall)', () => {
      const contents: Placement[] = [
        { id: 'LuxuryBed', x: 0, y: 0 },
        { id: 'FlowerVase', x: 4, y: 0 },
        { id: 'FlowerVase', x: 5, y: 0 },
      ];
      for (let x = 0; x < 6; x++)
        for (let y = 0; y < 4; y++) contents.push({ id: 'ExteriorWall', x, y });
      expect(detectedTypes(roomBlueprint(6, 4, contents))).to.deep.equal(['privateBedroom']);
    });
  });

  describe('constraint failures', () => {
    it('toilet without wash station is not a latrine', () => {
      const cavity = singleCavity(roomBlueprint(4, 3, [{ id: 'Outhouse', x: 0, y: 0 }]));
      expect(cavity.result).to.equal('miscellaneous');
      expect(cavity.matchedTypes).to.deep.equal([]);
    });

    it('industrial machinery disqualifies a latrine', () => {
      const blueprint = roomBlueprint(7, 3, [
        { id: 'Outhouse', x: 0, y: 0 },
        { id: 'WashBasin', x: 2, y: 0 },
        { id: 'Generator', x: 4, y: 0 },
      ]);
      expect(singleCavity(blueprint).result).to.equal('miscellaneous');
    });

    it('an outhouse spoils an otherwise valid washroom (falls back to latrine)', () => {
      const blueprint = roomBlueprint(6, 3, [
        { id: 'FlushToilet', x: 0, y: 0 },
        { id: 'WashSink', x: 2, y: 0 },
        { id: 'Outhouse', x: 4, y: 0 },
      ]);
      expect(detectedTypes(blueprint)).to.deep.equal(['latrine']);
    });

    it('ceiling below 4 downgrades a luxury barracks to barracks', () => {
      const blueprint = roomBlueprint(8, 3, [
        { id: 'LuxuryBed', x: 0, y: 0 },
        { id: 'FlowerVase', x: 4, y: 0 },
      ]);
      expect(detectedTypes(blueprint)).to.deep.equal(['barracks']);
    });

    it('a non-luxury bed downgrades a luxury barracks to barracks', () => {
      const blueprint = roomBlueprint(8, 4, [
        { id: 'LuxuryBed', x: 0, y: 0 },
        { id: 'Bed', x: 4, y: 0 },
        { id: 'FlowerVase', x: 6, y: 0 },
      ]);
      expect(detectedTypes(blueprint)).to.deep.equal(['barracks']);
    });

    it('one uncovered cell fails backwallComplete (private bedroom -> luxury barracks)', () => {
      const contents: Placement[] = [
        { id: 'LuxuryBed', x: 0, y: 0 },
        { id: 'FlowerVase', x: 4, y: 0 },
        { id: 'FlowerVase', x: 5, y: 0 },
      ];
      for (let x = 0; x < 6; x++)
        for (let y = 0; y < 4; y++)
          if (!(x === 5 && y === 3)) contents.push({ id: 'ExteriorWall', x, y });
      expect(detectedTypes(roomBlueprint(6, 4, contents))).to.deep.equal(['luxuryBarracks']);
    });

    it('a second luxury bed fails privateBedroom max-1 (stays luxury barracks)', () => {
      const contents: Placement[] = [
        { id: 'LuxuryBed', x: 0, y: 0 },
        { id: 'LuxuryBed', x: 0, y: 2 },
        { id: 'FlowerVase', x: 4, y: 0 },
        { id: 'FlowerVase', x: 5, y: 0 },
      ];
      for (let x = 0; x < 6; x++)
        for (let y = 0; y < 4; y++) contents.push({ id: 'ExteriorWall', x, y });
      expect(detectedTypes(roomBlueprint(6, 4, contents))).to.deep.equal(['luxuryBarracks']);
    });

    it('a dining table disqualifies a kitchen (becomes mess hall)', () => {
      const blueprint = roomBlueprint(7, 3, [
        { id: 'SpiceGrinder', x: 0, y: 0 },
        { id: 'CookingStation', x: 2, y: 0 },
        { id: 'Refrigerator', x: 5, y: 0 },
        { id: 'DiningTable', x: 6, y: 0 },
      ]);
      expect(detectedTypes(blueprint)).to.deep.equal(['messHall']);
    });

    it('a single science building is not a laboratory', () => {
      const blueprint = roomBlueprint(8, 4, [{ id: 'ResearchCenter', x: 0, y: 0 }]);
      expect(singleCavity(blueprint).result).to.equal('miscellaneous');
    });

    it('power plant tolerates industrial machinery', () => {
      const blueprint = roomBlueprint(8, 3, [
        { id: 'MachineShop', x: 0, y: 0 },
        { id: 'Generator', x: 4, y: 0 },
      ]);
      expect(detectedTypes(blueprint)).to.deep.equal(['powerPlant']);
    });
  });

  describe('size boundaries', () => {
    // 4×3 shell with one interior cell filled -> 11 open cells.
    it('11 cells is below every minimum (barracks needs 12)', () => {
      const blueprint = roomBlueprint(4, 3, [{ id: 'Bed', x: 0, y: 0 }]);
      place(blueprint, 'Tile', 3, 2);
      const cavity = singleCavity(blueprint);
      expect(cavity.size).to.equal(11);
      expect(cavity.result).to.equal('miscellaneous');
    });

    it('12 cells matches barracks', () => {
      expect(detectedTypes(roomBlueprint(4, 3, [{ id: 'Bed', x: 0, y: 0 }]))).to.deep.equal([
        'barracks',
      ]);
    });

    it('64 cells still matches barracks; 65 does not', () => {
      expect(detectedTypes(roomBlueprint(16, 4, [{ id: 'Bed', x: 0, y: 0 }]))).to.deep.equal([
        'barracks',
      ]);
      const over = roomBlueprint(13, 5, [{ id: 'Bed', x: 0, y: 0 }]);
      expect(singleCavity(over).size).to.equal(65);
      expect(singleCavity(over).result).to.equal('miscellaneous');
    });
  });

  describe('tiers, overrides, conflicts', () => {
    it('flush toilet + advanced wash station upgrades latrine to washroom', () => {
      const blueprint = roomBlueprint(4, 3, [
        { id: 'FlushToilet', x: 0, y: 0 },
        { id: 'WashSink', x: 2, y: 0 },
      ]);
      expect(detectedTypes(blueprint)).to.deep.equal(['washroom']);
    });

    it('hospital overrides mess hall and barracks (no conflict)', () => {
      const blueprint = roomBlueprint(6, 3, [
        { id: 'MedicalCot', x: 0, y: 0 },
        { id: 'Outhouse', x: 3, y: 0 },
        { id: 'DiningTable', x: 5, y: 0 },
      ]);
      const cavity = singleCavity(blueprint);
      expect(cavity.result).to.equal('room');
      expect(detectedTypes(blueprint)).to.deep.equal(['hospital']);
    });

    it('great hall overrides recreation room (no conflict)', () => {
      const blueprint = roomBlueprint(8, 4, [
        { id: 'DiningTable', x: 0, y: 0 },
        { id: 'WaterCooler', x: 1, y: 0 },
        { id: 'ItemPedestal', x: 3, y: 0 },
      ]);
      expect(detectedTypes(blueprint)).to.deep.equal(['greatHall']);
    });

    it('bed + dining table across families -> conflict -> miscellaneous', () => {
      const blueprint = roomBlueprint(4, 3, [
        { id: 'Bed', x: 0, y: 0 },
        { id: 'DiningTable', x: 2, y: 0 },
      ]);
      const cavity = singleCavity(blueprint);
      expect(cavity.result).to.equal('conflict');
      expect(cavity.matchedTypes).to.deep.equal(['barracks', 'messHall']);
      expect(detectedTypes(blueprint)).to.deep.equal([]);
    });
  });

  describe('park / nature reserve ambiguity', () => {
    it('12–31 cells: park only', () => {
      const result = detectRooms(roomBlueprint(4, 3, [{ id: 'ParkSign', x: 0, y: 0 }]));
      expect(result.rooms).to.have.length(1);
      expect(result.rooms[0].type).to.equal('park');
      expect(result.rooms[0].possibleUpgrade).to.equal(undefined);
      expect(roomSearchTags(result)).to.deep.equal(['park']);
    });

    it('32–64 cells: park with possibleUpgrade natureReserve, both search tags', () => {
      const result = detectRooms(roomBlueprint(8, 4, [{ id: 'ParkSign', x: 0, y: 0 }]));
      expect(result.rooms).to.have.length(1);
      expect(result.rooms[0].type).to.equal('park');
      expect(result.rooms[0].possibleUpgrade).to.equal('natureReserve');
      expect(roomSearchTags(result)).to.deep.equal(['natureReserve', 'park']);
    });

    it('65–120 cells: nature reserve only', () => {
      const result = detectRooms(roomBlueprint(13, 5, [{ id: 'ParkSign', x: 0, y: 0 }]));
      expect(result.rooms.map(r => r.type)).to.deep.equal(['natureReserve']);
      expect(roomSearchTags(result)).to.deep.equal(['natureReserve']);
    });
  });

  describe('multiple rooms', () => {
    const twoRooms = (): Blueprint => {
      const blueprint = new Blueprint();
      addRoomShell(blueprint, 0, 0, 4, 3);
      addRoomShell(blueprint, 6, 0, 4, 3);
      place(blueprint, 'Outhouse', 0, 0);
      place(blueprint, 'WashBasin', 2, 0);
      place(blueprint, 'Bed', 6, 0);
      return blueprint;
    };

    it('detects both rooms, cavity ids ordered by lowest tile index', () => {
      const result = detectRooms(twoRooms());
      expect(result.rooms.map(r => r.type)).to.deep.equal(['latrine', 'barracks']);
      expect(result.rooms.map(r => r.cavityId)).to.deep.equal([0, 1]);
      expect(result.cavities.map(c => c.result)).to.deep.equal(['room', 'room']);
    });

    it('duplicate room types dedupe in search tags', () => {
      const blueprint = new Blueprint();
      addRoomShell(blueprint, 0, 0, 4, 3);
      addRoomShell(blueprint, 6, 0, 4, 3);
      place(blueprint, 'Bed', 0, 0);
      place(blueprint, 'Bed', 6, 0);
      expect(roomSearchTags(detectRooms(blueprint))).to.deep.equal(['barracks']);
    });

    it('is deterministic: identical input, identical output', () => {
      expect(detectRooms(twoRooms())).to.deep.equal(detectRooms(twoRooms()));
    });
  });

  describe('cell reporting', () => {
    it('room cells are exactly the interior open cells', () => {
      const blueprint = roomBlueprint(4, 3, [{ id: 'Bed', x: 0, y: 0 }]);
      const result = detectRooms(blueprint);
      expect(result.rooms[0].cells).to.have.length(12);
      expect(result.rooms[0].size).to.equal(12);
      // Cells are unique and sorted ascending (row-major discovery order).
      const cells = result.rooms[0].cells;
      expect(new Set(cells).size).to.equal(12);
      expect([...cells].sort((a, b) => a - b)).to.deep.equal(cells);
    });
  });
});
