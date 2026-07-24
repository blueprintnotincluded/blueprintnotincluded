// The catalogue of every rebindable editor action.
//
// An action is an *abstraction*: "pan the camera up", not "the W key". Nothing
// outside this file knows which key triggers what - components register a
// handler for an action id and the KeybindingService decides which chord(s)
// reach it. Adding a shortcut means adding an entry here plus one handler
// registration; rebinding it is then free.
//
// Defaults follow Oxygen Not Included's own key bindings wherever the game has
// an equivalent action (https://oxygennotincluded.fandom.com/wiki/Controls).
// Where it doesn't - the website has tools the game has no concept of, and the
// game has controls that mean nothing here - we pick a key the game leaves
// free for its unmapped actions, so a player's muscle memory never collides.

export const ShortcutAction = {
  // Camera
  cameraPanUp: "camera.panUp",
  cameraPanDown: "camera.panDown",
  cameraPanLeft: "camera.panLeft",
  cameraPanRight: "camera.panRight",
  cameraZoomIn: "camera.zoomIn",
  cameraZoomOut: "camera.zoomOut",
  cameraHome: "camera.home",

  // Tools
  toolSelect: "tool.select",
  toolBuild: "tool.build",
  toolPlanning: "tool.planning",
  toolScissors: "tool.scissors",

  // Build tool
  buildRotate: "build.rotate",

  // Edit
  editUndo: "edit.undo",
  editRedo: "edit.redo",
  editDelete: "edit.delete",

  // Overlays
  overlayBuildings: "overlay.buildings",
  overlayPower: "overlay.power",
  overlayPlumbing: "overlay.plumbing",
  overlayVentilation: "overlay.ventilation",
  overlayAutomation: "overlay.automation",
  overlayShipment: "overlay.shipment",
  overlayRooms: "overlay.rooms",

  // Blueprint
  blueprintNew: "blueprint.new",
  blueprintSave: "blueprint.save",
  blueprintBrowse: "blueprint.browse",
  blueprintExportImages: "blueprint.exportImages",

  // Interface
  interfaceCancel: "interface.cancel",
  interfaceKeyboardShortcuts: "interface.keyboardShortcuts",
} as const;

export type ShortcutActionId =
  (typeof ShortcutAction)[keyof typeof ShortcutAction];

export type ShortcutCategoryId =
  "camera" | "tools" | "build" | "edit" | "overlay" | "blueprint" | "interface";

export interface ShortcutActionDefinition {
  id: ShortcutActionId;
  category: ShortcutCategoryId;
  label: string;
  // Serialized chords (see key-chord.ts). An empty array is a valid, unbound
  // action: it shows up in the settings dialog waiting for a key.
  defaults: string[];
  // Auto-repeat is what makes held-down panning feel right; for one-shot
  // actions (undo, tool switching) a repeated keydown should be ignored.
  allowAutoRepeat?: boolean;
}

export interface ShortcutCategoryDefinition {
  id: ShortcutCategoryId;
  label: string;
}

export const SHORTCUT_CATEGORIES: ShortcutCategoryDefinition[] = [
  { id: "camera", label: $localize`:keyboard shortcut category:Camera` },
  { id: "tools", label: $localize`:keyboard shortcut category:Tools` },
  { id: "build", label: $localize`:keyboard shortcut category:Build tool` },
  { id: "edit", label: $localize`:keyboard shortcut category:Edit` },
  { id: "overlay", label: $localize`:keyboard shortcut category:Overlays` },
  { id: "blueprint", label: $localize`:keyboard shortcut category:Blueprint` },
  { id: "interface", label: $localize`:keyboard shortcut category:Interface` },
];

