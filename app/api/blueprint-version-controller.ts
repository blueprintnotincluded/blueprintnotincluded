import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { BlueprintModel } from './models/blueprint';
import { BlueprintVersionModel, BlueprintVersion } from './models/blueprint-version';
import { UserJwt } from './models/user';
import { NotificationController } from './notification-controller';
import { apiError } from './utils/apiError';
import { optionalViewer } from './utils/optionalViewer';
import { canViewBlueprint } from './utils/blueprint-visibility';
import { BlueprintEventService } from './services/blueprint-event-service';
import {
  ensureCurrentVersion,
  resolveCurrentData,
  getCurrentVersion,
} from './services/blueprint-version-service';
import { PreviewImageService } from './services/preview-image-service';
import {
  BlueprintVersionDto,
  ListBlueprintVersionsResponse,
  CreateBlueprintVersionRequest,
  CreateBlueprintVersionResponse,
  ForkBlueprintResponse,
  DeleteBlueprintVersionResponse,
} from '../../lib/index';

const NAME_MAX_LENGTH = 60;
const FORK_SUFFIX = ' fork';

// "<name> fork", truncated so the total respects the same 60-char cap as
// Blueprint.name — the suffix uses only letters/space so the result stays
// valid against the name regex as long as the source name was valid.
function forkName(originalName: string): string {
  const maxBase = NAME_MAX_LENGTH - FORK_SUFFIX.length;
  const base = originalName.length > maxBase ? originalName.slice(0, maxBase) : originalName;
  return `${base}${FORK_SUFFIX}`;
}

function toVersionDto(version: BlueprintVersion): BlueprintVersionDto {
  return {
    id: (version._id as mongoose.Types.ObjectId).toString(),
    name: version.name ?? null,
    createdAt: version.createdAt.toISOString(),
    thumbnail: version.thumbnail ?? null,
  };
}

export class BlueprintVersionController {
  constructor() {
    this.fork = this.fork.bind(this);
    this.listVersions = this.listVersions.bind(this);
    this.createVersion = this.createVersion.bind(this);
    this.deleteVersion = this.deleteVersion.bind(this);
    this.restoreVersion = this.restoreVersion.bind(this);
  }

  public async fork(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as UserJwt;
      const sourceId = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(sourceId)) {
        res.status(400).json(apiError(400, 'Invalid blueprint id'));
        return;
      }

      const source = await BlueprintModel.model.findOne({ _id: sourceId, deletedAt: null });
      // Drafts can only be forked by their owner or an admin (the fork below
      // is itself a draft via the schema default).
      if (!source || !canViewBlueprint(source, user)) {
        res.status(404).json(apiError(404, 'Blueprint not found'));
        return;
      }

      const sourceVersion = await ensureCurrentVersion(source);

      const now = new Date();
      const forked = new BlueprintModel.model({
        owner: user._id,
        name: forkName(source.name),
        // Every blueprint starts with the author's like (GitHub-star semantics) — see uploadBlueprint
        likes: [user._id],
        likeCount: 1,
        data: sourceVersion.data,
        thumbnail: sourceVersion.thumbnail,
        createdAt: now,
        modifiedAt: now,
        deletedAt: null,
        // Forks start as drafts, like any new blueprint
        isPublished: false,
        gameVersion: source.gameVersion ?? null,
        category: source.category ?? null,
        subcategory: source.subcategory ?? null,
        description: source.description ?? null,
        researchTier: source.researchTier ?? null,
        modded: source.modded ?? null,
        forkedFrom: {
          blueprintId: source._id,
          versionId: sourceVersion._id,
          forkedAt: now,
        },
      });

      const forkedVersion = new BlueprintVersionModel.model({
        blueprintId: forked._id,
        data: sourceVersion.data,
        thumbnail: sourceVersion.thumbnail,
        modVersion: sourceVersion.modVersion ?? null,
        createdAt: now,
      });
      await forkedVersion.save();
      forked.currentVersionId = forkedVersion._id as mongoose.Types.ObjectId;
      await forked.save();

      await BlueprintModel.model.updateOne({ _id: source._id }, { $inc: { forkCount: 1 } });

      // Render-on-write: warm the fork's preview cache (Phase 2).
      PreviewImageService.instance.prerender(forked.id, now, async () => forkedVersion.data);

      // The fork is a brand-new (draft) blueprint — lifecycle log starts here
      BlueprintEventService.log({ blueprintId: forked.id, actorId: user._id, type: 'created' });

      await NotificationController.notify({
        recipientId: source.owner,
        actorId: user._id,
        type: 'fork',
        blueprintId: forked._id as mongoose.Types.ObjectId,
      });

