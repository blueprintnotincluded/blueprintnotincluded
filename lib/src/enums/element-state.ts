// Phase of matter for a BuildableElement, mirroring the low 2 bits of the game's
// Element.State. The export's own `state` field carries flag bits above these,
// which the converter masks off (see parseElementState in convert-export-2024.ts).
export enum ElementState {
  Vacuum,
  Gas,
  Liquid,
  Solid,
}