export const SHORTCUT_ACTIONS: ShortcutActionDefinition[] = [
  {
    id: ShortcutAction.cameraPanUp,
    category: "camera",
    label: $localize`:keyboard shortcut:Pan up`,
    defaults: ["KeyW", "ArrowUp"],
    allowAutoRepeat: true,
  },
  {
    id: ShortcutAction.cameraPanDown,
    category: "camera",
    label: $localize`:keyboard shortcut:Pan down`,
    defaults: ["KeyS", "ArrowDown"],
    allowAutoRepeat: true,
  },
  {
    id: ShortcutAction.cameraPanLeft,
    category: "camera",
    label: $localize`:keyboard shortcut:Pan left`,
    defaults: ["KeyA", "ArrowLeft"],
    allowAutoRepeat: true,
  },
  {
    id: ShortcutAction.cameraPanRight,
    category: "camera",
    label: $localize`:keyboard shortcut:Pan right`,
    defaults: ["KeyD", "ArrowRight"],
    allowAutoRepeat: true,
  },
  {
    id: ShortcutAction.cameraZoomIn,
    category: "camera",
    label: $localize`:keyboard shortcut:Zoom in`,
    defaults: ["Equal", "NumpadAdd"],
    allowAutoRepeat: true,
  },
  {
    id: ShortcutAction.cameraZoomOut,
    category: "camera",
    label: $localize`:keyboard shortcut:Zoom out`,
    defaults: ["Minus", "NumpadSubtract"],
    allowAutoRepeat: true,
  },
  {
    // Game: "Camera Home". Here it re-frames the whole blueprint.
    id: ShortcutAction.cameraHome,
    category: "camera",
    label: $localize`:keyboard shortcut:Center on blueprint`,
    defaults: ["KeyH"],
  },

  {
    // No game equivalent - V is free (the game's V opens Vitals).
    id: ShortcutAction.toolSelect,
    category: "tools",
    label: $localize`:keyboard shortcut:Select tool`,
    defaults: ["KeyV"],
  },
  {
    // Game: "Copy Building" (B). With something selected this also copies it
    // into the build tool, which is what the game's B does.
    id: ShortcutAction.toolBuild,
    category: "tools",
    label: $localize`:keyboard shortcut:Build tool (copy selected building)`,
    defaults: ["KeyB"],
  },
  {
    id: ShortcutAction.toolPlanning,
    category: "tools",
    label: $localize`:keyboard shortcut:Planning notes tool`,
    defaults: ["KeyN"],
  },
  {
    id: ShortcutAction.toolScissors,
    category: "tools",
    label: $localize`:keyboard shortcut:Scissors tool`,
    defaults: ["KeyX"],
  },

  {
    // Game: "Rotate Building".
    id: ShortcutAction.buildRotate,
    category: "build",
    label: $localize`:keyboard shortcut:Rotate building`,
    defaults: ["KeyO"],
  },

  {
    id: ShortcutAction.editUndo,
    category: "edit",
    label: $localize`:keyboard shortcut:Undo`,
    defaults: ["Ctrl+KeyZ", "Meta+KeyZ"],
    allowAutoRepeat: true,
  },
  {
    id: ShortcutAction.editRedo,
    category: "edit",
    label: $localize`:keyboard shortcut:Redo`,
    defaults: ["Ctrl+KeyY", "Ctrl+Shift+KeyZ", "Shift+Meta+KeyZ"],
    allowAutoRepeat: true,
  },
  {
    id: ShortcutAction.editDelete,
    category: "edit",
    label: $localize`:keyboard shortcut:Delete selection`,
    defaults: ["Delete"],
  },

  // The game puts overlays on F1..F11; we keep the F-key each shared overlay
  // uses there. Buildings takes F1 (the game's F1 overlay, Oxygen, has no
  // counterpart here) and Shipment takes F8.
  {
    id: ShortcutAction.overlayBuildings,
    category: "overlay",
    label: $localize`:keyboard shortcut:Buildings overlay`,
    defaults: ["F1"],
  },
  {
    id: ShortcutAction.overlayPower,
    category: "overlay",
    label: $localize`:keyboard shortcut:Power overlay`,
    defaults: ["F2"],
  },
  {
    id: ShortcutAction.overlayPlumbing,
    category: "overlay",
    label: $localize`:keyboard shortcut:Plumbing overlay`,
    defaults: ["F4"],
  },
  {
    id: ShortcutAction.overlayVentilation,
    category: "overlay",
    label: $localize`:keyboard shortcut:Ventilation overlay`,
    defaults: ["F5"],
  },
  {
    id: ShortcutAction.overlayAutomation,
    category: "overlay",
    label: $localize`:keyboard shortcut:Automation overlay`,
    defaults: ["F6"],
  },
  {
    id: ShortcutAction.overlayRooms,
    category: "overlay",
    label: $localize`:keyboard shortcut:Rooms overlay`,
    defaults: ["F7"],
  },
  {
    id: ShortcutAction.overlayShipment,
    category: "overlay",
    label: $localize`:keyboard shortcut:Shipment overlay`,
    defaults: ["F8"],
  },

  {
    // Ctrl+N is reserved by the browser and can't be cancelled, so the "new"
    // shortcut takes Alt as well.
    id: ShortcutAction.blueprintNew,
    category: "blueprint",
    label: $localize`:keyboard shortcut:New blueprint`,
    defaults: ["Ctrl+Alt+KeyN", "Alt+Meta+KeyN"],
  },
  {
    id: ShortcutAction.blueprintSave,
    category: "blueprint",
    label: $localize`:keyboard shortcut:Save blueprint`,
    defaults: ["Ctrl+KeyS", "Meta+KeyS"],
  },
  {
    id: ShortcutAction.blueprintBrowse,
    category: "blueprint",
    label: $localize`:keyboard shortcut:Browse blueprints`,
    defaults: ["Ctrl+KeyO", "Meta+KeyO"],
  },
  {
    id: ShortcutAction.blueprintExportImages,
    category: "blueprint",
    label: $localize`:keyboard shortcut:Export images`,
    defaults: ["Ctrl+Shift+KeyE", "Shift+Meta+KeyE"],
  },

  {
    id: ShortcutAction.interfaceCancel,
    category: "interface",
    label: $localize`:keyboard shortcut:Cancel / deselect`,
    defaults: ["Escape"],
  },
  {
    id: ShortcutAction.interfaceKeyboardShortcuts,
    category: "interface",
    label: $localize`:keyboard shortcut:Keyboard shortcuts`,
    defaults: ["Shift+Slash"],
  },
];

const ACTIONS_BY_ID = new Map<ShortcutActionId, ShortcutActionDefinition>(
  SHORTCUT_ACTIONS.map((action) => [action.id, action]),
);

export function getShortcutAction(
  id: ShortcutActionId,
): ShortcutActionDefinition | undefined {
  return ACTIONS_BY_ID.get(id);
}

export function isShortcutActionId(id: string): id is ShortcutActionId {
  return ACTIONS_BY_ID.has(id as ShortcutActionId);
}

export function getShortcutActionsByCategory(
  category: ShortcutCategoryId,
): ShortcutActionDefinition[] {
  return SHORTCUT_ACTIONS.filter((action) => action.category == category);
}
