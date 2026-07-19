import { describe, expect, it, vi } from "vitest";
import { AreaOfEffect, Orientation, Vector2 } from "../../../../../lib/index";
import {
  AREA_OF_EFFECT_ALPHA,
  areaOfEffectColor,
  drawAreaOfEffectItem,
  drawAreaOfEffects,
  isLightCellObstructed,
  solidFoundationCells,
} from "./draw-area-of-effect";

const effect = (partial: Partial<AreaOfEffect> = {}): AreaOfEffect => ({
  kind: "operationRange",
  source: "test",
  shape: "rect",
  origin: { x: 0, y: 0 },
  blockedBySolids: true,
  cells: [[1, 2]],
  ...partial,
});

describe("area-of-effect renderer", () => {
  it("chooses kind colors, light tint, and fallbacks", () => {
    expect(areaOfEffectColor(effect())).toBe(0xf2a65a);
    expect(areaOfEffectColor(effect({ kind: "elementIntake" }))).toBe(0x58c7e8);
    expect(areaOfEffectColor(effect({ kind: "radiation" }))).toBe(0x9be564);
    expect(areaOfEffectColor(effect({ kind: "skyScan" }))).toBe(0x8da0ff);
    expect(
      areaOfEffectColor(
        effect({ kind: "light", lightColor: { r: 1, g: 0.5, b: 0, a: 1 } }),
      ),
    ).toBe(0xff8000);
    expect(
      areaOfEffectColor(effect({ kind: "light", lightColor: undefined })),
    ).toBe(0xffd45c);
    expect(areaOfEffectColor(effect({ kind: "modKind" }))).toBe(0xb8b8b8);
  });

  it("draws oriented absolute cell rectangles on the back layer", () => {
    const drawTileRectangle = vi.fn();
    const drawBlueprintDashedLine = vi.fn();
    const drawPixi = { drawTileRectangle, drawBlueprintDashedLine } as any;
    const item = {
      oniItem: { areasOfEffect: [effect()] },
      orientation: Orientation.R90,
      position: { x: 10, y: 20 },
    } as any;
    const camera = {} as any;

    drawAreaOfEffectItem(drawPixi, item, camera);

    expect(drawTileRectangle).toHaveBeenCalledTimes(1);
    const args = drawTileRectangle.mock.calls[0];
    expect(args[0]).toBe(camera);
    expect([args[1].x, args[1].y]).toEqual([12, 19]);
    expect([args[2].x, args[2].y]).toEqual([13, 18]);
    expect(args[3]).toBe(false);
    expect(args[4]).toBe(0);
    expect(args[5]).toBe(0xf2a65a);
    expect(args[7]).toBe(AREA_OF_EFFECT_ALPHA);
    expect(drawBlueprintDashedLine).toHaveBeenCalledTimes(4);
    expect(drawBlueprintDashedLine.mock.calls[0][3]).toBe(0xf2a65a);
  });

  it("outlines only exposed range edges", () => {
    const drawTileRectangle = vi.fn();
    const drawBlueprintDashedLine = vi.fn();
    drawAreaOfEffectItem(
      { drawTileRectangle, drawBlueprintDashedLine } as any,
      {
        oniItem: {
          areasOfEffect: [
            effect({
              cells: [
                [0, 0],
                [1, 0],
              ],
            }),
          ],
        },
        orientation: Orientation.Neutral,
        position: { x: 0, y: 0 },
      } as any,
      {} as any,
    );
    expect(drawTileRectangle).toHaveBeenCalledTimes(2);
    expect(drawBlueprintDashedLine).toHaveBeenCalledTimes(6);
    expect(drawTileRectangle.mock.invocationCallOrder[1]).toBeLessThan(
      drawBlueprintDashedLine.mock.invocationCallOrder[0],
    );
  });

  it("blocks light at solid foundation cells and every cell behind them", () => {
    const solids = new Set(["1,0"]);
    expect(
      isLightCellObstructed(new Vector2(0, 0), new Vector2(1, 0), solids),
    ).toBe(true);
    expect(
      isLightCellObstructed(new Vector2(0, 0), new Vector2(3, 0), solids),
    ).toBe(true);
    expect(
      isLightCellObstructed(new Vector2(0, 0), new Vector2(0, 3), solids),
    ).toBe(false);
  });

  it("prevents light leaking diagonally through solid tile corners", () => {
    expect(
      isLightCellObstructed(
        new Vector2(0, 0),
        new Vector2(2, 2),
        new Set(["1,0"]),
      ),
    ).toBe(true);
  });

  it("collects only foundation footprints as light blockers", () => {
    const items = [
      {
        oniItem: { isFoundation: true },
        position: { x: 4, y: 5 },
        topLeft: { x: 4, y: 5 },
        bottomRight: { x: 5, y: 4 },
      },
      {
        oniItem: { isFoundation: false },
        position: { x: 8, y: 8 },
        topLeft: { x: 8, y: 8 },
        bottomRight: { x: 8, y: 8 },
      },
    ] as any;
    expect([...solidFoundationCells(items)].sort()).toEqual([
      "4,4",
      "4,5",
      "5,4",
      "5,5",
    ]);
  });

  it("clips only blocked light effects while leaving other effect kinds nominal", () => {
    const drawTileRectangle = vi.fn();
    const drawPixi = {
      drawTileRectangle,
      drawBlueprintDashedLine: vi.fn(),
    } as any;
    const item = {
      oniItem: {
        areasOfEffect: [
          effect({
            kind: "light",
            origin: { x: 0, y: 0 },
            cells: [
              [0, 0],
              [1, 0],
              [2, 0],
            ],
          }),
          effect({ kind: "operationRange", cells: [[2, 0]] }),
        ],
      },
      orientation: Orientation.Neutral,
      position: { x: 0, y: 0 },
    } as any;
    drawAreaOfEffectItem(drawPixi, item, {} as any, new Set(["1,0"]));
    expect(drawTileRectangle).toHaveBeenCalledTimes(2);
    expect(drawTileRectangle.mock.calls.map((call) => call[5])).toEqual([
      0xffd45c, 0xf2a65a,
    ]);
  });

  it("fails silently when metadata is missing or params-only geometry is unsupported", () => {
    const drawTileRectangle = vi.fn();
    const drawPixi = {
      drawTileRectangle,
      drawBlueprintDashedLine: vi.fn(),
    } as any;
    const camera = {} as any;
    drawAreaOfEffectItem(
      drawPixi,
      {
        oniItem: {},
        orientation: Orientation.Neutral,
        position: { x: 0, y: 0 },
      } as any,
      camera,
    );
    drawAreaOfEffectItem(
      drawPixi,
      {
        oniItem: {
          areasOfEffect: [effect({ shape: "unknown", cells: undefined })],
        },
        orientation: Orientation.Neutral,
        position: { x: 0, y: 0 },
      } as any,
      camera,
    );
    expect(drawTileRectangle).not.toHaveBeenCalled();
  });

  it("renders every selected item and no unselected item", () => {
    const drawTileRectangle = vi.fn();
    const makeItem = (selected: boolean, x: number) =>
      ({
        selected,
        oniItem: { areasOfEffect: [effect()] },
        orientation: Orientation.Neutral,
        position: { x, y: 0 },
      }) as any;
    drawAreaOfEffects(
      { drawTileRectangle, drawBlueprintDashedLine: vi.fn() } as any,
      [makeItem(true, 0), makeItem(false, 10), makeItem(true, 20)],
      null,
      false,
      {} as any,
    );
    expect(drawTileRectangle).toHaveBeenCalledTimes(2);
  });

  it("renders only an active placement candidate and follows its current state", () => {
    const drawTileRectangle = vi.fn();
    const candidate = {
      selected: false,
      isBuildCandidate: true,
      oniItem: { areasOfEffect: [effect()] },
      orientation: Orientation.Neutral,
      position: { x: 3, y: 4 },
    } as any;
    const drawPixi = {
      drawTileRectangle,
      drawBlueprintDashedLine: vi.fn(),
    } as any;
    const camera = {} as any;
    drawAreaOfEffects(drawPixi, [], candidate, false, camera);
    expect(drawTileRectangle).not.toHaveBeenCalled();

    drawAreaOfEffects(drawPixi, [], candidate, true, camera);
    expect(drawTileRectangle).toHaveBeenCalledTimes(1);
    expect(drawTileRectangle.mock.calls[0][1].x).toBe(4);

    candidate.position.x = 8;
    candidate.orientation = Orientation.FlipH;
    drawAreaOfEffects(drawPixi, [], candidate, true, camera);
    expect(drawTileRectangle.mock.calls[1][1].x).toBe(7);
  });
});
