import { NODE_LABEL_PADDING } from "./index";

export const getDistance = (u, v) => {
    let dx = u.x - v.x;
    let dy = u.y - v.y;
    return Math.sqrt(dx*dx + dy*dy);
};

export const getCirclePathData = (r) => {
    // returns path data generating a circle centered at 0,0 (node center)
    r = r + NODE_LABEL_PADDING;
    return "m" + (0 - r) + "," + 0 +
        "a" + r + "," + r + " 0 1,1 " + (2*r) + ",0" +
        "a" + r + "," + r + " 0 1,1 " + -(2*r) + ",0";
};

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
};

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
};

export const getBezierLengthTillT = (t, P0, P1, P2) => {
    // returns legth of a segment of bezier curve starting from P0 till a point
    // on the curve at time t (P2 is the 2nd endpoint and P1 is control point)
    // see https://stackoverflow.com/questions/11854907/calculate-the-length-of-a-segment-of-a-quadratic-bezier
    let a_x = P0.x -2*P1.x + P2.x;
    let a_y = P0.y -2*P1.y + P2.y;
    let b_x = 2*P1.x - 2*P0.x;
    let b_y = 2*P1.y - 2*P0.y;
    let A = 4*(a_x*a_x + a_y*a_y);
    let B = 4*(a_x*b_x + a_y*b_y);
    let C = b_x*b_x + b_y*b_y;
    let b = B / (2*A);
    let c = C / A;
    let u = t + b;
    let k = c - b*b;
    let tmp1 = Math.sqrt(u*u+k);
    let tmp2 = Math.sqrt(b*b+k);
    return (Math.sqrt(A)/2)*(u*tmp1-b*tmp2+k*Math.log(Math.abs((u+tmp1)/(b+tmp2))));
};

export const arePointsClockwise = (P0, P1, P2) => {
    // returns true if the segments P0-P1-P2 have a clockwise formation (or collinear)
    return (P1.y - P0.y) * (P2.x - P1.x) - (P2.y - P1.y) * (P1.x - P0.x) >= 0;
};

export const isMidPointAboveLine = (P0, P1, P2) => {
    // returns true if P1 is above (or to the left) of the line that goes through P0 and P2
    let dy = P2.y - P0.y;
    let dx = P2.x - P0.x;
    if (dx === 0) {
        // no above, check if on the left
        return P1.x < P0.x;
    } else {
        let m = dy / dx;
        // y = mx + b is the formula for the line through P0 and P2, first we
        // need to find b knowing one point that goes through this line
        let b = P0.y - m*P0.x;
        // now we intersect this with the vertical line that goes through P1
        let yIntersect = m * P1.x + b;
        // if P1 is above this line, its y should be smaller than yIntersect
        return P1.y <= yIntersect;
    }
};

export const pushOutsideBbox = (x, y, nodes) => {
    // given an initial x, y, checks if they're inside or outside of bbox of
    // nodes. if inside, then pushes x,y, outside cluster using the cluster
    // center and its direction towards x,y
    let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
    let cx, cy, dx, dy, dist, bboxBoundingCircRadius, pushRatio;
    let boundary = 0;
    for (let node of nodes) {
        if (node.radius) boundary = node.radius;
        if (node.x - boundary < minX) { minX = node.x - boundary; }
        if (node.x + boundary > maxX) { maxX = node.x + boundary; }
        if (node.y - boundary < minY) { minY = node.y - boundary; }
        if (node.y + boundary > maxY) { maxY = node.y + boundary; }
    }
    cx = (minX + maxX) / 2.;
    cy = (minY + maxY) / 2.;
    bboxBoundingCircRadius = Math.sqrt(Math.pow((maxX - minX)/2., 2) + Math.pow((maxY - minY)/2., 2));
    if (x >= minX && x <= maxX) {
        if (y >= minY && y <= maxY) {
            // node is inside bbox, push it outside
            dx = x - cx;
            dy = y - cy;
            dist = Math.sqrt(dx*dx + dy*dy);
            pushRatio = bboxBoundingCircRadius / dist;
            // if (dist < 1) {
            //     // point very close to bbox center
            // } else {
            pushRatio = Math.min(pushRatio, 7);
            x += dx * pushRatio;
            y += dy * pushRatio;
            // }
        }
    }
    return {
        x: x,
        y: y
    };
};

