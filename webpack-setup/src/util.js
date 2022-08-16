import { NODE_LABEL_PADDING } from "./index";

export const getDistance = (u, v) => {
    let dx = u.x - v.x;
    let dy = u.y - v.y;
    return Math.sqrt(dx*dx + dy*dy);
}

export const getCirclePathData = (r) => {
    // returns path data generating a circle centered at 0,0 (node center)
    r = r + NODE_LABEL_PADDING;
    return "m" + (0 - r) + "," + 0 +
        "a" + r + "," + r + " 0 1,1 " + (2*r) + ",0" +
        "a" + r + "," + r + " 0 1,1 " + -(2*r) + ",0";
}

export const getCirclePathDataCenteredAroundTop = (r, l) => {
    // l is the length we want to shift from top most point of circle around it
    // (counter-clockwise)
    r = r + NODE_LABEL_PADDING;
    let circumference = Math.PI * 2 * r;
    l = Math.min(l, circumference / 4.0);
    let theta = l/r;
    // we're assuming circle is centered at (0, 0)
    let x0 = Math.cos(Math.PI/2.0 - theta) * -r;
    let y0 = Math.cos(theta) * -r;
    let x1 = -x0;
    let y1 = -y0;
    // we need to draw a full circle starting from (x0, y0)
    return "m" + x0 + "," + y0 +
        "a" + r + "," + r + " 0 1,1 " + (x1-x0) + "," + (y1-y0) +
        "a" + r + "," + r + " 0 1,1 " + (x0-x1) + "," + (y0-y1);
}

export const vectorFromStartDirMag = (u, v, d) => {
    // given a vector from u to v, returns a new ending point vp such that the
    // resulting vector from u has magnitude d
    let dx = v.x - u.x;
    let dy = v.y - u.y;
    let mag = Math.sqrt(dx*dx + dy*dy);
    return {
        x: (dx/mag)*d + u.x,
        y: (dy/mag)*d + u.y
    };
}
