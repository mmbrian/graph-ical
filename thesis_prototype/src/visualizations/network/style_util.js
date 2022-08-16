import { getDistance, vectorFromStartDirMag, getCirclePathDataCenteredAroundTop } from "./util";
import * as d3 from "d3";
import { combineLatest, Subject } from "rxjs";
import { filter, map } from "rxjs/operators";
import {
    getLinkId, computeConnectedComponent,
    getNodeRadiusInfo,
    isValidLink
} from "../../scripts/helpers";
import { isLabelNode } from "../../scripts/types";
import { NODE_LABEL_PADDING } from "./index";
const hx = require("hexagon-js");

export const NODE_CONTROLS_AREA_SIZE = 32;
export const ZOOM_EXTENTS = [0.1, 4];

export const addFilters = (defs) => {
    // create filter with id #drop-shadow
    // height > 100% so that the shadow is not clipped
    let filter = defs.append("filter")
        .attr("id", "drop-shadow")
        .attr("height", "175%")
        .attr("width", "175%");
    // SourceAlpha refers to opacity of graphic that this filter will be applied to
    // convolve that with a Gaussian and store result in blur
    filter.append("feGaussianBlur")
        .attr("in", "SourceAlpha")
        .attr("stdDeviation", 3)
        .attr("result", "blur");
    // translate output of Gaussian blur to the right and downwards
    // store result in offsetBlur
    filter.append("feOffset")
        .attr("in", "blur")
        .attr("dx", 2)
        .attr("dy", 2)
        .attr("result", "offsetBlur");
    // overlay original SourceGraphic over translated blurred opacity by using
    // feMerge filter. Order of specifying inputs is important!
    let feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode")
        .attr("in", "offsetBlur");
    feMerge.append("feMergeNode")
        .attr("in", "SourceGraphic");
};

export const addTextBackgroundFilters = (defs) => {
    // see https://stackoverflow.com/a/31013492
    let filter = defs.append("filter")
        .attr("id", "solid")
        .attr("x", "0")
        .attr("y", "0")
        .attr("height", "1")
        .attr("width", "1");
    filter.append("feFlood")
        .attr("flood-color", "yellow")
        .attr("result", "bg");
    let merge = filter.append("feMerge");
    merge.append("feMergeNode")
        .attr("in", "bg");
    merge.append("feMergeNode")
        .attr("in", "SourceGraphic");
};

export const addZoomSupport = (svg, g, width, height) => {
    // TODO: watch width/height changes using stream to update local data
    // (resetZoom and zoomToSelection reference old width/height)
    // zoom settings (see https://observablehq.com/@d3/zoom-to-bounding-box)
    const zoomed = () => {
        const {transform} = d3.event;
        g.attr("transform", transform);
        g.attr("stroke-width", 1 / transform.k);
    };
    const zoom = d3.zoom()
          .filter(() => {
              // NOTE: we also disable zoom of shift key so we can bind it to
              // resolution changes. see https://github.com/d3/d3-zoom/blob/master/README.md#zoom_filter
              return !d3.event.ctrlKey && !d3.event.button && !d3.event.shiftKey;
          })
          .scaleExtent(ZOOM_EXTENTS)
          .on("zoom", zoomed);
    svg.call(zoom).on("dblclick.zoom", null); // NOTE: double click zoom behavior
    // would zoom-in area around the cursor. we disable it for now
    // custom zoom actions
    const resetZoom = () => {
        svg.transition().duration(750).call(
            zoom.transform,
            d3.zoomIdentity,
            d3.zoomTransform(svg.node()).invert([width / 2, height / 2])
        );
    };
    const zoomToSelection = (x0, y0, x1, y1) => {
        d3.event.stopPropagation();
        svg.transition().duration(750).call(
            zoom.transform,
            d3.zoomIdentity
            .translate(0, 0)
            .scale(Math.min(8, 0.9 / Math.max((x1 - x0) / width, (y1 - y0) / height)))
            .translate(-(x0 + x1) / 2, -(y0 + y1) / 2),
            d3.mouse(svg.node())
        );
    };
    const zoomCommandsStream = new Subject();
    zoomCommandsStream.subscribe({
        next: cmd => {
            if (cmd.zoomToBBox) {
                zoomToSelection(cmd.x0, cmd.y0, cmd.x1, cmd.y1);
            } else {
                resetZoom();
            }
        }
    });
    return [zoomCommandsStream, zoom];
};

