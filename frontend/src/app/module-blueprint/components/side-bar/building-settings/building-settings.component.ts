import { Component, Input, ViewChild } from "@angular/core";
import { Popover } from "primeng/popover";
import { BlueprintService } from "src/app/module-blueprint/services/blueprint-service";
import {
  BlueprintItem,
  BuildableElement,
  ElementState,
  creatableSettingsKeysFor,
  decodeTagSet,
  encodeTagSet,
  formatBuildingDataEntry,
  NONE_TAG,
  SettingTag,
  primarySettingsKey,
  redundantEchoKeysFor,
  resolveSettingDescriptors,
  SettingFieldDescriptor,
  SettingFieldType,
  SettingUnit,
  stripNoteMarkup,
  toDisplayValue,
  toStoredValue,
} from "../../../../../../../lib/index";

interface EditableSettingRow {
  key: string;
  field: string;
  // The resolved descriptor this row was built from — carried so committing an
  // edit inverts exactly the conversion that produced displayValue.
  descriptor: SettingFieldDescriptor;
  label: string;
  type: SettingFieldType;
  unit?: SettingUnit;
  // What to render after the input. Empty string means no suffix at all (a
  // bare count), which is why this is not optional-with-fallback.
  unitSuffix: string;
  step: number;
  // What the template actually binds to [attr.step]. A native number input
  // validates step against min (value - min must be a step multiple), so a
  // fractional displayMin (Thermo Sensor's -273.15 °C) combined with an
  // integer step marks a perfectly normal value like 20 as :invalid — the
  // spinner arrows land on 20.85, 21.85, ... instead of whole degrees.
  // "any" disables that check without changing the increment shown by the
  // spinner buttons in browsers that still honour step for those.
  stepAttr: number | "any";
  // Set on a boolean that is a two-way choice (a threshold sensor's
  // above/below direction), which renders as a pair of options rather than a
  // checkbox. Absent means an ordinary on/off checkbox.
  booleanLabels?: { whenTrue: string; whenFalse: string };
  // type: 'element' only. The picker's phase filter (from the descriptor) and
  // the resolved element for the current value (undefined = none / unknown id).
  elementForceTag?: string;
  element?: BuildableElement;
  // type: 'tagSet' only. The decoded tag list, each paired with the element it
  // resolves to. Most storage filters carry tags that are not elements at all
  // (critter and seed tags), so `element` is routinely undefined and the raw
  // name is what gets rendered.
  tags?: ResolvedTag[];
  displayValue: any;
  displayMin?: number;
  displayMax?: number;
  cycleHint: string | null;
}

interface ResolvedTag {
  name: string;
  element?: BuildableElement;
}

interface CreatableSetting {
  key: string;
  label: string;
}

// The suffix implied by a descriptor that predates per-building units.
function legacySuffix(unit: SettingUnit | undefined): string {
  if (unit == "s") return "s";
  if (unit == "cycleFraction" || unit == "%") return "%";
  return "";
}

