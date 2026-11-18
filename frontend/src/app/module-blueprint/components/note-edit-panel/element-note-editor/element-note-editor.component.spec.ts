import { describe, it, expect, beforeEach } from "vitest";
import {
  BniWorldNote,
  BuildableElement,
  ElementState,
} from "../../../../../../../lib/index";
import { ElementNoteEditorComponent } from "./element-note-editor.component";

// Matches the mod screenshot the feature was specced from: Ice at
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

  it("reports hasElement for an unresolved tag, and only drops it when no element is named at all", () => {
    // hasElement gates the mass/temperature controls in the template: a modded
    // element we can't resolve still has stored values worth editing, while a
    // pending note with no id yet has nothing to show.
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

  it("keeps any non-negative mass on commit, past maxMass", () => {
    note.mass = 5000; // Ice maxMass is 1100: the full-cell mass, not a cap
    component.commitMass();
    expect(note.mass).to.equal(5000);

    note.mass = -10;
    component.commitMass();
    expect(note.mass).to.equal(0);

    note.mass = NaN;
    component.commitMass();
    expect(note.mass).to.equal(0);
  });

  it("lets a gas mass go past 1.8 kg, and the slider reach 20 kg", () => {
    note.id = 2; // Oxygen, maxMass 1.8
    note.mass = 1;
    expect(component.sliderMaxMass).to.equal(20);
    note.mass = 150; // a pumped-up sealed room
    component.commitMass();
    expect(note.mass).to.equal(150);
    expect(component.sliderMaxMass).to.equal(150);
  });

  it("sizes a solid's slider to maxMass, stretching to fit a heavier note", () => {
    note.mass = 1000;
    expect(component.sliderMaxMass).to.equal(1100);
    note.mass = 5000;
    expect(component.sliderMaxMass).to.equal(5000);
  });

  it("holds a stretched slider max steady through a drag, releasing it on commit", () => {
    note.id = 2; // Oxygen
    note.mass = 150;
    component.freezeSliderMax();
    note.mass = 75; // mid-drag
    expect(component.sliderMaxMass).to.equal(150);
    component.commitMass();
    expect(component.sliderMaxMass).to.equal(75);
  });

  it("ignores a frozen slider max left over from another note", () => {
    note.id = 2;
    note.mass = 150;
    component.freezeSliderMax();
    component.note = { x: 0, y: 0, type: 1, id: 2, mass: 1, temp: 300 };
    expect(component.sliderMaxMass).to.equal(20);
  });

  it("clamps temperature to the transition band widened by the 3 K overshoot", () => {
    note.temp = 1000;
    component.commitTemp();
    expect(note.temp).to.equal(275.5); // Ice highTemp 272.5 + 3

    note.temp = 274; // superheated ice the game still holds as solid
    component.commitTemp();
    expect(note.temp).to.equal(274);

    note.temp = -50;
    component.commitTemp();
    expect(note.temp).to.equal(0);
  });

  it("caps temperature at the sim's 10000 K for an element that never transitions", () => {
    note.id = 2; // Oxygen, highTemp 10000
    note.temp = 20000;
    component.commitTemp();
    expect(note.temp).to.equal(10000);
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

  it("falls back to the sim's absolute temperature limits when highTemp is 0 (stale database)", () => {
    note.id = 3;
    expect(component.hasTempRange).to.equal(false);
    note.temp = 5000;
    component.commitTemp();
    expect(note.temp).to.equal(5000);
    note.temp = 99999;
    component.commitTemp();
    expect(note.temp).to.equal(10000);
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
