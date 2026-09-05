// Vitest setup for the @angular/build:unit-test runner.
// The builder includes polyfills (zone.js) and initializes the Angular TestBed
// before this file runs, but the zone.js *testing* patch (needed by the
// waitForAsync/fakeAsync helpers) must be loaded explicitly here.
import "zone.js/testing";

// jsdom's Blob implements arrayBuffer() but not stream(). The BlueprintsV2
// share-string codec (lib/src/io/bni/bni-share-string.ts) pipes Blob.stream()
// through a CompressionStream, so without this any spec touching share strings
// dies on "stream is not a function" and has to mock the codec away. Node
// supplies ReadableStream and CompressionStream globally, so bridging the one
// missing method lets the real codec run here.
if (typeof Blob !== "undefined" && !Blob.prototype.stream) {
  Blob.prototype.stream = function (this: Blob) {
    return new ReadableStream({
      start: async (controller) => {
        controller.enqueue(new Uint8Array(await this.arrayBuffer()));
        controller.close();
      },
    });
  } as Blob["stream"];
}
