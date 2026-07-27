import { describe, it, expect, beforeEach } from "vitest";
import {
  BniWorldNote,
  BuildableElement,
  ElementState,
} from "../../../../../../../lib/index";
import { ElementNoteEditorComponent } from "./element-note-editor.component";

// Matches the mod screenshot cited in spec/element-notes.md: Ice at
// 1000 kg / -41 C, maxMass 1100, lowTemp/highTemp 0/272.5 K.
function iceLikeElement(): BuildableElement {
  const e = new BuildableElement();
  e.id = "Ice";
  e.name = "Ice";
  e.tag = 1;
  e.state = ElementState.Solid;
  e.uiColor = 0x66ccff;
  e.maxMass = 1100;
  e.defaultMass = 1000;
  e.defaultTemperature = 232.15;
  e.lowTemp = 0;
  e.highTemp = 272.5;
  return e;
}

function oxygenLikeElement(): BuildableElement {
  const e = new BuildableElement();
  e.id = "Oxygen";
  e.name = "Oxygen";
  e.tag = 2;
  e.state = ElementState.Gas;
  e.uiColor = 0x9be3ff;
  e.maxMass = 1.8;
  e.defaultMass = 1;
  e.defaultTemperature = 293.15;
  e.lowTemp = 0;
  e.highTemp = 10000;
  return e;
}

// A database predating the element-defaults export (PR #176): maxMass and
// highTemp default to 0 rather than NaN (BuildableElement.importFrom).
function staleElement(): BuildableElement {
  const e = new BuildableElement();
  e.id = "Stale";
  e.name = "Stale";
  e.tag = 3;
  e.state = ElementState.Solid;
  return e;
}

describe("ElementNoteEditorComponent", () => {
  let component: ElementNoteEditorComponent;
  let note: BniWorldNote;

  beforeEach(() => {
    BuildableElement.init();
    BuildableElement.elements = [
      iceLikeElement(),
      oxygenLikeElement(),
      staleElement(),
    ];
    component = new ElementNoteEditorComponent();
    note = { x: 0, y: 0, type: 1, id: 1, mass: 1000, temp: 232.15 };
    component.note = note;
  });

  it("resolves the selected element by tag and labels it", () => {
    expect(component.element?.id).to.equal("Ice");
    expect(component.elementName).to.equal("Ice");
    expect(component.elementStateLabel).to.equal("Solid");
    expect(component.markerName).to.equal("solid");
  });

  it("shows Unknown element and no marker when the tag is unresolved", () => {
    note.id = 999;
    expect(component.element).to.equal(undefined);
    expect(component.elementName).to.equal("Unknown element");
    expect(component.markerName).to.equal(null);
  });

  it("keeps the mass/temperature controls for an unresolved tag, and hides them only when no element is named at all", () => {
    // A modded element we can't resolve still has stored values worth editing;
    // a pending note with no id yet has nothing to show.
    note.id = 999;
    expect(component.hasElement).to.equal(true);
    note.id = undefined;
    expect(component.hasElement).to.equal(false);
  });

  it("converts Kelvin to Celsius for display and back on edit", () => {
    expect(component.tempCelsius).to.equal(-41);
    component.tempCelsius = -41;
    expect(note.temp).to.be.closeTo(232.15, 1e-9);
  });

  it("clamps mass to [0, maxMass] on commit", () => {
    note.mass = 5000;
    component.commitMass();
    expect(note.mass).to.equal(1100);

    note.mass = -10;
    component.commitMass();
    expect(note.mass).to.equal(0);
  });

  it("clamps temperature to [lowTemp, highTemp] (Kelvin) on commit", () => {
    note.temp = 1000;
    component.commitTemp();
    expect(note.temp).to.equal(272.5);

    note.temp = -50;
    component.commitTemp();
    expect(note.temp).to.equal(0);
  });

  it("derives a smaller mass step for a small-maxMass (gas) element than a large one (solid)", () => {
    note.id = 2; // Oxygen, maxMass 1.8
    expect(component.massStep).to.be.lessThan(0.01);
    note.id = 1; // Ice, maxMass 1100
    expect(component.massStep).to.be.at.least(1);
  });

  it("falls back to an unbounded mass input when maxMass is 0 (stale database)", () => {
    note.id = 3;
    expect(component.hasMassRange).to.equal(false);
    note.mass = 99999;
    component.commitMass();
    expect(note.mass).to.equal(99999);
    note.mass = -5;
    component.commitMass();
    expect(note.mass).to.equal(0);
  });

  it("falls back to an unclamped temperature when highTemp is 0 (stale database)", () => {
    note.id = 3;
    expect(component.hasTempRange).to.equal(false);
    note.temp = 99999;
    component.commitTemp();
    expect(note.temp).to.equal(99999);
  });

  it("re-seeds mass and temperature from the newly selected element, always (plan Q3)", () => {
    // Ice's values would be invalid for Oxygen (maxMass 1.8, lowTemp/highTemp 0/10000).
    note.mass = 1840;
    note.temp = 232.15;
    component.onSelectElement(oxygenLikeElement());
    expect(note.id).to.equal(2);
    expect(note.mass).to.equal(1);
    expect(note.temp).to.equal(293.15);
  });

  it("emits noteChange on element select, mass commit and temp commit", () => {
    let emits = 0;
    component.noteChange.subscribe(() => emits++);
    component.onSelectElement(oxygenLikeElement());
    component.commitMass();
    component.commitTemp();
    expect(emits).to.equal(3);
  });
});
