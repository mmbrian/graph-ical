require("./styles/index.scss");
require("hexagon-js/dist/hexagon.css");
require("@fortawesome/fontawesome-free/scss/fontawesome.scss");
require("@fortawesome/fontawesome-free/scss/solid.scss");
const uuidv4 = require("uuid/v4");
const hx = require("hexagon-js");
import { fromEvent, Subject } from "rxjs";
import * as d3 from "d3";
import { _baseNodes, _baseLinks, loadPrototypeData } from "./data";
import { NodeTypes, NodeActions, LinkTypes, C, VisualizationTypes } from "./types";
import {
    findNodeFromLocation, getNeighbors,
    isValidLink, getLinkType, isNeighborLink, getLinkId,
    getNodeOpacity, getLinkColor, getClusterNodeLabel, getNodeClass, getLinkClass,
    getNodeIcon, getNodeSize, isIsolatedNode,
    getNodeClusterNumber, getNodeWeight, getClusterStartingPosition,
    getNodeRadiusInfo
} from "./helpers";
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
    ZOOM_EXTENTS
} from "./style_util";
import {
    getDistance,
    getCirclePathData,
    getCirclePathDataCenteredAroundTop,
    textWrap
} from "./util";
import {
    getRepositories,
    storeTurtleDataToRepo,
    getRepositoryStatements,
    sparqlQuery
} from "./rest_util";

export default class RDFVisualizer {
    // Given a set of RDF statements, visualizes the graph with a SVG
    // visualization differs based on the given visuazliation type

    EDGE_GAP = 75; // extra distance between two connected nodes so that links are selectable
    MAX_CLUSTER_EXPAND_SIZE = 7; // maximum number of cluster children which are visible at a time
    CLUSTER_SCROLL_PADDING = Math.PI / MAX_CLUSTER_EXPAND_SIZE;
    NODE_LABEL_PADDING = 7;
    NODE_COLLISION_PADDING = 4; // separation between same-category nodes
    CLUSTER_COLLISION_PADDING = 10; // separation between different-category nodes
    MAX_RADIUS = 100; // max radius of a rendered node (entity or cluster)
    MIN_RADIUS = 25; // min radius of a rendered node
    // The largest node for each cluster. (largest radius)
    NODE_MOVE_AREA_WEIGHT = 0.5; // percentage of node's radius reserved for move region
    // e.g. 0.5 means hovering over node within a circle of radius r/2
    clusters = new Array(C);

    width = window.innerWidth;
    height = window.innerHeight;
    nodeElements, linkElements, nodePaths;
    selectedId = null;
    startingNode = null;
    targetNode = null;
    isolatedNodesOfType = {};

    constructor(type) {
        if (type) {
            this.VISUALIZATION_TYPE = type;
        } else {
            this.VISUALIZATION_TYPE = VisualizationTypes.BASE_GRAPH;
        }
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
        if (this.VISUALIZATION_TYPE !== VisualizationTypes.TEMPLATE_GRAPH) {
            // NOTE: template graph is not interactive the same way as base graph
            // only interaction allowed are tap events on each element that opens
            // a context menu for customizations
            this.setupStreams();
            this.setupDrag();
        }
        this.setupDocumentEventListeners();
    }