export const addHoverBoundaryHighlight = (mouseMoveStream, simulation, simulationTickStream) => {
    // highlights the boundary of a node (outer circle) when user moves inside it
    // also returns a stream that fires events when user enters/exits a node region
    let nodeEnterExitStream = new Subject();
    let lastClosestNodeToCursor = null;
    const setNodeBoundaryVisibility = (id, visible) => {
        // NOTE: uncomment to render node boundary on hover
        // d3.selectAll("circle.outer")
        //     .filter(d => d.id === id)
        //     .classed("hidden_circle", !visible);
    };
    const _stream = combineLatest(
        mouseMoveStream,
        simulationTickStream
    ).pipe(map(args => args[0]));
    _stream.subscribe({
        next: payload => {
            let closestNode = simulation.find(payload.m[0], payload.m[1]); // not giving any search radius so that we always find a node
            if (!closestNode) return;
            let dist = getDistance({ x: payload.m[0], y: payload.m[1]}, closestNode);
            if (dist <= closestNode.radius) {
                if (lastClosestNodeToCursor) {
                    if (lastClosestNodeToCursor.id !== closestNode.id) {
                        setNodeBoundaryVisibility(lastClosestNodeToCursor.id, false);
                        nodeEnterExitStream.next({
                            exit: true,
                            node: lastClosestNodeToCursor
                        });
                        nodeEnterExitStream.next({
                            enter: true,
                            node: closestNode
                        });
                    }
                } else {
                    nodeEnterExitStream.next({
                        enter: true,
                        node: closestNode
                    });
                }
                // we're within range of this node > show boundary
                setNodeBoundaryVisibility(closestNode.id, true);
                lastClosestNodeToCursor = Object.assign({}, closestNode);
            } else {
                if (lastClosestNodeToCursor) {
                    nodeEnterExitStream.next({
                        exit: true,
                        node: lastClosestNodeToCursor
                    });
                    setNodeBoundaryVisibility(lastClosestNodeToCursor.id, false);
                    lastClosestNodeToCursor = null;
                }
            }
        }
    });
    return nodeEnterExitStream;
};

export const renderCustomCursor = (mouseMoveStream) => {
    return mouseMoveStream.subscribe({
        next: payload => {
            // console.log(payload.e, payload.e.sourceEvent);
            d3.select(".cursor-element")
                .attr("style", "--x:" + (payload.e.clientX-5) + "px;" + "--y:" + (payload.e.clientY-5) + "px;");
            // -5 since cursor size is 10
        }
    });
};

export const renderFOW = (mouseMoveStream, movingElementStream) => {
    const _stream = combineLatest(
        mouseMoveStream,
        movingElementStream
    ).pipe(map(args => {
        return {
            e: args[0].e,
            isMovingSomething: args[1]
        };
    }));
    setTimeout(() => {
        movingElementStream.next(false);
    }, 1);
    return _stream.subscribe({
        next: payload => {
            // console.log(payload.e);
            if (!payload.isMovingSomething && !payload.e.altKey) {
                d3.selectAll(".overlay-view").style("height", "0px").style("width", "0px");
                return;
            }
            let tlx = payload.e.clientX;
            let tly = payload.e.clientY;
            let maxWidth = Math.max(window.innerWidth - tlx, tlx);
            let maxHeight = Math.max(tly, window.innerHeight - tly);
            let dMaxX = tlx - maxWidth;
            let dMaxY = tly - maxHeight;
            d3.select("#tl-overlay").style("top", dMaxY + "px").style("left", dMaxX + "px");
            d3.select("#tr-overlay").style("top", dMaxY + "px").style("left", tlx + "px");
            d3.select("#br-overlay").style("top", tly + "px").style("left", tlx + "px");
            d3.select("#bl-overlay").style("top", tly + "px").style("left", dMaxX + "px");
            d3.selectAll(".overlay-view").style("height", maxHeight + "px").style("width", maxWidth + "px");
        }
    });
};

