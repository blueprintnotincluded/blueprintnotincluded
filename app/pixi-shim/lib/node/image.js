'use strict';

// Image is node-canvas's, installed by node/window.js. This used to call
// `require('jsdom-global')()` a second time purely to get at `Image.prototype`
// -- see the note in node/window.js for what that cost.
console.log('pixi-shim ❤️ image');

// PIXI's resource loaders attach listeners to images they create. Nothing in
// the server-side render path goes through them (textures are decoded with
// node-canvas's loadImage and handed to BaseImageResource directly), but a
// missing method here surfaces as a TypeError deep inside PIXI rather than
// anything readable, so they are stubbed.
//
// These were previously written as Object.defineProperty(proto, name, fn),
// which passes a function where a descriptor belongs: every field reads as
// undefined, so the property was defined with the value `undefined` and
// calling it threw. Writing them as plain no-ops is what was meant.
const proto = global.Image.prototype;

if (typeof proto.addEventListener !== 'function') {
  proto.addEventListener = function addEventListener() {};
}

if (typeof proto.removeEventListener !== 'function') {
  proto.removeEventListener = function removeEventListener() {};
}