    setupStreams() {
        this.nodePinStream = new Subject();
        this.nodePinStream.subscribe({
            next: node => {
                let targetNode = this.nodes.find(d => d.id === node.id);
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
        this.nodeRenamedStream = new Subject();
        this.nodeRenamedStream.subscribe({
            next: payload => {
                let targetNode = this.nodes.find(d => d.id === payload.node.id);
                targetNode.label = payload.label;
                // need to update label around node
                d3.selectAll("textPath")
                    .filter(d => d.id === payload.node.id)
                    .each(function (d) {
                        let nodeCircumference = 2 * Math.PI * (targetNode.innerRadius + this.NODE_LABEL_PADDING);
                        let padding = this.NODE_LABEL_PADDING;
                        let self = d3.select(this);
                        self.text(targetNode.label); // resetting the text first
                        var textLength = self.node().getComputedTextLength(),
                            text = self.text();
                        while (textLength > (nodeCircumference - 2 * padding) && text.length > 0) {
                            text = text.slice(0, -1);
                            self.text(text + '...');
                            textLength = self.node().getComputedTextLength();
                        };
                        d3.select("defs")
                            .selectAll("path")
                            .filter(_d => _d.id === d.id)
                            .attr("d", getCirclePathDataCenteredAroundTop(targetNode.innerRadius, textLength/2.));
                    });
            }
        });
        //
        this.nodeControlsToggleStream = new Subject();
        this.nodeSelectionStream = new Subject();
        this.nodeMoveAreaVisitStream = new Subject(); // fires when we enter in the area
        // of a node where user can drag/move them from
        // TODO: like some other streams, nodeMoveAreaVisitStream should be combined
        // with tick stream and perform in-area detection not just from mousemove but
        // also on tick events (currently it's not fired every time it should be!)
        this.nodeWeightUpdatedStream = new Subject(); // fires whenever some proproperty of
        // a node that might affect its weight has changed e.g. num of connected edges
        handleNodeWeightUpdates(this.nodeWeightUpdatedStream);
        // const simulationTickStream = fromEvent(simulation, "tick"); // fires on simulation tick
        // TODO: properly link it to tick event
        this.simulationTickStream = new Subject(); // fires on simulation tick

        this.nodeAddingEdgeStream = new Subject();
        this.edgeStream = new Subject();
        this.performingAsyncOperationStream = new Subject();
        updateCursorWhenPerformingAsync(this.performingAsyncOperationStream);
        renderDragIndicatorOnNodeHover(
            this.nodeMoveAreaVisitStream,
            this.simulationTickStream,
            this.performingAsyncOperationStream
        );
        //
        this.edgeStream.subscribe({
            next: payload => {
                if (payload.add_edge && !payload.source.isClustedNode  && !payload.target.isClustedNode) {
                    this.addEdge(payload.source, payload.target);
                    this.clusterIsolatedNodes();
                    // fake async task
                    this.performingAsyncOperationStream.next({
                        started: true
                    });
                    setTimeout(() => {
                        this.performingAsyncOperationStream.next({
                            finished: true,
                            notify: true,
                            message: "Shared/Added/Projected " + payload.source.label + " with/To/Onto " + payload.target.label
                        });
                        // TODO: show proper message based on edge type
                    }, 2000); // TODO: make it random
                } else if (payload.remove_edge) {
                    // TODO:
                }
            }
        });
        //
        // creating a global stream for mousemove so that different methods can react
        this.globalSvgMouseMoveStream = new Subject();
        this.svg.on("mousemove", function () {
            // NOTE: need to call d3.mouse on g since it is the element that zooms
            // see https://stackoverflow.com/questions/29784294/d3-js-zooming-mouse-coordinates
            return this.globalSvgMouseMoveStream.next({e: d3.event, m: d3.mouse(g.node())});
        });
        renderCustomCursor(this.globalSvgMouseMoveStream);
        //

        // TODO: stream node and link updates so subscriptions can adapt instead of renewing them
        this.nodeEnterExitStream = addHoverBoundaryHighlight(this.globalSvgMouseMoveStream, this.simulation, this.simulationTickStream);
        renderNodeNameUponEnter(this.nodeEnterExitStream);
        this.componentNodeHoverSubscription = renderOnlyConnectedComponentEdgesOnHover(this.nodeEnterExitStream, this.links);
        this.nodeSelectSubscription = highlightConnectedComponentOnNodeSelect(this.nodeSelectionStream, this.nodes, this.links, this.zoomCommandsStream);
        this.resetNodeLinkSubscriptions = () => {
            this.nodeSelectSubscription.unsubscribe();
            this.componentNodeHoverSubscription.unsubscribe();
            this.nodeSelectSubscription = this.componentNodeHoverSubscription = null;
            this.componentNodeHoverSubscription = renderOnlyConnectedComponentEdgesOnHover(this.nodeEnterExitStream, this.links);
            this.nodeSelectSubscription = highlightConnectedComponentOnNodeSelect(this.nodeSelectionStream, this.nodes, this.links, this.zoomCommandsStream);
        }
        // NOTE: need to reset componentNodeHoverSubscription whenever links change
        // TODO: a better approach is if we can stream link changes so that all
        // subscriptions that use links can update their local cache
        renderAddEdgeIndicatorOnNodeHover(
            this.g,
            this.nodeEnterExitStream,
            this.nodeMoveAreaVisitStream,
            this.globalSvgMouseMoveStream,
            this.simulationTickStream,
            this.performingAsyncOperationStream
        );

        this.nodeAddEdgeDragStream = renderAddEdgeIndicatorOnDrag(
            this.g,
            this.nodeAddingEdgeStream,
            this.nodeEnterExitStream,
            this.globalSvgMouseMoveStream,
            this.edgeStream
        );
        renderNodeControlsOnHover(
            this.g,
            this.nodeEnterExitStream,
            this.globalSvgMouseMoveStream,
            this.simulationTickStream,
            this.nodeControlsToggleStream,
            this.nodePinStream,
            this.nodeRenamedStream
        );
        updateCursorWhenNotHoveringAnyNodes(
            this.nodeEnterExitStream,
            this.nodeAddEdgeDragStream,
            this.performingAsyncOperationStream
        );
    }

    setupInitialSVG() {
        // Creates sources <svg> element and inner g
        this.svg = d3.select("body").append("svg")
            .classed(this.VISUALIZATION_TYPE, true) // NOTE: there can only be 1 graph of each type
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
    }

    setupSimulation() {
        // setting up simulation forces
        this.centerForce = d3.forceCenter(0, 0);
        this.linkForce = d3.forceLink()
            .id(d => d.id) // NOTE: this is very important as it makes sure during links
            // initialization, source/target ids are matched appropriately with corresponding nodes
            .distance(link => {
                return link.source.radius + this.EDGE_GAP + link.target.radius;
            });
            // .strength(link => {
            //     return 0.5;
            // });
        this.simulation = d3.forceSimulation()
            .force("center", this.centerForce)
            .force("collision", d3.forceCollide().strength(1))
            .force("link", this.linkForce)
            .force("x", d3.forceX().x(function (d) {
                let clusterIndex = getNodeClusterNumber(d);
                if (d.id === this.clusters[clusterIndex].id) {
                    // where to direct cluster node > viewbox center
                    return 0;
                } else {
                    // where to direct other nodes > towards their cluster node
                    return this.clusters[clusterIndex].x;
                }
            }))
            .force("y", d3.forceY().y(function (d) {
                let clusterIndex = getNodeClusterNumber(d);
                if (d.id === this.clusters[clusterIndex].id) {
                    // where to direct cluster node > viewbox center
                    return 0;
                } else {
                    // where to direct other nodes > towards their cluster node
                    return this.clusters[clusterIndex].y;
                }
            }));
    }

    // Move node d to be adjacent to its cluster node.
    // see https://bl.ocks.org/mbostock/7881887
    cluster(alpha) {
        return function(d) {
            if (d.pinned) return;
            let clusterIndex = getNodeClusterNumber(d);
            var cluster = this.clusters[clusterIndex];
            if (cluster.id === d.id) return;
            var x = d.x - cluster.x,
            y = d.y - cluster.y,
            l = Math.sqrt(x * x + y * y),
            r = d.radius + cluster.radius;
            if (l != r) {
                l = (l - r) / l * alpha;
                d.x -= x *= l;
                d.y -= y *= l;
                cluster.x += x;
                cluster.y += y;
            }
        };
    }

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
                } else {
                    if (!d.isClustedNode) {
                        // inside region where add edge indicators are visible
                        d.isBeingMoved = false;
                        self.nodeAddingEdgeStream.next({
                            edge_started: true,
                            source: d
                        });
                        defocusInvalidNodesOnEdgeDrag(d, self.nodes);
                    }
                }
                if (!d3.event.active) self.simulation.alphaTarget(0.1).restart();
            }
            function dragged(d) {
                // NOTE: 'mouseover' event only gets triggered on the top-most element when two elements are painted one over top of each other
                // Here we make sure mouse move also works during a node drag
                self.globalSvgMouseMoveStream.next({e: d3.event.sourceEvent, m: d3.mouse(this.parentNode)});
                if (d.isBeingMoved) {
                    let dx = d3.event.x - d.fx;
                    let dy = d3.event.y - d.fy;
                    if (d.isClustedNode && d.isExpanded) {
                        // when moving a cluster node, all expanded children show be dragged
                        // with it (unless cluster is collapsed)
                        for (let ch of self.nodes.filter(v => v.isIsolated && v.node_type === d.node_type)) {
                            ch.fx += dx;
                            ch.fy += dy;
                        }
                    }
                    d.fx = d3.event.x;
                    d.fy = d3.event.y;
                }
            }
            function dragended(d) {
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
                if (!d3.event.active) self.simulation.alphaTarget(0.1).restart();
            }
            return d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended);
        }
    }

    resetData() {
        console.log("Resetting data...");
        // TODO: remove this logic and make sure proper base nodes and links are selected
        if (window.nodeLinkData) {
            console.log("node link data available! overriding base nodes and links.");
            this.baseNodes = [...window.nodeLinkData.nodes];
            this.baseLinks = [...window.nodeLinkData.links];
        } else {
            console.log("node link data unavailable. using default prototype data.");
        }
        // let nodeElements, linkElements, nodePaths;
        // isolatedNodesOfType = {};
        this.nodes = [...this.baseNodes];
        this.links = [...this.baseLinks];;
        // fix user node corresponding to logged in user
        this.loggedInUserNode = this.nodes.find(v => v.node_type === NodeTypes.USER_NODE && v.isLoggedInUser);
        // loggedInUserNode.fx = 0;//width/2.;
        // loggedInUserNode.fy = 0;//height/2.;
        this.clusterIsolatedNodes();
        //
        this.clusters = new Array(C);
        this.nodes = this.nodes.map(node => this.initNewNode(node));
        this.resetNodeLinkSubscriptions();
        this.updateSimulation();
    }


    resetDataWithQuery(query) {
        // TODO: update and perhaps disable in template graph
        query = query.toLowerCase();
        // remember positions from last time
        let nodePositions = this.nodes.map(node => {
            return {
                id: node.id,
                x: node.x,
                y: node.y,
                // NOTE: cluster nodes will have new ids, so we cache more info to track them later
                isClustedNode: node.isClustedNode,
                clusterType: node.node_type
            };
        });
        // always start with baseNodes since search applies to all nodes within
        // clusters as well
        this.nodes = [...this.baseNodes];
        this.links = [...this.baseLinks];
        // NOTE: before rendering we need to make sure only to add links with both
        // nodes
        // TODO: should search preserve entire connected components even if one node
        // matches the query? or shall we add that to node control so display connected
        // component even after search
        this.nodes = this.nodes.filter(node => node.label.toLowerCase().includes(query))
        let nodeIds = this.nodes.map(node => node.id);
        this.links = this.links.filter(link => {
            let targetId = typeof link.target === "object" ? link.target.id : link.target;
            let sourceId = typeof link.source === "object" ? link.source.id : link.source;
            return nodeIds.includes(targetId) && nodeIds.includes(sourceId);
        })
        this.clusterIsolatedNodes();
        //
        this.clusters = new Array(C);
        this.nodes = this.nodes.map(node => {
            let ret = this.initNewNode(node);
            // check if node already had a position before
            if (ret.isClustedNode) {
                // check if we had this cluster node before
                let lastPosition = nodePositions.find(v => v.isClustedNode && v.clusterType === ret.node_type);
                if (lastPosition) {
                    ret.x = lastPosition.x;
                    ret.y = lastPosition.y;
                }
            } else {
                // check if we had this node before
                let lastPosition = nodePositions.find(v => v.id === ret.id);
                if (lastPosition) {
                    ret.x = lastPosition.x;
                    ret.y = lastPosition.y;
                }
            }
            return ret;
        });
        this.resetNodeLinkSubscriptions();
        this.updateSimulation();
    }

    initNewNode(node, hasPosition = false) {
        let i = getNodeClusterNumber(node);
        node.cluster = i;
        let rR = getNodeRadiusInfo(node, this.links);
        // TODO: node radius has to change whenever getNodeWeight changes
        node.innerRadius = rR.r;
        node.radius = rR.R;
        if (!hasPosition) {
            let clusterPosition = getClusterStartingPosition(i);
            node.x = clusterPosition.x + Math.random();
            node.y = clusterPosition.y + Math.random();
        }
        if (!this.clusters[i] || (rR.r > this.clusters[i].radius)) this.clusters[i] = node;
        return node;
    }

    addEdge(u, v) {
        // TODO: need to recompute u and v's radiuses and transition to new radiuses
        if (!isValidLink(u, v)) {
            // hx.alert({
            //   title: "This is a warning alert.",
            //   body: "Use it to tell users about something that could be a problem, but won\"t block them from doing things yet.",
            //   type: "warning",
            // });
            hx.notifyNegative("This kind of Link is not Allowed!");
            return;
        }
        let type = getLinkType(u, v);
        // update active graph
        this.links.push({
            source: u,
            target: v,
            link_type: type,
            value: 0.2 // TODO
        });
        // also change base graph
        this.baseLinks.push({
            source: u,
            target: v,
            link_type: type,
            value: 0.2
        });
        // unpin both boths (if pinned)
        if (u.pinned)
            this.nodePinStream.next(u)
        if (v.pinned)
            this.nodePinStream.next(v);
        if (u.isIsolated || v.isIsolated) {
            // console.log("clicking cluster toggle...");
            // window.toggle = d3.select("text.cluster_toggle");
            // add edge to a cluster child, need to collapse cluster
            // d3.select("text.cluster_toggle").on("click")();
            let clusterNode = this.nodes.find(v => v.isClustedNode && v.isExpanded);
            if (clusterNode) {
                clusterNode.isExpanded = false;
                clusterNode.isDisplayingControls = false;
                this.nodePinStream.next(clusterNode);
            }
        }
        // cluster the isolated
        this.clusterIsolatedNodes();
        this.nodeWeightUpdatedStream.next({
            nodes: [u, v],
            links: links
        });
        this.resetNodeLinkSubscriptions();
        this.updateSimulation();
    }

    removeEdge(link) {
        d3.select("div.cursor-element").classed("show_icon", false);
        d3.select("body").classed("disable_cursor", false);
        d3.select("i.icon_content").classed("hidden", true);
        // console.log("remove edge requested for", link);
        let _i1 = this.links.indexOf(this.links.find(l => l.source.id === link.source.id && l.target.id === link.target.id));
        let _i2 = this.baseLinks.indexOf(this.baseLinks.find(l => l.source.id === link.source.id && l.target.id === link.target.id));
        console.log("removing edge", _i1, _i2);
        this.links.splice(_i1, 1);
        this.baseLinks.splice(_i2, 1);
        // TODO: recompute node weights
        this.clusterIsolatedNodes();
        this.resetNodeLinkSubscriptions();
        this.updateSimulation();
    }

    limitToNghs(selectedNode) {
        // given a selected node, modifies links and nodes in the graph to contrain
        // it only to immediate neighbourhood of the selected graph
        // TODO: could add as a mode to node controls

        var neighbors = getNeighbors(selectedNode, this.links);
        var newNodes = this.baseNodes.filter(function (node) {
            return neighbors.indexOf(node.id) > -1 || node.level === 1
        });

        var diff = {
            removed: this.nodes.filter(function (node) { return newNodes.indexOf(node) === -1 }),
            added: newNodes.filter(function (node) { return this.nodes.indexOf(node) === -1 })
        };

        diff.removed.forEach(function (node) { this.nodes.splice(this.nodes.indexOf(node), 1) });
        diff.added.forEach(function (node) { this.nodes.push(node) });

        this.links = this.links.filter(function (link) {
            return link.target.id === selectedNode.id || link.source.id === selectedNode.id
        });
        this.resetNodeLinkSubscriptions();
    }

    clusterIsolatedNodes() {
        // will modify nodes (and not baseNodes) such that all "isolated" nodes
        // are removed and each such node_type will have a single cluster node
        let isolated_node_ids = [];
        let isolated_node_types = [];
        this.isolatedNodesOfType = {};
        for (let node of this.nodes) {
            if (isIsolatedNode(node, this.links, this.nodes)) {
                if (!isolatedNodesOfType[node.node_type]) {
                    isolatedNodesOfType[node.node_type] = {};
                }
                isolated_node_ids.push(node.id);
                isolated_node_types.push(node.node_type);
                // keep in history for later cluster expand/collapse
                isolatedNodesOfType[node.node_type][node.id] = node;
            } else {
                node.isIsolated = false;
                // remove from isolated ones if it was isolated before
                if (this.isolatedNodesOfType[node.node_type]) {
                    delete this.isolatedNodesOfType[node.node_type][node.id];
                }
            }
        }
        this.nodes = this.nodes.filter(v => isolated_node_ids.indexOf(v.id) < 0);
        // create and add cluster nodes
        new Set(isolated_node_types).forEach(node_type => {
            let hasClusterNode = this.nodes.find(v => v.isClustedNode && v.node_type === node_type);
            if (hasClusterNode) return;
            let numClusterChildren = Object.keys(this.isolatedNodesOfType[node_type]).length;
            // find cluster centroid
            // NOTE: alternatively we can use cluster starting point here but overal
            // it shouldn't matter that much
            let cx = Object.values(this.isolatedNodesOfType[node_type])
                .map(v => v.x)
                .reduce((x, y) => x+y, 0) / numClusterChildren;
            let cy = Object.values(this.isolatedNodesOfType[node_type])
                .map(v => v.y)
                .reduce((x, y) => x+y, 0) / numClusterChildren;
            this.nodes.push({
                id: uuidv4(),
                isClustedNode: true,
                isExpanded: false,
                clusterSize: numClusterChildren,
                label: getClusterNodeLabel(node_type),
                node_type: node_type,
                x: cx,
                y: cy
            });
        });
    }

    toggleCluster(node_type) {
        // TODO: this method is imported in style_util. instead call the one from
        // visualization class instance
        //
        // expands or collapses a cluster of isolated nodes
        if (this.isolatedNodesOfType[node_type]) {
            let clusterNode = this.nodes.find(v => v.isClustedNode && v.node_type === node_type);
            this.nodePinStream.next(clusterNode);
            if (clusterNode && !clusterNode.isExpanded) { // clustered > expand
                this.zoomObject.scaleExtent([1, 1]); // temporarily disables zoom with scrolling
                clusterNode.isExpanded = true;
                // // remove cluster node from active nodes
                // nodes.splice(clusterNode.index, 1); // TODO: make sure index is correct
                // add isolated nodes of this cluster to active nodes
                // TODO: not all but a paginated set, position around a circle
                let clusteredNodes = Object.values(this.isolatedNodesOfType[node_type]);
                clusteredNodes.sort((u, v) => u.label.localeCompare(v.label));
                let alpha = 0;
                for (let isolatedNode of clusteredNodes) {
                    // position nodes around cluster on a circle
                    isolatedNode.posAlpha = alpha;
                    isolatedNode.x = clusterNode.x + Math.cos(alpha) * clusterNode.radius * 2;
                    isolatedNode.y = clusterNode.y + Math.sin(alpha) * clusterNode.radius * 2;
                    alpha += Math.PI*2/(this.MAX_CLUSTER_EXPAND_SIZE);
                    // TODO: transition position from cluster x, y to this point on expand
                    // NOTE: we cannot use pin stream here since node is not yet added
                    // to nodes list
                    isolatedNode.fx = isolatedNode.x;
                    isolatedNode.fy = isolatedNode.y;
                    isolatedNode.pinned = true;
                    isolatedNode.isIsolated = true;
                    isolatedNode = this.initNewNode(isolatedNode, true);
                    isolatedNode._radius = isolatedNode.radius;
                    isolatedNode._innerRadius = isolatedNode.innerRadius;
                    if (isolatedNode.posAlpha >= Math.PI*2) {
                        isolatedNode.radius = 0;
                        isolatedNode.innerRadius = 0;
                        isolatedNode.hidden = true;
                    }
                    // NOTE: we only render nodes with alpha in [0, 2xPI]
                    this.nodes.push(isolatedNode);
                }
            } else { // expanded > collapse
                this.zoomObject.scaleExtent(ZOOM_EXTENTS);
                clusterNode.isExpanded = false;
                this.clusterIsolatedNodes();
            }
            this.updateSimulation();
        }
    }

    updateSimulation() {
        const self = this;
        self.updateGraph();
        self.simulation
            .nodes(self.nodes)
            .on("tick", () => {
                // apply cluster forces to keep cluster nodes together
                self.nodeElements.each(self.cluster(.3))
                self.nodeElements.attr("transform", d => {
                    // can override positioning here by changing d.x and d.y
                    return ("translate(" + d.x + "," + d.y + ")");
                });
                self.nodeElements
                    .filter(v => v.isClustedNode && v.isExpanded)
                    .each(c => {
                        if (Math.abs(c.scrollSpeed) > 0.5) {
                            let clusterNodes = self.nodes.filter(v => v.isIsolated && v.node_type === c.node_type);
                            let maxDegree = Math.max(...clusterNodes.map(v => v.posAlpha));
                            let minDegree = Math.min(...clusterNodes.map(v => v.posAlpha));
                            let scrollDir = Math.sign(c.scrollSpeed);
                            // if ((maxDegree < (Math.PI*2-Math.PI/10) && scrollDir < 0) || (minDegree > Math.PI/10 && scrollDir > 0)) {
                            if ((maxDegree < (Math.PI*2 - self.CLUSTER_SCROLL_PADDING) && scrollDir < 0) ||
                                (minDegree > self.CLUSTER_SCROLL_PADDING && scrollDir > 0)) {
                                // NOTE: this is to stop scroll when we reach the ending or
                                // beginning of the list and wanna go further in this direction
                                c.scrollSpeed = Math.sign(c.scrollSpeed) * -1;
                                // c.scrollSpeed = 0;
                                // return;
                            }
                            clusterNodes
                                .forEach(v => {
                                    let alphaSpeed = Math.PI / Math.max(1, (180 - Math.abs(c.scrollSpeed * 25))); // larger > faster
                                    alphaSpeed = Math.max(Math.min(alphaSpeed, Math.PI/10), Math.PI/180);
                                    let _prevAlpha = v.posAlpha;
                                    v.posAlpha += Math.sign(c.scrollSpeed) * alphaSpeed;
                                    v.fx = c.fx + Math.cos(v.posAlpha) * c.radius * 2;
                                    v.fy = c.fy + Math.sin(v.posAlpha) * c.radius * 2;
                                    let prevDisplayed = _prevAlpha >= 0 && _prevAlpha < Math.PI*2;
                                    let nowDisplayed = v.posAlpha >= 0 && v.posAlpha < Math.PI*2;
                                    if (!nowDisplayed && prevDisplayed) {
                                        // hide node
                                        // hide label
                                        // d3.selectAll("text.label_text")
                                        self.svg.selectAll("text.label_text") // TODO: make sure this works!
                                            .filter(d => d.id === v.id)
                                            .classed("hidden", true);
                                        // transition radius to 0
                                        // d3.selectAll("circle.inner")
                                        self.svg.selectAll("circle.inner") // TODO: make sure this works!
                                            .filter(d => d.id === v.id)
                                            .transition()
                                            .duration(150)
                                            .delay(function(d, i) { return i * 5; })
                                            .attrTween("r", function(d) {
                                                var i = d3.interpolate(d.innerRadius, 0);
                                                return function(t) { return d.innerRadius = i(t); };
                                            });
                                    }
                                    if (nowDisplayed && !prevDisplayed) {
                                        // display node
                                        // show label
                                        // d3.selectAll("text.label_text")
                                        self.svg.selectAll("text.label_text") // TODO: make sure this works!
                                            .filter(d => d.id === v.id)
                                            .classed("hidden", false);
                                        // transition radius to r
                                        // d3.selectAll("circle.inner")
                                        self.svg.selectAll("circle.inner") // TODO: make sure this works!
                                            .filter(d => d.id === v.id)
                                            .transition()
                                            .duration(350)
                                            .delay(function(d, i) { return i * 5; })
                                            .attrTween("r", function(d) {
                                                var i = d3.interpolate(0, d._innerRadius);
                                                return function(t) { return d.innerRadius = i(t); };
                                            });
                                        // d3.selectAll("path.label_path")
                                        self.svg.selectAll("path.label_path") // TODO: make sure this works!
                                            .filter(d => d.id === v.id)
                                            .attr("d", d => getCirclePathData(d._innerRadius));
                                    }
                                });
                            c.scrollSpeed *= 0.95;
                        }
                    });
                // linkElements
                // d3.selectAll("line.link")
                self.svg.selectAll("line.link")  // TODO: make sure this works!
                    .attr("x1", link => {
                        return typeof link.source === "object" ? link.source.x : self.getNodeById(link.source).x;
                    })
                    .attr("y1", link => {
                        return typeof link.source === "object" ? link.source.y : self.getNodeById(link.source).y;
                    })
                    .attr("x2", link => {
                        return typeof link.target === "object" ? link.target.x : self.getNodeById(link.target).x;
                    })
                    .attr("y2", link => {
                        return typeof link.target === "object" ? link.target.y : self.getNodeById(link.target).y;
                    });
                // background lines (invisible)
                // d3.selectAll("line.link_bg")
                self.svg.selectAll("line.link_bg") // TODO: make sure this works!
                    .attr("x1", link => {
                        return typeof link.source === "object" ? link.source.x : self.getNodeById(link.source).x;
                    })
                    .attr("y1", link => {
                        return typeof link.source === "object" ? link.source.y : self.getNodeById(link.source).y;
                    })
                    .attr("x2", link => {
                        return typeof link.target === "object" ? link.target.x : self.getNodeById(link.target).x;
                    })
                    .attr("y2", link => {
                        return typeof link.target === "object" ? link.target.y : self.getNodeById(link.target).y;
                    });
                // d3.selectAll("path.edgepath")
                self.svg.selectAll("path.edgepath") // TODO: make sure this works!
                    .attr('d', function(link) {
                        let sourceX = typeof link.source === "object" ? link.source.x : self.getNodeById(link.source).x;
                        let sourceY = typeof link.source === "object" ? link.source.y : self.getNodeById(link.source).y;
                        let targetX = typeof link.target === "object" ? link.target.x : self.getNodeById(link.target).x;
                        let targetY = typeof link.target === "object" ? link.target.y : self.getNodeById(link.target).y;
                        return 'M '+sourceX+' '+sourceY+' L '+ targetX +' '+targetY;
                   });
                // d3.selectAll("text.edgelabel")
                self.svg.selectAll("text.edgelabel") // TODO: make sure this works!
                    .attr('transform', function(link,i) {
                        let sourceX = typeof link.source === "object" ? link.source.x : self.getNodeById(link.source).x;
                        let targetX = typeof link.target === "object" ? link.target.x : self.getNodeById(link.target).x;
                        if (targetX<sourceX){
                            let bbox = this.getBBox();
                            let rx = bbox.x+bbox.width/2;
                            let ry = bbox.y+bbox.height/2;
                            return 'rotate(180 '+rx+' '+ry+')';
                        }
                        else {
                            return 'rotate(0)';
                        }
                    });
                // nodePaths.attr("d", d => getCirclePathData(d.innerRadius));
                self.simulationTickStream.next({
                    nodes: self.nodes
                });
                console.log("ticked");
            });
        self.simulation
            .force("collision")
            .radius(d => {
                return d.radius + self.NODE_COLLISION_PADDING / 2.0;
                // NOTE: makes sure distance between any two nodes with radiuses r1
                // and r2 is r1 + r2 + NODE_COLLISION_PADDING
            });
        self.linkForce.links(self.links);
        self.simulation.alphaTarget(0.1).restart();
        console.log("updated simulation...");
    }

    updateGraph() {
        const thisVis = this;
        // links
        thisVis.linkElements = linkGroup
            .selectAll("line")
            .data(thisVis.links, link => getLinkId(link));
        thisVis.linkElements.exit().remove();
        let linkEnter = thisVis.linkElements
            .enter()
            // .append("line")
            // .attr("class", d => {
            //     return "link " + getLinkClass(d.link_type);
            // })
            // .attr("stroke-width", d => Math.sqrt(d.value));
            .each(function(d, ind) {
                let self = d3.select(this);
                self.append("line")
                    .attr("class", d => {
                        return "link " + getLinkClass(d.link_type);
                    })
                    .attr("stroke-width", d => Math.sqrt(d.value));
                self
                    .append("line")
                    .classed("link_bg", true)
                    .on("mousemove", function (d) {
                        d3.select("div.cursor-element").classed("show_icon", true);
                        d3.select("body").classed("disable_cursor", true);
                        d3.select("i.icon_content").classed("hidden", false);
                    })
                    .on("mouseout", function (d) {
                        d3.select("div.cursor-element").classed("show_icon", false);
                        d3.select("body").classed("disable_cursor", false);
                        d3.select("i.icon_content").classed("hidden", true);
                    })
                    .on("click", function (d) {
                        // console.log("clicked", d);
                        // removeEdge(d); // TODO: fix remove behaviour
                    })
                    .on("contextmenu", function (d) {
                        d3.event.preventDefault();
                        // TODO: move logic to a method and complete for all cases
                        let message = "";
                        switch (d.link_type) {
                            case LinkTypes.OWNER_OF:
                                if (d.source.node_type === NodeTypes.GROUP_NODE || d.source.node_type === NodeTypes.DISPLAY_GROUP_NODE) {
                                    message = d.source.label + " is owned by " + d.target.label;
                                }
                                if (d.target.node_type === NodeTypes.GROUP_NODE || d.target.node_type === NodeTypes.DISPLAY_GROUP_NODE) {
                                    message = d.target.label + " is owned by " + d.source.label;
                                }
                                break;
                            case LinkTypes.MEMBER_OF:
                                if (d.source.node_type === NodeTypes.GROUP_NODE || d.source.node_type === NodeTypes.DISPLAY_GROUP_NODE) {
                                    message = d.target.label + " is a member of " + d.source.label;
                                }
                                if (d.target.node_type === NodeTypes.GROUP_NODE || d.target.node_type === NodeTypes.DISPLAY_GROUP_NODE) {
                                    message = d.source.label + " is a member of " + d.target.label;
                                }
                                break;
                            case LinkTypes.SHARED_WITH:
                                if (d.source.node_type === NodeTypes.GROUP_NODE || d.source.node_type === NodeTypes.USER_NODE) {
                                    message = d.target.label + " is shared with " + d.source.label;
                                }
                                if (d.target.node_type === NodeTypes.GROUP_NODE || d.target.node_type === NodeTypes.USER_NODE) {
                                    message = d.source.label + " is shared with " + d.target.label;
                                }
                                break;
                            case LinkTypes.PROJECTED_ON:
                                if (d.source.node_type === NodeTypes.DISPLAY_GROUP_NODE || d.source.node_type === NodeTypes.DISPLAY_NODE) {
                                    message = d.target.label + " is projected on " + d.source.label;
                                }
                                if (d.target.node_type === NodeTypes.DISPLAY_GROUP_NODE || d.target.node_type === NodeTypes.DISPLAY_NODE) {
                                    message = d.source.label + " is projected on " + d.target.label;
                                }
                                break;
                            default:
                        }
                        message += ". (Click to remove connection)"
                        hx.notifyPositive(message);
                    });
                self
                    .append("path")
                    .classed("edgepath", true)
                    // .attr("d", 'M '+d.source.x+' '+d.source.y+' L '+ d.target.x +' '+d.target.y)
                    .attr('fill-opacity', 0)
                    .attr('stroke-opacity', 0)
                    .attr('fill', "blue")
                    .attr('stroke', "red")
                    .attr("id", "edgepath" + ind);
                self
                    .append("text")
                    .classed("edgelabel", true)
                    .attr("id", 'edgelabel'+ind)
                    .attr("dx", 100)
                    .attr("dy", 7)
                    .attr("font-size", 10)
                    .attr("fill", '#000')
                    .append('textPath')
                    .attr('xlink:href', '#edgepath'+ind)
                    .text(d.link_type);

            });
        thisVis.linkElements = linkEnter.merge(thisVis.linkElements);

        // label text paths (initial paths)
        thisVis.nodePaths = thisVis.defGroup
            .selectAll("path")
            .data(thisVis.nodes, function (node) { return node.id });
        thisVis.nodePaths.exit().remove();
        let nodePathEnter = thisVis.nodePaths
            .enter()
            .append("path")
            .classed("label_path", true)
            .attr("d", d => getCirclePathData(d.innerRadius))
            .attr("id", d => "textPathFor" + d.id);
        thisVis.nodePaths = nodePathEnter.merge(thisVis.nodePaths);
        // nodes
        thisVis.nodeElements = thisVis.nodeGroup
            .selectAll("g")
            .data(thisVis.nodes, function (node) { return node.id });
        thisVis.nodeElements.exit().remove();
        let nodeEnter = thisVis.nodeElements
            .enter()
            .append("g")
            .classed("node", true)
            .call(thisVis.drag())
        // node icon
        nodeEnter
            .append("text")
            .attr("class", "has_icon")
            .text(d => getNodeIcon(d.node_type))
            .attr("x", 0)
            .attr("y", 0);
        // node label
        nodeEnter
            .append("text")
            .attr("class", "label_text")
            .classed("hidden", d => d.hidden)
            .append("textPath")
            .attr("startOffset", "0")
            .attr("href", d => "#textPathFor" + d.id)
            .text(d => d.label);
        nodeEnter
            .select("textPath")
            .each(function (d) {
                // here we make sure if text length exceeds circumference of the
                // path it is being rendered on, we cut it from the end and add
                // ellipsis in the end
                let nodeCircumference = 2 * Math.PI * (d.innerRadius + thisVis.NODE_LABEL_PADDING);
                let padding = NODE_LABEL_PADDING;
                var self = d3.select(this),
                    textLength = self.node().getComputedTextLength(),
                    text = self.text();
                while (textLength > (nodeCircumference - 2 * padding) && text.length > 0) {
                    text = text.slice(0, -1);
                    self.text(text + '...');
                    textLength = self.node().getComputedTextLength();
                };
                // here we update text paths such that text is centered around node's
                // topmost point (and text path start is contrained in [left most point, top most point]
                // so that at least the beginning becomes closer to being rendered
                // on a straight line (more readable)
                thisVis.defGroup
                    .selectAll("path.label_path")
                    .filter(_d => _d.id === d.id)
                    .attr("d", getCirclePathDataCenteredAroundTop(d.innerRadius, textLength/2.));
                // TODO: recompute text wrapping and positioning when node radius changes
            });
        // how to render non-cluster nodes
        let regularNodes = nodeEnter.filter(function (d) { return !d.isClustedNode; });
        regularNodes
            .append("circle")
            .lower() // will place an element as the first child of its parent
            .attr("cx", 0)
            .attr("cy", 0)
            .attr("class", d => {
                let extra = " inner";
                if (d.isLoggedInUser) {
                    extra += " logged_in"
                }
                return getNodeClass(d.node_type) + extra;
            })
            .transition()
            .duration(750)
            .delay(function(d, i) { return i * 5; })
            .attrTween("r", function(d) {
                var i = d3.interpolate(0, d.innerRadius);
                return function(t) { return d.innerRadius = i(t); };
            }); // this delayed transition is important as it stabilizes initial
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
            });
        regularNodes
            .append("circle")
            .lower() // will place an element as the first child of its parent
            .attr("cx", 0)
            .attr("cy", 0)
            .attr("class", d => {
                let extra = " outer hidden_circle";
                if (d.isLoggedInUser) {
                    extra += " logged_in"
                }
                return getNodeClass(d.node_type) + extra;
            })
            .transition()
            .duration(750)
            .delay(function(d, i) { return i * 5; })
            .attrTween("r", function(d) {
                var i = d3.interpolate(0, d.radius);
                return function(t) { return d.radius = i(t); };
            });
        // how to render cluster nodes
        let clusterNodes = nodeEnter.filter(function (d) { return d.isClustedNode; });
        clusterNodes
            .append("circle")
            .lower() // will place an element as the first child of its parent
            .attr("cx", 0)
            .attr("cy", 0)
            .attr("class", d => {
                return getNodeClass(d.node_type) + " cluster_node inner";
            })
            .style("filter", "url(#drop-shadow)")
            .transition()
            .duration(750)
            .delay(function(d, i) { return i * 5; })
            .attrTween("r", function(d) {
                var i = d3.interpolate(0, d.innerRadius);
                return function(t) { return d.innerRadius = i(t); };
            });
        clusterNodes
            .select("circle.inner")
            .on("mouseover", function (d) {
                //
            })
            .on("mouseout", function (d) {
                //
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
            .on("wheel", function (d) {
                // if (d.isExpanded) {
                if (d.isExpanded && d.clusterSize > thisVis.MAX_CLUSTER_EXPAND_SIZE) {
                    // NOTE: only allow scrolling if there are more items in cluster
                    // than MAX_CLUSTER_EXPAND_SIZE
                    if (!d.scrollSpeed) { d.scrollSpeed = 0; }
                    let scrollDir = Math.sign(d.scrollSpeed);
                    let wheelDir = Math.sign(d3.event.wheelDelta);
                    if (scrollDir && wheelDir !== scrollDir) {
                        d.scrollSpeed = 0;
                    }
                    d.scrollSpeed += wheelDir;
                }
            });
        clusterNodes
            .append("circle")
            .lower() // will place an element as the first child of its parent
            .attr("cx", 0)
            .attr("cy", 0)
            .attr("class", d => {
                return getNodeClass(d.node_type) + " cluster_node outer hidden_circle";
            })
            .transition()
            .duration(750)
            .delay(function(d, i) { return i * 5; })
            .attrTween("r", function(d) {
                var i = d3.interpolate(0, d.radius);
                return function(t) { return d.radius = i(t); };
            });
        clusterNodes
            .append("circle")
            .lower() // will place an element as the first child of its parent
            // .classed("cluster_inactive_node", true)
            .attr("class", function(d) {
                return getNodeClass(d.node_type) + " cluster_inactive_node";
            })
            .style("filter", "url(#drop-shadow)")
            .attr("cx", 3)
            .attr("cy", 7)
            .attr("r", function (d) {
                return d.innerRadius;
            });
        clusterNodes
            .append("circle")
            .lower() // will place an element as the first child of its parent
            // .classed("cluster_inactive_node", true)
            .attr("class", function(d) {
                return getNodeClass(d.node_type) + " cluster_inactive_node";
            })
            .style("filter", "url(#drop-shadow)")
            .attr("cx", 6)
            .attr("cy", 14)
            .attr("r", function (d) {
                return d.innerRadius;
            });
        // adding neighbour highlighting for selected node
        // NOTE: click and dblclick from d3 won't work for us as dbl click also fires
        // on clicks. we can either switch our UI behaviour or use rxjs buffer to
        // create a reliable dblclick only stream separated from click
        nodeEnter.on("dblclick", thisVis.selectNode);
        nodeEnter.on("click", function (d, i) {
            d3.event.preventDefault();
            d.isDisplayingControls = !d.isDisplayingControls;
            thisVis.nodeControlsToggleStream.next({
                node: d
            });
        })
        thisVis.nodeElements = nodeEnter.merge(thisVis.nodeElements);
    }

    selectNode(selectedNode) {
        d3.event.stopPropagation(); // prevents deselectAll
        this.nodeSelectionStream.next(selectedNode);
        // also hide controls
        selectedNode.isDisplayingControls = false;
        this.nodeControlsToggleStream.next({
            node: selectedNode
        });
    }

    deselectAll() {
        this.nodeSelectionStream.next(null);
        // also hide controls TODO
        // nodes[0].isDisplayingControls = false;
        // nodeControlsToggleStream.next({
        //     node: nodes[0]
        // });
    }

    setupDocumentEventListeners() {
        const self = this;
        document.addEventListener("click", function() {
            this.deselectAll();
        });

        document.addEventListener("DOMContentLoaded", () => {
            this.resetData();
            getRepositories();
        });

        document.getElementById("search_input").addEventListener("input", function(ev) {
            // console.log("changed search:", this.value);
            // TODO: update rendering based on this.value (without affecting it too much)
            // NOTES:
            // 1. need to remember position of all nodes before input change
            // 2. need to filter nodes based on query
            // 3. still need to cluster nodes
            // 4. remaning nodes will be added at their original position to the graph
            if (this.value) {
                this.resetDataWithQuery(this.value);
            } else {
                this.resetData();
            }
        });

        document.getElementById("search_input").addEventListener("keyup", function(ev) {
            if (ev.key === "Escape") {
                this.value = "";
                // TODO: reset without affecting rendering too much
                this.resetData();
            }
        });

        // TODO: add event listener instead of overriding the method
        window.onresize = (ev) => {
            this.width = window.innerWidth;
            this.height = window.innerHeight;
            this.svg.attr("width", this.width).attr("height", this.height);
            // viewbox is set such that viewport center is 0,0
            this.svg.attr("viewBox", (-this.width/2) + " " + (-this.height/2) + " " + this.width + " " + this.height);
            this.centerForce.x(0).y(0);
            this.simulation.alphaTarget(0.1).restart();
        }

        document.getElementById("legend-toggle").addEventListener("click", function(ev) {
            let isHidden = d3.select("#legend-area").classed("hidden");
            d3.select("#legend-area").classed("hidden", !isHidden);
        });

        document.getElementById('upload').addEventListener('change', () => {
            var files = this.files;
            if (files.length === 0) {
                console.log('No file is selected');
                return;
            }
            var reader = new FileReader();
            reader.onload = function(event) {
                window.prototypeTurtleDataString = event.target.result;
                loadPrototypeData(event.target.result);
                setTimeout(() => {
                    self.resetData();
                }, 1500);
            };
            reader.readAsText(files[0]);
        });

        document.getElementById('store').addEventListener('click', () => {
            storeTurtleDataToRepo(window.activeRepoURI, window.prototypeTurtleDataString);
        });

        document.getElementById('load').addEventListener('click', () => {
            getRepositoryStatements(window.activeRepoURI);
        });

        document.getElementById('sparql-query').addEventListener('click', () => {
            let query = prompt("Enter a SPARQL Query", "construct {?s ?p ?o} where {?s ?p ?o}");
            sparqlQuery(window.activeRepoURI, query);
        })
    }
}
