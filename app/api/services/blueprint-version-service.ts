import mongoose from 'mongoose';
import { Blueprint, BlueprintModel } from '../models/blueprint';
import { BlueprintVersion, BlueprintVersionModel } from '../models/blueprint-version';

// data/thumbnail/modVersion stay on Blueprint as a read cache during the
// currentVersionId transition (spec/FORKS.md) — resolving through the version
// keeps the invariant that currentVersionId always reflects the latest saved data.

// Loads the data a blueprint currently renders. Falls back to the Blueprint's own
// (cached) `data` for documents that predate BlueprintVersion and haven't been
// saved since — normal saves always create/sync a current version going forward.
export async function resolveCurrentData(blueprint: Blueprint): Promise<any> {
  if (blueprint.currentVersionId != null) {
    const version = await BlueprintVersionModel.model.findById(blueprint.currentVersionId);
    if (version != null) return version.data;
  }
  return blueprint.data;
}

export async function getCurrentVersion(blueprint: Blueprint): Promise<BlueprintVersion | null> {
  if (blueprint.currentVersionId == null) return null;
  return BlueprintVersionModel.model.findById(blueprint.currentVersionId);
}

// Ensures a blueprint has a currentVersionId, creating an initial version from its
// cached `data` if one is missing (documents saved before this feature shipped).
export async function ensureCurrentVersion(blueprint: Blueprint): Promise<BlueprintVersion> {
  const existing = await getCurrentVersion(blueprint);
  if (existing != null) return existing;

  const version = new BlueprintVersionModel.model({
    blueprintId: blueprint._id,
    data: blueprint.data,
    thumbnail: blueprint.thumbnail,
    createdAt: blueprint.createdAt ?? new Date(),
  });
  await version.save();
  await BlueprintModel.model.updateOne(
    { _id: blueprint._id },
    { $set: { currentVersionId: version._id } }
  );
  blueprint.currentVersionId = version._id as mongoose.Types.ObjectId;
  return version;
}

// Called on every regular save (upload/autosave): keeps the current version's data
// mirroring the just-saved Blueprint.data, creating the initial version on first save.
export async function syncCurrentVersion(
  blueprint: Blueprint,
  data: any,
  thumbnail: string
): Promise<void> {
  if (blueprint.currentVersionId != null) {
    const result = await BlueprintVersionModel.model.updateOne(
      { _id: blueprint.currentVersionId },
      { $set: { data, thumbnail } }
    );
    if (result.matchedCount > 0) return;
  }

  const version = new BlueprintVersionModel.model({
    blueprintId: blueprint._id,
    data,
    thumbnail,
    createdAt: new Date(),
  });
  await version.save();
  await BlueprintModel.model.updateOne(
    { _id: blueprint._id },
    { $set: { currentVersionId: version._id } }
  );
  blueprint.currentVersionId = version._id as mongoose.Types.ObjectId;
}
