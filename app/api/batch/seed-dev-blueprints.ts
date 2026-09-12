// Dev-only seed script: populates the local database with a full social graph for
// manually testing the site's community features in the browser — users, blueprints,
// real forks (BlueprintVersion + forkedFrom + forkCount), likes, comments (with
// replies, edits, soft-deletes, @mentions and /b/ references), follows and feedback.
//
// Usage:
//   npm run seed:dev-blueprints   # full social-graph seed (destructive re-seed)
//   npm run seed:dev-user         # ONLY ensure/restore the protected user + print its token
//
// Re-running is safe: it wipes the disposable @bpni.local fixture and recreates it.
//
// --- Logging in ---------------------------------------------------------------
// The devcontainer runs AUTH_MODE=local by default (specs/local-auth-mode-plan.md):
// open the login page and pick a dev user from the picker, or log in with the form
// using any @bpni.local email and the shared DEV_PASSWORD — no WorkOS keys needed.
// This script seeds the same users (via ../dev-users, the shared definitions) with
// that password, so nothing further is required after `npm run seed:dev-blueprints`.
//
// The printed-token flow below still matters for an AUTH_MODE=workos checkout with
// no real WorkOS keys configured: this script MINTS a JWT signed with the same
// `JWT_SECRET` the real endpoint uses, so it validates against the expressjwt
// middleware identically — no WorkOS round-trip. Paste the printed snippet into the
// browser console on the site origin:
//
//   localStorage.setItem('blueprintnotincluded-token', '<jwt>'); location.reload();
//
// --- The protected validation user -----------------------------------------------
// `dev_you` is your durable validation identity. It has a DETERMINISTIC _id, so its
// token stays valid no matter how many times the DB is reset — and it is the one
// account the destructive cleanup never deletes. After ANY reset (a full `test`
// db-setup, a manual drop, whatever), `npm run seed:dev-user` restores it in one
// command with no WorkOS flow. Its minted token is admin and long-lived (30 days),
// so a single paste gives you everything for a month of validation.

import * as fs from 'fs';
import * as path from 'path';
import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import {
  deriveRequiredDlcs,
  deriveModded,
  deriveCategory,
  buildCategoryLookup,
  CategoryLookup,
} from '../../../lib/index';
import { UserModel } from '../models/user';
import { BlueprintModel, Blueprint, thumbnailTypeOf } from '../models/blueprint';
import { BlueprintVersionModel } from '../models/blueprint-version';
import { CommentModel } from '../models/comment';
import { FollowModel } from '../models/follow';
import { BlueprintRatingModel } from '../models/blueprint-rating';
import { FeedbackModel } from '../models/feedback';
import { ensureCurrentVersion } from '../services/blueprint-version-service';
import { sanitizeCommentBody } from '../services/comment-body';
import { DEV_USERS as ALL_DEV_USERS, DEV_PASSWORD, DevUserSpec } from '../dev-users';

dotenv.config();

// 1x1 transparent PNG — placeholders don't render realistically, and that's fine:
// the point is to exercise metadata/social features, not blueprint art.
const THUMBNAIL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

type Role = 'admin' | undefined;

// `dev_you` is the durable validation identity — fixed _id, never deleted by
// cleanupPrior. Everyone else is the disposable social-graph fixture.
const PROTECTED_USER = ALL_DEV_USERS.find(u => u.username === 'dev_you')!;
const DEV_USERS: DevUserSpec[] = ALL_DEV_USERS.filter(u => u.username !== 'dev_you');
const PROTECTED_TOKEN_DAYS = 30;

// Placeholder blueprints keyed by real prefab IDs so the categorization algorithms
// (deriveCategory / deriveRequiredDlcs / deriveModded) actually fire — requiredDlcs,
// category and modded are DERIVED below exactly as production does, never hand-set.
// The comment on each spec is the expected derivation outcome (a manual assertion of
// what the algorithm should produce), which the run-summary prints back for checking.
interface SourceSpec {
  owner: string;
  name: string;
  subcategory: string;
  description: string;
  prefabIds: string[];
  daysAgo: number;
  ratedBy: string[]; // usernames (each seeds a 4-5 star rating)
}

