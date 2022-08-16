// import {
//   BaseVisualization
// } from "../visualizations/BaseVisualization";
//
// // TODO: move to somwhere without imports from BaseVisualization children
// export const exportTemplate = (filename) => {
//     if (!filename.endsWith(".ttl")) {
//         filename = filename + ".ttl";
//     }
//     let object;
//     const writer = new N3.Writer({
//         prefixes: {
//             // gtemplate: 'https://pxio.de/graph-ical/styles/0.1/#',
//             ...window.activeRepoNameSpaces
//         }
//     });
//     // next we write UI info related to vis type decisions
//     for (let vis of BaseVisualization.visualizations) {
//         if (vis.options.ignoreInTemplate) continue;
//         for (let quad of vis.getTemplateRDF()) {
//             writer.addQuad(quad);
//         }
//     }
//     // writing tab info
//     for (let quad of getTabDataRDF()) {
//         writer.addQuad(quad);
//     }
//     writer.end((error, result) => {
//         if (!error) {
//             var pom = document.createElement('a');
//             pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(result));
//             pom.setAttribute('download', filename);
//             if (document.createEvent) {
//                 var event = document.createEvent('MouseEvents');
//                 event.initEvent('click', true, true);
//                 pom.dispatchEvent(event);
//             }
//             else {
//                 pom.click();
//             }
//         }
//     });
// };
//
// let expert_mode_toggle = new hx.Toggle("#btn_domain_expert_toggle");
// expert_mode_toggle.value(!window.isInUserMode);
// expert_mode_toggle.on('change', (shouldExpertMode) => {
//   window.isInUserMode = !shouldExpertMode;
//   // inform all visualizations
//   BaseVisualization.getAllVisualizations().forEach((vis, i) => vis.onToggleUserMode());
//   // adjust other UI (add new tabs)
//   d3.select(".plus-new-tab").classed("invisible", !shouldExpertMode);
//   d3.select("#translate-rdf-terms").classed("invisible", !shouldExpertMode);
//   d3.select("#add-ui").classed("invisible", !shouldExpertMode);
//   d3.select("#export-template-button").classed("invisible", !shouldExpertMode);
//   d3.select("#create-events").classed("invisible", !shouldExpertMode);
// });
//
//
// // TODO: move highlight logic to a separate module
// window.highlightedRects = {};
// window.highlighterStream = new Subject();
// window.highlighterStream.subscribe({
//     next: args => {
//         if (args.add) {
//             let id = uuidv4();
//             window.highlightedRects[id] = args.rect;
//             args.vis.highlightId = id;
//         }
//         if (args.remove) {
//             delete window.highlightedRects[args.id];
//         }
//         if (Object.keys(window.highlightedRects).length > 0) {
//             renderHighlightedVisualizations(Object.values(window.highlightedRects));
//         } else {
//             d3.select("div.overlay-container").html("");
//         }
//     }
// });
// const renderHighlightedVisualizations = (rects) => {
//     let isInsideAnyRect = (x, y) => {
//         for (let r of rects) {
//             if (x >= r.x && x <= r.x + r.w) {
//                 if (y >= r.y && y <= r.y + r.h) {
//                     return true;
//                 }
//             }
//         }
//         return false;
//     };
//     let overlayArea = d3.select("div.overlay-container");
//     // remove previous dimmed divs
//     overlayArea.html("");
//     // compute x and y arrays (sorted)
//     let xArray = [31, window.innerWidth];
//     let yArray = [85, window.innerHeight];
//     rects.map(r => {
//         xArray.push(r.x);
//         yArray.push(r.y);
//         xArray.push(r.x + r.w);
//         yArray.push(r.y + r.h);
//         return r;
//     });
//     xArray = Array.from(new Set(xArray));
//     yArray = Array.from(new Set(yArray));
//     xArray = xArray.sort(function(a, b) {
//         return a - b;
//     });
//     yArray = yArray.sort(function(a, b) {
//         return a - b;
//     });
//     for (let i=0; i<xArray.length - 1; i++) {
//         let left = xArray[i];
//         let w = xArray[i+1] - left;
//         let top = yArray[0];
//         for (let j=0; j<yArray.length-1; j++) {
//             let h = yArray[j+1] - top;
//             //
//             let mx = left + w * 0.5;
//             let my = top + h * 0.5;
//             if (!isInsideAnyRect(mx, my)) {
//                 // add overlay
//                 let overlay = overlayArea.append("div")
//                     .classed("overlay-area", true)
//                     .classed("placeholder", window.isInAddVisualizationMode && w > 100 && h > 100)
//                     .style("top", top + "px")
//                     .style("left", left + "px")
//                     .style("width", w + "px")
//                     .style("height", h + "px");
//                 overlay.on("click", () => {
//                     BaseVisualization.getAllVisualizations().forEach((vis, i) => {
//                         vis.setHighlighted(false);
//                     });
//                 });
//             }
//             top = yArray[j+1];
//         }
//     }
// };
