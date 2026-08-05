import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export class ArtifactStore {
  public readonly responsesDir: string;

  public constructor(public readonly directory: string) {
    this.responsesDir = path.join(directory, 'responses');
  }

  public prepare(): void {
    fs.mkdirSync(this.responsesDir, { recursive: true, mode: 0o700 });
  }

  public path(name: string): string {
    return path.join(this.directory, name);
  }

  public exists(name: string): boolean {
    return fs.existsSync(this.path(name));
  }

  public read(name: string): unknown {
    return JSON.parse(fs.readFileSync(this.path(name), 'utf8')) as unknown;
  }

  public writeJson(name: string, value: unknown): void {
    this.atomicReplace(this.path(name), json(value));
  }

  public writeText(name: string, value: string): void {
    this.atomicReplace(this.path(name), value);
  }

  public createReservation(value: unknown): void {
    this.prepare();
    const destination = this.path('reservation.json');
    const temporary = this.writeTemporary(destination, json(value));
    try {
      // link is an atomic create-if-absent operation. It cannot overwrite a
      // reservation left by a crash or an earlier run.
      fs.linkSync(temporary, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error('A reservation already exists; review the artifact before any rerun');
      }
      throw error;
    } finally {
      fs.unlinkSync(temporary);
    }
  }

  private atomicReplace(destination: string, contents: string): void {
    this.prepare();
    const temporary = this.writeTemporary(destination, contents);
    fs.renameSync(temporary, destination);
  }

  private writeTemporary(destination: string, contents: string): string {
    const temporary = `${destination}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, contents, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    return temporary;
  }
}