const SOURCE_SPECS: SourceSpec[] = [
  {
    owner: 'dev_creator_alpha',
    name: 'Lone Manual Generator',
    subcategory: 'generator',
    description: 'A single manual generator. Should categorize as power.',
    prefabIds: ['ManualGenerator'], // -> power / base
    daysAgo: 30,
    ratedBy: ['dev_forker', 'dev_lurker', 'dev_creator_beta', 'dev_admin'],
  },
  {
    owner: 'dev_creator_alpha',
    name: 'Single Electrolyzer',
    subcategory: 'electrolyzer',
    description: 'One electrolyzer. Should categorize as oxygenGen.',
    prefabIds: ['Electrolyzer'], // -> oxygenGen / base
    daysAgo: 26,
    ratedBy: ['dev_lurker', 'dev_forker'],
  },
  {
    owner: 'dev_creator_beta',
    name: 'Just an Air Conditioner',
    subcategory: 'thermo',
    description: 'AirConditioner sits in the game "utilities" tab but is a cooling signature prefab.',
    prefabIds: ['AirConditioner'], // -> cooling / base (signature, not game-category)
    daysAgo: 22,
    ratedBy: ['dev_lurker'],
  },
  {
    owner: 'dev_creator_beta',
    name: 'Metal Refinery Only',
    subcategory: 'refinery',
    description: 'Single metal refinery. Should categorize as refining.',
    prefabIds: ['MetalRefinery'], // -> refining / base
    daysAgo: 18,
    ratedBy: ['dev_admin', 'dev_forker'],
  },
  {
    owner: 'dev_creator_alpha',
    name: 'Solo Microbe Musher',
    subcategory: 'kitchen',
    description: 'One microbe musher. Should categorize as food.',
    prefabIds: ['MicrobeMusher'], // -> food / base
    daysAgo: 15,
    ratedBy: ['dev_lurker'],
  },
  {
    owner: 'dev_creator_beta',
    name: 'One Ranch Station',
    subcategory: 'stable',
    description: 'Single ranch station. Should categorize as ranching.',
    prefabIds: ['RanchStation'], // -> ranching / base
    daysAgo: 12,
    ratedBy: ['dev_forker'],
  },
  {
    owner: 'dev_creator_alpha',
    name: 'Bare Gas Pump',
    subcategory: 'ventilation',
    description: 'A single gas pump. Ventilation/hvac is intentionally unmapped, so this should stay Untagged.',
    prefabIds: ['GasPump'], // -> Untagged / base (hvac deliberately not mapped)
    daysAgo: 9,
    ratedBy: ['dev_lurker', 'dev_admin'],
  },
  {
    owner: 'dev_forker',
    name: 'Naked Wire Run',
    subcategory: 'distribution',
    description: 'Just wires. No functional signal — should stay Untagged.',
    prefabIds: ['Wire', 'Wire'], // -> Untagged / base
    daysAgo: 7,
    ratedBy: [],
  },
  {
    owner: 'dev_creator_alpha',
    name: 'Spaced Out Oxygen',
    subcategory: 'electrolyzer',
    description: 'Electrolyzer + a Spaced Out battery module — category oxygenGen, requiredDlcs [EXPANSION1_ID].',
    prefabIds: ['Electrolyzer', 'BatteryModule'], // -> oxygenGen / [EXPANSION1_ID] (BatteryModule requires Spaced Out)
    daysAgo: 4,
    ratedBy: ['dev_forker', 'dev_lurker', 'dev_admin'],
  },
  {
    owner: 'dev_creator_beta',
    name: 'Modded Widget',
    subcategory: 'misc',
    description: 'Contains a prefab ID absent from the database — should flag modded=true.',
    prefabIds: ['ManualGenerator', 'TotallyFakeModBuilding'], // -> power / base / modded=true
    daysAgo: 2,
    ratedBy: [],
  },
];

