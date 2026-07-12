import { Injectable } from "@angular/core";
import {
  detectRooms,
  IObsBlueprintChange,
  RoomDetectionResult,
} from "../../../../../lib/index";
import { BlueprintService } from "./blueprint-service";

// Keeps a lazily-recomputed room detection result for the editor blueprint.
// Recomputes only while a consumer is active (Room overlay visible) — inactive
// changes just mark the result dirty. While active, changes are debounced so a
// 40-tile drag triggers one detection after the stroke settles.
@Injectable({ providedIn: "root" })
export class RoomDetectionService implements IObsBlueprintChange {
  static readonly debounceMs = 250;

  private result_: RoomDetectionResult | null = null;
  private dirty = true;
  private active_ = false;
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(private blueprintService: BlueprintService) {
    // The editor mutates one long-lived Blueprint instance (loadNewBlueprint
    // copies into it), so subscribing once covers loads and edits alike.
    this.blueprintService.blueprint.subscribeBlueprintChanged(this);
  }

  get active(): boolean {
    return this.active_;
  }
  // The canvas sets this every frame from "is the Room overlay on"; activation
  // recomputes immediately so the overlay never shows a stale result.
  set active(value: boolean) {
    if (value == this.active_) return;
    this.active_ = value;
    if (value) {
      if (this.dirty) this.recompute();
    } else this.cancelPending();
  }

  // Latest computed result; null until the first recompute (or after a failure).
  get result(): RoomDetectionResult | null {
    return this.result_;
  }

  // Fresh result right now, bypassing the debounce (save dialog).
  detectNow(): RoomDetectionResult | null {
    this.cancelPending();
    if (this.dirty) this.recompute();
    return this.result_;
  }

  // IObsBlueprintChange
  itemAdded() {}
  itemDestroyed() {}
  blueprintChanged() {
    this.dirty = true;
    if (!this.active_) return;
    this.cancelPending();
    this.debounceHandle = setTimeout(() => {
      this.debounceHandle = null;
      this.recompute();
    }, RoomDetectionService.debounceMs);
  }

  private cancelPending() {
    if (this.debounceHandle != null) {
      clearTimeout(this.debounceHandle);
      this.debounceHandle = null;
    }
  }

  private recompute() {
    try {
      this.result_ = detectRooms(this.blueprintService.blueprint);
    } catch (error) {
      // Detection must never break the editor; drop the result and move on.
      this.result_ = null;
    }
    this.dirty = false;
  }
}
