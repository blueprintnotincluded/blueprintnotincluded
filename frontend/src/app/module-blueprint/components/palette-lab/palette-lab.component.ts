import { Component, OnInit } from "@angular/core";
import { environment } from "../../../../environments/environment";

export interface PaletteOption {
  id: string;
  label: string;
  note: string;
  /** the three colours the swatch shows: board, tag, mark */
  swatch: [string, string, string];
}

/**
 * TEMPORARY design tool: flick the discover skin between candidate palettes on
 * the real page with real data, because a hex list tells you nothing about what
 * a palette does to a wall of blueprint art.
 *
 * Dev builds only — it renders nothing when environment.production is true.
 * Delete this component and the [data-palette] blocks in bni-skin.css once a
 * palette is chosen and promoted to the default tokens.
 */
@Component({
  selector: "app-palette-lab",
  standalone: false,
  templateUrl: "./palette-lab.component.html",
  styleUrls: ["./palette-lab.component.css"],
})
export class PaletteLabComponent implements OnInit {
  static readonly STORAGE_KEY = "bpni-palette-lab";

  readonly enabled = !environment.production;
  open = true;
  current = "sample-board";

  readonly palettes: PaletteOption[] = [
    {
      id: "sample-board",
      label: "Sample Board",
      note: "What's on the branch now. Warm charcoal, bone tag, china red.",
      swatch: ["#201e1a", "#e6e0d2", "#cc4126"],
    },
    {
      id: "film",
      label: "Drafting Film",
      note: "True-neutral cool greys, pale film tag, safety orange.",
      swatch: ["#22262a", "#dfe4e8", "#ff6a13"],
    },
    {
      id: "cyanotype",
      label: "Cyanotype",
      note: "Deep Prussian ground, chalk tag, warm amber mark.",
      swatch: ["#101f2e", "#eef2f5", "#f0a92c"],
    },
    {
      id: "concrete",
      label: "Concrete",
      note: "Cool grey concrete, cast-letter white tag, signal green.",
      swatch: ["#2c2f33", "#f0f0ee", "#3f9b6d"],
    },
    {
      id: "steam",
      label: "Steam 2026",
      note: "Measured from the live Workshop. Cool near-black, #1a9fff.",
      swatch: ["#1b1d21", "#d6dde4", "#1a9fff"],
    },
  ];

  ngOnInit(): void {
    if (!this.enabled) return;
    const saved = this.read();
    if (saved) this.select(saved);
    else this.apply(this.current);
  }

  paletteById(id: string): PaletteOption {
    return this.palettes.find((p) => p.id === id) ?? this.palettes[0];
  }

  select(id: string): void {
    this.current = id;
    this.apply(id);
    try {
      localStorage.setItem(PaletteLabComponent.STORAGE_KEY, id);
    } catch {
      /* private mode — the switcher still works for this page view */
    }
  }

  private apply(id: string): void {
    document.documentElement.setAttribute("data-palette", id);
  }

  private read(): string | null {
    try {
      const v = localStorage.getItem(PaletteLabComponent.STORAGE_KEY);
      return this.palettes.some((p) => p.id === v) ? v : null;
    } catch {
      return null;
    }
  }
}
