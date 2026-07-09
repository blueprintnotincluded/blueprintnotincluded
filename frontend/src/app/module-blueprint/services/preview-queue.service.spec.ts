import { PreviewQueueService } from "./preview-queue.service";

describe("PreviewQueueService", () => {
  let service: PreviewQueueService;

  beforeEach(() => {
    service = new PreviewQueueService();
  });

  it("starts the first task immediately and holds later ones", () => {
    const started: string[] = [];
    service.enqueue(() => started.push("a"));
    service.enqueue(() => started.push("b"));
    service.enqueue(() => started.push("c"));

    expect(started).toEqual(["a"]);
  });

  it("starts the next task when the active one finishes", () => {
    const started: string[] = [];
    const first = service.enqueue(() => started.push("a"));
    service.enqueue(() => started.push("b"));

    first.done();
    expect(started).toEqual(["a", "b"]);
  });

  it("removes a waiting task without starting it", () => {
    const started: string[] = [];
    const first = service.enqueue(() => started.push("a"));
    const second = service.enqueue(() => started.push("b"));
    service.enqueue(() => started.push("c"));

    second.done();
    first.done();
    expect(started).toEqual(["a", "c"]);
  });

  it("ignores repeated done() calls", () => {
    const started: string[] = [];
    const first = service.enqueue(() => started.push("a"));
    service.enqueue(() => started.push("b"));
    service.enqueue(() => started.push("c"));

    first.done();
    first.done();
    expect(started).toEqual(["a", "b"]);
  });
});
