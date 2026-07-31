import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import {
  BuildableElement,
  BSpriteInfo,
  BSpriteModifier,
  BBuilding,
  ElementState,
} from '../../lib';

describe('Database Asset Validation', () => {
  const assetPath = path.join(__dirname, '../../assets/database');
  // The committed runtime artifact is the loose database-2024.json (readable diffs);
  // the backend reads it directly and the frontend zips it at build time. The .zip is
  // a gitignored build derivative, so tests read the JSON.
  const databaseJsonPath = path.join(assetPath, 'database-2024.json');
  const readDatabase = () => JSON.parse(fs.readFileSync(databaseJsonPath, 'utf8'));
  const uiImagePath = path.join(__dirname, '../../assets/ui_image');

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

    it('should write database-2024.json into the frontend asset root', () => {
      const frontendJson = path.join(
        __dirname,
        '../../frontend/src/assets/database/database-2024.json'
      );
      expect(fs.existsSync(frontendJson), 'frontend database-2024.json should exist').to.be.true;
      expect(fs.statSync(frontendJson).size).to.be.greaterThan(0);
    });
  });

  describe('Database Content Validation', () => {
    let database: any;

    before(() => {
      database = readDatabase();
    });

    it('should have 487 buildings and 212 elements', () => {
      // 463 vanilla + 24 modded (6 Steam Workshop mods) — see
      // spec/WEBSITE_MOD_IMPORT.md. Import defensively: this count varies
      // with whatever mods were enabled at export time.
      expect(database.buildings.length).to.equal(487);
      expect(database.elements.length).to.equal(212);
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
        // Vanilla U59 ships 32 gases; a sharp drop here means state parsing broke.
        expect(gases.length).to.equal(32);
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

    it('should have valid building structure with uiImage', () => {
      database.buildings.forEach((building: BBuilding, index: number) => {
        expect(building, `Building ${index} should have prefabId`).to.have.property('prefabId');
        expect(building.prefabId, `Building ${index} prefabId should be string`)
          .to.be.a('string')
          .with.length.greaterThan(0);
        expect(building, `Building ${index} should have uiImage`).to.have.property('uiImage');
        expect(building.uiImage, `Building ${index} uiImage should be string`)
          .to.be.a('string')
          .with.length.greaterThan(0);
      });
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

    it('should have overlay info sprites in uiSprites', () => {
      const infoSprites = (database.uiSprites as BSpriteInfo[]).filter(
        si => si.name && (si.name.includes('info') || si.name.includes('tile'))
      );
      expect(infoSprites.length).to.be.greaterThan(0);
    });

    it('should have overlay spriteModifiers (info / element overlays)', () => {
      expect(database.spriteModifiers).to.be.an('array');
      (database.spriteModifiers as BSpriteModifier[]).forEach((modifier, index) => {
        expect(modifier, `Modifier ${index} should have name`).to.have.property('name');
        expect(modifier, `Modifier ${index} should have tags`).to.have.property('tags');
        expect(modifier.tags, `Modifier ${index} tags should be array`).to.be.an('array');
      });
    });
  });

  describe('Flat Icon Assets', () => {
    it('should have ui_image directory with PNG files', () => {
      expect(fs.existsSync(uiImagePath), 'assets/ui_image should exist').to.be.true;
      const pngs = fs.readdirSync(uiImagePath).filter(f => f.endsWith('.png'));
      expect(pngs.length, 'ui_image should have at least 1000 PNG files').to.be.greaterThan(1000);
    });

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

    const rectsInDatabase = (): { id: string; rect: Rect }[] => {
      const database = readDatabase();
      return [
        ...database.buildings
          .filter((b: any) => b.uiImageRect)
          .map((b: any) => ({ id: b.uiImage, rect: b.uiImageRect as Rect })),
        ...(database.terrainFeatures ?? [])
          .filter((f: any) => f.uiImageRect)
          .map((f: any) => ({ id: f.id, rect: f.uiImageRect as Rect })),
      ];
    };

    it('should match every rect to its own PNG aspect', () => {
      const mismatched: string[] = [];
      const checked = rectsInDatabase();
      for (const { id, rect } of checked) {
        const png = pngSize(path.join(uiImagePath, `${id}.png`));
        if (png == null || png.w === 0 || png.h === 0) continue;
        const pngAspect = png.w / png.h;
        const off = Math.abs(rect.w / rect.h - pngAspect) / pngAspect;
        if (off >= ASPECT_TOLERANCE) mismatched.push(`${id} off by ${Math.round(off * 100)}%`);
      }
      expect(checked.length, 'rects to check').to.be.greaterThan(300);
      expect(mismatched, `rect/PNG aspect mismatch: ${mismatched.join(', ')}`).to.be.empty;
    });

    it('should give every terrain feature a placement rect', () => {
      // Terrain icons are tight-cropped renders, so the stretch fallback is a
      // visible regression rather than a graceful default: every catalogue entry
      // should carry the rect the export measured for it.
      const database = readDatabase();
      const withoutRect = (database.terrainFeatures ?? [])
        .filter((f: any) => !f.uiImageRect)
        .map((f: any) => f.id);
      expect(database.terrainFeatures, 'terrainFeatures').to.be.an('array').with.length.greaterThan(
        0
      );
      expect(withoutRect, `terrain features with no uiImageRect: ${withoutRect.join(', ')}`).to.be
        .empty;
    });
  });
});
