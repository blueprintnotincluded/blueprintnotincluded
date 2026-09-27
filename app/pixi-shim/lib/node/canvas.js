'use strict';

const { Canvas, CanvasRenderingContext2D } = require('canvas');

console.log('pixi-shim ❤️ Canvas + WebGL');

window.Canvas = Canvas;
window.CanvasRenderingContext2D = CanvasRenderingContext2D;

// HTMLCanvasElement *is* node-canvas's Canvas (see node/window.js), so this
// overrides its getContext to cache one context per option set, which is what
// PIXI expects of a DOM canvas.
HTMLCanvasElement.prototype.getContext = function (type = '2d', contextOptions = {}) {
  // No WebGL here: the renderer is constructed with forceCanvas, so a request
  // for one is a caller that has not been told. Returning null is what a
  // browser does for an unsupported context type, and what PIXI's own support
  // probe expects to see. Returned before touching any state, so a probe can
  // never cost this canvas its cached 2D context (and that context's drawing
  // state) by recording different options.
  if (type !== '2d') return null;

  const stringified = JSON.stringify(contextOptions);
  if (!this._context2d || this._contextOptions !== stringified) {
    this._contextOptions = stringified;
    this._context2d = new CanvasRenderingContext2D(this, contextOptions);
    this._context2d.canvas = this;
  }

  this.context = this._context2d;

  return this.context;
};

document.createElement = (function (create) {
  // Closure over the minimal DOM's createElement, which throws for anything
  // this does not handle — a tag we silently returned an empty object for
  // would surface as a blank render much later.
  return function (type) {
    let element;

    switch (type) {
      case 'canvas': {
        element = new Canvas(window.innerWidth, window.innerHeight);
        element.addEventListener = (action, callback) =>
          document.addEventListener(action, callback);
        element.getContext = HTMLCanvasElement.prototype.getContext.bind(element);
        break;
      }
      // If other type of createElement fallback to default
      default: {
        element = create.apply(this, arguments);
        break;
      }
    }

    // Monkey patch style prop
    element.style = document.createAttribute('style');

    return element;
  };
})(document.createElement);
