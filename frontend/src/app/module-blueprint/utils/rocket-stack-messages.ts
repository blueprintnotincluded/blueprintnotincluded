import {
  OniItem,
  RocketStackPartRef,
  RocketStackWarning,
  stripNoteMarkup,
} from "../../../../../lib/index";

// How many problems one notice spells out before summarising the rest. A
// badly-drawn rocket can trip a dozen checks at once, and a toast is not a list.
const MAX_LINES = 3;

function nameOf(part: RocketStackPartRef): string {
  try {
    return stripNoteMarkup(OniItem.getOniItem(part.prefabId).name);
  } catch {
    return part.prefabId;
  }
}

function cells(count: number): string {
  return count == 1
    ? $localize`:rocketStack.cell:1 cell`
    : $localize`:rocketStack.cells:${count}:count: cells`;
}

// "2 cells left and 1 cell down": where the module has to move to land on the
// hardpoint. Offsets are y-up, like every blueprint coordinate.
function moveBy(offset: { x: number; y: number }): string {
  const parts: string[] = [];
  if (offset.x != 0)
    parts.push(
      offset.x < 0
        ? $localize`:rocketStack.left:${cells(-offset.x)}:distance: left`
        : $localize`:rocketStack.right:${cells(offset.x)}:distance: right`,
    );
  if (offset.y != 0)
    parts.push(
      offset.y < 0
        ? $localize`:rocketStack.down:${cells(-offset.y)}:distance: down`
        : $localize`:rocketStack.up:${cells(offset.y)}:distance: up`,
    );
  return parts.join($localize`:rocketStack.and: and `);
}

// One sentence per warning, in the words of the game's own build conditions.
export function describeRocketStackWarning(
  warning: RocketStackWarning,
): string {
  switch (warning.kind) {
    case "misaligned":
      return $localize`:rocketStack.misaligned:${nameOf(warning.module)}:module: is not on the hardpoint of the ${nameOf(warning.hardpointOwner)}:below: beneath it: move it ${moveBy(warning.offset)}:move:.`;
    case "onTopOnly":
      return $localize`:rocketStack.onTopOnly:${nameOf(warning.module)}:module: is stacked on a ${nameOf(warning.below)}:below:, which has to be the top of its rocket.`;
    case "engineNotOnBottom":
      return $localize`:rocketStack.engineNotOnBottom:${nameOf(warning.module)}:module: has to be the bottom module of its rocket.`;
    case "multipleEngines":
      return $localize`:rocketStack.multipleEngines:A rocket has ${warning.modules.length}:count: engines (${warning.modules.map(nameOf).join(", ")}:modules:); it can have one.`;
    case "multipleCommandModules":
      return $localize`:rocketStack.multipleCommandModules:A rocket has ${warning.modules.length}:count: command modules (${warning.modules.map(nameOf).join(", ")}:modules:); it can have one.`;
    case "multipleRoboPilots":
      return $localize`:rocketStack.multipleRoboPilots:A rocket has ${warning.modules.length}:count: robo-pilot modules; it can have one.`;
    case "tooTall":
      return $localize`:rocketStack.tooTall:A rocket is ${warning.height}:height: cells tall; its ${nameOf(warning.engine)}:engine: lifts ${warning.maxHeight}:maxHeight: at most.`;
  }
}

// The body of the editor's rocket notice: the first few warnings in full, then
// a count of the rest.
export function describeRocketStackWarnings(
  warnings: RocketStackWarning[],
): string {
  const lines = warnings.slice(0, MAX_LINES).map(describeRocketStackWarning);
  const rest = warnings.length - lines.length;
  if (rest > 0)
    lines.push($localize`:rocketStack.more:And ${rest}:count: more.`);
  return lines.join(" ");
}