// [sourceName, forkerUsername] — creates a real fork (new Blueprint + BlueprintVersion
// + forkedFrom + forkCount increment), exactly like POST /api/blueprints/:id/fork.
const FORKS: Array<[string, string]> = [
  ['Lone Manual Generator', 'dev_forker'],
  ['Spaced Out Oxygen', 'dev_forker'],
  ['Spaced Out Oxygen', 'dev_creator_alpha'],
];

// Second-level forks: fork the fork, to exercise multi-hop lineage / version history.
// [forkNameToForkAgain, forkerUsername]. Fork names are `${source} fork`.
const FORK_OF_FORKS: Array<[string, string]> = [
  ['Lone Manual Generator fork', 'dev_creator_beta'],
];

// follower -> followee (usernames). Self-follows are rejected by the model.
const FOLLOWS: Array<[string, string]> = [
  ['dev_lurker', 'dev_creator_alpha'],
  ['dev_lurker', 'dev_creator_beta'],
  ['dev_lurker', 'dev_forker'],
  ['dev_forker', 'dev_creator_alpha'],
  ['dev_creator_beta', 'dev_creator_alpha'],
  // The protected user has followers and follows others, so its feed/profile populate.
  ['dev_lurker', 'dev_you'],
  ['dev_creator_beta', 'dev_you'],
  ['dev_you', 'dev_creator_alpha'],
];

function buildLookups(dbPath: string): {
  dlcIdsMap: Map<string, string[]>;
  knownIds: Set<string>;
  modByPrefabId: Map<string, string>;
  categoryLookup: CategoryLookup;
} {
  const raw = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const dlcIdsMap = new Map<string, string[]>();
  const knownIds = new Set<string>();
  const modByPrefabId = new Map<string, string>();
  for (const building of raw.buildings) {
    dlcIdsMap.set(building.prefabId, building.dlcIds ?? []);
    knownIds.add(building.prefabId);
    if (building.mod) modByPrefabId.set(building.prefabId, building.mod);
  }
  const categoryLookup = buildCategoryLookup(raw.buildMenuCategories, raw.buildMenuItems);
  return { dlcIdsMap, knownIds, modByPrefabId, categoryLookup };
}

