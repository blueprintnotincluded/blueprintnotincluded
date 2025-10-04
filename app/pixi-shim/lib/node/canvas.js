'use strict';

const { Canvas, CanvasRenderingContext2D } = require('canvas');

console.log('pixi-shim ❤️ Canvas + WebGL');

window.Canvas = Canvas;
window.CanvasRenderingContext2D = CanvasRenderingContext2D;

/* global process */

HTMLCanvasElement.prototype.getContext = function (type = '2d', contextOptions = {}) {
  if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') {
    console.log({
      getContext: {
        type,
        contextOptions,
      },
    });
  }

  const stringified = JSON.stringify(contextOptions);
  const ref = type === '2d' ? '_context2d' : 'gl';

  console.log('test this ref CanvasRenderingContext2D');
  if (!this[ref] || this._contextOptions !== stringified) {
    this._contextOptions = stringified;

    if (type === '2d') {
      console.log('test this ref CanvasRenderingContext2D');
      this[ref] = new CanvasRenderingContext2D(this, contextOptions);
    } else {
      console.log('WebGL not supported');
    }

    this[ref].canvas = this;
  }

  this.context = this[ref];

  return this.context;
};

document.createElement = (function (create) {
  // Closure
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
