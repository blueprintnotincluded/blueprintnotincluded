export interface PixiUtil {
  getNewContainer(): any;
  getNewGraphics(): any;
  getSpriteFrom(ressource: any): any;
  getNewBaseTexture(url: string): any;
  getNewTexture(baseTex: any /*PIXI.BaseTexture*/, rectangle: any /*PIXI.Rectangle*/): any;
  getNewTextureWhole(baseTex: any /*PIXI.BaseTexture*/): any;
  getNewRectangle(x1: number, y1: number, x2: number, y2: number): any;
  getNewBaseRenderTexture(options: any): any;
  getNewRenderTexture(brt: any): any;
  getNewPixiApp(options: any): any;
  getUtilityGraphicsBack(): any;
  getUtilityGraphicsFront(): any;
}

let nextStableSortOrder = 0;

// PIXI's built-in Container.sortChildren() breaks zIndex ties using an index
// it re-stamps from each child's *current* array position on every call. That
// means a transient zIndex divergence (e.g. a building that only outranks a
// sibling while a specific overlay is active) permanently reorders the two
// once they tie again, instead of reverting - render order ends up depending
// on overlay navigation history rather than current state. Stamp each child
// once with a fixed key on first sight and tie-break on that instead.
export function stableSortChildren(container: any): void {
  for (const child of container.children) {
    if (child._stableSortOrder === undefined) child._stableSortOrder = nextStableSortOrder++;
  }
  container.children.sort(
    (a: any, b: any) => a.zIndex - b.zIndex || a._stableSortOrder - b._stableSortOrder
  );
}