export const renderNodeNameUponEnter = (nodeEnterExitStream) => {
    return nodeEnterExitStream.subscribe({
        next: payload => {
            if (payload.enter) {
                // console.log("Entered node", payload.nodeId);
                // let topAllowed = payload.node.y > -(window.innerHeight/2) + 100;
                // let bottomAllowed = payload.node.y < (window.innerHeight/2) - 100;
                // let leftAllowed = payload.node.x > -(window.innerWidth/2) + 100;
                // let rightAllowed = payload.node.x < (window.innerWidth/2) - 100;
                d3.select(".cursor-content")
                    .classed(payload.node.x > 0 ? "right" : "left", true)
                    .classed(payload.node.y > 0 ? "bottom" : "top", true)
                    .select("span.title").text(payload.node.label);
                if (isLabelNode(payload.node)) return;
                // hide regular label
                d3.selectAll("text.label_text")
                    .filter(d => d.id === payload.node.id)
                    .classed("being_hovered", true);
            } else if (payload.exit) {
                // console.log("Exited node", payload.nodeId);
                d3.select(".cursor-content")
                    .attr("class", "cursor-content");
                if (isLabelNode(payload.node)) return;
                // show regular label
                d3.selectAll("text.label_text")
                    .filter(d => d.id === payload.node.id)
                    .classed("being_hovered", false);
            }
        }
    });
};

export const renderOnlyConnectedComponentEdgesOnHover = (nodeEnterExitStream, links) => {
    return nodeEnterExitStream.subscribe({
        next: payload => {
            if (payload.enter) {
                // compute connected component links
                // class all other links as hidden_edge
                let clinks = computeConnectedComponent(payload.node, links).links;
                clinks = clinks.map(link => getLinkId(link));
                d3.selectAll("line.link")
                    .filter(d => !clinks.includes(getLinkId(d)))
                    .classed("hidden_edge", true);
                d3.selectAll("text.edgelabel")
                    .filter(d => !clinks.includes(getLinkId(d)))
                    .classed("hidden_label", true);
            } else if (payload.exit) {
                // render all edges
                d3.selectAll("line.link")
                    .classed("hidden_edge", false);
                d3.selectAll("text.edgelabel")
                    .classed("hidden_label", false);
            }
        }
    });
};

export const highlightConnectedComponentOnNodeSelect = (nodeSelectionStream, nodes, links, zoomCommandsStream = null) => {
    let lastHighlightedComponentNodes = null;
    return nodeSelectionStream.subscribe({
        next: node => {
            if (node) {
                if (lastHighlightedComponentNodes) {
                    if (lastHighlightedComponentNodes.includes(node.id)) {
                        console.log("component is already highlighted!");
                        return;
                    }
                    // reset first
                    d3.selectAll("line.link").classed("non_component_edge", false);
                    d3.selectAll("g.node").classed("non_component_node", false);
                }
                const component = computeConnectedComponent(node, links);
                const clinks = component.links.map(link => getLinkId(link));
                const cnodes = component.nodes.map(node => node.id);
                lastHighlightedComponentNodes = cnodes;
                // defocus non-component links
                d3.selectAll("line.link")
                    .filter(d => !clinks.includes(getLinkId(d)))
                    .classed("non_component_edge", true)
                    .lower();
                // defocus non-component nodes
                d3.selectAll("g.node")
                    .filter(d => !cnodes.includes(d.id))
                    .classed("non_component_node", true)
                    .lower();
                if (zoomCommandsStream) {
                    // let nBBoxes = component.nodes.map(node => {
                    //     let _v = d3.selectAll('g.node').filter(d => d.id === node.id);
                    //     return _v.node().getBoundingClientRect();
                    // })
                    // zoomCommandsStream.next({
                    //     zoomToBBox: true,
                    //     x0: Math.min(...nBBoxes.map(bbox => bbox.left)),
                    //     x1: Math.max(...nBBoxes.map(bbox => bbox.right)),
                    //     y0: Math.min(...nBBoxes.map(bbox => bbox.top)),
                    //     y1: Math.max(...nBBoxes.map(bbox => bbox.bottom))
                    // });
                    // zoom in bbox of cnodes
                    zoomCommandsStream.next({
                        zoomToBBox: true,
                        x0: Math.min(...component.nodes.map(node => node.x - node.radius)),
                        x1: Math.max(...component.nodes.map(node => node.x + node.radius)),
                        y0: Math.min(...component.nodes.map(node => node.y - node.radius)),
                        y1: Math.max(...component.nodes.map(node => node.y + node.radius))
                    });
                }
            } else {
                lastHighlightedComponentNodes = null;
                // deselect all
                d3.selectAll("line.link").classed("non_component_edge", false);
                d3.selectAll("g.node").classed("non_component_node", false);
                // zoom back to normal
                if (zoomCommandsStream) {
                    // zoom in bbox of cnodes
                    zoomCommandsStream.next({
                        zoomToBBox: false
                    });
                }
            }
        }
    });
};

