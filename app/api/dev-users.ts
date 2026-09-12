// Local-auth-mode dev users (specs/local-auth-mode-plan.md). Fixed ids and a
// shared known password so a fresh devcontainer has working logins with no
// seed step. Only ever written by ensureDevUsers(), which db.ts calls at
// boot in local mode — never reachable in production (see auth-mode.ts).
//
// seed-dev-blueprints.ts imports DEV_USERS too, so its social-graph fixture
// still points at these same ids/usernames.
import mongoose from 'mongoose';
import { UserModel } from './models/user';

export const DEV_PASSWORD = 'dev_password';

export interface DevUserSpec {
  _id: mongoose.Types.ObjectId;
  username: string;
  email: string;
  bio: string;
  localRole?: 'admin';
}

// `dev_you` keeps the fixed _id the old seed:dev-user script used
// (d0d0d0d0d0d0d0d0d0d0d0d0), so existing minted tokens and any blueprint
// ownership tied to that id keep working.
export const DEV_USERS: DevUserSpec[] = [
  {
    _id: new mongoose.Types.ObjectId('d0d0d0d0d0d0d0d0d0d0d0d0'),
    username: 'dev_you',
    email: 'dev_you@bpni.local',
    bio: 'Durable dev validation account — survives DB resets.',
    localRole: 'admin',
  },
  {
    _id: new mongoose.Types.ObjectId('d0d0d0d0d0d0d0d0d0d0d0d1'),
    username: 'dev_admin',
    email: 'dev_admin@bpni.local',
    bio: 'Platform admin — moderates comments and triages feedback.',
    localRole: 'admin',
  },
  {
    _id: new mongoose.Types.ObjectId('d0d0d0d0d0d0d0d0d0d0d0d2'),
    username: 'dev_creator_alpha',
    email: 'dev_creator_alpha@bpni.local',
    bio: 'Prolific builder. Posts a lot of single-purpose reference builds.',
  },
  {
    _id: new mongoose.Types.ObjectId('d0d0d0d0d0d0d0d0d0d0d0d3'),
    username: 'dev_creator_beta',
    email: 'dev_creator_beta@bpni.local',
    bio: 'Automation enthusiast.',
  },
  {
    _id: new mongoose.Types.ObjectId('d0d0d0d0d0d0d0d0d0d0d0d4'),
    username: 'dev_forker',
    email: 'dev_forker@bpni.local',
    bio: "Forks and remixes other people's builds.",
  },
  {
    _id: new mongoose.Types.ObjectId('d0d0d0d0d0d0d0d0d0d0d0d5'),
    username: 'dev_lurker',
    email: 'dev_lurker@bpni.local',
    bio: 'Mostly here to like and follow.',
  },
];

// Idempotent: upserts each user by fixed _id and (re)applies the shared known
// password, so it is safe to run on every boot regardless of DB state.
export async function ensureDevUsers(): Promise<void> {
  for (const spec of DEV_USERS) {
    const setFields: Record<string, unknown> = {
      username: spec.username,
      email: spec.email,
      bio: spec.bio,
      authProvider: 'legacy',
    };
    const updateOp: Record<string, unknown> = { $set: setFields };
    if (spec.localRole) {
      setFields.localRole = spec.localRole;
    } else {
      updateOp.$unset = { localRole: '' };
    }

    const user = await UserModel.model.findOneAndUpdate({ _id: spec._id }, updateOp, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
    // PBKDF2 costs real wall-clock time by design (~seconds/user on this
    // hardware) — that cost is identical whether hashing to store or hashing
    // to verify, so there is no cheaper way to make this idempotent. Runs
    // once at boot (fire-and-forget from db.ts), never blocking the server.
    user!.setPassword(DEV_PASSWORD);
    await user!.save();
  }
  console.log(`[auth] dev users ensured (${DEV_USERS.length})`);
}
