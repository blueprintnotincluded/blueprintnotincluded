---
name: Blueprint Not Included
description: A warm charcoal sample board where every blueprint is a mounted specimen with a bone tag.
colors:
  board: "#201e1a"
  board-deep: "#17150f"
  mount: "#2a2721"
  mount-hi: "#34302a"
  inset: "#1b1915"
  rule: "#3d3830"
  rule-strong: "#4e483e"
  tag: "#e6e0d2"
  tag-hi: "#f2ede1"
  tag-ink: "#1b1813"
  tag-ink-secondary: "#6b6355"
  ink: "#f2eee4"
  body: "#c6bfb0"
  muted: "#948c7c"
  faint: "#6e675a"
  mark: "#cc4126"
  mark-hi: "#e4653f"
  mark-dim: "#8e3520"
  mark-glow: "rgba(204, 65, 38, 0.35)"
  mark-tint: "rgba(204, 65, 38, 0.1)"
  brass: "#b8912e"
  brass-tint: "rgba(184, 145, 46, 0.14)"
  danger: "#a8452c"
  chip: "#3a352d"
  chip-hi: "#484237"
  thumb-ground: "#7e786c"
typography:
  display:
    fontFamily: "Big Shoulders Display, Arial Narrow, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.01em"
  headline:
    fontFamily: "Big Shoulders Display, Arial Narrow, sans-serif"
    fontSize: "21px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.045em"
  title:
    fontFamily: "Big Shoulders Display, Arial Narrow, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.005em"
  body:
    fontFamily: "IBM Plex Sans, Helvetica Neue, sans-serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  control:
    fontFamily: "IBM Plex Sans, Helvetica Neue, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.01em"
  chip:
    fontFamily: "IBM Plex Sans, Helvetica Neue, sans-serif"
    fontSize: "11.5px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.02em"
  label:
    fontFamily: "IBM Plex Sans, Helvetica Neue, sans-serif"
    fontSize: "10.5px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.1em"
rounded:
  none: "0"
spacing:
  2xs: "4px"
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "20px"
  xl: "22px"
  2xl: "32px"
components:
  specimen-mount:
    backgroundColor: "{colors.mount}"
    textColor: "{colors.body}"
    rounded: "{rounded.none}"
    padding: "10px"
  specimen-mount-hover:
    backgroundColor: "{colors.mount-hi}"
    textColor: "{colors.body}"
  specimen-tag:
    backgroundColor: "{colors.tag}"
    textColor: "{colors.tag-ink}"
    typography: "{typography.title}"
    rounded: "{rounded.none}"
    padding: "7px 9px 8px"
  button-primary:
    backgroundColor: "{colors.mark}"
    textColor: "#ffffff"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.mark-hi}"
    textColor: "#ffffff"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.body}"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
  button-secondary-hover:
    backgroundColor: "{colors.mount-hi}"
    textColor: "{colors.mark-hi}"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.chip}"
    rounded: "{rounded.none}"
    padding: "2px 8px"
  chip-draft:
    backgroundColor: "{colors.brass-tint}"
    textColor: "{colors.brass}"
    typography: "{typography.chip}"
    rounded: "{rounded.none}"
    padding: "2px 8px"
  input:
    backgroundColor: "{colors.inset}"
    textColor: "{colors.body}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
  facet:
    backgroundColor: "transparent"
    textColor: "{colors.body}"
    rounded: "{rounded.none}"
    padding: "3px 8px"
  facet-active:
    backgroundColor: "{colors.mount}"
    textColor: "{colors.ink}"
  tick-include:
    backgroundColor: "{colors.mark}"
    textColor: "#ffffff"
    rounded: "{rounded.none}"
    size: "18px"
  tick-exclude:
    backgroundColor: "{colors.brass-tint}"
    textColor: "{colors.brass}"
    rounded: "{rounded.none}"
    size: "18px"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.title}"
    rounded: "{rounded.none}"
    padding: "3px 2px 7px"
  tab-active:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
---

# Design System: Blueprint Not Included

## Overview

**Creative North Star: "The Sample Board"**

BNI is a catalogue of things people built, so it is presented the way an architect
presents materials: specimens mounted on a board, each with a small typed tag pasted
beneath it. The thumbnail is the object. Everything else — name, author, packs, rooms,
counts — is apparatus, and apparatus stays small, typographic, and out of the way.