export const renderDragIndicatorOnNodeHover = (
    nodeMoveAreaVisitStream, simulationTickStream,
    performingAsyncOperationStream
) => {
    let lastVisitedNode = null;
    let _stream = combineLatest(
        nodeMoveAreaVisitStream,
        simulationTickStream, // just to make sure we track node move also when
        // node position changes (even if mouse not moving)
        performingAsyncOperationStream
    ).pipe(map(args => {
        return {
            node: args[0].node,
            enter: args[0].enter,
            finished_async: args[2].finished
        };
    }));
    setTimeout(() => {
        performingAsyncOperationStream.next({ finished: true });
    }, 1);
    return _stream.subscribe({
        next: payload => {
            // if (isLabelNode(payload.node)) return;
            if (payload.enter) {
                let sameOldNode = lastVisitedNode && lastVisitedNode.id === payload.node.id;
                if (lastVisitedNode && lastVisitedNode.id !== payload.node.id) {
                    // reset last visited node
                    d3.selectAll("circle.inner")
                        .filter(d => d.id === lastVisitedNode.id)
                        .classed("movable", false);
                } else {
                    if (!sameOldNode && payload.finished_async) {
                        lastVisitedNode = payload.node;
                        d3.selectAll("circle.inner")
                            .filter(d => d.id === payload.node.id)
                            .classed("movable", true);
                        d3.select(".cursor-element").classed("hidden_cursor", true);
                    }
                }
            } else {
                if (payload.node) {
                    // reset node
                    d3.selectAll("circle.inner")
                        .filter(d => d.id === payload.node.id)
                        .classed("movable", false);
                }
                d3.select(".cursor-element").classed("hidden_cursor", false);
                lastVisitedNode = null;
            }
        }
    });
};

