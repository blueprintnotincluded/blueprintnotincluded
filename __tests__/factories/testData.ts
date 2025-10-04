import { Types } from 'mongoose';
import { User } from '../../app/api/models/user';
import { Blueprint } from '../../app/api/models/blueprint';

export interface TestUser {
  _id?: Types.ObjectId;
  email: string;
  username: string;
  hash?: string;
  salt?: string;
}

export interface TestBlueprint {
  _id?: Types.ObjectId;
  owner: Types.ObjectId;
  name: string;
  tags: string[];
  likes: string[];
  createdAt: Date;
  modifiedAt: Date;
  thumbnail: string;
  isCopy?: boolean;
  copyOf?: Types.ObjectId;
  data: any;
  deleted: boolean;
}

export class TestDataFactory {
  private static userCounter = 0;
  private static blueprintCounter = 0;

  static createUser(overrides: Partial<TestUser> = {}): TestUser {
    this.userCounter++;
    const timestamp = Date.now();
    return {
      _id: new Types.ObjectId(),
      email: `testuser${this.userCounter}_${timestamp}@example.com`,
      username: `testuser${this.userCounter}_${timestamp}`,
      hash: 'dummy_hash_for_testing',
      salt: 'dummy_salt_for_testing',
      ...overrides,
    };
  }

  static createBlueprint(
    owner: Types.ObjectId,
    overrides: Partial<TestBlueprint> = {}
  ): TestBlueprint {
    this.blueprintCounter++;
    const now = new Date();

    return {
      _id: new Types.ObjectId(),
      owner,
      name: `Test Blueprint ${this.blueprintCounter}`,
      tags: ['test', 'automation'],
      likes: [],
      createdAt: new Date(now.getTime() - this.blueprintCounter * 1000 * 60 * 60), // Spread creation times
      modifiedAt: new Date(now.getTime() - this.blueprintCounter * 1000 * 60 * 30), // Modified more recently
      thumbnail: `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==`,
      data: {
        version: '1.0',
        buildings: [
          {
            id: 'Generator',
            x: 0,
            y: 0,
            element: 'SandStone',
            temperature: 293.15,
          },
        ],
        cells: [],
        info: {
          name: `Test Blueprint ${this.blueprintCounter}`,
          description: 'A test blueprint for automated testing',
        },
      },
      deleted: false,
      ...overrides,
    };
  }

  static createPopularBlueprint(
    owner: Types.ObjectId,
    likes: string[] = ['user1', 'user2', 'user3']
  ): TestBlueprint {
    return this.createBlueprint(owner, {
      name: `Popular Blueprint ${this.blueprintCounter}`,
      tags: ['popular', 'power', 'automation'],
      likes,
      data: {
        version: '1.0',
        buildings: [
          { id: 'Generator', x: 0, y: 0 },
          { id: 'Battery', x: 1, y: 0 },
          { id: 'Wire', x: 2, y: 0 },
        ],
        info: {
          name: `Popular Blueprint ${this.blueprintCounter}`,
          description: 'A popular power generation setup',
        },
      },
    });
  }

  static createOldBlueprint(owner: Types.ObjectId, daysAgo: number = 7): TestBlueprint {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - daysAgo);

    return this.createBlueprint(owner, {
      name: `Old Blueprint ${this.blueprintCounter}`,
      createdAt: oldDate,
      modifiedAt: oldDate,
      tags: ['old', 'legacy'],
    });
  }

  static createCopiedBlueprint(owner: Types.ObjectId, originalId: Types.ObjectId): TestBlueprint {
    return this.createBlueprint(owner, {
      name: `Copy of Blueprint ${this.blueprintCounter}`,
      isCopy: true,
      copyOf: originalId,
      tags: ['copy', 'modified'],
    });
  }

  static reset(): void {
    this.userCounter = 0;
    this.blueprintCounter = 0;
  }
}
