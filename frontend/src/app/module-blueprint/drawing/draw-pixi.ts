import { ElementRef } from "@angular/core";
import { ComponentCanvasComponent } from "../components/component-canvas/component-canvas.component";
import {
  BlueprintItem,
  CameraService,
  Vector2,
  PixiUtil,
  ZIndex,
} from "../../../../../lib/index";
import { ComponentMenuComponent } from "../components/component-menu/component-menu.component";

import {} from "pixi.js-legacy";
declare var PIXI: any;

export class DrawPixi implements PixiUtil {
  getUtilityGraphicsBack() {
    return this.utilityGraphicsBack;
  }
  getUtilityGraphicsFront() {
    return this.utilityGraphicsFront;
  }
  getNewContainer() {
    return new PIXI.Container();
  }
  getNewGraphics() {
    return new PIXI.Graphics();
  }
  getSpriteFrom(ressource: any) {
    return PIXI.Sprite.from(ressource);
  }
  getNewBaseTexture(url: string) {
    return PIXI.Texture.from(url);
  }
  getNewTexture(baseTex: any, rectangle: any) {
    return new PIXI.Texture(baseTex, rectangle);
  }
  getNewTextureWhole(baseTex: any) {
    return new PIXI.Texture(baseTex);
  }
  getNewRectangle(x1: number, y1: number, x2: number, y2: number) {
    return new PIXI.Rectangle(x1, y1, x2, y2);
  }
  getNewBaseRenderTexture(options: any) {
    return new PIXI.BaseRenderTexture(options);
  }
  getNewRenderTexture(brt: any) {
    return new PIXI.RenderTexture(brt);
  }
  getNewPixiApp(_options: any) {
    return this.pixiApp;
  }

  static instance: DrawPixi;

  pixiApp!: PIXI.Application;
  backGraphics!: PIXI.Graphics;
  frontGraphics!: PIXI.Graphics;
  utilityGraphicsBack!: PIXI.Graphics;
  utilityGraphicsFront!: PIXI.Graphics;
  blueprintContainer!: PIXI.Container;
  parent!: ComponentCanvasComponent;

  Init(canvas: ElementRef, parent: ComponentCanvasComponent) {
    DrawPixi.instance = this;

    this.parent = parent;

    let htmlCanvas: HTMLCanvasElement = canvas.nativeElement;
    let options: any = {};
    options.view = htmlCanvas;
    options.width = canvas.nativeElement.width;
    options.height = canvas.nativeElement.height;
    options.autoResize = true;
    //options.forceCanvas = true;

    PIXI.utils.skipHello();
    this.pixiApp = new PIXI.Application(options);
    this.backGraphics = new PIXI.Graphics();
    this.backGraphics.zIndex = -100;
    this.frontGraphics = new PIXI.Graphics();
    this.frontGraphics.zIndex = 100;
    this.utilityGraphicsBack = new PIXI.Graphics();
    this.utilityGraphicsBack.zIndex = ZIndex.GasConduits + 100 - 1;
    this.utilityGraphicsFront = new PIXI.Graphics();
    this.utilityGraphicsFront.zIndex = ZIndex.LiquidConduits + 100 + 1;
    this.blueprintContainer = new PIXI.Container();
    this.blueprintContainer.interactiveChildren = false;
    this.blueprintContainer.addChild(this.utilityGraphicsBack);
    this.blueprintContainer.addChild(this.utilityGraphicsFront);
    this.pixiApp.stage.addChild(this.backGraphics);
    this.pixiApp.stage.addChild(this.blueprintContainer);
    this.pixiApp.stage.addChild(this.frontGraphics);

    //this.pixiApp.stage.sortableChildren = true;
    this.pixiApp.ticker.add(() => {
      this.drawAll();
    });
  }

  InitAnimation() {
    this.pixiApp.ticker.add(() => {
      this.animateAll();
    });
  }

  drawAll() {
    ComponentMenuComponent.debugFps = this.pixiApp.ticker.FPS;

    //console.log('drawAll');
    if (this.pixiApp != null) {
      //if (this.pixiApp.renderer.width != this.parent.canvasRef.nativeElement.width ||
      //this.pixiApp.renderer.height != this.parent.canvasRef.nativeElement.height)
      this.pixiApp.renderer.resize(
        this.parent.canvasRef.nativeElement.width,
        this.parent.canvasRef.nativeElement.height
      );
      //console.log('resize');
      //return;
    }

    this.parent.drawAll();
  }

  public sortChildren() {
    //console.log('sortChildren')
    this.blueprintContainer.sortChildren();
  }

  animateAll() {
    this.parent.animateAll();
  }

  clearGraphics() {
    this.backGraphics.clear();
    this.frontGraphics.clear();
    this.utilityGraphicsBack.clear();
    this.utilityGraphicsFront.clear();
  }

  FillRect(color: number, x: number, y: number, w: number, h: number) {
    this.backGraphics.beginFill(color);
    this.backGraphics.drawRect(x, y, w, h);
    this.backGraphics.endFill();
  }

  // TODO abstract drawline
  drawBlueprintLine(
    _color: string,
    alpha: number,
    start: Vector2,
    end: Vector2,
    _lineWidth: number
  ) {
    this.backGraphics.lineStyle(1, 0xffffff, alpha);
    this.backGraphics.moveTo(start.x, start.y);
    this.backGraphics.lineTo(end.x, end.y);
  }
  drawTemplateItem(templateItem: BlueprintItem, camera: CameraService) {
    templateItem.drawPixi(camera, this);
  }

  public drawTileRectangle(
    camera: CameraService,
    topLeft: Vector2,
    bottomRight: Vector2,
    frontGraphics: boolean,
    borderWidth: number,
    fillColor: number,
    borderColor: number,
    fillAlpha: number,
    borderAlpha: number
  ) {
    let rectanglePosition = new Vector2(
      (topLeft.x + camera.cameraOffset.x) * camera.currentZoom,
      (-topLeft.y + camera.cameraOffset.y) * camera.currentZoom
    );
    let rectangleSize = new Vector2(
      (bottomRight.x - topLeft.x) * camera.currentZoom,
      (topLeft.y - bottomRight.y) * camera.currentZoom
    );

    let graphics = frontGraphics ? this.frontGraphics : this.backGraphics;

    graphics.beginFill(fillColor, fillAlpha);
    graphics.drawRect(
      rectanglePosition.x,
      rectanglePosition.y,
      rectangleSize.x,
      rectangleSize.y
    );
    graphics.endFill();

    if (borderWidth > 0) {
      graphics.lineStyle(borderWidth, borderColor, borderAlpha);
      graphics.moveTo(rectanglePosition.x, rectanglePosition.y);
      graphics.lineTo(
        rectanglePosition.x + rectangleSize.x,
        rectanglePosition.y
      );
      graphics.lineTo(
        rectanglePosition.x + rectangleSize.x,
        rectanglePosition.y + rectangleSize.y
      );
      graphics.lineTo(
        rectanglePosition.x,
        rectanglePosition.y + rectangleSize.y
      );
      graphics.lineTo(rectanglePosition.x, rectanglePosition.y);
    }
  }
}