function suffixOf(descriptor: SettingFieldDescriptor): string {
  return descriptor.unitSuffix ?? legacySuffix(descriptor.unit);
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// Whether (value - min) is a whole multiple of step, within floating-point
// tolerance — the condition the browser's own step-mismatch validation uses.
function isStepAligned(min: number, step: number): boolean {
  if (step <= 0) return false;
  const remainder = Math.abs(min) % step;
  return remainder < 1e-9 || Math.abs(remainder - step) < 1e-9;
}

function stepAttrFor(
  step: number,
  displayMin: number | undefined,
): number | "any" {
  return displayMin != null && !isStepAligned(displayMin, step) ? "any" : step;
}

const CYCLE_SECONDS = 600;

// Editable display of a building's BlueprintsV2 buildingData (timer
// durations, switch state, logic gate delays, ...) —
// spec/building-settings-plan.md phase 3. Curated keys render as editable
// rows; every other stored Key is preserved but shown only as a count, never
// dumped as raw JSON. Edits commit on blur/Enter/change, one undo step per
// completed edit, matching the world-notes editor pattern.
@Component({
  selector: "app-building-settings",
  templateUrl: "./building-settings.component.html",
  styleUrls: ["./building-settings.component.css"],
  standalone: false,
})
export class BuildingSettingsComponent {
  @Input() blueprintItem!: BlueprintItem;

  // One shared element picker popover — a building carries `Filterable` at most
  // once, so there is never more than one element row on screen. The tag-set
  // picker shares it: `TreeFilterable` is likewise carried at most once, and
  // the two never appear on the same building.
  @ViewChild("elementPanel", { static: false }) elementPanel?: Popover;
  elementPickerRow?: EditableSettingRow;

  constructor(private blueprintService: BlueprintService) {}

  get hasSettings(): boolean {
    return (
      this.rows.length > 0 ||
      this.otherKeys.length > 0 ||
      this.creatableSettings.length > 0 ||
      this.primaryUnsetLabel != null
    );
  }

  // Some sensors keep their settings under one canonical Key (threshold sensors
  // -> IThresholdSwitch; the Critter Sensor -> its own Key). When that Key is
  // absent the blueprint says nothing and the mod leaves the built sensor on
  // the game's own default — a state distinct from "pinned to a value", so it
  // is shown as an explicit row rather than hidden behind a button.
  private get primaryKey(): { key: string; label: string } | null {
    return primarySettingsKey(this.blueprintItem.id);
  }

  private get hasPrimary(): boolean {
    const pk = this.primaryKey;
    return (
      pk != null &&
      (this.blueprintItem.buildingData ?? []).some(
        (entry) => entry.Key == pk.key,
      )
    );
  }

  // The row label for a sensor whose canonical settings Key is not stored; null
  // for anything without such a Key, or that already has one.
  get primaryUnsetLabel(): string | null {
    const pk = this.primaryKey;
    return pk != null && !this.hasPrimary ? pk.label : null;
  }

  // The quantity the canonical settings Key pins, whether or not it is
  // currently stored. `primaryUnsetLabel` answers the same question only for
  // the absent case; the Clear button needs it for the present one.
  get primaryLabel(): string | null {
    return this.primaryKey?.label ?? null;
  }

  get canClearPrimary(): boolean {
    return this.primaryKey != null && this.hasPrimary;
  }

  setPrimary() {
    const pk = this.primaryKey;
    if (pk == null) return;
    this.blueprintItem.addBuildingSetting(pk.key);
    this.commit();
  }

  clearPrimary() {
    const pk = this.primaryKey;
    if (pk == null) return;
    let removed = this.blueprintItem.removeBuildingSetting(pk.key);
    // A copied Critter Sensor also carries a redundant IThresholdSwitch echo of
    // the threshold — drop that too, or the value stays pinned through the echo.
    // Which Keys those are is the catalogue's to know: inferring it here (any
    // primary Key that isn't IThresholdSwitch must have an IThresholdSwitch
    // echo) would discard a genuine, independent entry on the first prefab that
    // carries both.
    for (const echoKey of redundantEchoKeysFor(this.blueprintItem.id, pk.key))
      removed = this.blueprintItem.removeBuildingSetting(echoKey) || removed;
    if (removed) this.commit();
  }

  get rows(): EditableSettingRow[] {
    const rows: EditableSettingRow[] = [];
    for (const entry of this.blueprintItem.buildingData ?? []) {
      const descriptors = resolveSettingDescriptors(
        this.blueprintItem.id,
        entry.Key,
      );
      if (descriptors.length == 0) continue;

      const value = entry.Value;
      if (value == null || typeof value !== "object") continue;

      for (const descriptor of descriptors) {
        if (descriptor.hidden) continue;
        // Mirrors formatBuildingDataEntry: a missing field means this entry
        // is incomplete/malformed (or from a newer mod version) — skip it
        // rather than rendering an editable row backed by nothing, which
        // would crash setBuildingSetting the moment the user touched it.
        if (!(descriptor.field in value)) continue;
        const decimals =
          descriptor.decimals ?? (descriptor.type == "int" ? 0 : 2);
        const raw = value[descriptor.field];
        const step = descriptor.step ?? (descriptor.type == "int" ? 1 : 0.1);
        // Bounds are stored-unit in the catalogue, so they go through the
        // same conversion as the value they constrain.
        const displayMin =
          descriptor.min != null
            ? toDisplayValue(descriptor, descriptor.min)
            : undefined;
        rows.push({
          key: entry.Key,
          field: descriptor.field,
          descriptor,
          label: descriptor.labelKey,
          type: descriptor.type,
          unit: descriptor.unit,
          unitSuffix: suffixOf(descriptor),
          step,
          stepAttr: stepAttrFor(step, displayMin),
          booleanLabels: descriptor.booleanLabels,
          elementForceTag: descriptor.elementForceTag,
          // NONE_TAG ('Void') is "nothing selected" — the game ships a real
          // element with that id, so it must not be resolved as one.
          element:
            descriptor.type == "element" &&
            typeof raw == "string" &&
            raw !== NONE_TAG
              ? BuildableElement.getElementById(raw)
              : undefined,
          tags:
            descriptor.type == "tagSet"
              ? decodeTagSet(raw).map((tag) => ({
                  name: tag.Name,
                  element: BuildableElement.getElementById(tag.Name),
                }))
              : undefined,
          displayValue:
            typeof raw == "number"
              ? roundTo(toDisplayValue(descriptor, raw), decimals)
              : descriptor.type == "bool" && descriptor.invert
                ? !raw
                : raw,
          displayMin,
          displayMax:
            descriptor.max != null
              ? toDisplayValue(descriptor, descriptor.max)
              : undefined,
          cycleHint:
            descriptor.unit == "s" &&
            typeof raw == "number" &&
            raw >= CYCLE_SECONDS
              ? `~${(raw / CYCLE_SECONDS).toFixed(2)} cycles`
              : null,
        });
      }
    }
    return rows;
  }

  get otherKeys(): string[] {
    return (this.blueprintItem.buildingData ?? [])
      .filter(
        (entry) =>
          formatBuildingDataEntry(entry, this.blueprintItem.id) == null,
      )
      .map((entry) => entry.Key);
  }

  get otherKeysTooltip(): string {
    return this.otherKeys.join(", ");
  }

  // Keys this specific building can create from scratch (hand-checked
  // catalogue defaults) that it does not already have.
  get creatableSettings(): CreatableSetting[] {
    const existing = new Set(
      (this.blueprintItem.buildingData ?? []).map((entry) => entry.Key),
    );
    return (
      creatableSettingsKeysFor(this.blueprintItem.id)
        .filter((key) => !existing.has(key))
        // The canonical settings Key has its own always-present row, which
        // carries both the unset state and the control that sets it — a second
        // button here would offer the same thing twice.
        .filter((key) => key != this.primaryKey?.key)
        .map((key) => ({ key, label: $localize`Add automation settings` }))
    );
  }

  trackByCreatable(_index: number, item: CreatableSetting): string {
    return item.key;
  }

  addSetting(key: string) {
    this.blueprintItem.addBuildingSetting(key);
    this.commit();
  }

  // `rows` is a getter that rebuilds a fresh array of fresh objects on every
  // change-detection cycle (which fires on every keystroke, since the
  // (keydown.enter) binding registers a real keydown listener zone.js wakes
  // up for). Without a stable trackBy, *ngFor's default identity diffing
  // treats every row as removed-and-re-added on each cycle and tears down
  // the <input> DOM nodes mid-edit, discarding whatever the user just typed.
  // Same reason as trackByRow: `rows` rebuilds its ResolvedTag objects on every
  // change-detection pass, so without this Angular tears down each chip and its
  // remove button even when the filter has not changed -- and a remove button
  // that had focus loses it mid-keyboard-navigation.
  trackByTag(_index: number, tag: ResolvedTag): string {
    return tag.name;
  }

  trackByRow(_index: number, row: EditableSettingRow): string {
    return `${row.key}:${row.field}`;
  }

  // `el` is the control the edit came from. It is reconciled to the value
  // actually committed, because a rejected or adjusted edit otherwise leaves
  // the DOM showing something the model does not hold — see the clamp note
  // below.
  onFieldInput(
    row: EditableSettingRow,
    rawInput: string | boolean,
    el?: HTMLInputElement,
  ) {
    let value: any = rawInput;
    if (row.type == "bool") {
      value = Boolean(rawInput);
      // Re-picking the option already in force is not an edit; without this a
      // click on the selected half of an above/below toggle would push an
      // undo step that changes nothing. Compared in DISPLAY space, which for
      // an inverted row is the negation of what gets stored.
      if (value === row.displayValue) return;
      if (row.descriptor.invert) value = !value;
    } else if (row.type == "int" || row.type == "float") {
      // An emptied field is not an edit to zero — and Number("") is 0, so it
      // has to be caught before the parse. Same for a stray paste that does
      // not parse: restore what the model holds rather than leaving the
      // control showing something that corresponds to nothing.
      const text = String(rawInput).trim();
      let num = Number(text);
      if (text === "" || Number.isNaN(num)) {
        this.reconcile(el, row.displayValue);
        return;
      }
      // Blurring an untouched input must not write — checked BEFORE clamping,
      // against the raw typed number. A value already stored outside the
      // sensor's soft range (e.g. an imported blueprint's Threshold above the
      // display max) must round-trip through an untouched blur unchanged; if
      // this check ran after clamping, the clamped number would never equal
      // the (out-of-range) displayValue, and blurring the field with no edit
      // would silently pull a stored value onto the boundary and detach
      // rawSource for nothing. Also handles the ordinary case: the displayed
      // value is rounded, so re-deriving a stored value from it would nudge a
      // Thermo Sensor stored at 293.153 K to 293.15.
      if (num === row.displayValue) {
        this.reconcile(el, num);
        return;
      }
      // Soft bounds: the range comes from the sensor prefab's own
      // RangeMin/RangeMax, which the game's setter does not enforce either, so
      // an out-of-range entry is pulled to the nearest bound rather than
      // rejected. Note this only ever applies to values the user types — a
      // value already stored outside the range is displayed and preserved
      // untouched (handled by the no-op-blur check above).
      if (row.displayMin != null && num < row.displayMin) num = row.displayMin;
      if (row.displayMax != null && num > row.displayMax) num = row.displayMax;
      // Show what was actually taken. Angular's [value] binding only rewrites
      // the DOM when the bound value changes, so clamping an entry down onto
      // the value already stored (typing 999999 into a sensor already at its
      // 20000 max) would otherwise leave 999999 sitting in the box.
      this.reconcile(el, num);
      // A real edit attempt (num !== displayValue above) can still clamp back
      // onto the value already stored — typing 999999 into a sensor already
      // at its 20000 max. That is not a change either, so it must not write
      // or detach rawSource; this is a second, independent no-op check from
      // the one above, since it depends on the clamped number rather than
      // what was typed.
      if (num === row.displayValue) return;
      value = toStoredValue(row.descriptor, num);
      if (row.type == "int") value = Math.round(value);
    } else if (row.type == "string") {
      value = String(rawInput);
      // The template's [attr.maxlength] stops interactive typing, but not a
      // paste or a value set programmatically, so enforce the catalogue
      // bound here too before it reaches storage/export.
      if (row.displayMax != null) value = value.slice(0, row.displayMax);
      this.reconcile(el, value);
      if (value === row.displayValue) return;
    }

    this.blueprintItem.setBuildingSetting(row.key, row.field, value);
    this.commit();
  }

  private reconcile(el: HTMLInputElement | undefined, value: unknown) {
    if (el != null) el.value = String(value);
  }

  // The current-element label for a `type: 'element'` row: the element's
  // display name (markup stripped), the raw id when it isn't in the database,
  // or "None" when nothing is selected.
  elementLabel(row: EditableSettingRow): string {
    const raw = row.displayValue;
    if (raw == null || raw === "" || raw === NONE_TAG) return $localize`None`;
    if (row.element != null) return stripNoteMarkup(row.element.name);
    return String(raw);
  }

  openElementPicker(row: EditableSettingRow, event: Event) {
    this.elementPickerRow = row;
    this.elementPanel?.toggle?.(event);
  }

  // Commit from the element picker. "None" (id) maps to the mod's Void
  // sentinel; Clear (removeBuildingSetting) is the way to unset the whole key.
  onElementPicked(element: BuildableElement) {
    this.elementPanel?.hide?.();
    const row = this.elementPickerRow;
    if (row == null) return;
    const value = element.id === "None" ? NONE_TAG : element.id;
    if (value === row.displayValue) return;
    this.blueprintItem.setBuildingSetting(row.key, row.field, value);
    this.commit();
  }

  // A tag that resolves to an element shows its game name; one that does not
  // (a critter or seed tag, which the site has no model for) shows the raw id
  // rather than being hidden, so nothing in the stored filter is invisible.
  tagLabel(tag: ResolvedTag): string {
    return tag.element != null ? stripNoteMarkup(tag.element.name) : tag.name;
  }

  // Adding is restricted to the element picker's vocabulary, so the editor can
  // never invent a tag it cannot name. Removal works on anything, including the
  // non-element tags a storage bin filter carries.
  onTagPicked(element: BuildableElement) {
    this.elementPanel?.hide?.();
    const row = this.elementPickerRow;
    if (row == null || row.tags == null) return;
    if (element.id === "None") return;
    if (row.tags.some((tag) => tag.name === element.id)) return;
    this.writeTags(row, [...row.tags.map((tag) => tag.name), element.id]);
  }

  removeTag(row: EditableSettingRow, name: string) {
    if (row.tags == null) return;
    const remaining = row.tags
      .map((tag) => tag.name)
      .filter((tagName) => tagName !== name);
    if (remaining.length === row.tags.length) return;
    this.writeTags(row, remaining);
  }

  private writeTags(row: EditableSettingRow, names: string[]) {
    this.blueprintItem.setBuildingSetting(
      row.key,
      row.field,
      encodeTagSet(
        names.map((Name) => ({ Name, IsValid: true }) as SettingTag),
      ),
    );
    this.commit();
  }

  // Solids only, confirmed by round trip: a Smart Storage Bin exported with
  // Water in its filter came back from the game with Water gone and Sandstone
  // intact. Conveyor rails carry solid chunks and storage bins take no bottled
  // liquids or gas canisters, so any other phase is an entry the game discards
  // without saying so. A one-state pool renders no segmented filter.
  readonly tagPickerStates: ElementState[] = [ElementState.Solid];

  private commit() {
    this.blueprintService.blueprint.emitBlueprintChanged();
  }
}
