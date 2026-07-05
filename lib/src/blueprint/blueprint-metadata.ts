export const GAME_VERSIONS = ['base', 'spacedOut', 'frostyPlanet', 'bionicBooster'] as const;
export type GameVersion = typeof GAME_VERSIONS[number];

export const CATEGORIES = ['oxygenGen', 'power', 'cooling', 'food', 'ranching',
  'automation', 'transit', 'refining', 'rooms', 'decor'] as const;
export type Category = typeof CATEGORIES[number];

export const SUBCATEGORIES: Record<Category, readonly string[]> = {
  oxygenGen: ['electrolyzer', 'algae', 'rust'],
  power:     ['generator', 'storage', 'distribution'],
  cooling:   ['aquatuner', 'fan', 'passive'],
  food:      ['farm', 'kitchen', 'greatHall'],
  ranching:  ['critter', 'egg', 'grooming'],
  automation: ['logic', 'sensor', 'switch'],
  transit:   ['rail', 'conveyor', 'pneumatic', 'ladder'],
  refining:  ['oil', 'metal', 'food'],
  rooms:     ['barracks', 'hospital', 'recreation'],
  decor:     ['sculpture', 'plant', 'lighting'],
};
export type Subcategory = string;

export const RESEARCH_TIERS = ['novice', 'advanced', 'interstellar', 'applied', 'dataAnalysis'] as const;
export type ResearchTier = typeof RESEARCH_TIERS[number];
