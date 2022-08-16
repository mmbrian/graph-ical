require("./style.scss");
const uuidv4 = require("uuid/v4");
const hx = require("hexagon-js");
const N3 = require('n3');
const { DataFactory } = N3;
const { namedNode, literal, quad } = DataFactory;
import { fromEvent, Subject, interval  } from "rxjs";
import { throttle } from "rxjs/operators";
import * as d3 from "d3";
import {
    NodeTypes, NodeActions,
    LinkTypes,
    isLabelNode
} from "../../scripts/types";
import {
    findNodeFromLocation, getNeighbors,
    isValidLink, getLinkType, isNeighborLink, getLinkId,
    getNodeOpacity, getLinkColor, getClusterNodeLabel, getNodeClass,
    isIsolatedNode, getClusterStartingPosition,
    getLinkLabelSync
} from "../../scripts/helpers";
import {
    addFilters,
    addZoomSupport,
    addHoverBoundaryHighlight,
    renderCustomCursor,
    renderNodeNameUponEnter,
    renderOnlyConnectedComponentEdgesOnHover,
    highlightConnectedComponentOnNodeSelect,
    renderDragIndicatorOnNodeHover,
    renderAddEdgeIndicatorOnNodeHover,
    renderAddEdgeIndicatorOnDrag,
    renderNodeControlsOnHover,
    updateCursorWhenPerformingAsync,
    updateCursorWhenNotHoveringAnyNodes,
    handleNodeWeightUpdates,
    defocusInvalidNodesOnEdgeDrag,
    ZOOM_EXTENTS,
    renderFOW,
    NODE_CONTROLS_AREA_SIZE,
    addTextBackgroundFilters
} from "./style_util";
import {
    getDistance,
    getCirclePathData,
    getCirclePathDataCenteredAroundTop,
    textWrap,
    getBezierLengthTillT,
    arePointsClockwise,
    isMidPointAboveLine,
    pushOutsideBbox,
    getBisectorProjection,
    getLinkLabelHotspots,
    getFarthestAvailableHotspot
} from "./util";
import {
    updateTemplateHtmlInfo
} from "../../scripts/template";
import {
    hideAllTemplateCtxt,
    setNodeIconVisibility,
    setNodeIconColor,
    setNodeIconSize,
    getIconText,
    setNodeIcon,
    setNodeLabelVisibility,
    setNodeShapeSelection,
    setNodeSelectedColor,
    setNodeStrokeVisibility,
    setNodeStrokeStylePreview,
    setNodeSelectedStrokeColor,
    setNodeSelectedStrokeSize,
    setNodeSelectedSize,
    setNodeSelectedVisibility,
    initNodeLiteralPicker,
    setEdgeLabelVisibility,
    setEdgeVisibility,
    setEdgeSelectedColor
} from "../../scripts/template_style";
import {
    computeSelectedNodesAndLinks
} from "./compression";
import {
  VisTypes,
  BaseVisualization,
  addTemplatePrefix,
  TEMPLATE_VIEW_SPECIFIC_SPECS
} from "../BaseVisualization";
import {
    getPredicateLabel,
    getTypeLiteralPredicates,
    getLiteral,
    getEventsForNetwork,
    getRawDataForNetwork,
    getInstanceInfo,
    getRepositoryTypes,
    getUniqueRelationsBetweenTypes
} from "../../scripts/rest_util";
import { shortenWithPrefix } from "../../scripts/data";

export const MIN_RADIUS = 25; // min radius of a rendered node
export const MAX_RADIUS = 100; // max radius of a rendered node (entity or cluster)
export const NODE_LABEL_PADDING = 7;

export const NetworkTypes = Object.freeze({
    BASE_GRAPH: "base-graph", // base graph that contains all RDF statements to be rendered
    TEMPLATE_GRAPH: "template-graph", // contains only a template subset of the parent graph
    QUERY_GRAPH: "query-graph" // contains only a subset of RDF statement based on a SPARQL query
});

const NetworkTemplateKeys = Object.freeze({
    EDGE_STRAIGHTNESS: "edgeStraightness",
    EDGE_SHORTNESS: "edgeShortness",
    CLUSTER_GRAVITY: "clusterGravity",
    EDGE_LABEL_SIZE: "edgeLabelSize",
});

export const NetworkDataMode = Object.freeze({
    EVENT_MODE: "Event based",
    RAW_DATA_MODE: "Raw RDF",
});

export const DEFAULT_NODE_STYLE = {
    isNodeLabelVisible: true,
    nodeLabelPredicate: undefined,
    isNodeCircle: true,
    nodeColor: "#41b3a3",
    isNodeStrokeVisible: true,
    nodeStrokeShape: "solid",
    nodeStrokeColor: "#000",
    nodeStrokeSize: 1,
    nodeSize: MIN_RADIUS,
    isNodeVisible: false,
    isNodeIconVisible: true,
    nodeIconColor: "#fff",
    nodeIconSize: 18, // px font-size
    nodeIconName: "fas fa-question-circle"
};
const NOTE_STROKE_DASH_MULTIPLIER = 5;
export const DEFAULT_LINK_STYLE = {
    isLinkLabelVisible: true,
    isLinkVisible: false,
    linkColor: "#000",
    linkSize: 1,
    linkShape: "solid",
    hasCustomLabel: false, // by default link label is just the predicate label fetched from repo
    customLabel: ""
};

// TODO:
// 2. try to remove all direct references to window into props

export default class RDFVisualizer extends BaseVisualization {
    // Given a set of RDF statements, visualizes the graph with a SVG
    // visualization differs based on the given visuazliation type

    constructor(type, tabContentId, options) {
        super(
            type,
            tabContentId,
            options
        );
        this.vis_type = VisTypes.NETWORK;
        this.EDGE_GAP = 5; // extra distance between two connected nodes so that links are selectable
        this.NODE_COLLISION_PADDING = 4; // separation between same-category nodes
        this.CLUSTER_COLLISION_PADDING = 10; // separation between different-category nodes
        // The largest node for each cluster. (largest radius)
        this.NODE_MOVE_AREA_WEIGHT = 0.5; // percentage of node's radius reserved for move region
        // e.g. 0.5 means hovering over node within a circle of radius r/2
        // this.clusters = {};
        // sim parameters
        if (this.options[TEMPLATE_VIEW_SPECIFIC_SPECS]) {
            // has view specific opts
            let networkOpts = this.options[TEMPLATE_VIEW_SPECIFIC_SPECS];
            this.wEdgeAlpha = parseFloat(networkOpts[NetworkTemplateKeys.EDGE_STRAIGHTNESS]);
            this.wEdgeBeta = parseFloat(networkOpts[NetworkTemplateKeys.EDGE_SHORTNESS]);
            this.wClusterG = parseFloat(networkOpts[NetworkTemplateKeys.CLUSTER_GRAVITY]);
            this.edgeLabelSize = parseFloat(networkOpts[NetworkTemplateKeys.EDGE_LABEL_SIZE]);
            this.options.isDisplayingCompressionStats = networkOpts.isDisplayingCompressionStats === "true";
            this.options.isDisplayingGraphZoom = networkOpts.isDisplayingGraphZoom === "true";
            if (networkOpts.compressionC) {
                this.compressionC = parseInt(networkOpts.compressionC);
            } else {
                this.compressionC = 1;
            }
            this.setTitleSuffix("[Depth: " + this.compressionC + "]");
        } else {
            // set defaults
            this.wEdgeAlpha = 0.6;
            this.wEdgeBeta = 0.1;
            this.wClusterG = 0.3;
            this.edgeLabelSize = 45;
            this.options.isDisplayingCompressionStats = false;
            this.options.isDisplayingGraphZoom = false;
            this.compressionC = 1;
            this.dataMode = NetworkDataMode.RAW_DATA_MODE;
        }
        console.log("loaded network with opts", this.options);
        if (type !== null) {
            this.NETWORK_TYPE = type;
        } else {
            this.NETWORK_TYPE = NetworkTypes.BASE_GRAPH;
        }

        if (this.options.hasCoordsAndDims) {
            // this.width = this.options.width.substring(0, this.options.width.length - 2); // remove px suffix
            // this.height = this.options.height.substring(0, this.options.height.length - 2); // remove px suffix
            // this.width = parseFloat(this.width);
            // this.height = parseFloat(this.height) - 60; // accounting for header size
            this.width = this.percentageToPx(this.options.width, "width");
            this.height = this.percentageToPx(this.options.height, "height") - 60;
        } else {
            this.width = 500;
            this.height = 500 - 60*2 + (this.isTemplate() ? 30 : 0);
        }
        this.height += (!this.options.isDisplayingCompressionStats ? 30 : 0);
        this.selectedId = null;
        this.startingNode = null;
        this.targetNode = null;
        this.isolatedNodesOfType = {};
        ////////////////////////////
        // create template if base-graph
        if (!this.isTemplate()) {
            // loading all node/link specific styles
            this.initNodeLinkStyles()
                .then(async () => {
                    console.log("node styles are");
                    console.log(this.nodeStyles);
                    await this.loadNodeTemplateStyles();
                    await this.loadLinkTemplateStyles();
                    // data mode change occures after template styles (both node and link) are loaded
                    this.onDataModeChange(NetworkDataMode.RAW_DATA_MODE); // TODO: load from rdf settings
                    this.templateNetwork = new RDFVisualizer(
                        NetworkTypes.TEMPLATE_GRAPH,
                        tabContentId,
                        {
                            ...options,
                            parent: this
                        }
                    );
                });
        }
        ////////////////////////////
        // base nodes and links are all nodes and links that should be rendered
        // initially. graph operations such as adding/removing nodes/edges will
        // change them. but pesudo elements such as clusters are not part of these
        // lists. also local search queries will not affect these lists.
        this.baseNodes = [];
        this.baseLinks = [];
        // nodes and links lists are everything that is actively rendered, including
        // pseudo links and nodes such as the ones associated to clusters. i.e.
        // what user sees is what is reflected in these two lists.
        this.nodes = [];
        this.links = [];
        // set up svg elements
        this.setupInitialSVG();
        // set up force-directed simulation object and related parameters
        this.setupSimulation();
        // helpers
        this.getNodeById = (id) => this.nodes.find(n => n.id === id);
        // streams
        this.initStreams();
        if (!this.isTemplate()) {
            // NOTE: template graph is not interactive the same way as base graph
            // only interaction allowed are tap events on each element that opens
            // a context menu for customizations
            // this.setupStreams();
        }
        this.setupStreams(); // TODO: filter stream for template graph
        this.setupDrag();
        this.setupDocumentEventListeners();
        if (!this.isTemplate()) {
            this.addTemplateEditUI();
            this.setupTemplateEditTools();
        }
        d3.select(this.getSelector(".compression-toggle"))
            .property("value", this.compressionC);
    }

    isTemplate() {
        return this.NETWORK_TYPE === NetworkTypes.TEMPLATE_GRAPH;
    }

    initStreams() {
        // const simulationTickStream = fromEvent(simulation, "tick"); // fires on simulation tick
        // TODO: properly link it to tick event
        this.simulationTickStream = new Subject(); // fires on simulation tick
        //
        this.nodePinStream = new Subject();
        this.nodeSelectionStream = new Subject();
        this.nodeRenamedStream = new Subject();
        this.nodeControlsToggleStream = new Subject();
        this.nodeMoveAreaVisitStream = new Subject(); // fires when we enter in the area
        // of a node where user can drag/move them from
        // TODO: like some other streams, nodeMoveAreaVisitStream should be combined
        // with tick stream and perform in-area detection not just from mousemove but
        // also on tick events (currently it's not fired every time it should be!)
        this.nodeWeightUpdatedStream = new Subject(); // fires whenever some proproperty of
        // a node that might affect its weight has changed e.g. num of connected edges
        this.nodeAddingEdgeStream = new Subject();
        this.edgeStream = new Subject();
        this.performingAsyncOperationStream = new Subject();
        // creating a global stream for mousemove so that different methods can react
        this.globalSvgMouseMoveStream = new Subject();
        this.resolutionStream = new Subject();
        this.resolutionResponseStream = this.resolutionStream.pipe(
            throttle(val => interval(100)) // react only to latest resolution change every 100 milliseconds
            // NOTE: this delay has to be large enough to make sure nodes that are
            // added new have their correct radius set for collision, but also
            // small enough to make resolution changes fast
        );
        // TODO: still with fast resolution changes we might get NaN errors on
        // certain data e.g. agents and SenseKnowledge
        this.movingElementStream = new Subject(); // to know if we're moving a node/edge
    }

    setupStreams() {
        const thisVis = this;
        // renderFOW(this.globalSvgMouseMoveStream, this.movingElementStream);
        this.resolutionResponseStream.subscribe({
            next: newDepth => {
                thisVis.compressionC = newDepth;
                thisVis.setTitleSuffix("[Depth: " + thisVis.compressionC + "]");
                d3.select(thisVis.getSelector(".compression-toggle"))
                    .property("value", thisVis.compressionC);
                d3.select(thisVis.getSelector(".resolution_spinner_container label"))
                    .text("Event Depth: " + thisVis.compressionC);
                getEventsForNetwork(thisVis).then(async (events) => {
                    let nodeLinkData = await thisVis.getNetworkDataFromEvents(events, thisVis.compressionC);
                    thisVis.baseNodes = nodeLinkData.nodes;
                    thisVis.baseLinks = nodeLinkData.links;
                    thisVis.resetData(false, true);
                });
            }
        });
        this.nodePinStream.subscribe({
            next: node => {
                let targetNode = thisVis.nodes.find(d => d.id === node.id);
                if (targetNode.fx || targetNode.fy) {
                    targetNode.fx = null;
                    targetNode.fy = null;
                    targetNode.pinned = false;
                } else {
                    targetNode.fx = targetNode.x;
                    targetNode.fy = targetNode.y;
                    targetNode.pinned = true;
                }
            }
        });
        //
        if (!this.isTemplate()) {
            this.nodeRenamedStream.subscribe({
                next: payload => {
                    let targetNode = thisVis.nodes.find(d => d.id === payload.node.id);
                    targetNode.label = payload.label;
                    // need to update label around node
                    thisVis.nodeGroup
                        .selectAll("textPath")
                        .filter(d => d.id === payload.node.id)
                        .each(function (d) {
                            let nodeCircumference = 2 * Math.PI * (targetNode.innerRadius + NODE_LABEL_PADDING);
                            let padding = NODE_LABEL_PADDING;
                            let self = d3.select(this);
                            self.text(targetNode.label); // resetting the text first
                            var textLength = self.node().getComputedTextLength(),
                                text = self.text();
                            while (textLength > (nodeCircumference - 2 * padding) && text.length > 0) {
                                text = text.slice(0, -1);
                                self.text(text + '...');
                                textLength = self.node().getComputedTextLength();
                            };
                            thisVis.defGroup
                                .selectAll("path")
                                .filter(_d => _d.id === d.id)
                                .attr("d", getCirclePathDataCenteredAroundTop(targetNode.innerRadius, textLength/2.));
                        });
                }
            });
            // NOTE: ignored for now
            // handleNodeWeightUpdates(this.nodeWeightUpdatedStream);
            updateCursorWhenPerformingAsync(this.performingAsyncOperationStream);
            //
            // TODO: needs rework
            // this.edgeStream.subscribe({
            //     next: payload => {
            //         if (payload.add_edge && !payload.source.isClustedNode  && !payload.target.isClustedNode) {
            //             thisVis.addEdge(payload.source, payload.target);
            //             thisVis.clusterIsolatedNodes();
            //             // fake async task
            //             thisVis.performingAsyncOperationStream.next({
            //                 started: true
            //             });
            //             setTimeout(() => {
            //                 thisVis.performingAsyncOperationStream.next({
            //                     finished: true,
            //                     notify: true,
            //                     message: "Shared/Added/Projected " + payload.source.label + " with/To/Onto " + payload.target.label
            //                 });
            //                 // TODO: show proper message based on edge type
            //             }, 2000); // TODO: make it random
            //         } else if (payload.remove_edge) {
            //             // TODO:
            //         }
            //     }
            // });
        }
        //
        renderDragIndicatorOnNodeHover(
            this.nodeMoveAreaVisitStream,
            this.simulationTickStream,
            this.performingAsyncOperationStream
        );
        //
        this.svg.on("mousemove", function () {
            // NOTE: need to call d3.mouse on g since it is the element that zooms
            // see https://stackoverflow.com/questions/29784294/d3-js-zooming-mouse-coordinates
            return thisVis.globalSvgMouseMoveStream.next({e: d3.event, m: d3.mouse(thisVis.g.node())});
        });
        renderCustomCursor(this.globalSvgMouseMoveStream);
        // TODO: stream node and link updates so subscriptions can adapt instead of renewing them
        this.nodeEnterExitStream = addHoverBoundaryHighlight(this.globalSvgMouseMoveStream, this.simulation, this.simulationTickStream);
        renderNodeNameUponEnter(this.nodeEnterExitStream);
        this.componentNodeHoverSubscription = renderOnlyConnectedComponentEdgesOnHover(this.nodeEnterExitStream, this.links);
        this.nodeSelectSubscription = highlightConnectedComponentOnNodeSelect(this.nodeSelectionStream, this.nodes, this.links, this.zoomCommandsStream);
        this.resetNodeLinkSubscriptions = () => {
            thisVis.nodeSelectSubscription.unsubscribe();
            thisVis.componentNodeHoverSubscription.unsubscribe();
            thisVis.nodeSelectSubscription = this.componentNodeHoverSubscription = null;
            thisVis.componentNodeHoverSubscription = renderOnlyConnectedComponentEdgesOnHover(thisVis.nodeEnterExitStream, thisVis.links);
            thisVis.nodeSelectSubscription = highlightConnectedComponentOnNodeSelect(thisVis.nodeSelectionStream, thisVis.nodes, thisVis.links, thisVis.zoomCommandsStream);
        };
        // NOTE: need to reset componentNodeHoverSubscription whenever links change
        // TODO: a better approach is if we can stream link changes so that all
        // subscriptions that use links can update their local cache
        if (!this.isTemplate()) {
            // TODO: disabling any add edge UI for now
            // renderAddEdgeIndicatorOnNodeHover(
            //     this.g,
            //     this.nodeEnterExitStream,
            //     this.nodeMoveAreaVisitStream,
            //     this.globalSvgMouseMoveStream,
            //     this.simulationTickStream,
            //     this.performingAsyncOperationStream
            // );
            // this.nodeAddEdgeDragStream = renderAddEdgeIndicatorOnDrag(
            //     this.g,
            //     this.nodeAddingEdgeStream,
            //     this.nodeEnterExitStream,
            //     this.globalSvgMouseMoveStream,
            //     this.edgeStream
            // );
            renderNodeControlsOnHover(
                this,
                this.g,
                this.nodeEnterExitStream,
                this.globalSvgMouseMoveStream,
                this.simulationTickStream,
                this.nodeControlsToggleStream,
                this.nodePinStream,
                this.nodeRenamedStream
            );
        }
        updateCursorWhenNotHoveringAnyNodes(
            this.nodeEnterExitStream,
            this.nodeAddEdgeDragStream,
            this.performingAsyncOperationStream
        );
        this.setupLinkLabelSelectBehaviour();
    }

