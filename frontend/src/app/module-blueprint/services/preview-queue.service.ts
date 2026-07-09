import { Injectable } from "@angular/core";

export interface PreviewQueueTicket {
  /**
   * Idempotent: removes a still-waiting task from the queue, or frees the
   * active slot so the next waiting task starts.
   */
  done(): void;
}

/**
 * Serializes server-rendered preview loads so each client has at most one
 * preview request in flight. The backend renders previews one at a time; a
 * page of cards firing 20+ simultaneous requests just queued on the render
 * worker until they all timed out together.
 */
@Injectable({ providedIn: "root" })
export class PreviewQueueService {
  private queue: Array<() => void> = [];
  private activeCount = 0;
  private readonly maxConcurrent = 1;

  /** Queues `start`; it runs (synchronously if the slot is free) once no earlier task is active. */
  enqueue(start: () => void): PreviewQueueTicket {
    let state: "waiting" | "active" | "done" = "waiting";
    const run = () => {
      state = "active";
      this.activeCount++;
      start();
    };
    this.queue.push(run);
    this.pump();
    return {
      done: () => {
        if (state === "done") return;
        const wasActive = state === "active";
        state = "done";
        if (wasActive) {
          this.activeCount--;
          this.pump();
        } else {
          this.queue = this.queue.filter((task) => task !== run);
        }
      },
    };
  }

  private pump() {
    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      this.queue.shift()!();
    }
  }
}