The ground is warm charcoal, never blue-grey. That single decision does most of the work:
it separates the site from every asset store on the shelf, and it lets the game's own
art, which is warm and hand-painted, sit on the page without clashing. The only light
surface anywhere is the bone-stock tag under each specimen, which is what makes a wall of
blueprints scan — your eye reads the tags as a rhythm and the art as the content.

This world replaced a Steam-Workshop-derived skin. That skin's palette came from a
screenshot of the ONI Workshop, and a direct measurement of the live page (2026-08-02)
showed Steam had since rebuilt it on a new component library with gradient panels,
resting shadows, 2px radii and outlined buttons. Rather than chase a moving reference,
BNI now commits to a world of its own. The measured Steam values are preserved in the
appendix as reference, not as authority.

**Key Characteristics:**
- Warm charcoal board; no blue-grey anywhere in the chrome
- Specimens are *mounted* — margin inside the mount, hairline rule, never bled to the edge
- One light surface: the bone tag, and it stays small
- One interaction mark (china-pencil red); brass means withheld or flagged
- Zero radius everywhere; depth is board → mount → tag, not shadow
- The blueprint art supplies all the colour

## Colors

A warm charcoal ramp interrupted by one bone, one red mark, and one brass flag.

### Primary
- **China Red** (`mark`): the only interaction mark. Links, active tab underline, focus,
  primary button fill, the mount's hover edge, the include tick, star fill, the inset bar
  on an active facet.
- **China Red Bright** (`mark-hi`): the hover state of anything marked, and the colour any
  responding text takes.
- **China Red Deep** (`mark-dim`): red *borders* only — the hairline a secondary control
  takes on hover.

### Secondary
- **Brass** (`brass`) with its wash: **withheld or flagged**. Drafts (dashed edge, hatched
  mount) and excluded DLC packs. Brass never means "destructive" and red never means
  "set aside" — the two signals have strictly separate jobs.
- **Oxide** (`danger`): destructive actions only, always accompanied by the verb in words.

### Neutral
- **Board** (`board`): the page ground, lit by one faint off-centre wash.
- **Board Deep** (`board-deep`): the void behind the board and the nav bar.
- **Mount** (`mount`) / **Mount Raised** (`mount-hi`): the specimen mount and its hover step.
- **Inset** (`inset`): recessed fields.
- **Rule** (`rule`) / **Rule Strong** (`rule-strong`): hairlines.
- **Tag** (`tag`) / **Tag Bright** (`tag-hi`): bone label stock, and its hovered state.
- **Tag Ink** (`tag-ink`) / **Tag Ink Secondary**: type *on* the tag. Board ink never
  appears on the tag and tag ink never appears on the board.
- **Ink / Body / Muted / Faint**: the four-step text ramp on the board.

### Named Rules

**The One Mark Rule.** The chrome has one hue. China red marks what responds to you.
Brass marks what has been set aside. Nothing else is coloured, ever.

**The Tag Ink Rule.** The tag is a different material from the board. Type on bone takes
tag ink; type on charcoal takes board ink. Mixing them is what makes a pasted label look
like a filled rectangle.

**The Blueprint-Owns-Colour Rule.** The most colourful thing on any screen is the
blueprint art. If chrome colour competes with a thumbnail, the chrome is wrong.

## Typography

**Display Font:** Big Shoulders Display (with Arial Narrow fallback)
**Body Font:** IBM Plex Sans (with Helvetica Neue fallback)

**Character:** The condensed face is the lettering on a specimen tag — it carries page
titles, specimen names and tab labels, where its narrow forms let a long blueprint name
fit a tag without shrinking. IBM Plex Sans carries everything that must survive
translation into zh, ru and ko, which is why it stays: both faces are already self-hosted
with the cyrillic, greek and vietnamese subsets those builds need.

### Hierarchy
- **Display** (700, 40px, 1.0): page titles. Drops to 22px below 640px.
- **Headline** (800, 21px, `0.045em`): the nav wordmark.
- **Title** (700, 19px, 1.1): specimen names on the tag; also tab labels at 17px.
- **Body** (400, 14.5px, 1.5): reading text.
- **Control** (600, 13.5px): buttons.
- **Chip** (500, 11.5px, `0.02em`): pack, room and category marks.
- **Label** (700, 10.5px, `0.1em`, uppercase): facet-group labels, each with a hairline
  rule beneath. The only uppercase in the system.