export const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const getBisectorProjection = (p0, p1, p) => {
    // returns the point on bisector of p0-p1 that
    // is closest to p (it's projection)
    let dx = p0.x - p1.x;
    let dy = p0.y - p1.y;
    let cx = 0.5*(p0.x + p1.x);
    let cy = 0.5*(p0.y + p1.y);
    if (dx === 0) {
        // bisector is horizontal
        return {
            x: p.x,
            y: cy
        };
    }
    if (dy === 0) {
        // bisector is vertical
        return {
            x: cx,
            y: p.y
        };
    }
    let m = dy/dx; // slope of p0-p1
    let mb = -1/m; // slope of bisector
    // bisector is the line y = mb * x + b
    // where cx, cy is a point. now we find b
    let b = cy - cx*mb;
    // now we find the projection
    let bp = p.y - p.x*m; // for line that goes through p and is perpendecular to bisector
    // we need to find intersection of these two lines
    // y = m*x + bp
    // y = mb*x + b
    // => mb*x + b = m*x + bp => x(mb-m)=bp-b
    let x = (bp-b)/(mb-m);
    return {
        x: x,
        y: m*x + bp
    };
};

const getBisectorDirection = (p0, p1) => {
    // given two points, returns a unit vector indicating the direction along
    // bisector (inverse direction if order changes)
    // NOTE: we assume order is always the same for label nodes for the same link
    let dx = p1.x - p0.x;
    let dy = p1.y - p0.y;
    if (dx === 0) {
        // bisector is a horizontal line
        return {
            x: -1,
            y: 0
        };
    }
    if (dy === 0) {
        // bisector is a vertical line
        return {
            x: 0,
            y: 1
        };
    }
    let m = dy/dx;
    let mb = -1/m;
    let dir = {
        x: 1,
        y: mb
    };
    if (dy > 0) {
        dir.x *= -1;
        dir.y *= -1;
    }
    let dirm = Math.sqrt(dir.x*dir.x + dir.y*dir.y);
    return {
        x: dir.x / dirm,
        y: dir.y / dirm
    };
};

export const getLinkLabelHotspots = (source, target, nlinks, gap = 50) => {
    // given two nodes, returns ideal location of label nodes between them.
    // this is used to apply a force to these label nodes towards the hotspots
    // nlinks is the number of links (hotspots) and gap is distance between
    // hostpots
    let mx = (source.x + target.x)*0.5;
    let my = (source.y + target.y)*0.5;
    if (nlinks === 1) {
        // single hotspot > center of endpoints
        return {
          1: {
              x: mx,
              y: my
          }
        };
    } else {
        // need to make sure that regardless of order of source/target, we always
        // generate same hotspot mapping to their ids
        // this way we can always force a label node towards the farthest available
        // hotspot (which is detected by this id)
        let bd = getBisectorDirection(source, target);
        let offset = gap * (nlinks-1)*0.5;
        let hotspots = {};
        for (let i=0; i<nlinks; i++) {
            hotspots[i+1] = {
                x: mx + bd.x*(i*gap - offset),
                y: my + bd.y*(i*gap - offset)
            };
        }
        return hotspots;
    }
};

export const getFarthestAvailableHotspot = (source, target, p, nlinks, decidedHotspots, gap = 50) => {
    let hotspots = getLinkLabelHotspots(source, target, nlinks, gap);
    let availableHotspots = Object.keys(hotspots).filter(i => !decidedHotspots.includes(i));
    // filter out unavailable hotspots
    let allowedHotspots = {};
    for (let h of availableHotspots) {
        allowedHotspots[h] = hotspots[h];
    }
    // compute distances and max distance
    let hotspotDistances = {};
    for (let h in allowedHotspots) {
        hotspotDistances[h] = getDistance(allowedHotspots[h], p);
    }
    let maxD = Math.max(...Object.values(hotspotDistances));
    // return farthest available hotspot
    for (let h in allowedHotspots) {
        if (hotspotDistances[h] === maxD) {
            return {
                hotspot_id: h,
                p: allowedHotspots[h]
            };
        }
    }
    return null;
};
