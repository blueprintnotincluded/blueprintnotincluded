import { Request, Response } from 'express';
import { OniItem } from '../../lib/index';

// Supported-mods index for non-editor pages (Discover, details): id -> title/
// buildings without shipping the database zip. Derived once from the loaded
// game database; static per deploy, so clients may cache it.
export class ModController {
  private payload: { mods: { id: string; title: string; buildings: string[] }[] } | null = null;

  getMods = (_req: Request, res: Response) => {
    if (this.payload == null) {
      const byId = new Map<string, { id: string; title: string; buildings: string[] }>();
      for (const item of OniItem.oniItems) {
        if (item.mod == null) continue;
        const entry = byId.get(item.mod) ?? {
          id: item.mod,
          title: item.modTitle ?? item.mod,
          buildings: [],
        };
        entry.buildings.push(item.id);
        byId.set(item.mod, entry);
      }
      this.payload = {
        mods: [...byId.values()]
          .map(m => ({ ...m, buildings: m.buildings.sort() }))
          .sort((a, b) => a.title.localeCompare(b.title)),
      };
    }
    res.json(this.payload);
  };
}