### Named Rules

**The Condensed-Is-The-Tag Rule.** The display face means "this is a label on an object" —
page titles, specimen names, tab labels. It never sets body copy.

**The Tabular Count Rule.** Dates and any number in a repeating grid take
`font-variant-numeric: tabular-nums` so columns of counts don't shimmer.

## Layout

The board is the page. There is no inner panel and no card-of-cards: content sits directly
on the board in a 1440px container with 32px gutters, releasing to 20px below 1500px.

Discover is a 218px facet rail beside a fluid results column, 26px apart. Results are
`repeat(auto-fill, minmax(300px, 1fr))` with a 22px/20px gutter — wide enough for four
specimens across at full width, which is what makes the grid read as a tray rather than a
list. Below 900px the rail collapses behind a Filters disclosure; below 640px padding
drops to 20px/14px.

Inside a mount: 10px of board margin around the thumbnail, the tag directly beneath it,
then metadata at 8–9px intervals, with the social row separated by a hairline.

The site nav is sticky on its own z-index rung (`--bni-z-nav: 40`). All page-level
layering uses that ladder (`-1` backdrop, `4` raised, `40` nav); nothing may exceed ~1000,
where PrimeNG's overlays begin.

## Elevation & Depth

**No shadows anywhere.** Depth is three materials stacked: the board, the mount sitting on
it, and the tag pasted on the mount. Each is a step in the warm ramp, and hover moves the
mount one step lighter rather than lifting it.

The board carries one very faint off-centre radial wash (~5% warm light from the upper
left) — the difference between a surface under a lamp and a flat slab. It is deliberately
below the threshold where it reads as a gradient.

The only inset is on form fields (`inset 0 1px 2px rgba(0,0,0,0.35)`), so a field reads as
cut into the mount rather than sitting on it.

### Named Rules

**The No-Shadow Rule.** Nothing casts a shadow. If something needs to separate, it takes a
hairline or a surface step. A drop shadow in this world is a foreign object.

**The Step-Don't-Lift Rule.** Hover moves a surface one step lighter and draws the mark
around it. It never translates, scales, or grows a shadow.

## Shapes

Square, universally — every radius token including PrimeNG's whole scale is `0`. There is
no 2px exception; chips, ticks, skeleton bars and tags are all hard-cornered, because a
mounted board is made of cut edges.

Form language is 1px hairlines on `rule`, going to `rule-strong` on hover and `mark` on
focus. The thumbnail carries a hairline plus a `-2px` inset dark outline, which is what
makes it read as mounted under a mat rather than printed on the mount.

Dashed edges are reserved for "not finished": a draft mount takes a dashed brass border
plus 10px/13px diagonal hatching at −45°. Dashed is never decorative.

## Components

### The Mounted Specimen (signature)
The catalogue's atom and the whole world in one component. A charcoal mount with a
hairline; the thumbnail inset 10px on three sides with its own rule and inset outline; a
bone tag pasted directly beneath carrying the name in condensed display type and the star
rating right-aligned; then quiet board metadata — author and date, pack/room/category
chips, and a hairline-separated social row of comments, forks, views and downloads.

Hover steps the mount lighter, brightens the tag stock, and draws the china-red mark
around the whole mount. The name turns red with it. Drafts take the brass dashed edge and
hatch, and dim the thumbnail slightly.

### Buttons
- **Shape:** square, 1px border, 8px/16px padding, 8px icon gap.
- **Primary:** solid china red, white label. Hover brightens the fill; no gradient.
- **Secondary:** transparent with a `rule-strong` hairline. Hover fills to `mount-hi` with
  a red border and bright red label.
- **Danger:** oxide wash at 16%, oxide border at 55%. Always labelled with its verb.
- **Disabled:** `opacity: 0.45`, default cursor.

### Chips
Outline-only by default: transparent fill, `rule` hairline, muted label at 11.5px. Only
interactive chips fill (`chip` grey) on hover. Draft is the exception — brass wash, dashed
brass border. The label carries the meaning; there is no per-category hue.

### Facet Rail
Full-width baseline rows, label left, faint tabular count right, no border. Hover brightens
the label. Active fills to `mount` with an `inset 2px 0 0` mark down the left edge. Group
labels are 10.5px uppercase with a hairline rule under them.

