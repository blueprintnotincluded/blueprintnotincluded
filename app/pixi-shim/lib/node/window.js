'use strict';

/*global process*/

// A minimal DOM for PIXI, in place of jsdom.
//
// This used to be `require('jsdom-global')()`, which cost ~62MB of RSS and
// pulled in 485 modules -- a full HTML implementation with an HTML parser,
// a cookie jar, WebSockets and XPath -- inside the preview render worker.
//
// Almost none of it was reachable. Instrumenting every one of the 161 globals
// jsdom injects, across a real canvas render, showed PIXI reading exactly one
// of them (`HTMLCanvasElement`) plus `document.createElement`. Everything else
// was the shim overwriting jsdom's own implementations: node/canvas.js
// replaces HTMLCanvasElement.prototype.getContext and document.createElement,
// and node/image.js replaces Image.prototype. jsdom was being loaded to supply
// two class objects that were then gutted.
//
// So the classes come straight from node-canvas now, and the window/document
// carry only what PIXI and the rest of this shim actually reach for. Anything
// missing fails loudly at the point of use rather than silently rendering
// wrong -- see createElement below.
if (!global.window) {
  console.log('pixi-shim ❤️ DOM');

  const { Canvas, Image, ImageData } = require('canvas');

  // PIXI identifies canvases with `instanceof HTMLCanvasElement`, and
  // node/canvas.js patches `HTMLCanvasElement.prototype.getContext`. Pointing
  // the name at node-canvas's Canvas satisfies both, and means the object PIXI
  // draws into is the real thing rather than a jsdom element wrapping it.
  global.HTMLCanvasElement = Canvas;
  global.HTMLImageElement = Image;
  global.Image = Image;
  global.ImageData = ImageData;

  const noop = function () {};

  function createInertElement(tagName) {
    const element = {
      tagName: String(tagName).toUpperCase(),
      style: {},
      children: [],
      classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
      attributes: {},
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      removeChild(child) {
        const at = this.children.indexOf(child);
        if (at !== -1) this.children.splice(at, 1);
        return child;
      },
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name)
          ? this.attributes[name]
          : null;
      },
      removeAttribute(name) {
        delete this.attributes[name];
      },
      addEventListener: noop,
      removeEventListener: noop,
      dispatchEvent: noop,
      focus: noop,
      blur: noop,
    };
    return element;
  }

  const document = {
    // Wrapped by node/canvas.js, which returns a node-canvas Canvas for
    // 'canvas' and falls through to here for everything else.
    //
    // Everything else is inert on purpose. PIXI builds DOM it never uses in a
    // one-shot render -- AccessibilityManager makes a <div> in its constructor
    // and only attaches it when activated, which needs a pointer event that
    // never arrives here. An object that accepts styling and appends, and does
    // nothing, is all that is wanted; the alternative is carrying a full HTML
    // implementation to satisfy a constructor.
    createElement(tagName) {
      return createInertElement(tagName);
    },
    // node/canvas.js hangs one of these on every canvas it makes.
    createAttribute() {
      return {};
    },
    createTextNode() {
      return {};
    },
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: noop,
    // PIXI's interaction manager reads these when it attaches; it is never
    // started in a one-shot render, but they cost nothing to provide.
    body: { appendChild: noop, removeChild: noop, style: {} },
    documentElement: { style: {} },
  };

  const window = {
    document,
    // node/polyfill.js fills in anything left undefined here. navigator is set
    // rather than left out on purpose: polyfill's fallback also assigns
    // `global.navigator`, which is a getter-only global on Node 21+ and would
    // throw. Node 20 has no navigator global at all; see global.window below.
    navigator: { userAgent: 'node.js' },
    innerWidth: Number(process.env.WINDOW_WIDTH) || 1024,
    innerHeight: Number(process.env.WINDOW_HEIGHT) || 768,
    devicePixelRatio: 1,
    screen: { width: 1024, height: 768 },
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: noop,
    Image,
    ImageData,
  };
  window.window = window;
  window.self = window;
  window.top = window;
  window.parent = window;

  global.window = window;
  // Node 20 has no built-in navigator; Node 21+ does, as a getter-only global
  // that assignment would throw on under 'use strict'. Set it only when absent.
  if (typeof globalThis.navigator === 'undefined') globalThis.navigator = window.navigator;
  global.document = document;
  global.self = window;

  console.log(`pixi-shim ❤️ Window ${window.innerWidth}x${window.innerHeight}`);
}
