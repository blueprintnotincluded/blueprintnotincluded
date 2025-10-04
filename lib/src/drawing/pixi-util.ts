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
