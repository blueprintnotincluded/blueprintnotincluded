import { expect } from 'chai';
import { loadGameDatabase } from '../helpers/roomFixtures';
import fs from 'fs';
import path from 'path';
import {
  CATEGORIES,
  SUBCATEGORIES,
  buildCategoryLookup,
  deriveCategory,
} from '../../lib';

describe('deriveCategory: context signals', function () {
  // The tamer signal reads the terrain catalogue to tell a geyser from a plant.
  before(() => loadGameDatabase());

  const db = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../assets/database/database-2024.json'), 'utf8')
  );
  const lookup = buildCategoryLookup(db.buildMenuCategories, db.buildMenuItems);

  // The appliances every tamer, boiler and cooling loop share.
  const COOLING_LOOP = ['LiquidConditioner', 'SteamTurbine2', 'MetalTile', 'LiquidConduit'];

  it('still reads a plain loop as cooling with no context at all', () => {
    expect(deriveCategory(COOLING_LOOP, lookup)).to.equal('cooling');
    expect(deriveCategory(COOLING_LOOP, lookup, {})).to.equal('cooling');
    expect(deriveCategory(COOLING_LOOP, lookup, { title: 'Chill box' })).to.equal('cooling');
  });

  it('a terrain annotation makes the same loop a tamer', () => {
    expect(
      deriveCategory(COOLING_LOOP, lookup, { terrainFeatureIds: ['GeyserGeneric_steam'] })
    ).to.equal('tamer');
    expect(deriveCategory(COOLING_LOOP, lookup, { terrainFeatureIds: ['OilWell'] })).to.equal(
      'tamer'
    );
  });

  // Wild plants ride in the same annotation list; a loop beside a Mealwood is
  // still just a loop.
  it('a plant annotation is not a tamer signal, a geyser beside it still is', () => {
    expect(
      deriveCategory(COOLING_LOOP, lookup, { terrainFeatureIds: ['ForestTree', 'PrickleFlower'] })
    ).to.equal('cooling');
    expect(
      deriveCategory(COOLING_LOOP, lookup, {
        terrainFeatureIds: ['ForestTree', 'GeyserGeneric_steam'],
      })
    ).to.equal('tamer');
  });

  it('a title that names a tamer or a boiler does too, whatever the case', () => {
    expect(deriveCategory(COOLING_LOOP, lookup, { title: 'Metal Volcano Tamer' })).to.equal(
      'tamer'
    );
    expect(deriveCategory(COOLING_LOOP, lookup, { title: 'cool steam GEYSER' })).to.equal('tamer');
    expect(deriveCategory(COOLING_LOOP, lookup, { title: 'Petroleum boiler v3' })).to.equal(
      'boiler'
    );
    expect(deriveCategory(COOLING_LOOP, lookup, { title: 'Sour gas setup' })).to.equal('boiler');
  });

  it('matches whole words only — a gas vent is a building, not a geyser', () => {
    expect(deriveCategory(COOLING_LOOP, lookup, { title: 'Gas vent manifold' })).to.equal(
      'cooling'
    );
    expect(deriveCategory(COOLING_LOOP, lookup, { title: 'Preventing overheating' })).to.equal(
      'cooling'
    );
  });

  it('a title alone can carry a category with no signature building', () => {
    // Only tiles and pipes: nothing to score on but the title.
    expect(deriveCategory(['MetalTile', 'LiquidConduit'], lookup)).to.equal(null);
    expect(
      deriveCategory(['MetalTile', 'LiquidConduit'], lookup, { title: 'Crude to petroleum boiler' })
    ).to.equal('boiler');
  });

  it('a sieve loop is water, not cooling', () => {
    expect(deriveCategory(['WaterPurifier', 'LiquidPump', 'LiquidConduit'], lookup)).to.equal(
      'water'
    );
    expect(deriveCategory(['Desalinator', 'LiquidConditioner'], lookup)).to.equal('water');
    // Even with a full cooling loop on it, the sieve is what the build is for.
    expect(deriveCategory(['WaterPurifier', ...COOLING_LOOP], lookup)).to.equal('water');
    expect(
      deriveCategory(['LiquidPump', 'LiquidConduit'], lookup, { title: 'Water sieve setup' })
    ).to.equal('water');
  });

  it('reservoirs alone are storage; reservoirs on a cooling loop are still cooling', () => {
    expect(
      deriveCategory(['LiquidReservoir', 'LiquidValve', 'Door', 'LiquidConduit'], lookup)
    ).to.equal('storage');
    expect(deriveCategory([...COOLING_LOOP, 'LiquidReservoir'], lookup)).to.equal('cooling');
    expect(
      deriveCategory(['LiquidConduit', 'LiquidValve'], lookup, { title: 'Infinite liquid storage' })
    ).to.equal('storage');
    expect(deriveCategory(['Tile'], lookup, { title: 'Infinite gas (doors)' })).to.equal('storage');
  });

  it('a rocket interior stays a rocket interior whatever the title says', () => {
    expect(
      deriveCategory(['RocketControlStation', 'Bed'], lookup, { title: 'Volcano tamer rocket' })
    ).to.equal('rocketInterior');
  });

  it('every category has a subcategory list and the specific ones precede cooling', () => {
    for (const category of CATEGORIES) expect(SUBCATEGORIES[category]).to.be.an('array');
    for (const specific of ['tamer', 'boiler', 'water', 'storage'] as const) {
      expect(CATEGORIES.indexOf(specific), specific).to.be.below(CATEGORIES.indexOf('cooling'));
    }
  });
});
