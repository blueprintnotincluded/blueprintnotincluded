import { UserJwt } from '../models/user';

// Owner may be a raw ObjectId/string or a populated User document depending on
// which query produced the blueprint — normalize to the id string either way.
export function ownerIdOf(blueprint: { owner: any }): string | null {
  const owner = blueprint.owner;
  if (owner == null) return null;
  return (owner._id ?? owner).toString();
}

// Draft gate shared by every read endpoint: published blueprints are visible
// to everyone; drafts only to their owner and admins. Missing isPublished
// (docs predating the backfill migration) counts as published so a doc that
// somehow escapes the backfill degrades to visible, not to a 404.
export function canViewBlueprint(
  blueprint: { owner: any; isPublished?: boolean | null },
  viewer: UserJwt | null | undefined
): boolean {
  if (blueprint.isPublished !== false) return true;
  if (viewer == null) return false;
  return viewer.role === 'admin' || ownerIdOf(blueprint) === viewer._id;
}