function blueprintData(prefabIds: string[]) {
  return {
    blueprintItems: prefabIds.map((id, i) => ({
      id,
      temperature: 293.15,
      position: { x: i, y: 0 },
      elements: [],
    })),
  };
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

type UserDoc = InstanceType<typeof UserModel.model>;

async function seedUser(spec: DevUserSpec): Promise<UserDoc> {
  await UserModel.model.deleteOne({ _id: spec._id });
  // legacy + DEV_PASSWORD: reachable both through the local-auth-mode picker/form
  // and via a minted JWT for an AUTH_MODE=workos checkout with no real keys (see header).
  const user = new UserModel.model({
    _id: spec._id,
    username: spec.username,
    email: spec.email,
    bio: spec.bio,
    authProvider: 'legacy',
  });
  user.setPassword(DEV_PASSWORD);
  await user.save();
  return user;
}

// Idempotent upsert of the protected user at its fixed _id. Never deleted by cleanup;
// re-running restores the exact same identity (same _id => existing tokens still work).
async function ensureProtectedUser(): Promise<UserDoc> {
  await UserModel.model.updateOne(
    { _id: PROTECTED_USER._id },
    {
      $set: {
        username: PROTECTED_USER.username,
        email: PROTECTED_USER.email,
        bio: PROTECTED_USER.bio,
        authProvider: 'legacy',
        localRole: PROTECTED_USER.localRole,
      },
    },
    { upsert: true },
  );
  const user = (await UserModel.model.findById(PROTECTED_USER._id))!;
  user.setPassword(DEV_PASSWORD);
  await user.save();
  return user;
}

// Mint a long-lived dev JWT directly (bypassing generateJwt's 7d/24h prod policy),
// signed with the same JWT_SECRET so the expressjwt middleware accepts it identically.
function mintDevToken(user: UserDoc, opts: { days: number; role?: Role } = { days: 7 }): string {
  const payload: Record<string, unknown> = {
    _id: (user._id as mongoose.Types.ObjectId).toString(),
    email: user.email,
    username: user.username,
    exp: Math.floor(Date.now() / 1000) + opts.days * 24 * 60 * 60,
  };
  if (opts.role) payload.role = opts.role;
  return jwt.sign(payload, process.env.JWT_SECRET as string);
}

function printLogin(label: string, token: string): void {
  console.log(`\n  # ${label}`);
  console.log(`  localStorage.setItem('blueprintnotincluded-token', '${token}'); location.reload();`);
}

async function forkBlueprint(source: Blueprint, ownerId: mongoose.Types.ObjectId, ratedBy: string[]) {
  const sourceVersion = await ensureCurrentVersion(source);
  const now = new Date();

  const forked = new BlueprintModel.model({
    owner: ownerId,
    name: `${source.name} fork`,
    data: sourceVersion.data,
    thumbnail: sourceVersion.thumbnail,
    thumbnailType: thumbnailTypeOf(sourceVersion.thumbnail),
    createdAt: now,
    modifiedAt: now,
    deletedAt: null,
    requiredDlcs: source.requiredDlcs ?? [],
    category: source.category ?? null,
    subcategory: source.subcategory ?? null,
    description: source.description ?? null,
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
    createdAt: now,
  });
  await forkedVersion.save();
  forked.currentVersionId = forkedVersion._id as mongoose.Types.ObjectId;
  await forked.save();

  await BlueprintModel.model.updateOne({ _id: source._id }, { $inc: { forkCount: 1 } });
  await seedRatings(forked, ratedBy);
  return forked;
}

async function cleanupPrior(): Promise<void> {
  const priorUsers = await UserModel.model.find({ email: { $in: DEV_USERS.map(u => u.email) } });
  const disposableUserIds = priorUsers.map(u => u._id);

  // Content is scrubbed for the disposable fixture AND the protected user (so its
  // seeded blueprints/interactions regenerate cleanly). The protected USER doc itself
  // is deliberately excluded from the user delete below — it must survive.
  const contentUserIds = [...disposableUserIds, PROTECTED_USER._id];

  const priorBlueprints = await BlueprintModel.model.find({ owner: { $in: contentUserIds } });
  const priorBlueprintIds = priorBlueprints.map(b => b._id);

  await BlueprintVersionModel.model.deleteMany({ blueprintId: { $in: priorBlueprintIds } });
  await BlueprintRatingModel.model.deleteMany({
    $or: [
      { blueprintId: { $in: priorBlueprintIds } },
      { userId: { $in: contentUserIds.map(id => id.toString()) } },
    ],
  });
  await CommentModel.model.deleteMany({
    $or: [{ blueprintId: { $in: priorBlueprintIds } }, { authorId: { $in: contentUserIds } }],
  });
  await FollowModel.model.deleteMany({
    $or: [{ followerId: { $in: contentUserIds } }, { followeeId: { $in: contentUserIds } }],
  });
  await FeedbackModel.model.deleteMany({ userId: { $in: contentUserIds } });
  await BlueprintModel.model.deleteMany({ owner: { $in: contentUserIds } });
  // Only the disposable fixture users are removed — never the protected user.
  if (disposableUserIds.length) {
    await UserModel.model.deleteMany({ _id: { $in: disposableUserIds } });
  }
}

function initModels(): void {
  UserModel.init();
  BlueprintModel.init();
  BlueprintVersionModel.init();
  CommentModel.init();
  FollowModel.init();
  FeedbackModel.init();
  BlueprintRatingModel.init();
}

// Seed one rating doc per rater with varied values (5,4,5,4…) and set the
// blueprint's denormalized aggregate — the invariant the rate endpoint keeps.
async function seedRatings(blueprint: Blueprint, raterIds: string[]): Promise<void> {
  if (raterIds.length === 0) return;
  const now = new Date();
  const values = raterIds.map((_, index) => (index % 2 === 0 ? 5 : 4));
  await BlueprintRatingModel.model.insertMany(
    raterIds.map((userId, index) => ({
      blueprintId: blueprint._id,
      userId,
      value: values[index],
      createdAt: now,
      updatedAt: now,
    }))
  );
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  blueprint.ratingCount = values.length;
  blueprint.ratingAverage = average;
  await blueprint.save();
}

// `npm run seed:dev-user`: restore ONLY the protected user + reprint its token, with no
// WorkOS flow and without touching any other data. Safe after any DB reset/drop.
async function runUserOnly(): Promise<void> {
  const mongoUri = process.env.DB_URI;
  if (!mongoUri) throw new Error('DB_URI not set in environment');
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET not set — cannot mint dev login tokens');

  await mongoose.connect(mongoUri);
  initModels();
  const user = await ensureProtectedUser();
  const token = mintDevToken(user, { days: PROTECTED_TOKEN_DAYS, role: PROTECTED_USER.localRole });

  console.log(`\nProtected user restored: ${PROTECTED_USER.username} (admin, ${PROTECTED_TOKEN_DAYS}-day token, no WorkOS).`);
  printLogin(`${PROTECTED_USER.username} — your durable validation login`, token);
  await mongoose.disconnect();
}

async function run() {
  const mongoUri = process.env.DB_URI;
  if (!mongoUri) throw new Error('DB_URI not set in environment');
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET not set — cannot mint dev login tokens');

  const dbPath = path.resolve(__dirname, '../../../assets/database/database-2024.json');
  const { dlcIdsMap, knownIds, modByPrefabId, categoryLookup } = buildLookups(dbPath);

  await mongoose.connect(mongoUri);
  initModels();

  await cleanupPrior();

  // Users — the protected `dev_you` participates in the graph like any other, but its
  // identity persists across runs (fixed _id, never deleted).
  const usersByName = new Map<string, UserDoc>();
  const protectedUser = await ensureProtectedUser();
  usersByName.set(PROTECTED_USER.username, protectedUser);
  for (const spec of DEV_USERS) usersByName.set(spec.username, await seedUser(spec));
  const idOf = (username: string) => usersByName.get(username)!._id as mongoose.Types.ObjectId;

  // Source blueprints, with metadata derived exactly like production
  const sourcesByName = new Map<string, Blueprint>();
  const derivedRows: Array<{ name: string; requiredDlcs: string[]; category: string; modded: boolean }> = [];
  for (const spec of SOURCE_SPECS) {
    const buildingDlcIds = spec.prefabIds.map(id => dlcIdsMap.get(id) ?? []);
    const requiredDlcs = deriveRequiredDlcs(buildingDlcIds);
    const modded = deriveModded(spec.prefabIds, knownIds, modByPrefabId);
    const category = deriveCategory(spec.prefabIds, categoryLookup);

    const raterIds = spec.ratedBy.map(u => idOf(u).toString());
    const created = daysAgo(spec.daysAgo);
    const blueprint = new BlueprintModel.model({
      owner: idOf(spec.owner),
      name: spec.name,
      thumbnail: THUMBNAIL,
      thumbnailType: thumbnailTypeOf(THUMBNAIL),
      data: blueprintData(spec.prefabIds),
      requiredDlcs,
      category,
      subcategory: spec.subcategory,
      description: spec.description,
      modded,
      createdAt: created,
      modifiedAt: created,
      deletedAt: null,
    });
    await blueprint.save();
    await seedRatings(blueprint, raterIds);
    sourcesByName.set(spec.name, blueprint);
    derivedRows.push({ name: spec.name, requiredDlcs, category: category ?? 'Untagged', modded });
  }

  // Forks (real BlueprintVersion + forkedFrom + forkCount), including a fork-of-fork.
  // Forks start unrated — self-rating is forbidden, so the forker can't seed one.
  const forksByName = new Map<string, Blueprint>();
  for (const [sourceName, forkerName] of FORKS) {
    const fork = await forkBlueprint(sourcesByName.get(sourceName)!, idOf(forkerName), []);
    forksByName.set(fork.name, fork);
  }
  for (const [forkName, forkerName] of FORK_OF_FORKS) {
    const parentFork = forksByName.get(forkName)!;
    const fork = await forkBlueprint(parentFork, idOf(forkerName), []);
    forksByName.set(fork.name, fork);
  }

  // A blueprint OWNED by the protected user, so `dev_you`'s profile/feed isn't empty:
  // it gets ratings, and dev_forker forks it (so "someone forked my build" is testable).
  const myPrefabs = ['ManualGenerator', 'Wire'];
  const myRaters = [idOf('dev_lurker').toString(), idOf('dev_creator_alpha').toString()];
  const myCreated = daysAgo(5);
  const myBlueprint = new BlueprintModel.model({
    owner: idOf(PROTECTED_USER.username),
    name: 'My Test Base',
    thumbnail: THUMBNAIL,
    thumbnailType: thumbnailTypeOf(THUMBNAIL),
    data: blueprintData(myPrefabs),
    requiredDlcs: deriveRequiredDlcs(myPrefabs.map(id => dlcIdsMap.get(id) ?? [])),
    category: deriveCategory(myPrefabs, categoryLookup),
    subcategory: 'generator',
    description: 'Owned by the protected dev_you account — your validation sandbox.',
    modded: deriveModded(myPrefabs, knownIds, modByPrefabId),
    createdAt: myCreated,
    modifiedAt: myCreated,
    deletedAt: null,
  });
  await myBlueprint.save();
  await seedRatings(myBlueprint, myRaters);
  sourcesByName.set(myBlueprint.name, myBlueprint);
  await forkBlueprint(myBlueprint, idOf('dev_forker'), []);

  // Mentions resolver over the seeded users (lowercased username -> userId)
  const resolveMentions = async (usernames: string[]): Promise<Map<string, string>> => {
    const out = new Map<string, string>();
    for (const uname of usernames) {
      const user = usersByName.get(uname.toLowerCase()) ?? usersByName.get(uname);
      if (user) out.set(uname.toLowerCase(), (user._id as mongoose.Types.ObjectId).toString());
    }
    return out;
  };

  // Comments: a thread with a reply, an @mention + /b/ reference, an edit, a soft-delete.
  const genBp = sourcesByName.get('Lone Manual Generator')!;
  const spomBp = sourcesByName.get('Spaced Out Oxygen')!;
  let commentCount = 0;

  const addComment = async (opts: {
    blueprintId: mongoose.Types.ObjectId;
    author: string;
    rawBody: string;
    parentId?: mongoose.Types.ObjectId | null;
    daysAgo: number;
    edited?: boolean;
    deleted?: boolean;
  }) => {
    const body = await sanitizeCommentBody(opts.rawBody, resolveMentions);
    const createdAt = daysAgo(opts.daysAgo);
    const comment = new CommentModel.model({
      blueprintId: opts.blueprintId,
      authorId: idOf(opts.author),
      parentId: opts.parentId ?? null,
      body,
      createdAt,
      lastActivityAt: createdAt,
      editedAt: opts.edited ? daysAgo(Math.max(0, opts.daysAgo - 0.5)) : null,
      deletedAt: opts.deleted ? daysAgo(Math.max(0, opts.daysAgo - 0.25)) : null,
    });
    await comment.save();
    commentCount++;
    return comment;
  };

  // Top-level + reply (reply bumps the parent's lastActivityAt, per the API path)
  const topOnGen = await addComment({
    blueprintId: genBp._id as mongoose.Types.ObjectId,
    author: 'dev_forker',
    rawBody: 'Love this — simple and clean. Forked it to tweak the wiring.',
    daysAgo: 3,
  });
  const replyOnGen = await addComment({
    blueprintId: genBp._id as mongoose.Types.ObjectId,
    author: 'dev_creator_alpha',
    rawBody: `Thanks! If you want the DLC version see /b/${(spomBp._id as mongoose.Types.ObjectId).toString()}`,
    parentId: topOnGen._id as mongoose.Types.ObjectId,
    daysAgo: 2,
  });
  await CommentModel.model.updateOne(
    { _id: topOnGen._id },
    { $max: { lastActivityAt: replyOnGen.createdAt } },
  );

  // @mention that resolves to a {{user:id}} token
  await addComment({
    blueprintId: genBp._id as mongoose.Types.ObjectId,
    author: 'dev_lurker',
    rawBody: 'Nice starter build @dev_creator_alpha — following you now.',
    daysAgo: 1,
  });

  // Edited comment
  await addComment({
    blueprintId: spomBp._id as mongoose.Types.ObjectId,
    author: 'dev_forker',
    rawBody: 'Works great on Spaced Out. (edited to add: needs a battery.)',
    daysAgo: 2,
    edited: true,
  });

  // Soft-deleted comment (kept in DB; controller renders it as removed)
  await addComment({
    blueprintId: spomBp._id as mongoose.Types.ObjectId,
    author: 'dev_lurker',
    rawBody: 'This comment was removed by its author.',
    daysAgo: 1,
    deleted: true,
  });

  // A comment on the protected user's own blueprint, so its detail page has activity
  await addComment({
    blueprintId: myBlueprint._id as mongoose.Types.ObjectId,
    author: 'dev_creator_alpha',
    rawBody: 'Solid starting point @dev_you — mind if I fork it?',
    daysAgo: 1,
  });

  // Follows
  let followCount = 0;
  for (const [follower, followee] of FOLLOWS) {
    await new FollowModel.model({ followerId: idOf(follower), followeeId: idOf(followee) }).save();
    followCount++;
  }

  // Feedback (drives the admin feedback queue)
  await new FeedbackModel.model({
    userId: idOf('dev_forker'),
    userEmail: 'dev_forker@bpni.local',
    username: 'dev_forker',
    message: 'The fork button is great, but I wish version history showed diffs.',
    url: '/b/' + (genBp._id as mongoose.Types.ObjectId).toString(),
    status: 'open',
  }).save();
  await new FeedbackModel.model({
    userId: idOf('dev_lurker'),
    userEmail: 'dev_lurker@bpni.local',
    username: 'dev_lurker',
    message: 'Loving the new like counts. Thanks!',
    status: 'resolved',
  }).save();

  // --- Summary --------------------------------------------------------------
  console.log(`\nSeeded ${DEV_USERS.length} disposable users + 1 protected (dev_you), ` +
    `${SOURCE_SPECS.length + 1} blueprints, ${FORKS.length + FORK_OF_FORKS.length + 1} forks, ` +
    `${commentCount} comments, ${followCount} follows, 2 feedback items.`);

  console.log('\nDerived metadata (verify categorization):');
  for (const r of derivedRows) {
    const dlcs = r.requiredDlcs.length > 0 ? r.requiredDlcs.join('+') : 'base';
    console.log(`  ${r.name.padEnd(24)} category=${r.category.padEnd(10)} requiredDlcs=${dlcs.padEnd(15)} modded=${r.modded}`);
  }

  console.log('\n=== Dev login ===');
  console.log(`(In AUTH_MODE=local, just log in on the site with any @bpni.local email + "${DEV_PASSWORD}".`);
  console.log(' The tokens below are for an AUTH_MODE=workos checkout with no real WorkOS keys —');
  console.log(' paste into the browser console on the site origin, then reload.)');

  // The protected account first and highlighted — this is the durable one to use.
  printLogin(
    `${PROTECTED_USER.username}  ⟵ USE THIS (admin, ${PROTECTED_TOKEN_DAYS}-day token, survives resets; restore anytime via \`npm run seed:dev-user\`)`,
    mintDevToken(protectedUser, { days: PROTECTED_TOKEN_DAYS, role: PROTECTED_USER.localRole }),
  );

  for (const spec of DEV_USERS) {
    const user = usersByName.get(spec.username)!;
    printLogin(`${spec.username}${spec.localRole ? ` (${spec.localRole})` : ''}`, mintDevToken(user, { days: 7, role: spec.localRole }));
  }

  await mongoose.disconnect();
}

const userOnly = process.argv.includes('--user-only');
(userOnly ? runUserOnly() : run()).catch(err => {
  console.error(err);
  process.exit(1);
});