export const renderAddEdgeIndicatorOnNodeHover = (
    g, nodeEnterExitStream, nodeMoveAreaVisitStream,
    globalSvgMouseMoveStream, simulationTickStream,
    performingAsyncOperationStream
) => {
    // adding indicators to svg
    let indicatorLine = g.append("line")
        .classed("hidden", true)
        .classed("edge_indicator", true)
        .lower(); // render behind all nodes
    let indicatorCircle = g.append("circle")
        .classed("pointer-events-none", true)
        .classed("hidden", true)
        .classed("edge_indicator", true);
    // setting up this stream from helper streams
    let nodeAddEdgeIndicatorStream = combineLatest(
        nodeMoveAreaVisitStream,
        nodeEnterExitStream,
        globalSvgMouseMoveStream,
        simulationTickStream, // NOTE: combining with tick stream makes sure events
        // are fired when node positions change
        performingAsyncOperationStream
    ).pipe(
        map(args => {
            if (args[4].finished && args[0].exit && args[1].enter && !isLabelNode(args[1].node)) {
                return {
                    render: true,
                    node: args[1].node,
                    mouseXY: args[2].m
                };
            } else {
                return {
                    render: false
                };
            }
        })
    );
    setTimeout(() => {
        performingAsyncOperationStream.next({ finished: true });
        nodeMoveAreaVisitStream.next({
            exit: true,
            node: null
        }); // firing once so that the combineLatest gets fired upon first
        // event firing on nodeEnterExitStream
    }, 1); // have to use a small delay here or else above next call is ignored
    // NOTE: drag is allowed when we're hovering around the inner node, still within
    // node region. therefore we need to make sure we have exited move area and
    // entered node region (one the same node). we also attach mouse position to this
    // stream such that we can position edge indicator towards mouse cursor
    return nodeAddEdgeIndicatorStream.subscribe({
        next: payload => {
            if (payload.render) {
                d3.select(".cursor-element").classed("hidden_cursor", false);
                d3.select(".cursor-element").classed("not-allowed", false);
                d3.select("body").classed("move_cursor", false);
                // render a circle towards mouse cursur on the boundary of
                // node's inner circle
                let v = vectorFromStartDirMag(
                    payload.node,
                    {
                        x: payload.mouseXY[0],
                        y: payload.mouseXY[1]
                    },
                    payload.node.innerRadius
                );
                indicatorCircle
                    .attr("cx", v.x)
                    .attr("cy", v.y)
                    .attr("r", 5)
                    .classed("hidden", false);
                indicatorLine
                    .attr("x2", payload.node.x)
                    .attr("y2", payload.node.y)
                    .attr("x1", payload.mouseXY[0])
                    .attr("y1", payload.mouseXY[1])
                    .classed("hidden", false);
                // remove default cursor
                d3.selectAll("g.node")
                    .filter(d => d.id === payload.node.id)
                    .classed("no_cursor", true);
            } else {
                indicatorCircle.classed("hidden", true);
                indicatorLine.classed("hidden", true);
                d3.select(".cursor-element").classed("hidden_cursor", true);
            }
        }
    });
};

export const defocusInvalidNodesOnEdgeDrag = (source, nodes) => {
    // given a source node, will defocus all other nodes that will make invalid
    // links
    d3.selectAll("g.node")
        .filter(d => d.id !== source.id)
        .classed("defocused", d => !isValidLink(source, d));
};

export const renderAddEdgeIndicatorOnDrag = (g, nodeAddingEdgeStream, nodeEnterExitStream, globalSvgMouseMoveStream, edgeStream) => {
    // adding indicators to svg
    let indicatorLine = g.append("line")
        .classed("hidden", true)
        .classed("link_imporsonator", true)
        .lower(); // render behind all nodes
    // setting up this stream from helper streams
    let nodeAddEdgeDragStream = combineLatest(
        nodeAddingEdgeStream,
        nodeEnterExitStream,
        globalSvgMouseMoveStream
    ).pipe(
        map(xym => {
            return {
                source: xym[0].source,
                render_line: xym[0].edge_started,
                target: xym[1].node,
                edge_allowed: xym[1].enter && (xym[0].source && xym[0].source.id !== xym[1].node.id),
                // only allowed if we entered last target and not the same node
                add_edge: xym[0].edge_finished,
                mouseXY: xym[2].m
            };
        })
    );
    setTimeout(() => {
        nodeAddingEdgeStream.next({
            edge_started: false,
            edge_finished: false
        }); // NOTE: this combination of props makes sure nodeAddEdgeDragStream's subscription
        // below does not perform any logic
    }, 1); // just so nodeAddEdgeDragStream is fired initialling on nodeEnterExitStream
    // before user has done any drags
    nodeAddEdgeDragStream.subscribe({
        next: payload => {
            if (isLabelNode(payload.source) && payload.render_line) return;
            // if (isLabelNode(payload.target) && payload.add_edge) return;
            if (payload.render_line) {
                indicatorLine
                    .attr("x1", payload.source.x)
                    .attr("y1", payload.source.y)
                    .attr("x2", payload.mouseXY[0])
                    .attr("y2", payload.mouseXY[1])
                    .classed("hidden", false);
            } else {
                indicatorLine.classed("hidden", true);
                if (payload.add_edge) {
                    if (payload.edge_allowed) {
                        // add edge from payload.source to payload.target
                        edgeStream.next({
                            add_edge: true,
                            source: payload.source,
                            target: payload.target
                        });
                    }
                    nodeAddingEdgeStream.next({
                        source: null,
                        edge_finished: false
                    }); // this makes sure we won't get duplicate add edge commands
                }
            }
        }
    });
    return nodeAddEdgeDragStream;
};

