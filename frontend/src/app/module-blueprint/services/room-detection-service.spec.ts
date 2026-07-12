import { Blueprint } from "../../../../../lib/index";
import { RoomDetectionService } from "./room-detection-service";
import { BlueprintService } from "./blueprint-service";

// The service only touches blueprintService.blueprint, so a bare Blueprint in
// a stub is enough — no TestBed/HTTP wiring needed. An empty blueprint gives a
// real (status 'empty') detection result; recomputes are observed through
// result object identity (detectRooms returns a fresh object per run).
describe("RoomDetectionService", () => {
  let blueprint: Blueprint;
  let service: RoomDetectionService;

  beforeEach(() => {
    vi.useFakeTimers();
    blueprint = new Blueprint();
    service = new RoomDetectionService({ blueprint } as BlueprintService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays lazy while inactive: changes only mark the result dirty", () => {
    blueprint.emitBlueprintChanged();
    vi.advanceTimersByTime(1000);
    expect(service.result).toBeNull();
  });

  it("computes immediately on activation", () => {
    service.active = true;
    expect(service.result).not.toBeNull();
    expect(service.result!.status).toBe("empty");
  });

  it("debounces changes while active: one recompute after the stroke settles", () => {
    service.active = true;
    const initial = service.result;

    blueprint.emitBlueprintChanged();
    blueprint.emitBlueprintChanged();
    blueprint.emitBlueprintChanged();

    vi.advanceTimersByTime(RoomDetectionService.debounceMs - 1);
    expect(service.result).toBe(initial); // still pending

    vi.advanceTimersByTime(1);
    const recomputed = service.result;
    expect(recomputed).not.toBe(initial);

    vi.advanceTimersByTime(1000);
    expect(service.result).toBe(recomputed); // exactly one recompute
  });

  it("re-activation without changes does not recompute", () => {
    service.active = true;
    const initial = service.result;
    service.active = false;
    service.active = true;
    expect(service.result).toBe(initial);
  });

  it("deactivation cancels a pending recompute", () => {
    service.active = true;
    const initial = service.result;
    blueprint.emitBlueprintChanged();
    service.active = false;
    vi.advanceTimersByTime(1000);
    expect(service.result).toBe(initial);
  });

  it("detectNow bypasses the debounce and returns a fresh result", () => {
    service.active = true;
    const initial = service.result;
    blueprint.emitBlueprintChanged();

    const fresh = service.detectNow();
    expect(fresh).not.toBe(initial);
    expect(service.result).toBe(fresh);

    vi.advanceTimersByTime(1000);
    expect(service.result).toBe(fresh); // pending debounce was cancelled
  });
});
