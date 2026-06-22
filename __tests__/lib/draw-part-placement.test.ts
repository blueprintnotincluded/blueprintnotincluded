import { expect } from 'chai';
import { DrawPart } from '../../lib';

// DrawPart.flatIconPlacement maps a ui_image placement rect (cells, footprint-relative,
// origin bottom-left, +y up) to sprite geometry in container space (100 px = 1 cell).
describe('DrawPart.flatIconPlacement', () => {
  it('default rect {0,0,w,h} reproduces legacy footprint placement', () => {
    // Legacy footprint render: anchor (0.5,1.0) at (centerX,50), size w*100 x h*100.
    // Its top-left corner is (centerX - w*50, 50 - h*100). flatIconPlacement is top-left
    // anchored, so x/y must equal that corner and width/height must match.
    for (const [w, h, centerX] of [
      [1, 1, 0],
      [2, 1, 50],
      [3, 2, 0],
      [4, 4, 50],
    ]) {
      const p = DrawPart.flatIconPlacement(w, { x: 0, y: 0, w, h });
      expect(p.anchorX, `w=${w}`).to.equal(0);
      expect(p.anchorY, `w=${w}`).to.equal(0);
      expect(p.x, `w=${w} x`).to.equal(centerX - w * 50);
      expect(p.y, `w=${w} y`).to.equal(50 - h * 100);
      expect(p.width, `w=${w} width`).to.equal(w * 100);
      expect(p.height, `w=${w} height`).to.equal(h * 100);
    }
  });

  it('downward overhang extends below the footprint (steam-turbine case)', () => {
    // Footprint 5x3, image is 5 wide x 4 tall with 1 cell hanging below: rect {0,-1,5,4}.
    const p = DrawPart.flatIconPlacement(5, { x: 0, y: -1, w: 5, h: 4 });
    expect(p.width).to.equal(500);
    expect(p.height).to.equal(400);
    // Footprint bottom is container y=50; the image bottom must sit one cell lower (y=150).
    const imageBottom = p.y + p.height;
    expect(imageBottom).to.equal(150);
    // Footprint top (y = 50 - 3*100 = -250) and image top coincide (no upward overhang here).
    expect(p.y).to.equal(-250);
  });

  it('horizontal overhang widens symmetrically around the footprint centre', () => {
    // 1x1 footprint, art 2 cells wide centred: rect {-0.5,0,2,1}.
    const p = DrawPart.flatIconPlacement(1, { x: -0.5, y: 0, w: 2, h: 1 });
    expect(p.width).to.equal(200);
    // footprint centre x is 0 (odd width); image spans -100..100 → centred on 0.
    expect(p.x).to.equal(-100);
    expect(p.x + p.width).to.equal(100);
  });
});