    setupLinkLabelSelectBehaviour() {
        // since label node selection is problematic, this stream updates what
        // node is being selected. so any menu including template ctxt renders
        // for the correct node
        let self = this;
        this.nodeEnterExitStream.subscribe({
            next: payload => {
                if (payload.enter && isLabelNode(payload.node)) {
                    let linkStyle = null;
                    if (self.isDisplayingTemplate) {
                        window.selectedLinkSourceType = self.templateNetwork.getNodeById(payload.node.source_node).node_type;
                        window.selectedLinkTargetType = self.templateNetwork.getNodeById(payload.node.target_node).node_type;
                        window.selectedLinkRelation = payload.node.link_type;
                        linkStyle = self.parent.getLinkStyle(
                            window.selectedLinkSourceType,
                            window.selectedLinkTargetType,
                            window.selectedLinkRelation
                        );
                    } else {
                        if (self.isTemplate()) {
                            window.selectedLinkSourceType = self.parent.templateNetwork.getNodeById(payload.node.source_node).node_type;
                            window.selectedLinkTargetType = self.parent.templateNetwork.getNodeById(payload.node.target_node).node_type;
                            window.selectedLinkRelation = payload.node.link_type;
                            linkStyle = self.parent.getLinkStyle(
                                window.selectedLinkSourceType,
                                window.selectedLinkTargetType,
                                window.selectedLinkRelation
                            );
                        } else {
                            window.selectedLinkSourceType = self.getNodeById(payload.node.source_node).node_type;
                            window.selectedLinkTargetType = self.getNodeById(payload.node.target_node).node_type;
                            window.selectedLinkRelation = payload.node.link_type;
                            linkStyle = self.getLinkStyle(
                                window.selectedLinkSourceType,
                                window.selectedLinkTargetType,
                                window.selectedLinkRelation
                            );
                        }
                    }
                }
            }
        });
    }

    setupInitialSVG() {
        if (this.isContained()) {
            // a template graph
            this.svg = this.parent.contentContainer
                .append("svg")
                .classed("network", true)
                .classed(this.NETWORK_TYPE, true) // NOTE: there can only be 1 graph of each type
                .classed("hidden_graph", this.isTemplate())
                .style("top", this.height + "px")
                .attr("width", this.width)
                .attr("height", this.height)
                .attr("viewBox", (-this.width/2) + " " + (-this.height/2) + " " + this.width + " " + this.height);
            // viewbox is set such that viewport center is 0,0
            this.g = this.svg.append("g");
            this.defGroup = this.svg.append("defs");
            this.linkGroup = this.g.append("g")
                .classed("links", true);
            this.nodeGroup = this.g.append("g")
                .classed("nodes", true);
            // add svg filters such as drop-shadow
            addFilters(this.defGroup);
            addTextBackgroundFilters(this.defGroup);

            this.zoomRet = addZoomSupport(this.svg, this.g, this.width, this.height);
            this.zoomCommandsStream = this.zoomRet[0];
            this.zoomObject = this.zoomRet[1];

            let self = this;
            // this.svg.on("wheel", function (d) {
            //     // console.log("wheel ", d, d3.event);
            //     if (!d3.event.shiftKey) return;
            //     if (d3.event.wheelDelta > 0) {
            //         // zoom-in
            //         self.compressionC++;
            //         if (self.compressionC > self.cr.c_max) {
            //             self.compressionC = self.cr.c_max;
            //         }
            //     } else if (d3.event.wheelDelta < 0) {
            //         // zoom-out
            //         self.compressionC--;
            //         if (self.compressionC < 1) {
            //             self.compressionC = 1;
            //         }
            //     }
            //     if (!self.isTemplate()) {
            //         self.resolutionStream.next(self.compressionC);
            //     }
            // });
        } else {
            // a base-graph
            // Creates sources <svg> element and inner g
            this.baseContainer
                .classed("network_svg_container", true)
                .classed(this.NETWORK_TYPE, true);
            if (!this.viewTitle) {
                this.setTitle(this.NETWORK_TYPE);
            }
            this.addCompressionStatusBar();
            this.addGraphResolutionUI();
            this.addSettingsUI();
            this.svg = this.contentContainer
                .append("svg")
                .classed("network", true)
                .classed(this.NETWORK_TYPE, true) // NOTE: there can only be 1 graph of each type
                // .classed("invisible", this.isTemplate()) // by default template is invisible
                .classed("no_stats", !this.options.isDisplayingCompressionStats)
                .attr("width", this.width)
                .attr("height", this.height)
                .attr("viewBox", (-this.width/2) + " " + (-this.height/2) + " " + this.width + " " + this.height);
            // viewbox is set such that viewport center is 0,0
            this.g = this.svg.append("g");
            this.defGroup = this.svg.append("defs");
            this.linkGroup = this.g.append("g")
                .classed("links", true);
            this.nodeGroup = this.g.append("g")
                .classed("nodes", true);
            // add svg filters such as drop-shadow
            addFilters(this.defGroup);

            this.zoomRet = addZoomSupport(this.svg, this.g, this.width, this.height);
            this.zoomCommandsStream = this.zoomRet[0];
            this.zoomObject = this.zoomRet[1];

            let self = this;
            // this.svg.on("wheel", function (d) {
            //     // console.log("wheel ", d, d3.event);
            //     if (!d3.event.shiftKey) return;
            //     if (d3.event.wheelDelta > 0) {
            //         // zoom-in
            //         self.compressionC++;
            //         if (self.compressionC > self.cr.c_max) {
            //             self.compressionC = self.cr.c_max;
            //         }
            //     } else if (d3.event.wheelDelta < 0) {
            //         // zoom-out
            //         self.compressionC--;
            //         if (self.compressionC < 1) {
            //             self.compressionC = 1;
            //         }
            //     }
            //     if (!self.isTemplate()) {
            //         self.resolutionStream.next(self.compressionC);
            //         // self.resetData();
            //     }
            // });
            this.makeMovableAndResizable((width, height) => {
                self.updateOnResize(width, height);
                self.templateNetwork.updateOnResize(width, height);
            });
        }
    }

    updateOnResize(width, height) {
        this.width = width;
        this.height = height - ((this.isTemplate() || !this.options.isDisplayingCompressionStats) ? 30 : 60);
        this.svg.attr("width", this.width).attr("height", this.height);
        // viewbox is set such that viewport center is 0,0
        this.svg.attr("viewBox", (-this.width/2) + " " + (-this.height/2) + " " + this.width + " " + this.height);
        this.centerForce.x(0).y(0);
        if (!this.isSimulationPaused)
            this.simulation.alphaTarget(0.1).restart();
    }

    getTemplateRDF() {
        let quads = super.getTemplateRDF();
        const viewContext = this.getViewNamedGraph();
        // edge straightness
        quads.push(quad(
            namedNode(addTemplatePrefix(TEMPLATE_VIEW_SPECIFIC_SPECS)),
            namedNode(addTemplatePrefix(NetworkTemplateKeys.EDGE_STRAIGHTNESS)),
            namedNode(this.wEdgeAlpha),
            viewContext,
        ));
        // edge shortness
        quads.push(quad(
            namedNode(addTemplatePrefix(TEMPLATE_VIEW_SPECIFIC_SPECS)),
            namedNode(addTemplatePrefix(NetworkTemplateKeys.EDGE_SHORTNESS)),
            namedNode(this.wEdgeBeta),
            viewContext,
        ));
        // cluster gravity
        quads.push(quad(
            namedNode(addTemplatePrefix(TEMPLATE_VIEW_SPECIFIC_SPECS)),
            namedNode(addTemplatePrefix(NetworkTemplateKeys.CLUSTER_GRAVITY)),
            namedNode(this.wClusterG),
            viewContext,
        ));
        // edge label size
        quads.push(quad(
            namedNode(addTemplatePrefix(TEMPLATE_VIEW_SPECIFIC_SPECS)),
            namedNode(addTemplatePrefix(NetworkTemplateKeys.EDGE_LABEL_SIZE)),
            namedNode(this.edgeLabelSize),
            viewContext,
        ));
        // compression stats
        // TODO: add to NetworkTemplateKeys
        quads.push(quad(
            namedNode(addTemplatePrefix(TEMPLATE_VIEW_SPECIFIC_SPECS)),
            namedNode(addTemplatePrefix("compressionC")),
            literal(this.compressionC),
            viewContext,
        ));
        // TODO: add to NetworkTemplateKeys
        quads.push(quad(
            namedNode(addTemplatePrefix(TEMPLATE_VIEW_SPECIFIC_SPECS)),
            namedNode(addTemplatePrefix("isDisplayingCompressionStats")),
            literal(this.options.isDisplayingCompressionStats),
            viewContext,
        ));
        // graph resolution
        // TODO: add to NetworkTemplateKeys
        quads.push(quad(
            namedNode(addTemplatePrefix(TEMPLATE_VIEW_SPECIFIC_SPECS)),
            namedNode(addTemplatePrefix("isDisplayingGraphZoom")),
            literal(this.options.isDisplayingGraphZoom),
            viewContext,
        ));
        // adding node styles
        quads.push(...this.getNodeStyleTemplateRDF());
        // adding link styles
        quads.push(...this.getLinkStyleTemplateRDF());
        return quads;
    }

    updateDomOnCompressionStatsToggle() {
        // TODO: fix compression stats UI
        this.contentContainer.select("div.compressionStatusBar")
            .classed("invisible", !this.options.isDisplayingCompressionStats);
        this.svg.classed("no_stats", !this.options.isDisplayingCompressionStats);
        this.updateOnResize(this.width, (this.height + 60) + (this.options.isDisplayingCompressionStats ? -30 : 0));
    }

    initNodeLinkStyles() {
        // sets node and links styles to default for all types and relations
        let self = this;
        return new Promise(async function(resolve, reject) {
            // initializing node styles first
            self.nodeStyles = {};
            let typeArray = await getRepositoryTypes(window.activeRepoURI);
            console.log("type array is");
            console.log(typeArray);
            typeArray = typeArray.map(t => shortenWithPrefix(t));
            for (let type of typeArray) {
                self.nodeStyles[type] = {};
                for (let style in DEFAULT_NODE_STYLE) {
                    self.nodeStyles[type][style] = DEFAULT_NODE_STYLE[style];
                }
            }
            // initializing link styles now
            self.linkStyles = {};
            let relationInfos = await getUniqueRelationsBetweenTypes(typeArray);
            for (let relInfo of relationInfos) {
                let styleId = self.getLinkStyleId(
                    relInfo.subject,
                    relInfo.object,
                    relInfo.relation
                );
                self.linkStyles[styleId] = {};
                for (let style in DEFAULT_LINK_STYLE) {
                    self.linkStyles[styleId][style] = DEFAULT_LINK_STYLE[style];
                }
            }
            console.log("node styles at the end of init are");
            console.log(self.nodeStyles);
            resolve();
        });
    }

    isNodeTypeVisible(type) {
        if (type in this.nodeStyles) {
            return this.nodeStyles[type].isNodeVisible;
        }
        return false;
    }

    toggleTypeVisibility(type) {
        if (type in this.nodeStyles) {
            this.nodeStyles[type].isNodeVisible = !this.nodeStyles[type].isNodeVisible;
        }
    }

    getAllVisibleNodeTypes() {
        return Object.keys(this.nodeStyles).filter(t => this.nodeStyles[t].isNodeVisible);
    }

    toggleTemplateView(isDisplayingTemplate) {
        this.templateDOMcontainer.classed("invisible", !isDisplayingTemplate);
        this.svg.classed("hidden_graph", isDisplayingTemplate);
        this.templateNetwork.svg.classed("hidden_graph", !isDisplayingTemplate);
        if (this.options.isDisplayingCompressionStats) {
            this.contentContainer.select(".compressionStatusBar").classed("invisible", isDisplayingTemplate);
        }
        if (this.options.isDisplayingGraphZoom) {
            this.contentContainer.select(".resolution_spinner_container").classed("invisible", isDisplayingTemplate);
        }
        this.inTemplateMode = isDisplayingTemplate;
        hideAllTemplateCtxt();
    }

    addTemplateEditUI() {
        // adds a searchable list of entities reflecting their state as per nodeStyles
        // also adds a list of relation fo all visible entities, again reflecting
        // their state as per linkStyles
        if (this.isTemplate()) return;
        let self = this;
        let templateToggle = this.contentContainer.append("div")
            .classed("network-template-toggle", true)
            .on("click", () => {
                templateToggle.classed("selected", !self.inTemplateMode);
                self.toggleTemplateView(!self.inTemplateMode);
            });
        templateToggle.append("i")
            .classed("fas fa-edit", true);
        this.templateDOMcontainer = this.contentContainer.append("div")
            .classed("template-dom-container invisible", true);
        let typeListContainer = this.templateDOMcontainer.append("div")
            .classed("node-type-selection", true);
        let relationListContainer = this.templateDOMcontainer.append("div")
            .classed("node-relation-selection", true);

        let typeSelectionToggle = this.templateDOMcontainer.append("div")
            .classed("node-type-selection-toggle", true)
            .on("click", () => {
                typeListContainer.classed("invisible", false);
            });
        typeSelectionToggle.append("i")
            .classed("fas fa-edit", true);
        let linkSelectionToggle = this.templateDOMcontainer.append("div")
            .classed("node-relation-selection-toggle", true)
            .on("click", () => {
                relationListContainer.classed("invisible", false);
            });
        linkSelectionToggle.append("i")
            .classed("fas fa-bezier-curve", true);

        let typeInputContainer = typeListContainer.append("div")
            .classed("node-type-header", true);
        let typeSearchInput = typeInputContainer.append("input")
            .classed("node-type-search", true)
            .attr("placeholder", "Search in types...")
            .on("input", function() {
                self.updateTemplateTypeSidebar(this.value);
            });
        let toggleTypeSelection = typeInputContainer.append("i")
            .classed("fas fa-chevron-left", true)
            .on("click", () => {
                typeListContainer.classed("invisible", true);
            });
        this.nodeTypeContainer = typeListContainer.append("div")
            .classed("node-type-items", true);
        getRepositoryTypes(window.activeRepoURI)
            .then((typeArray) => {
                let types = typeArray.map(t => shortenWithPrefix(t));
                self.allNodeTypes = types;
                self.updateTemplateTypeSidebar();
            });
        //////
        let relationInputContainer = relationListContainer.append("div")
            .classed("node-relation-header", true);
        let relationSearchInput = relationInputContainer.append("input")
            .classed("node-relation-search", true)
            .attr("placeholder", "Search in relations...")
            .on("input", function() {
                self.updateTemplateRelationSidebar(this.value);
            });
        let toggleRelationSelection = relationInputContainer.append("i")
            .classed("fas fa-chevron-right", true)
            .on("click", () => {
                relationListContainer.classed("invisible", true);
            });
        this.nodeRelationContainer = relationListContainer.append("div")
            .classed("node-relation-items", true);
        // show relations for all visible types
        this.updateTemplateRelationSidebar();
    }

