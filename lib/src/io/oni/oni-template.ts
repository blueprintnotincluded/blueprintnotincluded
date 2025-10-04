import { OniBuilding } from './oni-building';
import { OniCell } from './oni-cell';

export interface OniTemplate {
  name: string;
  buildings: OniBuilding[];
  cells: OniCell[];
}