// TODO: needs rework
// export const handleNodeWeightUpdates = (nodeWeightUpdatedStream) => {
//     // TODO:
//     nodeWeightUpdatedStream.subscribe({
//         next: payload => {
//             for (let node of payload.nodes) {
//                 let rR = getNodeRadiusInfo(node, payload.links);
//                 // TODO: if rR.r and node.innerRadius are different, need to
//                 // transition node radius to rR.r and update it also globally
//                 // changing radius affects:
//                 // linkForce, clusters, cluster forces, collision forces
//                 if (rR.r !== node.innerRadius) {
//                     d3.selectAll("text.label_text")
//                         .filter(d => d.id === node.id)
//                         .classed("being_hovered", true);
//                     // updating node radius on inner circle
//                     d3.selectAll("circle.inner")
//                         .filter(d => d.id === node.id)
//                         .transition()
//                         .duration(750)
//                         .delay(function(d, i) { return i * 5; })
//                         .attrTween("r", function(d) {
//                             var i = d3.interpolate(node.innerRadius, rR.r);
//                             return function(t) { return d.innerRadius = i(t); };
//                         });
//                     setTimeout(() => {
//                         // updating node label
//                         d3.selectAll("textPath")
//                             .filter(d => d.id === node.id)
//                             .each(function (d) {
//                                 let nodeCircumference = 2 * Math.PI * (rR.r + NODE_LABEL_PADDING);
//                                 let padding = NODE_LABEL_PADDING;
//                                 let self = d3.select(this);
//                                 self.text(d.label); // resetting the text first
//                                 let textLength = self.node().getComputedTextLength(),
//                                     text = self.text();
//                                 while (textLength > (nodeCircumference - 2 * padding) && text.length > 0) {
//                                     text = text.slice(0, -1);
//                                     self.text(text + '...');
//                                     textLength = self.node().getComputedTextLength();
//                                 };
//                                 d3.select("defs")
//                                     .selectAll("path")
//                                     .filter(_d => _d.id === d.id)
//                                     .attr("d", getCirclePathDataCenteredAroundTop(rR.r, textLength/2.));
//                             });
//                         d3.selectAll("text.label_text")
//                             .filter(d => d.id === node.id)
//                             .classed("being_hovered", false);
//                     }, 751);
//                     // TODO: still a bit buggy
//                 }
//             }
//         }
//     });
// };

export const updateCursorWhenNotHoveringAnyNodes = (nodeEnterExitStream, nodeAddEdgeDragStream, performingAsyncOperationStream) => {
    let _stream = combineLatest(
        nodeEnterExitStream,
        nodeAddEdgeDragStream,
        performingAsyncOperationStream
    ).pipe(
        map(xyz => {
            return {
                exit: xyz[0].exit,
                enter: xyz[0].enter,
                is_adding_edge: xyz[1].render_line,
                can_update_cursor: xyz[2].finished
            };
        })
    );
    setTimeout(() => {
        performingAsyncOperationStream.next({ finished: true });
    }, 1); // for initialization
    _stream.subscribe({
        next: payload => {
            if (payload.exit) {
                d3.select(".cursor-element").classed("not-allowed", !payload.is_adding_edge);
                if (payload.can_update_cursor) {
                    d3.select("body").classed("move_cursor", !payload.is_adding_edge);
                }
            } else if (payload.enter) {
                d3.select(".cursor-element").classed("not-allowed", false);
                d3.select("body").classed("move_cursor", false);
            }
        }
    });
};