      const response: ForkBlueprintResponse = { id: forked.id };
      res.json(response);
    } catch (err) {
      console.log('fork blueprint error');
      console.log(err);
      res.status(500).json(apiError(500, 'Failed to fork blueprint'));
    }
  }

  public async listVersions(req: Request, res: Response): Promise<void> {
    try {
      const blueprintId = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(blueprintId)) {
        res.status(400).json(apiError(400, 'Invalid blueprint id'));
        return;
      }

      // Anonymous route: gate drafts so version names/thumbnails can't leak,
      // and treat soft-deleted blueprints as not found
      const blueprint = await BlueprintModel.model
        .findOne({ _id: blueprintId, deletedAt: null })
        .select('owner isPublished')
        .lean();
      if (!blueprint || !canViewBlueprint(blueprint, optionalViewer(req))) {
        res.status(404).json(apiError(404, 'Blueprint not found'));
        return;
      }

      const versions = await BlueprintVersionModel.model
        .find({ blueprintId, deletedAt: null })
        .sort({ createdAt: -1 })
        .select('name createdAt thumbnail');

      const response: ListBlueprintVersionsResponse = { versions: versions.map(toVersionDto) };
      res.json(response);
    } catch (err) {
      console.log('list blueprint versions error');
      console.log(err);
      res.status(500).json(apiError(500, 'Failed to retrieve versions'));
    }
  }

  public async createVersion(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as UserJwt;
      const blueprintId = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(blueprintId)) {
        res.status(400).json(apiError(400, 'Invalid blueprint id'));
        return;
      }

      const { name } = (req.body ?? {}) as CreateBlueprintVersionRequest;
      if (name != null && (typeof name !== 'string' || name.length > NAME_MAX_LENGTH)) {
        res.status(400).json(apiError(400, `Version name must be ${NAME_MAX_LENGTH} characters or fewer`));
        return;
      }

      const blueprint = await BlueprintModel.model.findOne({ _id: blueprintId, deletedAt: null });
      if (!blueprint) {
        res.status(404).json(apiError(404, 'Blueprint not found'));
        return;
      }
      if (blueprint.owner.toString() !== user._id) {
        res.status(403).json(apiError(403, 'Only the owner can create a version'));
        return;
      }

      const currentData = await resolveCurrentData(blueprint);
      const currentVersion = await getCurrentVersion(blueprint);

      const version = new BlueprintVersionModel.model({
        blueprintId: blueprint._id,
        name: name ?? null,
        data: currentData,
        thumbnail: currentVersion?.thumbnail ?? blueprint.thumbnail,
        modVersion: currentVersion?.modVersion ?? null,
        createdAt: new Date(),
      });
      await version.save();

      blueprint.currentVersionId = version._id as mongoose.Types.ObjectId;
      await blueprint.save();

      const response: CreateBlueprintVersionResponse = { version: toVersionDto(version) };
      res.json(response);
    } catch (err) {
      console.log('create blueprint version error');
      console.log(err);
      res.status(500).json(apiError(500, 'Failed to create version'));
    }
  }

  public async deleteVersion(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as UserJwt;
      const blueprintId = req.params.id;
      const versionId = req.params.versionId;
      if (!mongoose.Types.ObjectId.isValid(blueprintId) || !mongoose.Types.ObjectId.isValid(versionId)) {
        res.status(400).json(apiError(400, 'Invalid blueprint or version id'));
        return;
      }

      const blueprint = await BlueprintModel.model.findOne({ _id: blueprintId, deletedAt: null });
      if (!blueprint) {
        res.status(404).json(apiError(404, 'Blueprint not found'));
        return;
      }
      if (blueprint.owner.toString() !== user._id) {
        res.status(403).json(apiError(403, 'Only the owner can delete a version'));
        return;
      }

      const version = await BlueprintVersionModel.model.findOne({
        _id: versionId,
        blueprintId,
        deletedAt: null,
      });
      if (!version) {
        res.status(404).json(apiError(404, 'Version not found'));
        return;
      }

      const liveCount = await BlueprintVersionModel.model.countDocuments({ blueprintId, deletedAt: null });
      if (liveCount <= 1) {
        res.status(400).json(apiError(400, 'Cannot delete the only remaining version'));
        return;
      }

      version.deletedAt = new Date();
      await version.save();

      if (blueprint.currentVersionId?.toString() === versionId) {
        const next = await BlueprintVersionModel.model
          .findOne({ blueprintId, deletedAt: null })
          .sort({ createdAt: -1 });
        // liveCount > 1 guarantees a next version exists
        blueprint.currentVersionId = next!._id as mongoose.Types.ObjectId;
        await blueprint.save();
      }

      const response: DeleteBlueprintVersionResponse = { deleteVersion: 'OK' };
      res.json(response);
    } catch (err) {
      console.log('delete blueprint version error');
      console.log(err);
      res.status(500).json(apiError(500, 'Failed to delete version'));
    }
  }

  // Points currentVersionId back at an earlier live version — the simpler of the
  // two restore semantics floated in spec/FORKS.md (no new version is created).
  public async restoreVersion(req: Request, res: Response): Promise<void> {
    try {
      const user = req.user as UserJwt;
      const blueprintId = req.params.id;
      const versionId = req.params.versionId;
      if (!mongoose.Types.ObjectId.isValid(blueprintId) || !mongoose.Types.ObjectId.isValid(versionId)) {
        res.status(400).json(apiError(400, 'Invalid blueprint or version id'));
        return;
      }

      const blueprint = await BlueprintModel.model.findOne({ _id: blueprintId, deletedAt: null });
      if (!blueprint) {
        res.status(404).json(apiError(404, 'Blueprint not found'));
        return;
      }
      if (blueprint.owner.toString() !== user._id) {
        res.status(403).json(apiError(403, 'Only the owner can restore a version'));
        return;
      }

      const version = await BlueprintVersionModel.model.findOne({
        _id: versionId,
        blueprintId,
        deletedAt: null,
      });
      if (!version) {
        res.status(404).json(apiError(404, 'Version not found'));
        return;
      }

      blueprint.currentVersionId = version._id as mongoose.Types.ObjectId;
      // The rendered content changed: bumping modifiedAt invalidates both the
      // disk preview cache and the frontend's versioned (?v=) preview urls.
      blueprint.modifiedAt = new Date();
      await blueprint.save();

      // Render-on-write: warm the preview cache with the restored data (Phase 2).
      PreviewImageService.instance.prerender(blueprint.id, blueprint.modifiedAt, async () => version.data);

      const response: CreateBlueprintVersionResponse = { version: toVersionDto(version) };
      res.json(response);
    } catch (err) {
      console.log('restore blueprint version error');
      console.log(err);
      res.status(500).json(apiError(500, 'Failed to restore version'));
    }
  }
}