    updateTemplateTypeSidebar(query = "") {
        // remove previous type list
        this.nodeTypeContainer.html("");
        let self = this;
        query = query.toLowerCase();
        for (let type of self.allNodeTypes.filter(t => t.toLowerCase().includes(query))) {
            let typeItem = self.nodeTypeContainer.append("div")
                .classed("node-type-item", true);
            typeItem
                .append("span")
                .text(type);
            let typeToggles = typeItem.append("div")
                .classed("node-type-toggle-container", true);
            typeToggles.append("i")
                .classed("fas fa-palette", true)
                .on("click", () => {
                    console.log("on node edit selected, TODO: toggle node template controls");
                    // TODO
                });
            typeToggles.append("i")
                .classed("fas", true)
                .classed("fa-eye-slash", !self.isNodeTypeVisible(type))
                .classed("fa-eye", self.isNodeTypeVisible(type))
                .on("click", function() {
                    self.toggleTypeVisibility(type);
                    d3.select(this).classed("fa-eye-slash", !self.isNodeTypeVisible(type));
                    d3.select(this).classed("fa-eye", self.isNodeTypeVisible(type));
                    // update relation list based of visibility changes
                    self.updateTemplateRelationSidebar();
                    // self.resetTemplateData(); // async call, TODO: make sure not multiple calls are queued
                    self.resetTemplateData().then(() => {
                        self.applyNodeTemplateStyles();
                        self.applyLinkTemplateStyles();
                    });
                    // TODO: make sure new template nodes have all existing style applied to them correctly
                    // need to call applyNodeTemplateStyles and applyLinkTemplateStyles, see resetData remains of old logic
                    // TODO: update base network as well
                    self.onDataModeChange(self.dataMode);
                });
        }
    }

    updateTemplateRelationSidebar(query = "") {
        // remove previous relation list
        this.nodeRelationContainer.html("");
        let self = this;
        query = query.toLowerCase();
        getUniqueRelationsBetweenTypes(self.getAllVisibleNodeTypes(), true) // caching result as long as invis types don't change
            .then(relationInfos => {
                for (let relInfo of relationInfos) {
                    if (!(relInfo.subject.toLowerCase().includes(query) ||
                        relInfo.object.toLowerCase().includes(query)  ||
                        relInfo.relation.toLowerCase().includes(query))) {
                        continue;
                    }
                    let styleId = self.getExistingLinkStyleId(
                        relInfo.subject,
                        relInfo.object,
                        relInfo.relation
                    );
                    let relItem = this.nodeRelationContainer.append("div")
                        .classed("node-relation-item", true);
                    let relTitleContainer = relItem.append("div")
                        .classed("node-relation-title", true);
                    relTitleContainer.append("span")
                        .classed("relation-subject", true)
                        .text(relInfo.subject);
                    relTitleContainer.append("span")
                        .classed("relation-predicate", true)
                        .text(relInfo.relation);
                    relTitleContainer.append("span")
                        .classed("relation-object", true)
                        .text(relInfo.object);
                    let relToggles = relItem.append("div")
                        .classed("node-relation-toggle-container", true);
                    relToggles.append("i")
                        .classed("fas fa-palette", true)
                        .on("click", () => {
                            console.log("on relation edit selected, TODO: toggle link template controls");
                            // TODO
                        });
                    relToggles.append("i")
                        .classed("fas", true)
                        .classed("fa-eye-slash", !self.linkStyles[styleId].isLinkVisible)
                        .classed("fa-eye", self.linkStyles[styleId].isLinkVisible)
                        .on("click", function() {
                            self.linkStyles[styleId].isLinkVisible = !self.linkStyles[styleId].isLinkVisible;
                            d3.select(this).classed("fa-eye-slash", !self.linkStyles[styleId].isLinkVisible);
                            d3.select(this).classed("fa-eye", self.linkStyles[styleId].isLinkVisible);
                            // self.resetTemplateData(); // async call, TODO: make sure not multiple calls are queued
                            self.resetTemplateData().then(() => {
                                self.applyNodeTemplateStyles();
                                self.applyLinkTemplateStyles();
                            });
                            // TODO: make sure new template nodes have all existing style applied to them correctly
                            // TODO: update base network as well
                            self.onDataModeChange(self.dataMode);
                        });
                }
            });
    }

    getInvisNodesAndLinkTypes() {
        // NOTE: assuming template styles are already fetched i.e. nodeStyles and linkStyles
        let invisNodes = Object.keys(this.nodeStyles).filter(t => !this.nodeStyles[t].isNodeVisible);
        let invisLinks = [];
        for (let styleId in this.linkStyles) {
            if (!this.linkStyles[styleId].isLinkVisible) {
                // invis link
                invisLinks.push(this.getLinkInfoFromId(styleId));
            }
        }
        return {
            nodeTypes: invisNodes,
            linkTypes: invisLinks
        };
    }

    getVisibleNodesAndLinkTypes() {
        // NOTE: assuming template styles are already fetched i.e. nodeStyles and linkStyles
        let visibleNodes = Object.keys(this.nodeStyles).filter(t => this.nodeStyles[t].isNodeVisible);
        let visibleLinks = [];
        for (let styleId in this.linkStyles) {
            if (this.linkStyles[styleId].isLinkVisible) {
                // invis link
                visibleLinks.push(this.getLinkInfoFromId(styleId));
            }
        }
        return {
            nodeTypes: visibleNodes,
            linkTypes: visibleLinks
        };
    }

    onDataModeChange(selectedDataMode) {
        console.log("onDataModeChange", selectedDataMode);
        // NOTE: make sure template style settings are fetched prior to calling
        // this method in order to render graph correctly
        this.dataMode = selectedDataMode; // TODO: store as rdf settings
        switch (this.dataMode) {
            case NetworkDataMode.RAW_DATA_MODE:
                getRawDataForNetwork(this).then(async (data) => {
                    let nodeLinkData = await this.getNetworkDataFromTriples(data);
                    this.baseNodes = nodeLinkData.nodes;
                    this.baseLinks = nodeLinkData.links;
                    this.resetData(false, true);
                });
                break;
            case NetworkDataMode.EVENT_MODE:
                getEventsForNetwork(this).then(async (events) => {
                    let nodeLinkData = await this.getNetworkDataFromEvents(events, this.compressionC);
                    this.baseNodes = nodeLinkData.nodes;
                    this.baseLinks = nodeLinkData.links;
                    this.resetData(false, true);
                });
                break;
            default:
        }
    }

    resetTemplateData() {
        if (this.isTemplate()) return;
        // applies to template graph but can only be called from parent
        let self = this;
        return new Promise(async function(resolve, reject) {
            let nodeLinkData = await self.getTemplateDataFromStyle();
            self.templateNetwork.baseNodes = nodeLinkData.nodes;
            self.templateNetwork.baseLinks = nodeLinkData.links;
            self.templateNetwork.resetData(false, true);
        });
    }

    getTemplateDataFromStyle() {
        // assuming node/link style is initialized and loaded from template, this
        // method returns the info required to render this template graph i.e.
        // all visible nodes types and links appear exactly once.
        let self = this;
        return new Promise(function(resolve, reject) {
            let visibleNodes = Object.keys(self.nodeStyles).filter(t => self.nodeStyles[t].isNodeVisible);
            let visibleLinks = [];
            for (let styleId in self.linkStyles) {
                if (self.linkStyles[styleId].isLinkVisible) {
                    // invis link
                    visibleLinks.push(self.getLinkInfoFromId(styleId));
                }
            }
            let typeToIds = {};
            let baseNodes = [];
            let baseLinks = [];
            let tmpNode;
            // each visible node has to be rendered regardless of relations
            for (let type of visibleNodes) {
                tmpNode = {};
                tmpNode.subject = type;
                tmpNode.id = uuidv4();
                typeToIds[type] = tmpNode.id;
                tmpNode.node_type = type;
                tmpNode.label = type;
                tmpNode.label_predicate = "SELF";
                baseNodes.push(JSON.parse(JSON.stringify(tmpNode)));
            }
            // now we add links
            for (let linkInfo of visibleLinks) {
                baseLinks.push({
                    source: typeToIds[linkInfo.sourceType],
                    target: typeToIds[linkInfo.targetType],
                    link_type: linkInfo.relation,
                    value: 0.1 // TODO: remove dependency to value in logic then remove it from here
                });
            }
            resolve({
                nodes: baseNodes,
                links: baseLinks
            });
        });
    }

    getNetworkDataFromTriples(triples) {
        let self = this;
        return new Promise(function(resolve, reject) {
            let subjectToTriples = {};
            let tmpS, tmpO, isUri, tmpP;
            for (let spo of triples) {
                tmpS = shortenWithPrefix(spo.s.value);
                isUri = spo.o.type === "uri";
                tmpO = isUri ? shortenWithPrefix(spo.o.value) : spo.o.value;
                tmpP = shortenWithPrefix(spo.p.value);
                if (tmpS in subjectToTriples) {
                    subjectToTriples[tmpS].push({
                        predicate: tmpP, object: tmpO, isUri: isUri
                    });
                } else {
                    subjectToTriples[tmpS] = [{
                        predicate: tmpP, object: tmpO, isUri: isUri
                    }];
                }
            }
            // here we add nodes for each subject
            // NOTE: there might be objects with uri type that do not appear as
            // subjects so we need to add them later
            let instanceToIds = {}; // used to map instance subjects to their node ids
            let baseNodes = [];
            let baseLinks = [];
            let tmpNode;
            let isDescribingType = false;
            for (let subject in subjectToTriples) {
                tmpNode = {};
                tmpNode.subject = subject;
                tmpNode.id = uuidv4();
                // we need to set node type and assign a temporary label here for visualization purposes
                for (let desc of subjectToTriples[subject]) {
                    isDescribingType = desc.predicate.toLowerCase() === "rdf:type" ||
                                       desc.predicate.toLowerCase() === "rdfs:subclassof";
                    if (isDescribingType) {
                        tmpNode.node_type = desc.object;
                    }
                    if (!desc.isUri) {
                        // relation to a literal, use as temp node label
                        tmpNode.label = desc.object;
                        tmpNode.label_predicate = desc.predicate;
                    }
                }
                // if there was no type info as triple description, set type to subject itself
                if (tmpNode.node_type === undefined) {
                    tmpNode.node_type = subject;
                }
                // same for label, if no literal description, use subject itself as its label
                if (tmpNode.label === undefined) {
                    tmpNode.label = subject;
                    tmpNode.label_predicate = "SELF"; // NOTE: special keyword indicating label comes from no relation
                }
                // TODO: for now only accept nodes with a valid type
                if (window.activeRepoShortenedTypes.includes(tmpNode.node_type)) {
                    instanceToIds[subject] = tmpNode.id;
                    baseNodes.push(JSON.parse(JSON.stringify(tmpNode)));
                }
            }
            // now we add links
            let nodeId, targetId;
            for (let subject in subjectToTriples) {
                nodeId = instanceToIds[subject];
                for (let desc of subjectToTriples[subject]) {
                    if (desc.isUri && (desc.object in instanceToIds)) {
                        targetId = instanceToIds[desc.object];
                        baseLinks.push({
                            source: nodeId,
                            target: targetId,
                            link_type: desc.predicate,
                            value: 0.1 // TODO: remove dependency to value in logic then remove it from here
                        });
                    } else {
                        // TODO: fix
                        // if (desc.isUri) {
                        //     // desc.object is an instance with no spo description where it is a subject
                        //     // i.e. most likely it is a top level class e.g. owl:Class
                        //     // we create the missing node first
                        //     tmpNode = {};
                        //     tmpNode.subject = desc.object;
                        //     tmpNode.id = uuidv4();
                        //     instanceToIds[desc.object] = tmpNode.id;
                        //     tmpNode.node_type = desc.object;
                        //     tmpNode.label = desc.object;
                        //     tmpNode.label_predicate = "SELF";
                        //     baseNodes.push(JSON.parse(JSON.stringify(tmpNode)));
                        //     // and then add the link
                        //     baseLinks.push({
                        //         source: nodeId,
                        //         target: tmpNode.id,
                        //         link_type: desc.predicate,
                        //         value: 0.1 // TODO: remove dependency to value in logic then remove it from here
                        //     });
                        // }
                    }
                }
            }
            resolve({
                nodes: baseNodes,
                links: baseLinks
            });
        });
    }

    addSettingsUI() {
        if (this.isTemplate()) return;
        // network mode
        this.addSelectorSetting(
            "Data Mode",
            (selectedDataMode) => {
                console.log("switched data mode to", selectedDataMode);
                this.onDataModeChange(selectedDataMode);
            },
            [NetworkDataMode.EVENT_MODE, NetworkDataMode.RAW_DATA_MODE],
            this.dataMode
        );
        // compression stats
        this.addToggleSetting("Show Compression Stats", (shouldDisplayCstats) => {
            this.options.isDisplayingCompressionStats = shouldDisplayCstats;
            this.updateDomOnCompressionStatsToggle();
        }, this.options.isDisplayingCompressionStats);
        this.addSettingsSeparator();
        // toggle to pause simulation
        this.addToggleSetting("Pause Simulation", (shouldPause) => {
            this.toggleSimulationPause(shouldPause);
        }, false);
        // spinner for edge straighness
        this.addSpinnerSetting(
            "Edge Straightness",
            (newValue) => {
                this.wEdgeAlpha = newValue;
            },
            0, 0.9, this.wEdgeAlpha, 0.01
        );
        // spinner for edge shortness
        this.addSpinnerSetting(
            "Edge Shortness",
            (newValue) => {
                this.wEdgeBeta = newValue;
            },
            0, 0.9, this.wEdgeBeta, 0.01
        );
        // spinner for cluster gravity
        this.addSpinnerSetting(
            "Cluster Gravity",
            (newValue) => {
                this.wClusterG = newValue;
            },
            0, 0.9, this.wClusterG, 0.01
        );
        // spinner for cluster gravity
        this.addSpinnerSetting(
            "Edge Label Size",
            (newValue) => {
                this.edgeLabelSize = newValue;
                this.updateEdgeLabelNodes();
                // also apply to template network
                this.templateNetwork.edgeLabelSize = newValue;
                this.templateNetwork.updateEdgeLabelNodes();
            },
            5, 100, this.edgeLabelSize, 0.5
        );
        this.addSettingsSeparator();
        this.addButtonSetting("Reset Template Style", () => {
            // this.nodeStyles = {};
            // for (let node of this.baseNodes) {
            //     this.setNodeDefaultStylesIfUndefined(node.node_type);
            // }
            // this.resetData();
            // TODO update
        }, "hx-danger hx-btn-small");
        this.addSettingsSeparator();
        //// TODO: move to a specific section (maybe close to data mode selector)
        // and make them visible only when data mode is set to event mode
        // also perhaps combine depth text setting with spinner title
        let eventDepthUpdateStream = new Subject();
        this.addTextSetting(
            "Furthest History Depth: 0",
            eventDepthUpdateStream
        );
        this.addSpinnerSetting(
            "Event History Depth",
            (newValue) => {
                this.compressionC = newValue;
                eventDepthUpdateStream.next({ text: "Event Depth: " + this.compressionC });
                if (this.dataMode === NetworkDataMode.EVENT_MODE) {
                    // already in event mode, apply update in depth change to data
                    this.onDataModeChange(this.dataMode);
                }
            },
            1, 13, 1, 1
        );
        this.addToggleSetting("Show Event Depth Spinner", (shouldDisplayZoom) => {
            this.options.isDisplayingGraphZoom = shouldDisplayZoom;
            this.contentContainer.select("div.resolution_spinner_container")
                .classed("invisible", !this.options.isDisplayingGraphZoom);
        }, this.options.isDisplayingGraphZoom);
        ////
    }