export const updateCursorWhenPerformingAsync = (performingAsyncOperationStream) => {
    performingAsyncOperationStream.subscribe({
        next: payload => {
            if (payload.started) {
                d3.select(".cursor-element").classed("cursor-loading", true);
                d3.select("body").classed("move_cursor", false);
            } else if (payload.finished) {
                d3.select(".cursor-element").classed("cursor-loading", false);
                d3.select("body").classed("move_cursor", true);
                if (payload.notify) {
                    hx.notifyPositive(payload.message);
                    // TODO: use types and notify with proper message i.e. positive,
                    // negative, warning, ...
                }
            }
        }
    });
};

export const renderNodeControlsOnHover = (
    vis, g, nodeEnterExitStream, globalSvgMouseMoveStream,
    simulationTickStream, nodeControlsToggleStream,
    pinNodeStream, nodeRenamedStream
) => {
    // TODO: minor bug when selecting a different node, sometimes need to select twice
    // TODO: handle when rename is selected and user navigates outside node or selects another
    // adding indicators to svg
    let indicatorCircleInner = g.append("circle")
        .classed("hidden", true)
        .classed("node_controls_inner", true)
        .lower();
    let indicatorCircleOuter = g.append("circle")
        .classed("hidden", true)
        .classed("node_controls_outer", true)
        .lower();
    let renameToggle = g
        .append("text")
        .attr("class", "node_control_icon hidden has_icon")
        .text("\uf304");
    let pinToggle = g
        .append("text")
        .attr("class", "node_control_icon hidden has_icon")
        .text("\uf08d");
    const faPlusText = "\uf067";
    const faMinusText = "\uf068";
    let clusterToggle = g
        .append("text")
        // .attr("class", "node_control_icon hidden has_icon")
        .attr("class", "node_control_icon hidden has_icon cluster_toggle")
        .text(faPlusText);
    // setting up this stream from helper streams
    let nodeAddEdgeDragStream = combineLatest(
        nodeEnterExitStream,
        globalSvgMouseMoveStream,
        simulationTickStream,
        nodeControlsToggleStream
    ).pipe(
        map(args => {
            return {
                node: args[0].node,
                mouseXY: args[1].m,
                exit: args[0].exit,
                enter: args[0].enter,
                clicked_node: args[3].node,
                isDisplayingControls: args[3].node.isDisplayingControls,
                updatedNode: args[2].nodes.find(d => d.id === args[3].node.id)
                // TODO: this find is quite extreme. we need to subscribe to
                // this specific node position change
            };
        })
    );
    let isRenaming = false;
    const toggleRename = () => {
        if (isRenaming) {
            d3.select("input.rename")
                .on("keypress", function () {
                    if(d3.event.keyCode === 13) { // enter
                        // change node's label
                        targetNode.label = d3.select(this).node().value;
                        nodeRenamedStream.next({
                            node: targetNode,
                            label: d3.select(this).node().value
                        });
                        isRenaming = false;
                        toggleRename();
                    }
                    // NOTE: cannot detect esc here, therefore it is detected on
                    // document below
                })
                .classed("hidden", false)
                .attr("placeholder", targetNode.label)
                .node().focus();
            d3.select("span.title").classed("hidden", true);
        } else {
            d3.select("input.rename").classed("hidden", true);
            d3.select("span.title").classed("hidden", false);
        }
    };
    renameToggle.on("click", () => {
        isRenaming = !isRenaming;
        toggleRename();
    });
    document.onkeydown = function(evt) {
        evt = evt || window.event;
        if (evt.keyCode == 27) {
            // cancel rename
            isRenaming = false;
            toggleRename();
        }
    };
    renameToggle
        .on("mouseover", () => {
            d3.select(".cursor-content").classed("tooltip", true);
            d3.select("span.title").text("Rename");
        })
        .on("mouseout", () => {
            d3.select(".cursor-content").classed("tooltip", false);
            d3.select("span.title").text(targetNode.label);
        });
    pinToggle.on("click", () => {
        pinNodeStream.next(targetNode);
    });
    pinToggle
        .on("mouseover", () => {
            d3.select(".cursor-content").classed("tooltip", true);
            d3.select("span.title").text(targetNode.pinned ? "Unpin" : "Pin");
        })
        .on("mouseout", () => {
            d3.select(".cursor-content").classed("tooltip", false);
            d3.select("span.title").text(targetNode.label);
        });
    clusterToggle.on("click", () => {
        if (targetNode.isExpanded) {
            clusterToggle.text(faPlusText);
        } else {
            clusterToggle.text(faMinusText);
        }
        vis.toggleCluster(targetNode.node_type);
    });
    clusterToggle
        .on("mouseover", () => {
            d3.select(".cursor-content").classed("tooltip", true);
            d3.select("span.title").text(targetNode.isExpanded ? "Hide Children" : "Show Children");
        })
        .on("mouseout", () => {
            d3.select(".cursor-content").classed("tooltip", false);
            d3.select("span.title").text(targetNode.label);
        });
    const hideControlsForNode = (node) => {
        node.isDisplayingControls = false;
        indicatorCircleInner.classed("hidden", true);
        indicatorCircleOuter.classed("hidden", true);
        renameToggle.classed("hidden", true);
        pinToggle.classed("hidden", true);
        clusterToggle.classed("hidden", true);
        d3.selectAll("text.label_text")
            .filter(d => d.id === node.id)
            .classed("node_has_controls_rendered", false);
    };
    let targetNode = null;
    return nodeAddEdgeDragStream.subscribe({
        next: payload => {
            if (payload.clicked_node) {
                if (targetNode && payload.clicked_node.id !== targetNode.id) {
                    // clicked on a new node, hide controls on last targetNode
                    hideControlsForNode(targetNode);
                }
                if (!payload.updatedNode) return;
                if (payload.isDisplayingControls) {
                    targetNode = payload.node;
                    // hide label
                    d3.selectAll("text.label_text")
                        .filter(d => d.id === payload.updatedNode.id)
                        .classed("node_has_controls_rendered", true);
                    indicatorCircleInner
                        .attr("cx", payload.updatedNode.x)
                        .attr("cy", payload.updatedNode.y)
                        .classed("hidden", false)
                        .attr("r", payload.updatedNode.innerRadius);
                    indicatorCircleOuter
                        .attr("cx", payload.updatedNode.x)
                        .attr("cy", payload.updatedNode.y)
                        .classed("hidden", false)
                        .attr("r", payload.updatedNode.innerRadius + NODE_CONTROLS_AREA_SIZE);
                    renameToggle
                        .classed("hidden", false)
                        .attr("x", payload.updatedNode.x + payload.updatedNode.innerRadius + NODE_CONTROLS_AREA_SIZE/2)
                        .attr("y", payload.updatedNode.y);
                    pinToggle
                        .classed("hidden", false)
                        .attr("x", payload.updatedNode.x - payload.updatedNode.innerRadius - NODE_CONTROLS_AREA_SIZE/2)
                        .attr("y", payload.updatedNode.y);
                    if (payload.updatedNode.isClustedNode) {
                        clusterToggle
                            .classed("hidden", false)
                            .attr("x", payload.updatedNode.x)
                            .attr("y", payload.updatedNode.y - payload.updatedNode.innerRadius - NODE_CONTROLS_AREA_SIZE/2);
                        if (!payload.updatedNode.isExpanded) {
                            clusterToggle.text(faPlusText);
                        }
                    }
                } else {
                    // when another node is hover hide controls
                    // payload.updatedNode.isDisplayingControls = false;
                    // NOTE: comment above so that hovering back this node renders
                    // its control (not desired atm)
                    hideControlsForNode(payload.updatedNode);
                }
            }
        }
    });
};

// export const toggleClusterNode = (node) => {
//     // in both cases cluster node is always visible. when collapsed, this method
//     // expands children around the node on a fixed circle (all nodes are pinned)
//     // scrolling in this mode rotates nodes CW or CCW for pagination.
//     // when expanded, this method collapses all visible cluster nodes back into
//     // cluster and unpins this node
//     if (node.isClustedNode) {
//         if (node.isExpanded) {
//             // collapse cluster nodes into cluster
//         } else {
//             // expand cluster and set initial scroll to 0
//         }
//     }
// }