Zero-count facets dim to 0.42 and go non-interactive but stay *visible*, so an empty pack
is still discoverable — never applied to the active row, so a dead-end filter can always be
cleared.

### DLC Row (signature)
One pack, two intents. Label and count on the left, then an include (`+`) and an exclude
(`−`) tick, each 18px and square. Include-on fills china red; exclude-on fills brass wash
with a brass border. An excluded row strikes its label in brass so the state does not rely
on colour alone. The label is deliberately *not* a button: with two ticks on the line, a
clickable label would have to silently mean one of them.

### Inputs
`inset` fill, 1px `rule` hairline, square, inner top shadow, italic placeholder in `faint`.
Hover takes `rule-strong`; focus takes `mark`.

### Tabs
Baseline-aligned condensed labels at 17px, 4px/20px gaps, transparent 2px bottom border
that becomes china red when active. The `appTabInk` directive upgrades a row to a single
sliding 2px bar (`0.25s cubic-bezier(0.4, 0, 0.2, 1)`), suppressed under reduced motion.

## Do's and Don'ts

### Do:
- **Do** put new catalogue UI under `.bni-skin` and restyle PrimeNG through its `--p-*`
  tokens rather than fighting component internals.
- **Do** mount images with board margin and a hairline. A bled-to-the-edge thumbnail is a
  tile, not a specimen.
- **Do** keep the tag small and its ink dark. It is a label, not a second panel.
- **Do** use china red for interaction and brass for withheld. Never swap them.
- **Do** pair every colour-carried state with a second signal (dash, strike, icon).
- **Do** honour `prefers-reduced-motion` on every animation.
- **Do** take a `--bni-z-*` token for cross-component layering.

### Don't:
- **Don't** add a drop shadow. Depth is board → mount → tag.
- **Don't** add corner radius. Every token is `0`.
- **Don't** introduce blue-grey, or any third chrome hue.
- **Don't** put board ink on the tag or tag ink on the board.
- **Don't** use gradients as surface fills. The board's ~5% light wash is the only one.
- **Don't** colour chips by category.
- **Don't** let chrome colour out-shout a blueprint thumbnail.
- **Don't** build anything that depends on re-rendering thumbnails; they are a fixed,
  server-generated whole-design fit until a migration says otherwise.

---

## Appendix: measured Steam reference (2026-08-02)

Retained because the previous system claimed descent from it, and because the live page is
still worth knowing. Sampled via computed styles from the ONI Workshop hub and browse
pages, both now built on Steam's hashed-class SteamUI React library.

| Property | Live Steam |
|---|---|
| Card/panel fill | `radial-gradient(62% 99% at 17% 35%, #3c4149, #1b1d21)` |
| Card shadow at rest | `1px 1px 10px rgba(0,0,0,0.58)` |
| Corner radius | `2px` on chips and buttons |
| Accent | `#1a9fff` |
| Page ground | `#262b34` |
| Body text | `#c6d4df` |
| Tag chip | `#3d4450`, 2px, `1px 12px`, 12px/400 white |
| Buttons | outlined: transparent fill, 1px accent border, accent label |
| Sort tabs | 20px/600, 3px accent underline |
| Type | Motiva Sans (proprietary) |
| Page backdrop | the game's `library_hero_2x.jpg`, `saturate(0.6) opacity(0.4)`, masked `linear-gradient(#000 78%, transparent 96%)` |
| Facet include/exclude | inline `+` / `−` per row |

The inline `+`/`−` facet pattern was adopted. The key-art backdrop was deliberately
declined: the project does not want to trade on another studio's art.

## Appendix: unmigrated surfaces

The editor (`/editor`, `/b/:id`) and the auth pages still run **stock PrimeNG Aura** with a
blue primitive ramp (`#007ad9` at 500) defined in `frontend/src/app/app.module.ts`, plus
legacy `ui-*` and `.box-card` rules in `styles.css` carrying 3px radii and Material-style
shadows. Their base font is Open Sans.

This is legacy, not a second system. The editor menubar already opts into the skin via
`styleClass="bni-skin"`, which is the migration path for the rest. New work on those
surfaces should converge on the Sample Board; the stock Aura look is not a reference.