    getNetworkDataFromEvents(events, depth = undefined) {
        // given a list of events, sets baseNodes and baseLinks such that they
        // reflect the state described by those events
        let self = this;
        return new Promise(async function(resolve, reject) {
            let evts = [];
            for (let eventId in events) {
                evts.push({
                    eventId: eventId,
                    info: events[eventId]
                });
            }
            evts.sort((k,v) => {
                let t1 = k.info.find(po => po.p === "pxio:time").o;
                let t2 = v.info.find(po => po.p === "pxio:time").o;
                return new Date(t1) - (new Date(t2));
            });
            // now oldest event is first in evts
            if (depth !== undefined) {
                let from = evts.length - depth;
                from = Math.max(from, 0);
                evts = evts.splice(from, depth);
            }
            // steps here are to
            // 1. add any nodes from events indicating addition of a node
            // 2. remove any nodes from events indicating removal of a node (if already added)
            // 3. add both nodes and a link for events indicating addition of a relation
            //    3.1 only add node if not already added
            // 4. when event indicates removal of a relation:
            //    4.1 remove link if already added
            //    4.2 for each of the two nodes, check if
            //        4.2.1 they appear in any other links to be added or
            //        4.2.2 they appear in some add instance event (as a node to be added)
            //    4.3 if both (4.2.1 and 4.2.2) are false for a node, also remove it
            let nodes = [];
            let links = [];
            console.log("Fetching network data from events...");
            for (let e of evts) {
                let isForInstance = e.info.find(po => po.p === "pxio:isForInstance").o === "true";
                let isAdded = e.info.find(po => po.p === "pxio:isAdded").o === "true";
                if (isForInstance) {
                    // event related to a single node
                    if (isAdded) {
                        // matches 1 > add node
                        nodes.push({
                            subject: e.info.find(po => po.p === "pxio:isFor").o,
                            node_type: shortenWithPrefix(e.info.find(po => po.p === "pxio:hasType").o),
                            event_id: e.eventId
                        });
                    } else {
                        // matches 2 > remove node (if added already)
                        let subject = e.info.find(po => po.p === "pxio:isFor").o;
                        let ind = null;
                        for (let i=0; i<nodes.length; i++) {
                            if (nodes[i].subject === subject) {
                                // this node was added, remove it from nodes
                                ind = i;
                                break;
                            }
                        }
                        if (ind !== null) {
                            nodes.splice(ind, 1);
                        }
                        // also remove any links with this node if already added
                        let inds = [];
                        for (let i=0; i<links.length; i++) {
                            if (links[i].subject === subject ||
                                links[i].object === subject) {
                                inds.push(i);
                                break;
                            }
                        }
                        if (inds) {
                            inds.sort().reverse().map(i => links.splice(i, 1));
                        }
                    }
                } else {
                    // event related  to a relation between two nodes
                    let subject = e.info.find(po => po.p === "pxio:isForSubject").o;
                    let object = e.info.find(po => po.p === "pxio:isForObject").o;
                    let relation = shortenWithPrefix(e.info.find(po => po.p === "pxio:hasType").o);
                    if (isAdded) {
                        // relation added 3 > add both nodes and a link
                        // add subject node if not already added
                        if (!nodes.find(n => n.subject === subject)) {
                            nodes.push({
                                subject: subject,
                                node_type: null,
                                event_id: e.eventId
                            });
                        }
                        // add object node if not already added
                        if (!nodes.find(n => n.subject === object)) {
                            nodes.push({
                                subject: object,
                                node_type: null,
                                event_id: e.eventId
                            });
                        }
                        links.push({
                            subject: subject,
                            object: object,
                            relation: relation,
                            event_id: e.eventId
                        });
                    } else {
                        // relation removed > 4
                        // 4.1 remove link if already added
                        let ind = null;
                        for (let i=0; i<links.length; i++) {
                            if (links[i].subject === subject &&
                                links[i].object === object &&
                                links[i].relation === relation) {
                                ind = i;
                                break;
                            }
                        }
                        if (ind !== null) {
                            links.splice(ind, 1);
                        }
                        // 4.2 check subject node first
                        ind = null;
                        for (let i=0; i<nodes.length; i++) {
                            if (nodes[i].subject === subject) {
                                if (nodes[i].node_type === null) {
                                    // node added from a relation
                                    // check if any link still wants this node
                                    if (links.find(l => l.subject === subject || l.object === subject)) {
                                        // found a link, node has to stay
                                    } else {
                                        // found no link, node can be removed if not
                                        // involved in instance creation
                                        ind = i;
                                        break;
                                    }
                                } else {
                                    // node added from instance creation
                                    // > node has to stay, nothing to do here
                                    ind = null;
                                }
                            }
                        }
                        if (ind !== null) {
                            nodes.splice(ind, 1);
                        }
                        // 4.2 now check of object node
                        ind = null;
                        for (let i=0; i<nodes.length; i++) {
                            if (nodes[i].subject === object) {
                                if (nodes[i].node_type === null) {
                                    // node added from a relation
                                    // check if any link still wants this node
                                    if (links.find(l => l.subject === object || l.object === object)) {
                                        // found a link, node has to stay
                                    } else {
                                        // found no link, node can be removed if not
                                        // involved in instance creation
                                        ind = i;
                                        break;
                                    }
                                } else {
                                    // node added from instance creation
                                    // > node has to stay, nothing to do here
                                    ind = null;
                                }
                            }
                        }
                        if (ind !== null) {
                            nodes.splice(ind, 1);
                        }
                    }
                }
            }
            // now nodes and links contain all nodes and links we have to render
            // we now need to generate baseNodes and baseLinks
            let instanceToIds = {}; // used to map instance subjects to their node ids
            let baseNodes = [];
            for (let node of nodes) {
                let info = await getInstanceInfo(window.activeRepoURI, shortenWithPrefix(node.subject));
                let type = null;
                let label = null;
                let label_predicate = null;
                if (node.node_type !== null) {
                    type = node.node_type;
                } else {
                    // missing node type, need to fetch from repo
                    type = info.find(po => shortenWithPrefix(po.p.value) === "rdf:type").o.value;
                    type = shortenWithPrefix(type);
                }
                // TODO: fix bug here
                // if (this.getNodeStyle(type).nodeLabelPredicate) {
                //     // label predicate is set, find literal from info
                //     let labelPO = info.find(po => shortenWithPrefix(po.p.value) === this.getNodeStyle(type).nodeLabelPredicate);
                //     label = labelPO.o.value;
                //     label_predicate = this.getNodeStyle(type).nodeLabelPredicate;
                // } else {
                    // label predicate is not set, find first literal from info
                    let labelPO = info.find(po => po.o.type === "literal");
                    label = labelPO.o.value;
                    label_predicate = shortenWithPrefix(labelPO.p.value);
                // }
                let id = uuidv4();
                instanceToIds[node.subject] = id;
                baseNodes.push({
                    id: id,
                    subject: node.subject,
                    node_type: type,
                    label: label,
                    label_predicate: label_predicate,
                    event_id: node.event_id
                });
            }
            let baseLinks = [];
            for (let link of links) {
                baseLinks.push({
                    source: instanceToIds[link.subject],
                    target: instanceToIds[link.object],
                    link_type: link.relation,
                    event_id: link.event_id,
                    value: 0.2
                });
            }
            // console.log("Finished computing event nodes and links");
            // console.log("baseNodes are");
            // console.log(baseNodes);
            // console.log("baseLinks are");
            // console.log(baseLinks);
            resolve({
                nodes: baseNodes,
                links: baseLinks
            });
        });
    }

    addCompressionStatusBar() {
        if (!this.isTemplate()) {
            this.contentContainer
                .append("div")
                .classed("compressionStatusBar", true)
                .classed("invisible", !this.options.isDisplayingCompressionStats)
                .classed("hx-flag-typography compression-status-bar", true);
        }
    }

    addGraphResolutionUI() {
        let self = this;
        if (!this.isTemplate() && this.contentContainer) {
            let spinnerContainer = this.contentContainer
                .append("div")
                .classed("resolution_spinner_container", true)
                .classed("invisible", !this.options.isDisplayingGraphZoom);
            spinnerContainer
                .append("label")
                .attr("for", this.id + "_compression_toggle")
                .text("Event Depth: " + self.compressionC);
            let resolutionSpinner = spinnerContainer
                .append("input")
                .attr("id", this.id + "_compression_toggle")
                .classed("compression-toggle", true)
                .attr("type", "range")
                .attr("min", "1")
                .attr("value", "1")
                .attr("max", "13")
                .attr("step", "1")
                .attr("title", "Max History Depth");
            resolutionSpinner.on("input", function() {
                self.resolutionStream.next(this.value);
            });
        }
    }

    setupSimulation() {
        const self = this;
        // setting up simulation forces
        this.centerForce = d3.forceCenter(0, 0);
        this.collisionForce = d3.forceCollide(MIN_RADIUS).strength(1);
        this.simulation = d3.forceSimulation()
            .force("center", this.centerForce)
            .force("collision", this.collisionForce)
            .force("x", d3.forceX().x(function (d) {
                if (isLabelNode(d)) {
                    return d.x;
                }
                // if (self.clusters[d.node_type] && d.id === self.clusters[d.node_type].id) {
                //     // where to direct cluster node > to cluster starting position which
                //     // is fixed and set on a circle around center depending on how many
                //     // type are visualized at a time
                return getClusterStartingPosition(d.node_type, self).x;
                // } else {
                //     // where to direct other nodes > towards their cluster node
                //     return self.clusters[d.node_type] ? self.clusters[d.node_type].x : 0;
                // }
            }))
            .force("y", d3.forceY().y(function (d) {
                if (isLabelNode(d)) {
                    return d.y;
                }
                // if (self.clusters[d.node_type] && d.id === self.clusters[d.node_type].id) {
                //     // where to direct cluster node > to cluster starting position which
                //     // is fixed and set on a circle around center depending on how many
                //     // type are visualized at a time
                return getClusterStartingPosition(d.node_type, self).y;
                // } else {
                //     // where to direct other nodes > towards their cluster node
                //     return self.clusters[d.node_type] ? self.clusters[d.node_type].y : 0;
                // }
            }));
    }

    // Move node d to be adjacent to its cluster node.
    // see https://bl.ocks.org/mbostock/7881887
    cluster(alpha) {
        const self = this;
        return function(d) {
            if (self.isTemplate()) return; // no cluster forces in template graph
            // as there are no clusters
            if (d.pinned || d.isBeingMoved) return;
            if (isLabelNode(d)) {
                return;
            }
            // var cluster = self.clusters[d.node_type];
            // if (!cluster) return;
            // if (cluster.id === d.id) return;
            let cluster = getClusterStartingPosition(d.node_type, self);
            var x = d.x - cluster.x,
            y = d.y - cluster.y,
            l = Math.sqrt(x * x + y * y),
            r = d.radius;// + cluster.radius;
            if (l != r) {
                l = (l - r) / l * alpha;
                d.x -= x *= l;
                d.y -= y *= l;
                // if (cluster.isBeingMoved || cluster.pinned) return;
                // cluster.x += x;
                // cluster.y += y;
            }
        };
    }

    getLinkCount(source, target) {
        // given two nodes, returns number of label nodes with them being the
        // endpoints
        return this.nodes.filter(n => {
            if (!isLabelNode(n)) return false;
            let sid = n.source_node;
            let tid = n.target_node;
            if (sid === source.id) {
                return tid === target.id;
            } else {
                if (sid === target.id) {
                    return tid === source.id;
                }
            }
            return false;
        }).length;
    }

    applyEdgeForces(alpha, beta) {
        const self = this;
        return function(d) {
            if (d.pinned || d.isBeingMoved) return;
            if (isLabelNode(d)) {
                // move label node towards the center of edge nodes
                // this ensures our edges are more or less straight lines
                let source = self.getNodeById(d.source_node);
                let target = self.getNodeById(d.target_node);
                let thisNode = self.getNodeById(d.id);
                if (!source || !target) return;
                let pairIdCandidate1 = d.source_node + "-" + d.target_node;
                let pairIdCandidate2 = d.target_node + "-" + d.source_node;
                let pairId;
                if (!self.linkPairToVisitedHotspotMapping[pairIdCandidate1] &&
                    !self.linkPairToVisitedHotspotMapping[pairIdCandidate2]) {
                    pairId = pairIdCandidate1;
                    self.linkPairToVisitedHotspotMapping[pairId] = [];
                } else {
                    if (self.linkPairToVisitedHotspotMapping[pairIdCandidate1]) {
                        pairId = pairIdCandidate1;
                    } else {
                        pairId = pairIdCandidate2;
                        let tmp = JSON.stringify(source);
                        source = JSON.parse(JSON.stringify(target));
                        target = JSON.parse(tmp);
                    }
                }
                let h = null;
                if (thisNode.hasHotspotTarget) {
                    let hotspots = getLinkLabelHotspots(
                        source, target,
                        self.getLinkCount(source, target),
                    );
                    h = hotspots[thisNode.hotspot_id];
                } else {
                    let h_info = getFarthestAvailableHotspot(
                        source, target, d,
                        self.getLinkCount(source, target),
                        self.linkPairToVisitedHotspotMapping[pairId]
                    );
                    // TODO: consider when not farthest is unavailable
                    if (!h_info) return;
                    h = h_info.p;
                    thisNode.hasHotspotTarget = true;
                    thisNode.hotspot_id = h_info.hotspot_id;
                    self.linkPairToVisitedHotspotMapping[pairId].push(thisNode.hotspot_id);
                }
                if (h) {
                    let dx = d.x - h.x;
                    let dy = d.y - h.y;
                    d.x -= dx * alpha;
                    d.y -= dy * alpha;
                } else {
                    console.log("hotspot is null");
                }
            } else {
                // move non-label nodes towards centroid of their label nodes
                let nghs = getNeighbors(d, self.links);
                nghs = nghs
                    .filter(node_id => node_id !== d.id)
                    .map(node_id => self.getNodeById(node_id));
                if (nghs.length) {
                    let cx = nghs.map(n => n ? n.x : 0).reduce((x,y) => x+y, 0)/nghs.length;
                    let cy = nghs.map(n => n ? n.y : 0).reduce((x,y) => x+y, 0)/nghs.length;
                    let dx = d.x - cx;
                    let dy = d.y - cy;
                    d.x -= dx * beta;
                    d.y -= dy * beta;
                }
            }
        };
    }

    // applyStationaryForce(alpha) {
    //     const self = this;
    //     return function(d) {
    //         if (d.pinned || d.isBeingMoved) return;
    //         // only applied to real nodes, forces them to their existing position
    //         if (!isLabelNode(d)) {
    //             // move label node towards the center of edge nodes
    //             // this ensures our edges are more or less straight lines
    //             if (d.px) {
    //                 d.px = d.x; // remember current x for next tick
    //                 let dx = d.x - d.px;
    //                 d.x -= dx * alpha;
    //             } else {
    //                 d.px = d.x;
    //             }
    //             if (d.py) {
    //                 d.py = d.y; // remember current y for next tick
    //                 let dy = d.y - d.py;
    //                 d.y -= dy * alpha;
    //             } else {
    //                 d.py = d.y;
    //             }
    //         }
    //     };
    // }

