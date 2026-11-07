import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import {
  PINNED_ICONS,
  ROCKET_MODULE_SUBCATEGORY,
  UNCATEGORIZED_SUBCATEGORY,
  connectionScaleFromCells,
  convertBuildMenuItems,
  plantIconRect,
} from '../../app/api/batch/convert-export-2024';
import {
  BuildableElement,
  BSpriteInfo,
  BSpriteModifier,
  BBuilding,
  ElementState,
  ZIndex,
} from '../../lib';

describe('Database Asset Validation', () => {
  const assetPath = path.join(__dirname, '../../assets/database');
  // The committed runtime artifact is the loose database-2024.json (readable diffs);
  // the backend reads it directly and the frontend zips it at build time. The .zip is
  // a gitignored build derivative, so tests read the JSON.
  const databaseJsonPath = path.join(assetPath, 'database-2024.json');
  const readDatabase = () => JSON.parse(fs.readFileSync(databaseJsonPath, 'utf8'));
  // The one served copy of the flat art: the editor fetches it, the preview worker
  // reads it from the built frontend, the import syncs into it.
  const uiImagePath = path.join(__dirname, '../../frontend/src/assets/ui_image');

  // The game hides a building from its build menu when either flag applies:
  //   !Deprecated && (!DebugOnly || Game.Instance.DebugOnlyBuildingsAllowed)
  // Deprecated is legacy content, unreachable in every mode; DebugOnly is the "Dev *"
  // buildings, reachable only with debug mode on. The export gained both flags in
  // OniExtract2024#5; until an export taken after that is imported, every building converts
  // with both false and these assertions hold vacuously. They are the regression guard for
  // afterwards -- the failure they exist to catch is a future import quietly putting
  // unbuildable buildings back in the menu.
  describe('Unbuildable buildings', () => {
    const unbuildable = (db: any) =>
      new Set(
        (db.buildings as any[])
          .filter(b => b.deprecated === true || b.debugOnly === true)
          .map(b => b.prefabId)
      );

    it('never offers a deprecated or debug-only building in the build menu', () => {
      const database = readDatabase();
      const hidden = unbuildable(database);
      const offered = (database.buildMenuItems as any[])
        .map(m => m.buildingId)
        .filter(id => hidden.has(id));
      expect(offered, `unbuildable buildings offered in the build menu: ${offered.join(', ')}`).to
        .be.empty;
    });

    it('keeps them in `buildings`, so saved blueprints still load', () => {
      const database = readDatabase();
      const ids = new Set((database.buildings as any[]).map(b => b.prefabId));
      // Whatever is flagged must still be present as a building; dropping it from the
      // catalogue entirely would break every blueprint that already contains one.
      for (const prefabId of unbuildable(database))
        expect(ids.has(prefabId), prefabId).to.equal(true);
    });

    it('keeps the two flags distinct, since they are different claims', () => {
      const database = readDatabase();
      for (const b of database.buildings as any[]) {
        if ('deprecated' in b) expect(b.deprecated, b.prefabId).to.be.a('boolean');
        if ('debugOnly' in b) expect(b.debugOnly, b.prefabId).to.be.a('boolean');
      }
    });
  });

  // The build menu groups each category's buildings under the game's subcategory
  // headers ("Ladders", "Tiles and Drywall", ...). The export has carried them all along
  // in buildingAndSubcategoryDataPairs[].Value; the converter now keeps them.
  describe('Build menu subcategories', () => {
    describe('convertBuildMenuItems', () => {
      const run = (
        overrides: Partial<Parameters<typeof convertBuildMenuItems>[0]> = {}
      ) => {
        const missingCategories: string[] = [];
        const missingMenuBuildings: string[] = [];
        const result = convertBuildMenuItems({
          pairsByCategory: {
            base: [
              { Key: 'Ladder', Value: 'ladders' },
              { Key: 'Tile', Value: 'tiles' },
              { Key: 'OldTile', Value: 'tiles' },
            ],
            plumbing: [{ Key: 'LiquidConduit', Value: 'pipes' }],
            hvac: [{ Key: 'GasConduit', Value: 'pipes' }],
            rocketry: [{ Key: 'Gantry', Value: 'fittings' }],
          },
          categoryNameToId: new Map([
            ['base', 1],
            ['plumbing', 2],
            ['hvac', 3],
            ['rocketry', 4],
          ]),
          buildingPrefabs: new Set([
            'Ladder',
            'Tile',
            'OldTile',
            'LiquidConduit',
            'GasConduit',
            'Gantry',
            'SteamEngineCluster',
            'HabitatModuleSmall',
          ]),
          hiddenPrefabs: new Set(['OldTile']),
          rocketModuleMenu: ['SteamEngineCluster', 'HabitatModuleSmall'],
          rocketModulePrefabs: new Set(['SteamEngineCluster', 'HabitatModuleSmall']),
          missingCategories,
          missingMenuBuildings,
          ...overrides,
        });
        return { ...result, missingCategories, missingMenuBuildings };
      };

      it('carries each pair\'s subcategory through, in plan order', () => {
        const { items } = run();
        expect(items.slice(0, 4)).to.deep.equal([
          { category: 1, buildingId: 'Ladder', subcategory: 'ladders' },
          { category: 1, buildingId: 'Tile', subcategory: 'tiles' },
          { category: 2, buildingId: 'LiquidConduit', subcategory: 'pipes' },
          { category: 3, buildingId: 'GasConduit', subcategory: 'pipes' },
        ]);
      });

      it('files the rocket modules under the site\'s own subcategory, after the plan entries', () => {
        const { items } = run();
        expect(items.slice(4)).to.deep.equal([
          { category: 4, buildingId: 'Gantry', subcategory: 'fittings' },
          { category: 4, buildingId: 'SteamEngineCluster', subcategory: ROCKET_MODULE_SUBCATEGORY },
          { category: 4, buildingId: 'HabitatModuleSmall', subcategory: ROCKET_MODULE_SUBCATEGORY },
        ]);
      });

      it('still leaves deprecated and debug-only buildings out', () => {
        const { items, hidden } = run();
        expect(items.map((i) => i.buildingId)).not.to.include('OldTile');
        expect(hidden).to.deep.equal(['OldTile']);
      });

      it('files an entry with no subcategory as uncategorized, and reports it', () => {
        const { items, unsubcategorized } = run({
          pairsByCategory: { base: [{ Key: 'Ladder', Value: '' }] },
        });
        expect(items).to.deep.equal([
          { category: 1, buildingId: 'Ladder', subcategory: UNCATEGORIZED_SUBCATEGORY },
          { category: 4, buildingId: 'SteamEngineCluster', subcategory: ROCKET_MODULE_SUBCATEGORY },
          { category: 4, buildingId: 'HabitatModuleSmall', subcategory: ROCKET_MODULE_SUBCATEGORY },
        ]);
        expect(unsubcategorized).to.deep.equal(['Ladder']);
      });

      it('reports unknown categories and menu prefabs with no building', () => {
        const { missingCategories, missingMenuBuildings } = run({
          pairsByCategory: {
            nonsense: [{ Key: 'Ladder', Value: 'ladders' }],
            base: [{ Key: 'Ghost', Value: 'ladders' }],
          },
        });
        expect(missingCategories).to.deep.equal(['nonsense']);
        expect(missingMenuBuildings).to.deep.equal(['Ghost']);
      });
    });

    describe('database-2024.json', () => {
      let database: any;
      before(() => {
        database = readDatabase();
      });

      it('gives every build menu entry a subcategory', () => {
        const without = (database.buildMenuItems as any[])
          .filter((m) => typeof m.subcategory !== 'string' || m.subcategory.length === 0)
          .map((m) => m.buildingId);
        expect(without.length, `build menu entries with no subcategory: ${without.slice(0, 20).join(', ')}`)
          .to.equal(0);
      });

      it('files exactly the rocket modules under the rocket-module subcategory', () => {
        const modules = new Set(
          (database.buildings as any[]).filter((b) => b.rocketModule != null).map((b) => b.prefabId)
        );
        for (const m of database.buildMenuItems as any[])
          expect(m.subcategory === ROCKET_MODULE_SUBCATEGORY, m.buildingId).to.equal(
            modules.has(m.buildingId)
          );
      });

      // The header text comes from the game's strings, so a subcategory the strings
      // don't name would render as a raw id. Modded buildings may bring their own.
      it('names every base-game subcategory in the game strings', () => {
        const strings = JSON.parse(
          fs.readFileSync(
            path.join(__dirname, '../../frontend/src/assets/strings/strings.json'),
            'utf8'
          )
        );
        const modded = new Set(
          (database.buildings as any[]).filter((b) => b.mod != null).map((b) => b.prefabId)
        );
        const unnamed = new Set<string>();
        for (const m of database.buildMenuItems as any[]) {
          if (modded.has(m.buildingId)) continue;
          if (m.subcategory === ROCKET_MODULE_SUBCATEGORY) continue;
          if (m.subcategory === UNCATEGORIZED_SUBCATEGORY) continue;
          const key = `STRINGS.UI.NEWBUILDCATEGORIES.${String(m.subcategory).toUpperCase()}.BUILDMENUTITLE`;
          if (!strings[key]) unnamed.add(m.subcategory);
        }
        expect([...unnamed], 'subcategories with no BUILDMENUTITLE').to.be.empty;
      });
    });
  });

  describe('Core Database Files', () => {
    it('should have valid database structure', () => {
      expect(fs.existsSync(databaseJsonPath), 'database-2024.json should exist').to.be.true;

      const database = readDatabase();

      expect(database).to.have.property('elements');
      expect(database).to.have.property('buildMenuCategories');
      expect(database).to.have.property('buildMenuItems');
      expect(database).to.have.property('uiSprites');
      expect(database).to.have.property('spriteModifiers');
      expect(database).to.have.property('buildings');

      expect(database.elements).to.be.an('array').with.length.greaterThan(0);
      expect(database.buildMenuCategories).to.be.an('array').with.length.greaterThan(0);
      expect(database.buildMenuItems).to.be.an('array').with.length.greaterThan(0);
      expect(database.uiSprites).to.be.an('array').with.length.greaterThan(0);
      expect(database.spriteModifiers).to.be.an('array');
      expect(database.buildings).to.be.an('array').with.length.greaterThan(0);
    });

    // The import writes the same JSON into both asset roots; the backend (app.ts,
    // the preview worker) reads one and the editor the other. A hand edit or a
    // conflict resolved in one root only would make previews and the editor
    // disagree about the same blueprint.
    it('should write the same database-2024.json into the frontend asset root', () => {
      const frontendJson = path.join(
        __dirname,
        '../../frontend/src/assets/database/database-2024.json'
      );
      expect(fs.existsSync(frontendJson), 'frontend database-2024.json should exist').to.be.true;
      expect(
        fs.readFileSync(frontendJson).equals(fs.readFileSync(databaseJsonPath)),
        'frontend database-2024.json should be byte-identical to assets/database/database-2024.json'
      ).to.be.true;
    });
  });

  describe('Database Content Validation', () => {
    let database: any;

    before(() => {
      database = readDatabase();
    });

    it('should have valid elements structure', () => {
      database.elements.forEach((element: BuildableElement, index: number) => {
        expect(element, `Element ${index} should have id`).to.have.property('id');
        expect(element.id, `Element ${index} id should be string`)
          .to.be.a('string')
          .with.length.greaterThan(0);
      });
    });

    // The mass/temperature defaults the game seeds its own pickers with. The two
    // invariants below are the export contract's (spec/elements-defaults.md) and
    // exist to catch an upstream regression: if the exporter ever reads gas.yaml
    // instead of the runtime Element, gases silently lose their 1.8/1.0 defaults.
    describe('element mass and temperature defaults', () => {
      const numericFields = [
        'maxMass',
        'defaultMass',
        'defaultTemperature',
        'lowTemp',
        'highTemp',
      ] as const;

      it('should give every element finite mass and temperature defaults', () => {
        for (const element of database.elements as BuildableElement[])
          for (const field of numericFields)
            expect(element[field], `${element.id}.${field}`).to.be.a('number').that.is.finite;
      });

      it('should give every gas the runtime mass defaults', () => {
        const gases = (database.elements as BuildableElement[]).filter(
          element => element.state === ElementState.Gas
        );
        // Vanilla U59 ships 32 gases; a sharp drop here means state parsing broke
        // (and would leave the loop below checking nothing).
        expect(gases.length).to.be.at.least(25);
        for (const gas of gases) {
          expect(gas.maxMass, `${gas.id} maxMass`).to.equal(1.8);
          expect(gas.defaultMass, `${gas.id} defaultMass`).to.equal(1.0);
        }
      });

      it('should never default an element above its own capacity', () => {
        for (const element of database.elements as BuildableElement[])
          expect(
            element.defaultMass,
            `${element.id} defaultMass exceeds maxMass`
          ).to.be.at.most(element.maxMass);
      });

      it('should match the values the export contract documents', () => {
        const byId = new Map<string, BuildableElement>(
          (database.elements as BuildableElement[]).map(element => [element.id, element])
        );
        const expected: [string, number, number, number, number][] = [
          // id, state, maxMass, defaultMass, defaultTemperature (Kelvin)
          ['Water', ElementState.Liquid, 1000, 1000, 300],
          ['Ice', ElementState.Solid, 1100, 1000, 232.15],
          ['CrudeOil', ElementState.Liquid, 870, 870, 350],
          ['Chlorine', ElementState.Liquid, 1000, 600, 200],
          ['Oxygen', ElementState.Gas, 1.8, 1.0, 300],
          ['Steam', ElementState.Gas, 1.8, 1.0, 400],
        ];
        for (const [id, state, maxMass, defaultMass, defaultTemperature] of expected) {
          const element = byId.get(id);
          expect(element, `${id} should exist`).not.to.equal(undefined);
          expect(element!.state, `${id} state`).to.equal(state);
          expect(element!.maxMass, `${id} maxMass`).to.equal(maxMass);
          expect(element!.defaultMass, `${id} defaultMass`).to.equal(defaultMass);
          expect(element!.defaultTemperature, `${id} defaultTemperature`).to.equal(
            defaultTemperature
          );
        }
      });

      // The export writes `state` as the enum name for most solids and its raw
      // numeric value (with flag bits set) for everything else; the converter
      // masks it down to the phase. Anything outside the enum means that broke.
      it('should normalize every state to a known phase', () => {
        const phases = [
          ElementState.Vacuum,
          ElementState.Gas,
          ElementState.Liquid,
          ElementState.Solid,
        ];
        for (const element of database.elements as BuildableElement[])
          expect(phases, `${element.id} state ${element.state}`).to.include(element.state);
      });
    });

    // Building names keep Klei's rich-text link markup; GameStringService strips
    // every /<link=".+?">(.*?)<\/link>/ at load time, so whatever markup is left
    // after that reaches the build menu raw.
    it('should keep building-name link markup in the form the string service strips', () => {
      const malformed = (database.buildings as BBuilding[])
        .filter(b => typeof b.name === 'string')
        .filter(b => /<\/?link/.test(b.name.replace(/<link=".+?">(.*?)<\/link>/gi, '$1')))
        .map(b => `${b.prefabId}: ${b.name}`);
      expect(malformed, `malformed link markup: ${malformed.join('; ')}`).to.be.empty;
    });

    // BlueprintItemWire.drawPixi (lib/src/blueprint/blueprint-item-wire.ts) draws the
    // conduit-content blob's outline in the building's backColor: only buildings on
    // sceneLayer 3 (GasConduits) or 5 (LiquidConduits) actually draw one. A regression
    // (all-white backColor for every building) shipped invisibly for months because
    // nothing else reads the field — this guards the one thing that does.
    it('should give plain/insulated/radiant conduits distinct, non-white outline colours', () => {
      const byPrefab = new Map<string, BBuilding>(
        (database.buildings as BBuilding[]).map(building => [building.prefabId, building])
      );
      const conduitZIndexes: ZIndex[] = [ZIndex.GasConduits, ZIndex.LiquidConduits];
      const drawsBlobOutline = (building: BBuilding | undefined) =>
        !!building && conduitZIndexes.includes(building.sceneLayer);

      const families: [string, string, string][] = [
        ['GasConduit', 'InsulatedGasConduit', 'GasConduitRadiant'],
        ['LiquidConduit', 'InsulatedLiquidConduit', 'LiquidConduitRadiant'],
      ];
      for (const [plainId, insulatedId, radiantId] of families) {
        const plain = byPrefab.get(plainId);
        const insulated = byPrefab.get(insulatedId);
        const radiant = byPrefab.get(radiantId);
        for (const [id, building] of [
          [plainId, plain],
          [insulatedId, insulated],
          [radiantId, radiant],
        ] as const) {
          expect(building, `${id} should exist`).not.to.equal(undefined);
          expect(drawsBlobOutline(building), `${id} should be on a conduit sceneLayer`).to.equal(
            true
          );
          expect(
            building!.backColor,
            `${id} should not ship the white regression colour`
          ).not.to.equal(0xffffff);
        }
        const colors = [plain, insulated, radiant].map(b => b!.backColor);
        expect(
          new Set(colors).size,
          `${plainId}/${insulatedId}/${radiantId} should each have a distinct outline colour`
        ).to.equal(3);
      }

      // Every building that actually draws the blob outline (not just the plain
      // families above — also the high-pressure variants) must have a real colour.
      const conduitZIndexSet = new Set<ZIndex>(conduitZIndexes);
      const stillWhite = (database.buildings as BBuilding[])
        .filter(b => conduitZIndexSet.has(b.sceneLayer) && b.backColor === 0xffffff)
        .map(b => b.prefabId);
      expect(stillWhite, `conduits still shipping white: ${stillWhite.join(', ')}`).to.be.empty;
    });

    it('should preserve representative areas of effect and omit empty arrays', () => {
      const byId = new Map<string, BBuilding>(
        (database.buildings as BBuilding[]).map(building => [building.prefabId, building])
      );
      const expectedKinds = new Map([
        ['FloorLamp', 'light'],
        ['AirFilter', 'elementIntake'],
        ['SolidTransferArm', 'operationRange'],
        ['RadiationLight', 'radiation'],
        ['CometDetector', 'skyScan'],
      ]);
      for (const [prefabId, kind] of expectedKinds) {
        const building = byId.get(prefabId);
        expect(building, `${prefabId} should exist`).not.to.equal(undefined);
        expect(building!.areasOfEffect, `${prefabId} areasOfEffect`).to.be.an('array').that.is.not
          .empty;
        expect(building!.areasOfEffect!.some(effect => effect.kind === kind)).to.equal(true);
      }

      const floorLampEffect = byId
        .get('FloorLamp')!
        .areasOfEffect!.find(effect => effect.kind === 'light')!;
      expect(floorLampEffect).to.include({
        kind: 'light',
        source: 'Light2D',
        shape: 'circle',
        blockedBySolids: true,
        range: 4,
        lux: 1000,
        falloffRate: 0.5,
      });
      expect(floorLampEffect.origin).to.deep.equal({ x: 0, y: 1 });
      expect(floorLampEffect.lightColor).to.deep.equal({ r: 0.57, g: 0.55, b: 0.44, a: 1 });
      expect(floorLampEffect.cells).to.have.length(49);

      for (const building of database.buildings as BBuilding[])
        expect(
          building.areasOfEffect,
          `${building.prefabId} empty areasOfEffect`
        ).not.to.deep.equal([]);
    });

    it('should have overlay spriteModifiers (info / element overlays)', () => {
      expect(database.spriteModifiers).to.be.an('array');
      (database.spriteModifiers as BSpriteModifier[]).forEach((modifier, index) => {
        expect(modifier, `Modifier ${index} should have name`).to.have.property('name');
        expect(modifier, `Modifier ${index} should have tags`).to.have.property('tags');
        expect(modifier.tags, `Modifier ${index} tags should be array`).to.be.an('array');
      });
    });

    it('should point every overlay spriteModifier at a registered uiSprite', () => {
      const spriteInfoNames = new Set((database.uiSprites as BSpriteInfo[]).map(si => si.name));
      const broken = (database.spriteModifiers as BSpriteModifier[])
        .filter(modifier => modifier.spriteInfoName && !spriteInfoNames.has(modifier.spriteInfoName))
        .map(modifier => `${modifier.name} -> ${modifier.spriteInfoName}`);
      expect(broken, `spriteModifiers with no uiSprite: ${broken.join(', ')}`).to.be.empty;
    });
  });

  // The website's half of the indicator contract. The export declares which indicator PNGs
  // it wrote (building.json `utilityIndicators`, OniExtract2024 #23) and the converter
  // registers whatever it declares; the renderer resolves these ids by name in
  // ConnectionHelper.getConnectionSprite. So what must hold over the committed database is
  // that every id the renderer asks for is registered as a whole-image indicator sprite
  // whose PNG sits in the SpriteInfo image root — not that the converter knows the names.
  describe('Utility port indicators', () => {
    const RENDERER_INDICATOR_IDS = [
      'input',
      'output',
      'electrical_disconnected',
      'logicInput',
      'logicOutput',
      'logicResetUpdate',
      'logic_ribbon_all_in',
      'logic_ribbon_all_out',
    ];
    const imagesRoot = path.join(__dirname, '../../frontend/src/assets/images');

    it('registers every indicator the renderer resolves as a whole-image sprite', () => {
      const database = readDatabase();
      const byName = new Map(
        (database.uiSprites as BSpriteInfo[]).map(si => [si.name, si] as const)
      );
      for (const id of RENDERER_INDICATOR_IDS) {
        const sprite = byName.get(id);
        expect(sprite, `uiSprites has no indicator sprite "${id}"`).to.exist;
        expect(sprite!.isInputOutput, `${id} is not flagged isInputOutput`).to.equal(true);
        expect(sprite!.textureName, `${id} textureName`).to.equal(id);
        expect(sprite!.uvMin, `${id} must be a whole-image sprite`).to.deep.equal({ x: 0, y: 0 });
        expect(sprite!.uvSize.x, `${id} has no width`).to.be.greaterThan(0);
        expect(sprite!.uvSize.y, `${id} has no height`).to.be.greaterThan(0);
      }
    });

    it('ships every indicator PNG in the SpriteInfo image root', () => {
      for (const id of RENDERER_INDICATOR_IDS) {
        const png = path.join(imagesRoot, `${id}.png`);
        expect(fs.existsSync(png), `missing ${path.relative(process.cwd(), png)}`).to.equal(true);
        expect(fs.statSync(png).size, `${id}.png is empty`).to.be.greaterThan(0);
      }
    });
  });

  describe('Flat Icon Assets', () => {
    it('should have a ui_image PNG for every building', () => {
      const database = readDatabase();
      const missingIcons: string[] = [];
      for (const building of database.buildings) {
        const expectedPng = path.join(uiImagePath, `${building.uiImage}.png`);
        if (!fs.existsSync(expectedPng)) {
          missingIcons.push(building.uiImage);
        }
      }
      expect(missingIcons, `Missing icons: ${missingIcons.join(', ')}`).to.be.empty;
    });
  });

  // Connectables draw each of their 16 sprites centre-anchored at 100 px x connectionScale,
  // so the scale is what makes a segment fill its cell and neighbours join flush. The export
  // declares the cell (connection_sprite_cells.json); measuring 15.png instead read the
  // transit tube, whose all-connected state overhangs with corner fillets, as ~1.0.
  describe('Connection-sprite scale', () => {
    const tube = { canvas: { w: 240, h: 240 }, cell: { x: 70, y: 70, w: 100, h: 100 } };
    const sixteen = (x: number, y: number) => Array.from({ length: 16 }, () => ({ x, y }));

    describe('connectionScaleFromCells', () => {
      it('should scale by canvas / cell on each axis', () => {
        expect(connectionScaleFromCells(tube, sixteen(240, 240))).to.deep.equal({
          scale: { x: 2.4, y: 2.4 },
        });
        const wide = { canvas: { w: 192, h: 108 }, cell: { x: 32, y: 4, w: 128, h: 100 } };
        expect(connectionScaleFromCells(wide, sixteen(192, 108))).to.deep.equal({
          scale: { x: 1.5, y: 1.08 },
        });
      });

      it('should refuse a cell that is not centred on its canvas', () => {
        const off = { ...tube, cell: { ...tube.cell, x: 71 } };
        expect(connectionScaleFromCells(off, sixteen(240, 240)))
          .to.have.property('problem')
          .that.matches(/off-centre/);
      });

      it('should refuse a centred cell that reaches past its canvas', () => {
        const oversized = { canvas: { w: 100, h: 100 }, cell: { x: -50, y: 0, w: 200, h: 100 } };
        expect(connectionScaleFromCells(oversized, sixteen(100, 100)))
          .to.have.property('problem')
          .that.matches(/reaches past/);
      });

      it('should refuse a canvas that is not the size of every one of its PNGs', () => {
        const sizes = sixteen(240, 240);
        sizes[3] = { x: 200, y: 240 };
        expect(connectionScaleFromCells(tube, sizes))
          .to.have.property('problem')
          .that.matches(/3\.png is 200x240/);
      });

      it('should refuse a state whose PNG size cannot be read', () => {
        const sizes: ({ x: number; y: number } | null)[] = sixteen(240, 240);
        sizes[15] = null;
        expect(connectionScaleFromCells(tube, sizes))
          .to.have.property('problem')
          .that.matches(/unreadable PNG size: 15\.png/);
      });

      it('should refuse a malformed entry', () => {
        for (const bad of [
          { canvas: { w: 240, h: 240 } },
          { ...tube, cell: { ...tube.cell, w: 0 } },
          { ...tube, canvas: { w: '240', h: 240 } },
        ])
          expect(connectionScaleFromCells(bad as any, sixteen(240, 240))).to.have.property(
            'problem'
          );
      });
    });

    it('should draw the transit tube at its full overhanging size', () => {
      const database = readDatabase();
      const travelTube = database.buildings.find((b: any) => b.prefabId === 'TravelTube');
      expect(travelTube.connectionSprites, 'TravelTube connectable').to.be.true;
      expect(travelTube.connectionScale.x, 'TravelTube connectionScale.x').to.be.closeTo(2.4, 0.01);
      expect(travelTube.connectionScale.y, 'TravelTube connectionScale.y').to.be.closeTo(2.4, 0.01);
    });

    it('should never draw a connectable smaller than its cell', () => {
      const database = readDatabase();
      const shrunk = database.buildings
        .filter((b: any) => b.connectionSprites)
        .filter((b: any) => !(b.connectionScale.x >= 1 && b.connectionScale.y >= 1))
        .map((b: any) => `${b.prefabId} ${JSON.stringify(b.connectionScale)}`);
      expect(shrunk, `connectables drawn below one cell: ${shrunk.join(', ')}`).to.be.empty;
    });
  });

  describe('uiImageRect placement', () => {
    // A rect says where a PNG sits over the footprint, and the renderer maps the
    // PNG linearly onto it — so w:h must equal the PNG's pixel aspect. When the two
    // disagree the icon draws at the wrong size and offset, silently and sitewide;
    // the 2024 exporter shipped exactly that for a long stretch, because a
    // main-menu pass overwrote in-game renders and left the measured rects behind.
    // 2% absorbs the exporter's rounding to 3 decimal places.
    const ASPECT_TOLERANCE = 0.02;

    // PNG dimensions straight out of the IHDR chunk — no decode needed.
    const pngSize = (file: string): { w: number; h: number } | null => {
      const fd = fs.openSync(file, 'r');
      try {
        const buf = Buffer.alloc(24);
        if (fs.readSync(fd, buf, 0, 24, 0) < 24) return null;
        if (buf.readUInt32BE(0) !== 0x89504e47) return null;
        return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
      } finally {
        fs.closeSync(fd);
      }
    };

    type Rect = { x: number; y: number; w: number; h: number };

    // A rect only means anything if all four numbers are real and it encloses area.
    // Truthiness is not enough: `{}` or a zero-width rect makes `w/h` NaN, and every
    // comparison against NaN is false — so a malformed entry would sail through the
    // aspect check below while rendering as nothing at all.
    const isValidRect = (rect: any): rect is Rect =>
      rect != null &&
      typeof rect === 'object' &&
      [rect.x, rect.y, rect.w, rect.h].every(v => typeof v === 'number' && Number.isFinite(v)) &&
      rect.w > 0 &&
      rect.h > 0;

    // Everything that *claims* a rect, valid or not — the malformed ones have to
    // reach the assertions rather than be filtered away before them.
    const rectsInDatabase = (): { id: string; rect: unknown }[] => {
      const database = readDatabase();
      return [
        ...database.buildings
          .filter((b: any) => b.uiImageRect !== undefined)
          .map((b: any) => ({ id: b.uiImage, rect: b.uiImageRect })),
        ...(database.terrainFeatures ?? [])
          .filter((f: any) => f.uiImageRect !== undefined)
          .map((f: any) => ({ id: f.id, rect: f.uiImageRect })),
      ];
    };

    it('should match every rect to its own PNG aspect', () => {
      const malformed: string[] = [];
      const mismatched: string[] = [];
      const checked = rectsInDatabase();
      for (const { id, rect } of checked) {
        if (!isValidRect(rect)) {
          malformed.push(`${id}: ${JSON.stringify(rect)}`);
          continue;
        }
        const png = pngSize(path.join(uiImagePath, `${id}.png`));
        if (png == null || png.w === 0 || png.h === 0) continue;
        const pngAspect = png.w / png.h;
        const off = Math.abs(rect.w / rect.h - pngAspect) / pngAspect;
        if (off >= ASPECT_TOLERANCE) mismatched.push(`${id} off by ${Math.round(off * 100)}%`);
      }
      expect(checked.length, 'rects to check').to.be.greaterThan(300);
      expect(malformed, `malformed uiImageRect: ${malformed.join(', ')}`).to.be.empty;
      expect(mismatched, `rect/PNG aspect mismatch: ${mismatched.join(', ')}`).to.be.empty;
    });

    // A pinned icon (PINNED_ICONS in convert-export-2024.ts) is the site's own PNG and
    // rect, kept in place of the export's. The converter applies the pin on every
    // import; this is the guard for the other way it can be lost -- someone copying
    // the export's ui_image/ over the asset roots by hand, or resolving a conflict in
    // the database towards the export's rect.
    it('should serve every pinned icon from its pinned PNG, with its pinned rect', () => {
      const database = readDatabase();
      const pinnedDir = path.join(__dirname, '../../assets/manual/ui_image');
      const frontendUiImagePath = path.join(__dirname, '../../frontend/src/assets/ui_image');

      for (const [prefabId, pin] of Object.entries(PINNED_ICONS)) {
        const pinned = fs.readFileSync(path.join(pinnedDir, `${prefabId}.png`));
        for (const root of [uiImagePath, frontendUiImagePath])
          expect(
            fs.readFileSync(path.join(root, `${prefabId}.png`)).equals(pinned),
            `${prefabId}.png in ${root} should be the pinned PNG`
          ).to.be.true;

        const building = database.buildings.find((b: any) => b.prefabId === prefabId);
        expect(building, `${prefabId} in buildings`).to.exist;
        expect(building.uiImageRect, `${prefabId} uiImageRect`).to.deep.equal(pin.rect);

        const png = pngSize(path.join(pinnedDir, `${prefabId}.png`))!;
        const sprite = database.uiSprites.find((s: any) => s.name === prefabId);
        expect(sprite.uvSize, `${prefabId} uiSprite size`).to.deep.equal({ x: png.w, y: png.h });
      }
    });

    // One catalogue, two kinds. A geyser has the cell it erupts from; a plant
    // has none, and must not carry a default that the editor would then draw.
    it('should type every terrain feature, with an active tile on terrain only', () => {
      const database = readDatabase();
      const features: any[] = database.terrainFeatures ?? [];
      const badKind = features.filter((f) => f.kind !== 'terrain' && f.kind !== 'plant');
      expect(badKind.map((f) => `${f.id}: ${f.kind}`), 'kind').to.be.empty;

      const terrain = features.filter((f) => f.kind === 'terrain');
      const plants = features.filter((f) => f.kind === 'plant');
      expect(terrain, 'terrain').to.have.length(31);
      expect(plants.length, 'plants').to.be.at.least(40);

      const terrainWithoutActive = terrain.filter((f) => f.activeTile == null).map((f) => f.id);
      expect(terrainWithoutActive, 'terrain with no activeTile').to.be.empty;
      const plantsWithActive = plants.filter((f) => f.activeTile != null).map((f) => f.id);
      expect(plantsWithActive, 'plants carrying an activeTile').to.be.empty;
      const unnamed = features.filter((f) => !f.name).map((f) => f.id);
      expect(unnamed, 'features with no name').to.be.empty;
    });

    // The exporter renders the Arbor and Bonbon trees whole, trunk plus every
    // branch, and sizes their box to match: 3x3 where the collider says 1x2.
    // A 1x2 here means the converter fell back to the collider, i.e. the
    // export predates plant rendering or the width/height fields were dropped.
    it('should size the whole-tree plants from the export, not the collider', () => {
      const database = readDatabase();
      const byId = new Map<string, any>((database.terrainFeatures ?? []).map((f: any) => [f.id, f]));
      for (const id of ['ForestTree', 'SpaceTree']) {
        const tree = byId.get(id);
        expect(tree, id).to.exist;
        expect({ width: tree.width, height: tree.height }, `${id} footprint`).to.deep.equal({ width: 3, height: 3 });
        // Measured by the exporter, not derived: the derived rect is a pure
        // function of the footprint and the served PNG, so a stored rect equal
        // to it means the converter fell back (no entry in ui_image_rects.json).
        const png = pngSize(path.join(uiImagePath, `${id}.png`))!;
        const derived = plantIconRect(tree.width, tree.height, { x: png.w, y: png.h });
        expect(tree.uiImageRect, `${id} rect is the derived fallback`).to.not.deep.equal(derived);
      }
      // Hanging plants keep the collider's box; their offset is the mod's concern.
      const vine = byId.get('SpiceVine');
      expect({ width: vine.width, height: vine.height }, 'SpiceVine').to.deep.equal({ width: 1, height: 3 });
    });

    // Plant icons are menu icons with no measured rect, so the importer fits
    // them into the footprint: aspect kept, centred, standing on the bottom row.
    describe('plantIconRect', () => {
      it('fits a tall icon to the width of a 1x2 footprint, on the ground', () => {
        // Mealwood: 69x113 px in a 1x2 footprint — width-limited.
        const rect = plantIconRect(1, 2, { x: 69, y: 113 });
        expect(rect.w).to.equal(1);
        expect(rect.h).to.be.closeTo(113 / 69, 0.001);
        expect(rect.x).to.equal(0);
        expect(rect.y).to.equal(0);
      });

      it('fits a wide icon to the height of a wide footprint, centred', () => {
        // A 128x85 icon in a 4x1 footprint — height-limited, so it is centred.
        const rect = plantIconRect(4, 1, { x: 128, y: 85 });
        expect(rect.h).to.equal(1);
        expect(rect.w).to.be.closeTo(128 / 85, 0.001);
        expect(rect.x).to.be.closeTo((4 - rect.w) / 2, 0.001);
        expect(rect.y).to.equal(0);
      });

      it('never leaves the footprint', () => {
        for (const [w, h, png] of [
          [1, 1, { x: 126, y: 115 }],
          [3, 4, { x: 89, y: 102 }],
          [1, 3, { x: 66, y: 108 }],
        ] as [number, number, { x: number; y: number }][]) {
          const rect = plantIconRect(w, h, png);
          expect(rect.x, `${w}x${h}`).to.be.at.least(0);
          expect(rect.x + rect.w, `${w}x${h}`).to.be.at.most(w + 0.001);
          expect(rect.y + rect.h, `${w}x${h}`).to.be.at.most(h + 0.001);
        }
      });
    });

    it('should give every terrain feature a usable placement rect', () => {
      // Terrain icons are tight-cropped renders, so the stretch fallback is a
      // visible regression rather than a graceful default: every catalogue entry
      // should carry the rect the export measured for it — and a rect that cannot
      // be drawn from is no better than none.
      const database = readDatabase();
      const withoutRect = (database.terrainFeatures ?? [])
        .filter((f: any) => !isValidRect(f.uiImageRect))
        .map((f: any) => `${f.id}: ${JSON.stringify(f.uiImageRect)}`);
      expect(database.terrainFeatures, 'terrainFeatures').to.be.an('array').with.length.greaterThan(
        0
      );
      expect(withoutRect, `terrain features with no usable uiImageRect: ${withoutRect.join(', ')}`)
        .to.be.empty;
    });
  });
});
