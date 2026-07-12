import {
  Cavity,
  DrawHelpers,
  RoomDetectionResult,
  Vector2,
} from "../../../../../lib/index";
import {
  buildRoomOverlayGeometry,
  ROOM_TYPE_LABELS,
} from "./room-overlay-geometry";

const tile = (x: number, y: number) =>
  DrawHelpers.getTileIndex(new Vector2(x, y));

// Cells sorted ascending, matching the detector's output contract.
const cells = (positions: [number, number][]) =>
  positions.map(([x, y]) => tile(x, y)).sort((a, b) => a - b);

const cavity = (id: number, overrides: Partial<Cavity>): Cavity => ({
  id,
  cells: [],
  size: 0,
  result: "miscellaneous",
  matchedTypes: [],
  ...overrides,
});

const result = (
  cavities: Cavity[],
  rooms: RoomDetectionResult["rooms"] = []
): RoomDetectionResult => ({ status: "ok", cavities, rooms });

describe("buildRoomOverlayGeometry", () => {
  it("merges row-consecutive cells into spans", () => {
    // 3x2 block plus one detached cell on the same row.
    const block = cells([
      [0, 0],
      [1, 0],
      [2, 0],
      [5, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
    const geometry = buildRoomOverlayGeometry(
      result([cavity(0, { cells: block, size: block.length })])
    );

    expect(geometry[0].spans).toEqual([
      { x: 0, y: 0, length: 3 },
      { x: 5, y: 0, length: 1 },
      { x: 0, y: 1, length: 3 },
    ]);
  });

  it("centers the label on the cavity bounding box", () => {
    const block = cells([
      [2, 3],
      [3, 3],
      [2, 4],
      [3, 4],
    ]);
    const geometry = buildRoomOverlayGeometry(
      result([cavity(0, { cells: block, size: 4 })])
    );
    expect(geometry[0].center).toEqual({ x: 2.5, y: 3.5 });
  });

  it("labels rooms with their display name and colors them by family", () => {
    const roomCells = cells([[0, 0]]);
    const geometry = buildRoomOverlayGeometry(
      result(
        [
          cavity(0, {
            cells: roomCells,
            size: 1,
            result: "room",
            matchedTypes: ["latrine"],
          }),
        ],
        [{ type: "latrine", cavityId: 0, cells: roomCells, size: 1 }]
      )
    );
    expect(geometry[0].label).toBe(ROOM_TYPE_LABELS.latrine);
    expect(geometry[0].color).toBeGreaterThan(0);
  });

  it("shows both names for a possible upgrade (Park / Nature Reserve)", () => {
    const roomCells = cells([[0, 0]]);
    const geometry = buildRoomOverlayGeometry(
      result(
        [
          cavity(0, {
            cells: roomCells,
            size: 1,
            result: "room",
            matchedTypes: ["park"],
          }),
        ],
        [
          {
            type: "park",
            possibleUpgrade: "natureReserve",
            cavityId: 0,
            cells: roomCells,
            size: 1,
          },
        ]
      )
    );
    expect(geometry[0].label).toBe(
      `${ROOM_TYPE_LABELS.park} / ${ROOM_TYPE_LABELS.natureReserve}`
    );
  });

  it("labels conflicts with the qualifying types", () => {
    const geometry = buildRoomOverlayGeometry(
      result([
        cavity(0, {
          cells: cells([[0, 0]]),
          size: 1,
          result: "conflict",
          matchedTypes: ["barracks", "messHall"],
        }),
      ])
    );
    expect(geometry[0].label).toBe(
      `${ROOM_TYPE_LABELS.barracks} / ${ROOM_TYPE_LABELS.messHall}`
    );
  });

  it("leaves miscellaneous cavities unlabeled with a faint fill", () => {
    const roomGeometry = buildRoomOverlayGeometry(
      result(
        [
          cavity(0, {
            cells: cells([[0, 0]]),
            size: 1,
            result: "room",
            matchedTypes: ["latrine"],
          }),
        ],
        [{ type: "latrine", cavityId: 0, cells: cells([[0, 0]]), size: 1 }]
      )
    );
    const miscGeometry = buildRoomOverlayGeometry(
      result([cavity(0, { cells: cells([[0, 0]]), size: 1 })])
    );
    expect(miscGeometry[0].label).toBeNull();
    expect(miscGeometry[0].alpha).toBeLessThan(roomGeometry[0].alpha);
  });

  it("has a display label for every room type", () => {
    for (const label of Object.values(ROOM_TYPE_LABELS)) {
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