    setupDrag() {
        const self = this;
        self.drag = () => {
            function dragstarted(d) {
                // console.log("drag started");
                let _m = d3.mouse(this); // TODO:
                let dist = getDistance({ x: _m[0], y: _m[1]}, { x: 0, y: 0 });
                if (dist < d.innerRadius*self.NODE_MOVE_AREA_WEIGHT) { // TODO:
                    // inside move region > drag and move
                    d.isBeingMoved = true;
                    d.fx = d.x;
                    d.fy = d.y;
                    self.movingElementStream.next(true);
                } else {
                    self.movingElementStream.next(false);
                    // inside region where add edge indicators are visible
                    d.isBeingMoved = false;
                    self.nodeAddingEdgeStream.next({
                        edge_started: true,
                        source: d
                    });
                    // TODO: fix, currently defocuses nodes when making template changes
                    // defocusInvalidNodesOnEdgeDrag(d, self.nodes);
                }
                if (!d3.event.active && !self.isSimulationPaused) self.simulation.alphaTarget(0.1).restart();
            }
            function dragged(d) {
                // NOTE: 'mouseover' event only gets triggered on the top-most element when two elements are painted one over top of each other
                // Here we make sure mouse move also works during a node drag
                self.globalSvgMouseMoveStream.next({e: d3.event.sourceEvent, m: d3.mouse(this.parentNode)});
                if (d.isBeingMoved) {
                    self.movingElementStream.next(true);
                    let dx = d3.event.x - d.fx;
                    let dy = d3.event.y - d.fy;
                    d.fx = d3.event.x;
                    d.fy = d3.event.y;
                }
            }
            function dragended(d) {
                self.movingElementStream.next(false);
                if (d.isBeingMoved) {
                    d.isBeingMoved = false;
                    if (!d.pinned) {
                        d.fx = null;
                        d.fy = null;
                    }
                } else {
                    self.nodeAddingEdgeStream.next({
                        edge_finished: true,
                        source: d
                    });
                    // in case any nodes were defocused, remove the class from them
                    // d3.selectAll("g.node").classed("defocused", false);
                    self.svg.selectAll("g.node").classed("defocused", false); // TODO: make sure this works!
                }
                if (!d3.event.active && !self.isSimulationPaused) self.simulation.alphaTarget(0.1).restart();
            }
            return d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended);
        };
    }

    async addEdgeLabelNodesAndLinks() {
        if (!this.nodes || !this.links) return;
        let newNodes = [];
        let edgeLabelNode;
        let linkId;
        for (let link of this.links) {
            linkId = uuidv4();
            edgeLabelNode = {
                id: uuidv4(),
                // label: link.link_type,
                label: getLinkLabelSync(link.link_type),
                // label: await getPredicateLabel(link.link_type),
                node_type: NodeTypes.EDGE_LABEL_NODE,
                source_node: link.source,
                target_node: link.target,
                link_type: link.link_type,
                link_id: linkId,
                event_id: link.event_id
            };
            // this.clusters[edgeLabelNode.cluster] = edgeLabelNode;
            newNodes.push(edgeLabelNode);
        }
        this.nodes.push(...newNodes);
    }

    updateNodeId(from, to) {
        // will go over baseLinks and nodes to update from to to
        for (let i=0; i<this.baseLinks.length; i++) {
            if (this.baseLinks[i].source === from) {
                this.baseLinks[i].source = to;
            }
            if (this.baseLinks[i].target === from) {
                this.baseLinks[i].target = to;
            }
        }
        for (let i=0; i<this.nodes.length; i++) {
            if (isLabelNode(this.nodes[i])) {
                if (this.nodes[i].source_node === from) {
                    this.nodes[i].source_node = to;
                }
                if (this.nodes[i].target_node === from) {
                    this.nodes[i].target_node = to;
                }
            }
        }
    }

    resetData(resetTemplate = true, skipCompression = false) {
        // TODO: when changing resolution, this initialization causes jumps in
        // edge rendering which should not happen
        this.linkPairToVisitedHotspotMapping = {};
        // NOTE: this object maps a source/target pair to list of hotspot ids
        // visited by their link labels nodes. regardless of how many links are
        // in data for a source/target pair, there is only one entry here if any
        // link between the two exist
        if (!this.isTemplate() && (this.baseLinks === undefined || this.baseNodes === undefined)) {
            return;
        }
        let oldNodes = [];
        for (let node of this.nodes) {
            oldNodes.push(JSON.parse(JSON.stringify(node)));
        }
        this.nodes = [...this.getFilteredBaseNodes()];
        // this.links includes two straigh line edges per link.
        // they are used to setup forces and currently rendered
        this.links = [...this.getFilteredBaseLinks()];
        // actual links (one per edge) that should be rendered as bezier curves
        // given two straigh line segments (this.links)
        this.realLinks = [...this.getFilteredBaseLinks()];
        // addEdgeLabelNodesAndLinks extends this.links
        this.addEdgeLabelNodesAndLinks();
        // this.clusters = {};
        if (!this.isTemplate()) {
            if (!skipCompression) {
                // TODO: need to remove compression logic and replace by new event logic (node styles applied after)
                let compressed = computeSelectedNodesAndLinks(this, this.nodes, this.links, this.compressionC, this.classCount);
                this.cr = compressed;
                this.nodes = [...compressed.nodes];
                this.links = [...compressed.links];
            }
            // check against old nodes and links to copy existing properties
            // TODO: requires updates
            for (let i = 0; i<this.nodes.length; i++) {
                // TODO: improve node comparison logic to make sure it is the same node even if labels matched
                let oldNode = oldNodes.find(n => {
                    if (n.event_id === undefined || this.nodes[i].event_id === undefined) return false;
                    return n.event_id === this.nodes[i].event_id && n.node_type === this.nodes[i].node_type;
                });
                if (oldNode) {
                    // console.log("found match: ", this.nodes[i], oldNode);
                    let outdatedNodeId = this.nodes[i].id;
                    this.nodes[i].x = oldNode.x;
                    this.nodes[i].y = oldNode.y;
                    this.nodes[i].id = oldNode.id;
                    this.nodes[i].radius = oldNode.radius;
                    this.nodes[i].innerRadius = oldNode.innerRadius;
                    // NOTE: here id will change for this node
                    // this means we need to update any labels pointing to this
                    // node id as source or target (also includes label nodes)
                    this.updateNodeId(outdatedNodeId, oldNode.id);
                }
            }
            //
            this.nodes = this.nodes.map(node => {
                if (node.x === undefined) {
                    return this.initNewNode(node);
                }
                return node;
            });
            this.getNodeById = (id) => {
                let ret = this.nodes.find(n => n.id === id);
                // TODO: this logic introduces rendering errors!
                if (ret) {
                    return ret;
                } else {
                    console.log("No matching nodes found for id: " + id);
                    return {
                        x: 0,
                        y: 0
                    };
                }
            };
        } else {
            this.nodes = this.nodes.map(node => this.initNewNode(node));
        }

        if (!this.isTemplate()) {
            this.resetNodeLinkSubscriptions();
        }
        this.updateSimulation();
        if (!this.isTemplate()) {
            // update template graph when base graph is reset
            // TODO: template should only be derived from compressed set of
            // nodes and links and not the entire set of RDF statements
            if (resetTemplate) {
                this.templateNetwork.resetData();
                // applying any style information that is already provided
                this.applyNodeTemplateStyles();
                this.applyLinkTemplateStyles();
            }
        }
    }


    // resetDataWithQuery(query) {
    //     // TODO: update and perhaps disable in template graph
    //     query = query.toLowerCase();
    //     // remember positions from last time
    //     let nodePositions = this.nodes.map(node => {
    //         return {
    //             id: node.id,
    //             x: node.x,
    //             y: node.y,
    //             // NOTE: cluster nodes will have new ids, so we cache more info to track them later
    //             isClustedNode: node.isClustedNode,
    //             clusterType: node.node_type
    //         };
    //     });
    //     // always start with baseNodes since search applies to all nodes within
    //     // clusters as well
    //     this.nodes = [...this.getFilteredBaseNodes()];
    //     this.links = [...this.getFilteredBaseLinks()];
    //     // NOTE: before rendering we need to make sure only to add links with both
    //     // nodes
    //     // TODO: should search preserve entire connected components even if one node
    //     // matches the query? or shall we add that to node control so display connected
    //     // component even after search
    //     this.nodes = this.nodes.filter(node => node.label.toLowerCase().includes(query));
    //     let nodeIds = this.nodes.map(node => node.id);
    //     this.links = this.links.filter(link => {
    //         let targetId = typeof link.target === "object" ? link.target.id : link.target;
    //         let sourceId = typeof link.source === "object" ? link.source.id : link.source;
    //         return nodeIds.includes(targetId) && nodeIds.includes(sourceId);
    //     });
    //     // this.clusterIsolatedNodes();
    //     //
    //     this.clusters = new Array(C);
    //     this.nodes = this.nodes.map(node => {
    //         let ret = this.initNewNode(node);
    //         // check if node already had a position before
    //         if (ret.isClustedNode) {
    //             // check if we had this cluster node before
    //             let lastPosition = nodePositions.find(v => v.isClustedNode && v.clusterType === ret.node_type);
    //             if (lastPosition) {
    //                 ret.x = lastPosition.x;
    //                 ret.y = lastPosition.y;
    //             }
    //         } else {
    //             // check if we had this node before
    //             let lastPosition = nodePositions.find(v => v.id === ret.id);
    //             if (lastPosition) {
    //                 ret.x = lastPosition.x;
    //                 ret.y = lastPosition.y;
    //             }
    //         }
    //         return ret;
    //     });
    //     this.resetNodeLinkSubscriptions();
    //     this.updateSimulation();
    // }

    initNewNode(node, hasPosition = false) {
        let xy;
        if (isLabelNode(node)) {
            node.innerRadius = this.edgeLabelSize;
            node.radius = this.edgeLabelSize;
            if (!hasPosition) {
                // node.x = Math.random(); // TODO: initialize better
                // node.y = Math.random(); // TODO: initialize better
                // TODO: check if any of source/target already exist then initialize
                // close to them and outside bbox
                xy = pushOutsideBbox(
                    Math.random(),
                    Math.random(),
                    this.nodes
                );
                node.x = xy.x;
                node.y = xy.y;
            }
        } else {
            // TODO: can be moved to an initialization stage for all types, but
            // also fine here
            // this.setNodeDefaultStylesIfUndefined(node.node_type);
            // node.cluster = i;
            let rR = this.getNodeRadiusInfo(node);
            // TODO: node radius has to change whenever getNodeWeight changes
            node.innerRadius = rR.r;
            node.radius = rR.R;
            if (!hasPosition) {
                let clusterPosition = getClusterStartingPosition(node.node_type, this);
                // push outside bbox
                xy = pushOutsideBbox(
                    clusterPosition.x + Math.random(),
                    clusterPosition.y + Math.random(),
                    this.nodes.filter(n => n.node_type === node.node_type)
                );
                node.x = xy.x;
                node.y = xy.y;
            }
            // if (!this.clusters[node.node_type] || (rR.r > this.clusters[node.node_type].radius)) this.clusters[node.node_type] = node;
        }
        return node;
    }

    // TODO: needs rework
    // addEdge(u, v) {
    //     // TODO: need to recompute u and v's radiuses and transition to new radiuses
    //     if (!isValidLink(u, v)) {
    //         // hx.alert({
    //         //   title: "This is a warning alert.",
    //         //   body: "Use it to tell users about something that could be a problem, but won\"t block them from doing things yet.",
    //         //   type: "warning",
    //         // });
    //         hx.notifyNegative("This kind of Link is not Allowed!");
    //         return;
    //     }
    //     let type = getLinkType(u, v);
    //     // update active graph
    //     this.links.push({
    //         source: u,
    //         target: v,
    //         link_type: type,
    //         value: 0.2 // TODO
    //     });
    //     // also change base graph
    //     this.baseLinks.push({
    //         source: u,
    //         target: v,
    //         link_type: type,
    //         value: 0.2
    //     });
    //     // unpin both boths (if pinned)
    //     if (u.pinned)
    //         this.nodePinStream.next(u);
    //     if (v.pinned)
    //         this.nodePinStream.next(v);
    //     if (u.isIsolated || v.isIsolated) {
    //         // console.log("clicking cluster toggle...");
    //         // window.toggle = d3.select("text.cluster_toggle");
    //         // add edge to a cluster child, need to collapse cluster
    //         // d3.select("text.cluster_toggle").on("click")();
    //         let clusterNode = this.nodes.find(v => v.isClustedNode && v.isExpanded);
    //         if (clusterNode) {
    //             clusterNode.isExpanded = false;
    //             clusterNode.isDisplayingControls = false;
    //             this.nodePinStream.next(clusterNode);
    //         }
    //     }
    //     // cluster the isolated
    //     this.clusterIsolatedNodes();
    //     this.nodeWeightUpdatedStream.next({
    //         nodes: [u, v],
    //         links: this.links
    //     });
    //     this.resetNodeLinkSubscriptions();
    //     this.updateSimulation();
    // }

    // TODO: needs rework
    // removeEdge(link) {
    //     d3.select("div.cursor-element").classed("show_icon", false);
    //     d3.select("body").classed("disable_cursor", false);
    //     d3.select("i.icon_content").classed("hidden", true);
    //     // console.log("remove edge requested for", link);
    //     let _i1 = this.links.indexOf(this.links.find(l => l.source.id === link.source.id && l.target.id === link.target.id));
    //     let _i2 = this.baseLinks.indexOf(this.baseLinks.find(l => l.source.id === link.source.id && l.target.id === link.target.id));
    //     console.log("removing edge", _i1, _i2);
    //     this.links.splice(_i1, 1);
    //     this.baseLinks.splice(_i2, 1);
    //     // TODO: recompute node weights
    //     this.clusterIsolatedNodes();
    //     this.resetNodeLinkSubscriptions();
    //     this.updateSimulation();
    // }

    limitToNghs(selectedNode) {
        // given a selected node, modifies links and nodes in the graph to contrain
        // it only to immediate neighbourhood of the selected graph
        // TODO: could add as a mode to node controls

        var neighbors = getNeighbors(selectedNode, this.links);
        var newNodes = this.getFilteredBaseNodes().filter(function (node) {
            return neighbors.indexOf(node.id) > -1 || node.level === 1;
        });

        var diff = {
            removed: this.nodes.filter(function (node) { return newNodes.indexOf(node) === -1; }),
            added: newNodes.filter(function (node) { return this.nodes.indexOf(node) === -1; })
        };

        diff.removed.forEach(function (node) { this.nodes.splice(this.nodes.indexOf(node), 1); });
        diff.added.forEach(function (node) { this.nodes.push(node); });

        this.links = this.links.filter(function (link) {
            return link.target.id === selectedNode.id || link.source.id === selectedNode.id;
        });
        this.resetNodeLinkSubscriptions();
    }

    updateEdgeLabelNodes() {
        const self = this;
        this.nodeElements
            .filter(d => isLabelNode(d))
            .select("circle.inner")
            .transition()
            .duration(250)
            .delay(function(d, i) { return i * 5; })
            .attrTween("r", function(d) {
                var i = d3.interpolate(d.innerRadius, self.edgeLabelSize);
                return function(t) { return d.innerRadius = i(t); };
            });
        this.nodeElements
            .filter(d => isLabelNode(d))
            .select("circle.outer")
            .transition()
            .duration(250)
            .delay(function(d, i) { return i * 5; })
            .attrTween("r", function(d) {
                var i = d3.interpolate(d.radius, self.edgeLabelSize);
                return function(t) { return d.radius = i(t); };
            });
        setTimeout(() => {
            for (let node of this.nodes.filter(n => isLabelNode(n))) {
                node.radius = self.edgeLabelSize;
                node.innerRadius = self.edgeLabelSize;
            }
            this.collisionForce
                .radius(d => {
                    return d.radius;// + self.NODE_COLLISION_PADDING / 2.0;
                });
            if (!this.isSimulationPaused)
                this.simulation.alphaTarget(0.1).restart();
            // this.updateSimulation();
        }, 260);
    }

    toggleSimulationPause(shouldPause) {
        if (shouldPause) {
            this.simulation.stop();
        } else {
            this.simulation.alphaTarget(0.1).restart();
        }
        this.isSimulationPaused = shouldPause;
    }

    getEdgeStraightness() {
        if (this.isTemplate()) {
            return this.parent.wEdgeAlpha;
        }
        return this.wEdgeAlpha;
    }

    getEdgeShortness() {
        if (this.isTemplate()) {
            return this.parent.wEdgeBeta;
        }
        return this.wEdgeBeta;
    }

    getClusterGravity() {
        if (this.isTemplate()) {
            return this.parent.wClusterG;
        }
        return this.wClusterG;
    }

    updateSimulation() {
        const self = this;
        self.updateGraph();
        self.simulation
            .nodes(self.nodes)
            .on("tick", () => {
                // apply cluster forces to keep cluster nodes together
                self.nodeElements
                    .each(self.cluster(self.getClusterGravity()));
                self.nodeElements
                    .each(self.applyEdgeForces(self.getEdgeStraightness(), self.getEdgeShortness()));
                // self.nodeElements.each(self.applyStationaryForce(1.8));
                self.nodeElements
                  .attr("transform", d => {
                      // can override positioning here by changing d.x and d.y
                      return ("translate(" + d.x + "," + d.y + ")");
                  });
                // linkElements
                // NOTE: link group paths are associated to only label nodes
                self.linkGroup.selectAll("path")
                    .attr("d", d => {
                        // control point
                        let cx = d.x, cy = d.y;
                        // endpoints
                        let s = self.getNodeById(d.source_node);
                        let x1 = s.x, y1 = s.y;
                        let t = self.getNodeById(d.target_node);
                        let x2 = t.x, y2 = t.y;
                        // check for label direction, we want label to be always on
                        // top, which means we might have to supply the reverse
                        // curve and goes through edge endpoints
                        let isCC = arePointsClockwise(s, d, t);
                        let isMidAbove = isMidPointAboveLine(s, d, t);
                        if ((isCC && isMidAbove) || (!isCC && !isMidAbove)) {
                            x1 = t.x, y1 = t.y;
                            x2 = s.x, y2 = s.y;
                        }
                        // instead of using label node's center as control point,
                        // let's assume the bezier curve has to go through this point
                        // at a time _t
                        // we have P(t) = (1-t^2)*P_0 + 2(1-t)tP_1 + t^2P_2
                        // knowing P_0 and P_2 as endpoint, we compute P_1
                        // we assume _t equals the ratio of first segments's lenth
                        // over the sum of both
                        let d_1 = Math.sqrt(Math.pow(x1-cx, 2) + Math.pow(y1-cy, 2));
                        let d_2 = Math.sqrt(Math.pow(x2-cx, 2) + Math.pow(y2-cy, 2));
                        let _t = d_1 / (d_1 + d_2);
                        cx = (cx - (1-_t)*(1-_t)*x1 - _t*_t*x2) / (2*_t*(1-_t));
                        cy = (cy - (1-_t)*(1-_t)*y1 - _t*_t*y2) / (2*_t*(1-_t));
                        // need to remember new control points for computing edge
                        // length later for repositioning label on the curve
                        d._cx = cx;
                        d._cy = cy;
                        return "M " + x1 + "," + y1 + " Q " + cx + "," + cy + " " + x2 + "," + y2;
                    })
                    .each(function (d) {
                        let _this = d3.select(this);
                        _this.classed("link_path" + d.id, true);
                        // first we need to translate text such that we revert
                        // translation from parent node since path data are not
                        // relative!
                        // we also set text offset such that it starts from outside
                        // source node
                        self.nodeGroup
                            .selectAll("text.label_text")
                            .filter(_d => _d.id === d.id)
                            .attr("transform", "translate(" + -d.x + "," + -d.y + ")")
                            .select("textPath")
                            .each(function (_d) {
                                let _self = d3.select(this);
                                // control point
                                let cx = d.x, cy = d.y;
                                // endpoints
                                let s = self.getNodeById(d.source_node);
                                let x1 = s.x, y1 = s.y;
                                let t = self.getNodeById(d.target_node);
                                let x2 = t.x, y2 = t.y;
                                let edgeCtrlP = {
                                    x: d._cx ? d._cx: d.x,
                                    y: d._cy ? d._cy: d.y,
                                };
                                let edgeLength, L, d_1, d_2, _t;
                                // check for label direction, we want label to be always on
                                // top, which means we might have to supply the reverse
                                // curve and goes through edge endpoints
                                let isCC = arePointsClockwise(s, d, t);
                                let isMidAbove = isMidPointAboveLine(s, d, t);
                                if ((isCC && isMidAbove) || (!isCC && !isMidAbove)) {
                                    x1 = t.x, y1 = t.y;
                                    x2 = s.x, y2 = s.y;
                                    edgeLength = getBezierLengthTillT(1, t, edgeCtrlP, s);
                                    d_1 = Math.sqrt(Math.pow(x1-cx, 2) + Math.pow(y1-cy, 2));
                                    d_2 = Math.sqrt(Math.pow(x2-cx, 2) + Math.pow(y2-cy, 2));
                                    _t = d_1 / (d_1 + d_2);
                                    L = getBezierLengthTillT(_t, t, edgeCtrlP, s);
                                } else {
                                    edgeLength = getBezierLengthTillT(1, s, edgeCtrlP, t);
                                    d_1 = Math.sqrt(Math.pow(x1-cx, 2) + Math.pow(y1-cy, 2));
                                    d_2 = Math.sqrt(Math.pow(x2-cx, 2) + Math.pow(y2-cy, 2));
                                    _t = d_1 / (d_1 + d_2);
                                    L = getBezierLengthTillT(_t, s, edgeCtrlP, t);
                                }
                                _self.text(d.label); // resetting the text first
                                var textLength = _self.node().getComputedTextLength(),
                                    text = _self.text();
                                // here we make sure edge has enough space to show the label,
                                // if not we shrink the label
                                while (textLength > (edgeLength - s.radius - t.radius) && text.length > 0) {
                                    text = text.slice(0, -1);
                                    _self.text(text + '...');
                                    textLength = _self.node().getComputedTextLength();
                                };
                                // we set offset such that label is rendered centered
                                // around label node's center on the curve. this makes
                                // hovering the label text also hover the label node
                                _self.attr("startOffset", L - textLength/2.);
                            });
                        // now we simply apply path data we computed above
                        self.defGroup
                            .selectAll("path.label_path")
                            .filter(_d => _d.id === d.id)
                            .attr("d", _this.attr("d"));
                    });
                // nodeLabelPathElements.attr("d", d => getCirclePathData(d.innerRadius));
                self.simulationTickStream.next({
                    nodes: self.nodes
                });
                // console.log("ticked");
            });
        self.collisionForce
            .radius(d => {
                return d.radius;
                // NOTE: makes sure distance between any two nodes with radiuses r1
                // and r2 is r1 + r2
            });
        if (!self.isSimulationPaused)
            self.simulation.alphaTarget(0.1).restart();
        // console.log("updated simulation...");
    }

    updateGraph() {
        const thisVis = this;
        // links
        // TODO: has to filter those links which are set to be hidden
        thisVis.linkCurveElements = thisVis.linkGroup
            .selectAll("path")
            .data(thisVis.nodes.filter(n => isLabelNode(n)), n => n.id);
        thisVis.linkCurveElements.exit().remove();
        let linkCurveEnter = thisVis.linkCurveElements
            .enter()
            .append("path")
            .classed("edge-path link", true);
        thisVis.linkCurveElements = linkCurveEnter.merge(thisVis.linkCurveElements);
        // label text paths (initial paths for rendering node/link labels)
        thisVis.nodeLabelPathElements = thisVis.defGroup
            .selectAll("path")
            .data(thisVis.nodes, n => n.id);
        thisVis.nodeLabelPathElements.exit().remove();
        let nodePathEnter = thisVis.nodeLabelPathElements
            .enter()
            .append("path")
            .classed("label_path", true)
            .attr("id", d => "textPathFor" + d.id);
        thisVis.nodeLabelPathElements = nodePathEnter.merge(thisVis.nodeLabelPathElements);
        ///////////////////////////////////////////
        // nodes
        thisVis.nodeElements = thisVis.nodeGroup
            .selectAll("g")
            .data(thisVis.nodes, n => n.id);
        thisVis.nodeElements.exit().remove();
        let nodeEnter = thisVis.nodeElements
            .enter()
            .append("g")
            .classed("node", true)
            .call(thisVis.drag());
        // node icon
        nodeEnter
            .append("text")
            .classed("has_icon", d => !isLabelNode(d))
            .classed("label_text", d => isLabelNode(d))
            .each(function (d) {
                let self = d3.select(this);
                if (isLabelNode(d)) {
                    // TODO: need to check if there's a custom label for this relation
                    // self.append("textPath")
                    //     .attr("startOffset", "0")
                    //     .attr("href", "#textPathFor" + d.id)
                    //     .text(d => d.label);
                    self.append("textPath")
                        .attr("startOffset", "0")
                        .attr("href", "#textPathFor" + d.id)
                        .text(d => getLinkLabelSync(d.label));

                    // label node's text should be along the bezier curve and centered
                    let linkPath = thisVis.linkGroup.select("path.link_path" + d.id);
                    if (!linkPath.empty()) {
                        thisVis.defGroup
                            .selectAll("path.label_path")
                            .filter(_d => _d.id === d.id)
                            .attr("d", linkPath.attr("d"));
                    }
                    // checking link label visibility
                    let sourceType = thisVis.getNodeById(d.source_node).node_type;
                    let targetType = thisVis.getNodeById(d.target_node).node_type;
                    let relation = d.link_type;
                    thisVis.setLinkDefaultStyleIfUndefined(
                        sourceType,
                        targetType,
                        relation
                    );
                    let style = thisVis.getLinkStyle(
                        sourceType,
                        targetType,
                        relation
                    );
                    self.classed(
                        "hidden",
                        !style.style.isLinkLabelVisible
                    );
                } else {
                    // set proper icon
                    self.text(
                        getIconText(thisVis.getNodeStyle(d.node_type).nodeIconName)
                    );
                    // set icon visibility
                    self.classed(
                        "hidden",
                        !thisVis.getNodeStyle(d.node_type).isNodeIconVisible
                    );
                    // set icon color
                    self.style(
                        "fill",
                        thisVis.getNodeStyle(d.node_type).nodeIconColor
                    );
                    // set icon size
                    self.style(
                        "font-size",
                        thisVis.getNodeStyle(d.node_type).nodeIconSize + "px"
                    );
                    //
                    self.on("click", function (_d) {
                        if (thisVis.isTemplate()) {
                            thisVis.parent.templateNodeSelectStream.next({
                                node: d,
                                event: d3.event,
                                isIcon: true
                            });
                        }
                    });
                }
            });
        // node label
        nodeEnter
            .filter(d => !isLabelNode(d))
            .append("text")
            .classed("label_text", true)
            // .attr("filter", "url(#solid)")
            .classed("hidden", d => {
                // not ever completely invisible in template graph
                if (thisVis.isTemplate()) {
                    return false;
                }
                return !thisVis.getNodeStyle(d.node_type).isNodeLabelVisible;
            })
            .classed("deactive", d => {
                // node label visibility in template (less opacity)
                if (!thisVis.isTemplate()) {
                    return false;
                }
                return !thisVis.getNodeStyle(d.node_type).isNodeLabelVisible;
            })
            .each(function (d) {
                let self = d3.select(this);
                let _textPath = self.append("textPath")
                    .attr("startOffset", "0")
                    .attr("href", d => "#textPathFor" + d.id)
                    .text(d => d.label); // TODO: check if label is set from selected predicate
                // here we make sure if text length exceeds circumference of the
                // path it is being rendered o8n, we cut it from the end and add
                // ellipsis in the end
                let rR = thisVis.getNodeRadiusInfo(d);
                let nodeCircumference = 2 * Math.PI * (rR.r + NODE_LABEL_PADDING);
                let padding = NODE_LABEL_PADDING;
                var textLength = _textPath.node().getComputedTextLength(),
                    text = _textPath.text();
                while (textLength > (nodeCircumference - 2 * padding) && text.length > 0) {
                    text = text.slice(0, -1);
                    _textPath.text(text + '...');
                    textLength = _textPath.node().getComputedTextLength();
                };
                // here we update text paths such that text is centered around node's
                // topmost point (and text path start is contrained in [left most point, top most point]
                // so that at least the beginning becomes closer to being rendered
                // on a straight line (more readable)
                thisVis.defGroup
                    .selectAll("path.label_path")
                    .filter(_d => _d.id === d.id)
                    .attr("d", getCirclePathDataCenteredAroundTop(rR.r, textLength/2.));
            });
        // how to render non-cluster nodes
        let regularNodes = nodeEnter.filter(function (d) { return !d.isClustedNode; });
        regularNodes
            .append("circle")
            .lower() // will place an element as the first child of its parent
            .attr("cx", 0)
            .attr("cy", 0)
            .attr("class", d => getNodeClass(d.node_type) + " inner")
            .transition()
            .duration(250)
            .delay(function(d, i) { return i * 5; })
            .attrTween("r", function(d) {
                var i = d3.interpolate(0, d.innerRadius);
                return function(t) { return d.innerRadius = i(t); };
            });
            // this delayed transition is important as it stabilizes initial
            // positioning by reducing node collision chance.
            // for more info see https://bl.ocks.org/mbostock/7881887
        regularNodes
            .select("circle.inner")
            .on("mouseover", function (d) {
                // update node size if necessary
                // if (getNodeSize(d.node_type) < d.boundingSize) {
                //     // d.collisionRadius = d.boundingSize;
                //     // d3.select(this)
                //     //     .transition()
                //     //     .ease(d3.easeCircle)
                //     //     .attr("r", d.boundingSize)
                //     //     .duration(200);
                //     // updateSimulation();
                // }
            })
            .on("mouseout", function (d) {
                thisVis.nodeMoveAreaVisitStream.next({
                    node: d,
                    exit: true
                });
            })
            .on("mousemove", function (d) {
                let _m = d3.mouse(this);
                let dist = getDistance({ x: _m[0], y: _m[1]}, { x: 0, y: 0 });
                if (dist < d.innerRadius*thisVis.NODE_MOVE_AREA_WEIGHT) {
                    thisVis.nodeMoveAreaVisitStream.next({
                        node: d,
                        enter: true
                    });
                } else {
                    thisVis.nodeMoveAreaVisitStream.next({
                        node: d,
                        exit: true
                    });
                }
            })
            .on("click", function (d) {
                if (thisVis.isTemplate()) {
                    thisVis.parent.templateNodeSelectStream.next({
                        node: d,
                        event: d3.event,
                        isLabelNode: isLabelNode(d)
                    });
                }
            })
            .each(function (d) {
                if (isLabelNode(d)) return;
                let self = d3.select(this);
                // node stroke visibility
                self.style(
                    "stroke-opacity",
                    thisVis.getNodeStyle(d.node_type).isNodeStrokeVisible ? 1 : 0
                );
                // node shape
                self.classed(
                    "invisible",
                    !thisVis.getNodeStyle(d.node_type).isNodeCircle
                );
                // node color
                self.style(
                    "fill",
                    thisVis.getNodeStyle(d.node_type).nodeColor
                );
                // node stroke size
                self.style(
                    "stroke-width",
                    thisVis.getNodeStyle(d.node_type).nodeStrokeSize + "px"
                );
                // node stroke shape
                let strokeDashArray = 0;
                if (thisVis.getNodeStyle(d.node_type).nodeStrokeShape === "dashed") {
                    strokeDashArray = thisVis.getNodeStyle(d.node_type).nodeStrokeSize * NOTE_STROKE_DASH_MULTIPLIER;
                }
                self.style(
                    "stroke-dasharray",
                    strokeDashArray
                );
                // node stroke color
                self.style(
                    "stroke",
                    thisVis.getNodeStyle(d.node_type).nodeStrokeColor
                );
            });
        regularNodes
            .append("circle")
            .lower() // will place an element as the first child of its parent
            .attr("cx", 0)
            .attr("cy", 0)
            .attr("class", d => {
                let extra = " outer hidden_circle";
                return getNodeClass(d.node_type) + extra;
            })
            .transition()
            .duration(250)
            .delay(function(d, i) { return i * 5; })
            .attrTween("r", function(d) {
                var i = d3.interpolate(0, d.radius);
                return function(t) { return d.radius = i(t); };
            });
        regularNodes
            .append("rect")
            .lower() // will place an element as the first child of its parent
            .attr("x", d => -d.innerRadius)
            .attr("y", d => -d.innerRadius)
            .attr("class", d => {
                let extra = " inner invisible";
                return getNodeClass(d.node_type) + extra;
            })
            .attr("width", d => d.innerRadius*2)
            .attr("height", d => d.innerRadius*2)
            .each(function (d) {
                if (isLabelNode(d)) return;
                let self = d3.select(this);
                // node stroke visibility
                self.style(
                    "stroke-opacity",
                    thisVis.getNodeStyle(d.node_type).isNodeStrokeVisible ? 1 : 0
                );
                // node shape
                self.classed(
                    "invisible",
                    thisVis.getNodeStyle(d.node_type).isNodeCircle
                );
                // node color
                self.style(
                    "fill",
                    thisVis.getNodeStyle(d.node_type).nodeColor
                );
                // node stroke size
                self.style(
                    "stroke-width",
                    thisVis.getNodeStyle(d.node_type).nodeStrokeSize + "px"
                );
                // node stroke shape
                let strokeDashArray = 0;
                if (thisVis.getNodeStyle(d.node_type).nodeStrokeShape === "dashed") {
                    strokeDashArray = thisVis.getNodeStyle(d.node_type).nodeStrokeSize * NOTE_STROKE_DASH_MULTIPLIER;
                }
                self.style(
                    "stroke-dasharray",
                    strokeDashArray
                );
                // node stroke color
                self.style(
                    "stroke",
                    thisVis.getNodeStyle(d.node_type).nodeStrokeColor
                );
            });
        regularNodes
            .select("circle.outer")
            .on("click", function (d) {
                if (thisVis.isTemplate()) {
                    thisVis.parent.templateNodeSelectStream.next({
                        node: d,
                        event: d3.event,
                        isLabelNode: isLabelNode(d)
                    });
                }
            });
            // .transition()
            // .duration(250)
            // .delay(function(d, i) { return i * 5; })
            // .attrTween("width", function(d) {
            //     var i = d3.interpolate(0, d.radius*2);
            //     return function(t) { return d.size = i(t); };
            // })
            // .transition()
            // .duration(250)
            // .delay(function(d, i) { return i * 5; })
            // .attrTween("height", function(d) {
            //     var i = d3.interpolate(0, d.radius*2);
            //     return function(t) { return d.size = i(t); };
            // });
        // adding neighbour highlighting for selected node
        // NOTE: click and dblclick from d3 won't work for us as dbl click also fires
        // on clicks. we can either switch our UI behaviour or use rxjs buffer to
        // create a reliable dblclick only stream separated from click
        nodeEnter.on("dblclick", function (selectedNode) {
            d3.event.stopPropagation(); // prevents deselectAll
            if (thisVis.isTemplate()) {
                return;
            }
            thisVis.nodeSelectionStream.next(selectedNode);
            // also hide controls
            selectedNode.isDisplayingControls = false;
            thisVis.nodeControlsToggleStream.next({
                node: selectedNode
            });
            //
            window.instanceSelectStream.next({
                subject: selectedNode.subject,
                type: selectedNode.node_type,
                selectSource: "graph"
            });
            window.instanceInfoSidebar.show();
        });
        nodeEnter.on("click", function (d, i) {
            d3.event.preventDefault();
            if (thisVis.isTemplate()) {
                return;
            }
            d.isDisplayingControls = !d.isDisplayingControls;
            thisVis.nodeControlsToggleStream.next({
                node: d
            });
            //
            window.instanceSelectStream.next({
                subject: d.subject,
                type: d.node_type,
                selectSource: "graph"
            });
        });
        thisVis.nodeElements = nodeEnter.merge(thisVis.nodeElements);
        // thisVis.resetNodeLabelPlacements();
    }

    deselectAll() {
        console.log("deselct all ", this.NETWORK_TYPE);
        this.nodeSelectionStream.next(null);
        if (this.isTemplate()) {
            // hideAllTemplateCtxt();
            // TODO: need to hide all ctxt but display if
            // a node is actually selected
        }
        // also hide controls TODO
        // nodes[0].isDisplayingControls = false;
        // nodeControlsToggleStream.next({
        //     node: nodes[0]
        // });
    }

    setupDocumentEventListeners() {
        const self = this;
        document.addEventListener("click", function() {
            self.deselectAll();
        });

        document.addEventListener("DOMContentLoaded", () => {
            //self.resolutionStream.next(1);
            // self.resetData();
        });

        // document.getElementById("search_input").addEventListener("input", function(ev) {
        //     // console.log("changed search:", this.value);
        //     // TODO: update rendering based on this.value (without affecting it too much)
        //     // NOTES:
        //     // 1. need to remember position of all nodes before input change
        //     // 2. need to filter nodes based on query
        //     // 3. still need to cluster nodes
        //     // 4. remaning nodes will be added at their original position to the graph
        //     if (this.value) {
        //         self.resetDataWithQuery(this.value);
        //     } else {
        //         self.resetData();
        //     }
        // });

        // document.getElementById("search_input").addEventListener("keyup", function(ev) {
        //     if (ev.key === "Escape") {
        //         this.value = "";
        //         // TODO: reset without affecting rendering too much
        //         self.resetData();
        //     }
        // });
    }

    setupTemplateEditTools() {
        // TODO: need to init styles for all node types in repo i.e. every class
        // which appears in template
        let self = this;
        this.isShowingTemplateCtxt = false;
        this.templateNodeSelectStream = new Subject();
        this.templateNodeSelectStream.subscribe({
            next: (payload) => {
                if (self.isShowingTemplateCtxt) {
                    hideAllTemplateCtxt();
                    self.isShowingTemplateCtxt = false;
                    self.templateNetwork.toggleSimulationPause(false);
                    return;
                }
                window.networkBeingModified = self.id;
                // payload has node, event, and optionally isIcon, isEdgeLabel
                let type, ctxt;
                if (payload.isIcon) {
                    // selected a node icon
                    type = payload.node.node_type;
                    window.objectBeingStyled = type;
                    ctxt = "node-template-icon-select-container";
                    self.colorChangingPart = "icon";
                    // update ctxt before display to reflect this state
                    // self.setNodeDefaultStylesIfUndefined(type);
                    setNodeIconVisibility(
                        self.getNodeStyle(type).isNodeIconVisible
                    );
                    setNodeIconColor(
                        self.getNodeStyle(type).nodeIconColor
                    );
                    setNodeIconSize(
                        self.getNodeStyle(type).nodeIconSize
                    );
                    setNodeIcon(
                        self.getNodeStyle(type).nodeIconName
                    );
                } else if (payload.isLabelNode) {
                    // selected edge
                    self.colorChangingPart = "edge";
                    // type = payload.node.link_type;
                    ctxt = "edge-template-select-container";
                    // window.selectedLinkSourceType = self.templateNetwork.getNodeById(payload.node.source_node).node_type;
                    // window.selectedLinkTargetType = self.templateNetwork.getNodeById(payload.node.target_node).node_type;
                    // window.selectedLinkRelation = payload.node.link_type;
                    self.setLinkDefaultStyleIfUndefined(
                        window.selectedLinkSourceType,
                        window.selectedLinkTargetType,
                        window.selectedLinkRelation
                    );
                    let linkStyle = self.getLinkStyle(
                        window.selectedLinkSourceType,
                        window.selectedLinkTargetType,
                        window.selectedLinkRelation
                    );
                    setEdgeLabelVisibility(linkStyle.style.isLinkLabelVisible);
                    setEdgeVisibility(linkStyle.style.isLinkVisible);
                } else {
                    // selected a node
                    type = payload.node.node_type;
                    window.objectBeingStyled = type;
                    ctxt = "node-template-select-container";
                    self.colorChangingPart = "shape";
                    let selectedLabelPredicate = null;
                    // update ctxt before display to reflect this state
                    // self.setNodeDefaultStylesIfUndefined(type);
                    setNodeLabelVisibility(
                        self.getNodeStyle(type).isNodeLabelVisible
                    );
                    setNodeShapeSelection(
                        self.getNodeStyle(type).isNodeCircle
                    );
                    setNodeSelectedColor(
                        self.getNodeStyle(type).nodeColor
                    );
                    setNodeStrokeVisibility(
                        self.getNodeStyle(type).isNodeStrokeVisible
                    );
                    setNodeStrokeStylePreview(
                        self.getNodeStyle(type).nodeStrokeShape
                    );
                    setNodeSelectedStrokeColor(
                        self.getNodeStyle(type).nodeStrokeColor
                    );
                    setNodeSelectedStrokeSize(
                        self.getNodeStyle(type).nodeStrokeSize
                    );
                    setNodeSelectedSize(
                        self.getNodeStyle(type).nodeSize
                    );
                    setNodeSelectedVisibility(
                        self.getNodeStyle(type).isNodeVisible
                    );
                    if (self.getNodeStyle(type).nodeLabelPredicate !== undefined) {
                        selectedLabelPredicate = self.getNodeStyle(type).nodeLabelPredicate;
                    }
                    //
                    getTypeLiteralPredicates(
                        window.activeRepoURI,
                        type
                    ).then(predicates => {
                        predicates = predicates.map(p => shortenWithPrefix(p));
                        if (predicates) {
                            initNodeLiteralPicker(
                                predicates,
                                selectedLabelPredicate ? selectedLabelPredicate : predicates[0]
                            );
                        } else {
                            console.log("query return no literal predicates for " + type);
                        }
                    });
                }
                hideAllTemplateCtxt();
                d3.select("." + ctxt).classed("invisible", false);
                // placing ctxt menu next to cursor
                let ctxtElement = document.getElementById(ctxt);
                d3.select(ctxtElement)
                    .style("left", payload.event.clientX + "px")
                    .style("top", payload.event.clientY + "px");
                self.isShowingTemplateCtxt = true;
                self.templateNetwork.toggleSimulationPause(true);
            }
        });
    }
    ///////////////////////////////////
    //// Icon Settings
    setIconVisibilityForEntity(type, isVisible) {
        // apply style
        this.nodeGroup
            .selectAll("text.has_icon")
            .filter(n => n.node_type === type)
            .classed("hidden", !isVisible);
        // display icon in template graph with less opacity
        this.templateNetwork.nodeGroup
            .selectAll("text.has_icon")
            .filter(n => n.node_type === type)
            .classed("deactive", !isVisible);
        // store decision
        this.nodeStyles[type].isNodeIconVisible = isVisible;
    }

    setIconColorForEntity(type, clr) {
        this.nodeGroup
            .selectAll("text.has_icon")
            .filter(n => n.node_type === type)
            .style("fill", clr);
        this.templateNetwork.nodeGroup
            .selectAll("text.has_icon")
            .filter(n => n.node_type === type)
            .style("fill", clr);
        // store decision
        this.nodeStyles[type].nodeIconColor = clr;
    }

    setIconSizeForEntity(type, size) {
        this.nodeGroup
            .selectAll("text.has_icon")
            .filter(n => n.node_type === type)
            .style("font-size", size + "px");
        this.templateNetwork.nodeGroup
            .selectAll("text.has_icon")
            .filter(n => n.node_type === type)
            .style("font-size", size + "px");
        // store decision
        this.nodeStyles[type].nodeIconSize = size;
    }

    setIconForEntity(type, iconName) {
        this.nodeGroup
            .selectAll("text.has_icon")
            .filter(n => n.node_type === type)
            .text(getIconText(iconName));
        this.templateNetwork.nodeGroup
            .selectAll("text.has_icon")
            .filter(n => n.node_type === type)
            .text(getIconText(iconName));
        // store decision
        this.nodeStyles[type].nodeIconName = iconName;
    }
    ///////////////////////////////////
    //// Node Settings

    setNodeVisibility(type, isVisible) {
        // store decision
        this.nodeStyles[type].isNodeVisible = isVisible;
        // resetting data uses filtered nodes and links
        // we ask not to reset template graph here as it
        // wont change
        // TODO: template graph should visualize decision e.g.
        // by making hidden nodeßs with less opacity
        this.resetData(false);
    }

    getFilteredBaseNodes() {
        return this.baseNodes.filter(n => {
            // this.setNodeDefaultStylesIfUndefined(n.node_type);
            let nodeStyle = this.getNodeStyle(n.node_type);
            if (nodeStyle) {
                return this.getNodeStyle(n.node_type).isNodeVisible;
            }
            return false;
            // TODO: there are nodes currently in repo with no type info
            // plus a bunch of blank nodes (which also don't have type info)
            // need to address them
        });
    }

    getFilteredBaseLinks() {
        // step 1. remove all links to invisible nodes
        let ret = [];
        let invisNodeIds = this.baseNodes.filter(n => {
            // this.setNodeDefaultStylesIfUndefined(n.node_type);
            let nodeStyle = this.getNodeStyle(n.node_type);
            if (nodeStyle) {
                return !this.getNodeStyle(n.node_type).isNodeVisible;
            }
            return false;
            // TODO: there are nodes currently in repo with no type info
            // plus a bunch of blank nodes (which also don't have type info)
            // need to address them
        }).map(n => n.id);
        ret = this.baseLinks.filter(l => {
            return !invisNodeIds.includes(l.source) &&
                   !invisNodeIds.includes(l.target);
        });
        // step 2. remove all links which are set to be invisible
        ret = ret.filter(l => {
            this.setLinkDefaultStyleIfUndefined(
                this.getNodeById(l.source).node_type,
                this.getNodeById(l.target).node_type,
                l.link_type
            );
            let lstyle = this.getLinkStyle(
                this.getNodeById(l.source).node_type,
                this.getNodeById(l.target).node_type,
                l.link_type
            ).style;
            return lstyle.isLinkVisible;
        });
        return ret;
    }

    setNodeLabelVisibility(type, isVisible) {
        // apply style
        this.nodeGroup
            .selectAll("text.label_text")
            .filter(n => n.node_type === type)
            .classed("hidden", !isVisible);
        // display icon in template graph with less opacity
        this.templateNetwork.nodeGroup
            .selectAll("text.label_text")
            .filter(n => n.node_type === type)
            .classed("deactive", !isVisible);
        // store decision
        this.nodeStyles[type].isNodeLabelVisible = isVisible;
    }

    setNodeLabelProperty(type, predicate) {
        this.nodeStyles[type].nodeLabelPredicate = predicate;
        this.updateNodeLabels(type);
    }

    updateNodeLabels(type) {
        // given a type, sets label on all nodes of this type based on
        // this.nodeStyles[type].nodeLabelPredicate
        // also needs to update rendering of labels (centering)
        if (this.getNodeStyle(type).nodeLabelPredicate === undefined) {
            return;
        }
        let p = this.getNodeStyle(type).nodeLabelPredicate;
        let thisVis = this;
        for (let node of this.baseNodes.filter(n => n.node_type === type)) {
            if (shortenWithPrefix(node.label_predicate) !== p) {
                // if not already using the requested predicate
                getLiteral(
                    window.activeRepoURI,
                    shortenWithPrefix(node.subject),
                    p
                ).then(label => {
                    // updating node label
                    node.label = label;
                    node.label_predicate = p;
                    thisVis.nodeElements.selectAll("textPath")
                        .filter(n => n.id === node.id)
                        .each(function (d) {
                            let rR = thisVis.getNodeRadiusInfo(d);
                            let nodeCircumference = 2 * Math.PI * (rR.r + NODE_LABEL_PADDING);
                            let self = d3.select(this);
                            // self.text(d.label); // resetting the text first
                            self.text(getLinkLabelSync(d.label)); // resetting the text first
                            let textLength = self.node().getComputedTextLength(),
                                text = self.text();
                            while (textLength > (nodeCircumference - 2 * NODE_LABEL_PADDING) && text.length > 0) {
                                text = text.slice(0, -1);
                                self.text(text + '...');
                                textLength = self.node().getComputedTextLength();
                            };
                            thisVis.svg.select("defs")
                                .selectAll("path")
                                .filter(_d => _d.id === d.id)
                                .attr("d", getCirclePathDataCenteredAroundTop(rR.r, textLength/2.));
                        });
                });
            }
        }
    }

    setNodeShape(type, isCircle = true) {
        // if not circle, change all node shapes to square
        // TODO: this should also affect how label is displayed
        for (let graph of [this, this.templateNetwork]) {
            graph.nodeGroup
                .selectAll("circle.inner")
                .filter(n => n.node_type === type)
                .classed("invisible", !isCircle);
            graph.nodeGroup
                .selectAll("rect.inner")
                .filter(n => n.node_type === type)
                .classed("invisible", isCircle);
        }
        // store decision
        this.nodeStyles[type].isNodeCircle = isCircle;
    }

    setNodeColor(type, clr) {
        for (let graph of [this, this.templateNetwork]) {
            graph.nodeGroup
                .selectAll("circle.inner")
                .filter(n => n.node_type === type)
                .style("fill", clr);
            graph.nodeGroup
                .selectAll("rect.inner")
                .filter(n => n.node_type === type)
                .style("fill", clr);
        }
        // store decision
        this.nodeStyles[type].nodeColor = clr;
    }

    getNodeRadiusInfo(node) {
        if (isLabelNode(node)) {
            return {
                r: this.edgeLabelSize,
                R: this.edgeLabelSize + NODE_CONTROLS_AREA_SIZE
            };
        }
        let type = node.node_type;
        let r = Math.min(
            this.getNodeStyle(type).nodeSize,
            MAX_RADIUS
        );
        return {
            r: r, // actual radius used for rendering
            R: r + NODE_CONTROLS_AREA_SIZE // radius used for collision forces
            // we add NODE_CONTROLS_AREA_SIZE so that control are always within node region
        };
    }

    setNodeSize(type, size) {
        // store decision
        this.nodeStyles[type].nodeSize = size;
        // apply size
        let rR = this.getNodeRadiusInfo({
            node_type: type
        });
        // NOTE: this also impact the label rendering since it follows a textpath
        for (let graph of [this, this.templateNetwork]) {
            // updating node radius on inner circle
            graph.nodeGroup.selectAll("circle.inner")
                .filter(n => n.node_type === type)
                .transition()
                .duration(250)
                .delay(function(d, i) { return i * 5; })
                .attrTween("r", function(d) {
                    var i = d3.interpolate(d.innerRadius, rR.r);
                    return function(t) { return d.innerRadius = i(t); };
                });
            graph.nodeGroup.selectAll("rect.inner")
                .filter(n => n.node_type === type)
                .attr("x", d => -rR.r)
                .attr("y", d => -rR.r)
                .attr("width", rR.r*2)
                .attr("height", rR.r*2);
            graph.nodeGroup.selectAll("circle.outer")
                .filter(n => n.node_type === type)
                .transition()
                .duration(250)
                .delay(function(d, i) { return i * 5; })
                .attrTween("r", function(d) {
                    var i = d3.interpolate(d.radius, rR.R);
                    return function(t) { return d.radius = i(t); };
                });
            // updating node label
            graph.nodeGroup
                .selectAll("textPath")
                .filter(d => !isLabelNode(d))
                .filter(n => n.node_type === type)
                .each(function (d) {
                    let nodeCircumference = 2 * Math.PI * (rR.r + NODE_LABEL_PADDING);
                    let self = d3.select(this);
                    self.text(d.label); // resetting the text first
                    let textLength = self.node().getComputedTextLength(),
                        text = self.text();
                    while (textLength > (nodeCircumference - 2 * NODE_LABEL_PADDING) && text.length > 0) {
                        text = text.slice(0, -1);
                        self.text(text + '...');
                        textLength = self.node().getComputedTextLength();
                    };
                    graph.defGroup
                        .selectAll("path.label_path")
                        .filter(_d => _d.id === d.id)
                        .attr("d", getCirclePathDataCenteredAroundTop(rR.r, textLength/2.));
                });
            // make sure simulation params such as collision forces are updated
            graph.updateSimulation();
        }
    }

    setNodeStrokeShape(type, shape) {
        let strokeDashArray = 0; // solid
        if (shape === "dashed") {
            strokeDashArray = this.getNodeStyle(type).nodeStrokeSize * NOTE_STROKE_DASH_MULTIPLIER;
        }
        for (let graph of [this, this.templateNetwork]) {
            graph.nodeGroup
                .selectAll("circle.inner")
                .filter(n => n.node_type === type)
                .style("stroke-dasharray", strokeDashArray);
            graph.nodeGroup
                .selectAll("rect.inner")
                .filter(n => n.node_type === type)
                .style("stroke-dasharray", strokeDashArray);
        }
        // store decision
        this.nodeStyles[type].nodeStrokeShape = shape;
    }

    setNodeStrokeColor(type, clr) {
        for (let graph of [this, this.templateNetwork]) {
            graph.nodeGroup
                .selectAll("circle.inner")
                .filter(n => n.node_type === type)
                .style("stroke", clr);
            graph.nodeGroup
                .selectAll("rect.inner")
                .filter(n => n.node_type === type)
                .style("stroke", clr);
        }
        // store decision
        this.nodeStyles[type].nodeStrokeColor = clr;
    }

    setNodeStrokeSize(type, size) {
        for (let graph of [this, this.templateNetwork]) {
            graph.nodeGroup
                .selectAll("circle.inner")
                .filter(n => n.node_type === type)
                .style("stroke-width", size + "px");
            graph.nodeGroup
                .selectAll("rect.inner")
                .filter(n => n.node_type === type)
                .style("stroke-width", size + "px");
        }
        // store decision
        this.nodeStyles[type].nodeStrokeSize = size;
        // we update dasharray as it relates to stroke size
        this.setNodeStrokeShape(type, this.getNodeStyle(type).nodeStrokeShape);
    }

    setNodeStrokeVisibility(type, isVisible) {
        // apply style
        for (let graph of [this, this.templateNetwork]) {
            graph.nodeGroup
                .selectAll("circle.inner")
                .filter(n => n.node_type === type)
                .style("stroke-opacity", isVisible ? 1 : 0);
            graph.nodeGroup
                .selectAll("rect.inner")
                .filter(n => n.node_type === type)
                .style("stroke-opacity", isVisible ? 1 : 0);
        }
        // store decision
        this.nodeStyles[type].isNodeStrokeVisible = isVisible;
    }
    ///////////////////////////////////
    //// Link Settings
    setLinkVisibility(sourceType, targetType, relation, isVisible) {
        // given a relation between two types (order doesnt matter)
        // toggles visibility of link in base graph
        // TODO: also applies lower opacity to link in template graph
        let styleId = this.getLinkStyleId(sourceType, targetType, relation);
        let existingStyle = this.getLinkStyle(sourceType, targetType, relation);
        if (existingStyle.style === undefined) {
            this.linkStyles[styleId] = {};
        } else {
            styleId = existingStyle.id;
        }
        // store decision
        this.linkStyles[styleId].isLinkVisible = isVisible;
        // apply toggles to data
        // resetting data uses filtered nodes and links
        // we ask not to reset template graph here as it
        // wont change
        // TODO: template graph should visualize decision e.g.
        // by making hidden nodes with less opacity
        this.resetData(false);
    }

    setLinkColor(sourceType, targetType, relation, clr) {
        // TODO
        let styleId = this.getLinkStyleId(sourceType, targetType, relation);
        let existingStyle = this.getLinkStyle(sourceType, targetType, relation);
        let isVisible = true; // default
        if (existingStyle.style === undefined) {
            this.linkStyles[styleId] = {};
        } else {
            styleId = existingStyle.id;
        }
        // store decision
        this.linkStyles[styleId].linkColor = clr;
        // apply color to data
        // need to identify the 2 links associated to this edge among
        // this.links
        let visitedLinkIds = [];
        for (let link of this.links) {
            if (link.link_type !== relation) continue;
            if (visitedLinkIds.includes(link.link_id)) continue;
            let s = this.getNodeById(link.source);
            let t = this.getNodeById(link.target);
            let t1, t2, linkLabelNode;
            if (isLabelNode(s)) {
                // check t type
                t1 = t.node_type;
                linkLabelNode = s;
            } else {
                // check s type
                t1 = s.node_type;
                linkLabelNode = t;
            }
            let pairLink = this.links.find(l => {
                return l.link_id === link.link_id &&
                    l.source !== link.source;
            });
            s = this.getNodeById(pairLink.source);
            t = this.getNodeById(pairLink.target);
            if (isLabelNode(s)) {
                // check t type
                t2 = t.node_type;
            } else {
                // check s type
                t2 = s.node_type;
            }
            // now check if t1,t2 match our source/target
            let lstyleId = this.getLinkStyleId(t1, t2, relation);
            if (lstyleId === styleId) {
                // console.log("found matching");
                // TODO: this is buggy right now
                // both link and pairLink matched > apply style
                this.linkCurveElements
                    .selectAll("path")
                    .filter(n => n.id === linkLabelNode.id)
                    .attr("stroke", clr);
            }
            visitedLinkIds.push(link.link_id);
        }
    }

    setLinkShape(sourceType, targetType, relation, shape) {
        // TODO
    }

    setLinkSize(sourceType, targetType, relation, size) {
        // TODO
    }

    setLinkLabelVisibility(sourceType, targetType, relation, isVisible) {
        let styleId = this.getLinkStyleId(sourceType, targetType, relation);
        let existingStyle = this.getLinkStyle(sourceType, targetType, relation);
        if (existingStyle.style === undefined) {
            this.linkStyles[styleId] = {};
        } else {
            styleId = existingStyle.id;
        }
        // store decision
        this.linkStyles[styleId].isLinkLabelVisible = isVisible;
        // TODO: also need to apply decision to data so that new nodes/edges
        // appearing due to zoom also render with this decision
        // TODO: might need similar changes to node updates.
        // TODO: this also needs to affect new nodes/links added to data
        // apply style to graph
        this.nodeElements.selectAll("text.label_text")
            .filter(n => {
                if (isLabelNode(n)) {
                    let s = n.source_node;
                    let t = n.target_node;
                    let sourceType = this.getNodeById(s).node_type;
                    let targetType = this.getNodeById(t).node_type;
                    let relation = n.link_type;
                    return this.getLinkStyle(
                        sourceType,
                        targetType,
                        relation
                      ).id === styleId;
                }
                return false;
            })
            .classed("hidden", !isVisible);
    }

    setLinkCustomLabel(sourceType, targetType, relation, label) {
        // TODO: replaces relation label with a custom label for the link
    }

    updateLinkLabels() {
        // TODO: loops through all links in the graph and replaces relation
        // labels with the label assigned to predicate via rdfs:label
        // TODO: prioritize custom label for relation if exists
        // console.log("Fetching all link labels...");
        // fetching label for all links first
        let linkToLabel = {};
        let promises = [];
        let linkTypes = Array.from(new Set(this.baseLinks.map(l => l.link_type)));
        for (let link_type of linkTypes) {
            promises.push(getPredicateLabel(link_type));
        }
        Promise.all(promises)
            .then(labels => {
                for (let i=0; i<labels.length; i++) {
                    // console.log("link label for " + linkTypes[i] + " is " + labels[i]);
                    linkToLabel[linkTypes[i]] = labels[i];
                }
                // update labels in graph
                for (let node of this.nodes) {
                    if (isLabelNode(node)) {
                        node.label = linkToLabel[node.label];
                    }
                }
                // and the rendering (label path is already set correctly)
                this.nodeElements.selectAll("textPath")
                    .filter(n => isLabelNode(n))
                    .each(function (d) {
                        let self = d3.select(this);
                        // self.text(d.label); // resetting the text first
                        self.text(getLinkLabelSync(d.label));
                    });
            });
    }
    ///////////////////////////////////
    // TODO: store/apply node settings just like icon settings

    loadLinkTemplateStyles() {
        if (this.isTemplate()) {
            return this.parent.loadLinkTemplateStyles();
        }
        let self = this;
        return new Promise(function(resolve, reject) {
            let optsKeys = Object.keys(self.options);
            optsKeys = optsKeys.filter(k => k.includes("linkStyle"));
            if (optsKeys) {
                for (let linkStyle of optsKeys) {
                    let linkOpts = self.options[linkStyle];
                    let id = linkOpts["id"];
                    for (let opt of Object.keys(linkOpts).filter(k => k !== "id")) {
                        // parse if boolean
                        if (linkOpts[opt] === "true" || linkOpts[opt] === "false") {
                            self.linkStyles[id][opt] = linkOpts[opt] === "true";
                        } else {
                            self.linkStyles[id][opt] = linkOpts[opt];
                        }
                    }
                }
            }
            resolve();
        });
    }

    getLinkStyleId(sourceType, targetType, relation) {
        // NOTE: assumes all args are shortened uris
        return sourceType + "|" + targetType + "|" + relation;
    }

    getExistingLinkStyleId(sourceType, targetType, relation) {
        let id1 = this.getLinkStyleId(sourceType, targetType, relation);
        let id2 = this.getLinkStyleId(targetType, sourceType, relation);
        if (id1 in this.linkStyles) {
            return id1;
        }
        return id2;
    }

    getLinkInfoFromId(id) {
        let ind = id.indexOf("|");
        let sourceType = id.substring(0, ind);
        id = id.substring(ind+1);
        ind = id.indexOf("|");
        let targetType = id.substring(0, ind);
        let relation = id.substring(ind+1);
        return {
            sourceType: sourceType,
            targetType: targetType,
            relation: relation
        };
    }

    getLinkStyle(sourceType, targetType, relation) {
        if (this.isTemplate()) {
            return this.parent._getLinkStyle(sourceType, targetType, relation);
        }
        return this._getLinkStyle(sourceType, targetType, relation);
    }

    _getLinkStyle(sourceType, targetType, relation) {
        let id1 = this.getLinkStyleId(sourceType, targetType, relation);
        let id2 = this.getLinkStyleId(targetType, sourceType, relation);
        if (id1 in this.linkStyles) {
            return {
                style: this.linkStyles[id1],
                id: id1
            };
        }
        return {
            style: this.linkStyles[id2],
            id: id2
        };
    }

    setLinkDefaultStyleIfUndefined(sourceType, targetType, relation) {
        if (this.isTemplate()) {
            this.parent._setLinkDefaultStyleIfUndefined(sourceType, targetType, relation);
            return;
        }
        this._setLinkDefaultStyleIfUndefined(sourceType, targetType, relation);
    }

    _setLinkDefaultStyleIfUndefined(sourceType, targetType, relation) {
        let styleId = this.getLinkStyleId(sourceType, targetType, relation);
        let existingStyle = this.getLinkStyle(sourceType, targetType, relation);
        if (existingStyle.style === undefined) {
            this.linkStyles[styleId] = {};
        } else {
            styleId = existingStyle.id;
        }
        for (let style in DEFAULT_LINK_STYLE) {
            if (this.linkStyles[styleId][style] === undefined) {
                this.linkStyles[styleId][style] = DEFAULT_LINK_STYLE[style];
            }
        }
    }

    getNodeStyle(type) {
        if (this.isTemplate()) {
            return this.parent.nodeStyles[type];
        }
        return this.nodeStyles[type];
    }

    loadNodeTemplateStyles() {
        if (this.isTemplate()) {
            return this.parent.loadNodeTemplateStyles();
        }
        let self = this;
        return new Promise(function(resolve, reject) {
            let optsKeys = Object.keys(self.options);
            optsKeys = optsKeys.filter(k => k.includes("nodeStyle"));
            if (optsKeys) {
                for (let nodeStyle of optsKeys) {
                    let nodeOpts = self.options[nodeStyle];
                    let type = shortenWithPrefix(nodeOpts["type"]);
                    for (let opt of Object.keys(nodeOpts).filter(k => k !== "type")) {
                        // parse if boolean
                        if (nodeOpts[opt] === "true" || nodeOpts[opt] === "false") {
                            self.nodeStyles[type][opt] = nodeOpts[opt] === "true";
                        } else {
                            self.nodeStyles[type][opt] = nodeOpts[opt];
                        }
                    }
                }
            }
            resolve();
        });

    }

    applyNodeTemplateStyles() {
        // assuming this.nodeStyles is populated from template data AND graph
        // is rendered, we now apply these styles to the graph
        for (let type of Object.keys(this.nodeStyles)) {
            // icon visibility (DONE: also applied in updateGraph)
            this.setIconVisibilityForEntity(type, this.getNodeStyle(type)["isNodeIconVisible"]);
            // icon color (DONE: also applied in updateGraph)
            this.setIconColorForEntity(type, this.getNodeStyle(type)["nodeIconColor"]);
            // icon size (DONE: also applied in updateGraph)
            this.setIconSizeForEntity(type, this.getNodeStyle(type)["nodeIconSize"]);
            // icon name (DONE: also applied in updateGraph)
            this.setIconForEntity(type, this.getNodeStyle(type)["nodeIconName"]);
            // node visibility (DONE: also applied in updateGraph)
            this.setNodeVisibility(type, this.getNodeStyle(type)["isNodeVisible"]);
            // node label visibility (DONE: also applied in updateGraph)
            this.setNodeLabelVisibility(type, this.getNodeStyle(type)["isNodeLabelVisible"]);
            // node stroke visibility (DONE: also applied in updateGraph)
            this.setNodeStrokeVisibility(type, this.getNodeStyle(type)["isNodeStrokeVisible"]);
            // node shape (DONE: also applied in updateGraph)
            this.setNodeShape(type, this.getNodeStyle(type)["isNodeCircle"]);
            // node color (DONE: also applied in updateGraph)
            this.setNodeColor(type, this.getNodeStyle(type)["nodeColor"]);
            // node size (DONE: also applied in updateGraph)
            this.setNodeSize(type, this.getNodeStyle(type)["nodeSize"]);
            // node stroke shape (DONE: also applied in updateGraph)
            this.setNodeStrokeShape(type, this.getNodeStyle(type)["nodeStrokeShape"]);
            // stroke color (DONE: also applied in updateGraph)
            this.setNodeStrokeColor(type, this.getNodeStyle(type)["nodeStrokeColor"]);
            // stroke size (DONE: also applied in updateGraph)
            this.setNodeStrokeSize(type, this.getNodeStyle(type)["nodeStrokeSize"]);
            // TODO: set node label predicate
            // TODO: also check if it is properly stored
        }
    }

    applyLinkTemplateStyles() {
        for (let styleId in this.linkStyles) {
            let linkInfo = this.getLinkInfoFromId(styleId);
            this.setLinkDefaultStyleIfUndefined(
                linkInfo.sourceType,
                linkInfo.targetType,
                linkInfo.relation
            );
            // link label visibility
            this.setLinkLabelVisibility(
                linkInfo.sourceType,
                linkInfo.targetType,
                linkInfo.relation,
                this.linkStyles[styleId].isLinkLabelVisible
            );
            // link visibility
            this.setLinkVisibility(
                linkInfo.sourceType,
                linkInfo.targetType,
                linkInfo.relation,
                this.linkStyles[styleId].isLinkVisible
            );
        }
        this.updateLinkLabels();
    }

    setNodeDefaultStylesIfUndefined(type) {
        if (this.isTemplate()) {
            this.parent._setNodeDefaultStylesIfUndefined(type);
            return;
        }
        this._setNodeDefaultStylesIfUndefined(type);
    }

    _setNodeDefaultStylesIfUndefined(type) {
        if (this.getNodeStyle(type) === undefined) {
            this.nodeStyles[type] = {};
        }
        for (let style in DEFAULT_NODE_STYLE) {
            if (this.getNodeStyle(type)[style] === undefined) {
                this.nodeStyles[type][style] = DEFAULT_NODE_STYLE[style];
            }
        }
    }

    getNodeStyleTemplateRDF() {
        let quads = [];
        const viewContext = this.getViewNamedGraph();
        let counter = 1;
        for (let type of Object.keys(this.nodeStyles)) {
            // this.setNodeDefaultStylesIfUndefined(type);
            let styleSubject = "nodeStyle" + counter;
            counter++;
            // node type
            quads.push(quad(
                namedNode(addTemplatePrefix(styleSubject)),
                namedNode(addTemplatePrefix("type")),
                namedNode(type),
                viewContext,
            ));
            // other node styles
            for (let style in DEFAULT_NODE_STYLE) {
                quads.push(quad(
                    namedNode(addTemplatePrefix(styleSubject)),
                    namedNode(addTemplatePrefix(style)),
                    literal(this.getNodeStyle(type)[style]),
                    viewContext,
                ));
            }
        }
        return quads;
    }

    getLinkStyleTemplateRDF() {
        let quads = [];
        const viewContext = this.getViewNamedGraph();
        let counter = 1;
        for (let linkStyleId of Object.keys(this.linkStyles)) {
            let styleSubject = "linkStyle" + counter;
            counter++;
            // link style id
            quads.push(quad(
                namedNode(addTemplatePrefix(styleSubject)),
                namedNode(addTemplatePrefix("id")),
                literal(linkStyleId),
                viewContext,
            ));
            // other link styles
            for (let style in DEFAULT_LINK_STYLE) {
                quads.push(quad(
                    namedNode(addTemplatePrefix(styleSubject)),
                    namedNode(addTemplatePrefix(style)),
                    literal(this.linkStyles[linkStyleId][style]),
                    viewContext,
                ));
            }
        }
        return quads;
    }

    updateWithLatestEventData() {
        this.resolutionResponseStream.next(this.compressionC);
    }
};

RDFVisualizer.getAllNetworks = () => {
    return BaseVisualization.visualizations.filter(
        v => v.vis_type === VisTypes.NETWORK
    );
};

RDFVisualizer.getNetworkById = (id) => {
    return BaseVisualization.visualizations.find(
        v => {
            return v.vis_type === VisTypes.NETWORK &&
                   v.id === id;
        }
    );
};
