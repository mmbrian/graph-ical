// Original demo from Mike Bostock: http://bl.ocks.org/mbostock/ad70335eeef6d167bc36fd3c04378048
// also inspired by https://medium.com/ninjaconcept/interactive-dynamic-force-directed-graphs-with-d3-da720c6d7811
// (especially for interactivity)
// Modifications:
// 1. disjoint force-directed layout. see https://observablehq.com/@d3/disjoint-force-directed-graph?collection=@d3/d3-force
// 2. added fisheye feature. see https://observablehq.com/@maliky/force-directed-graph-a-to-z
//  2.1 for better fisheye see https://observablehq.com/@benmaier/a-visually-more-appealing-fisheye-function
// 3. added collision detection so that nodes do not collide. see https://bl.ocks.org/d3indepth/9d9f03a0016bc9df0f13b0d52978c02f
// 4. added label support
//  4.1 made node size adjust to label size.
//  4.2 for styling labels see http://tutorials.jenkov.com/svg/text-element.html
// 5. added selection highlight support:
//  - highlights immediate neighborhood and defocuses rest
//  - selecting outside nodes deselects all
//  - only node selection so far
// 6. added initial dynamic graph rendering support
//  - node selection renders subgraph that is immediate neighbourhood of selected node
//  - selecting same node will reset the view back to original graph
// 7. added UI to add edges
//  - can add edges between any two existing nodes
//  - removed drag/move to support edge addition by drag
//  - adding edge uses an rxjs observable that updates UI accordingly
// 8. added basic types and styling for nodes and edges based on types
//  - see https://coolors.co/ for generating color palettes
// 9. now selecting node only higlights neighborhood and double click switches
// to neighborhood view
// 10. remove fisheye
// 11. added node clustering:
//  - isolated nodes of the same kind are clustered if they are more than 1
//  - when adding edges, a cluster node will expand once targeted into all its
//  isolated parts, after drag operation is done, nodes are clustered again
// 12. adjusted collision radius based on node radius also after updates
// 13. made addEdge type-aware. will assign the correct type to a link
// 14. added validation to add edge to prevent adding edges when it makes no sense
//  - for now this still allows UI action and only logs an error and prevents update
//  - same-node links can later be used to create groups/scenarios/...

// important TODO:
// 1. extend selection logic to use context when selecting a neighbourhood
// this means for instance when selecting a pixel source that is connected to a
// display or display group, the user node initiating that projection needs to
// be highlighted as well which is probably not a neighbour
// 2. turn into a nodejs app so we can add hexagonjs and use import statements
// 3. layouting strategy needs to be fixed. if dagre works well this can all
// be moved to vuejs and use dagger to update positions. 

// TODO
// 1. set max size for nodes and trim labels if they exceed that size


const NODE_RADIUS = 35;
const NODE_LABEL_PADDING = 7;

const width = window.innerWidth;
const height = window.innerHeight;
let nodeElements, linkElements;
let selectedId = null;
let startingNode = targetNode = null;
let isolatedNodesOfType = {};

let dragStream = new rxjs.Subject();
dragStream.subscribe({
    next: (update) => {
        console.log("drag update:", update);
        let node = update.value;

        switch (update.type) {
        case NodeTypes.STARTING_NODE:
            if (update.action === NodeActions.HIGHLIGHT_NODE) {
                d3.select("#cr" + node.id).classed("highlighted", true);
            } else if (update.action === NodeActions.REMOVE_NODE_HIGHLIGHT) {
                d3.select("#cr" + node.id).classed("highlighted", false);
            }
            break;
        case NodeTypes.TARGET_NODE:
            if (node.isClustedNode) {
                toggleCluster(node.node_type);
                targetNode = null;
            } else {
                if (update.action === NodeActions.HIGHLIGHT_NODE) {
                    d3.select("#cr" + node.id).classed("highlighted", true);
                } else if (update.action === NodeActions.REMOVE_NODE_HIGHLIGHT) {
                    d3.select("#cr" + node.id).classed("highlighted", false);
                }
            }
            break;
        default:
            console.log("Unknown node type when dragging");
        }
    }
});

// Creates sources <svg> element and inner g
const svg = d3.select('body').append('svg')
    .attr('width', width)
    .attr('height', height)
    .append('g');
const linkGroup = svg.append("g")
    .classed("links", true);
const nodeGroup = svg.append("g")
    .classed("nodes", true);

let linkForce = d3
    .forceLink()
    .id(function (link) { return link.id });
    // .strength(function (link) { return link.value });
let simulation = d3.forceSimulation()
    .force("link", linkForce)
    .force("charge", d3.forceManyBody().strength(-120))
    .force('center', d3.forceCenter(width / 2, height / 2))
    // .force('collision', d3.forceCollide().radius(function(d) {
    //     return d.radius
    // }))
    .force('collision', d3.forceCollide().radius(NODE_RADIUS*2))
    .force("x", d3.forceX())
    .force("y", d3.forceY());

drag = () => {
    function dragstarted(d) {
        // console.log("drag start", d3.event);
        // console.log(d);
        startingNode = d;
        dragStream.next({
            type: NodeTypes.STARTING_NODE,
            action: NodeActions.HIGHLIGHT_NODE,
            value: startingNode
        });
        if (!d3.event.active) simulation.alphaTarget(0.0).restart();
        // d.fx = d.x;
        // d.fy = d.y;
    }
    function dragged(d) {
        // console.log("dragged", d);
        // d.fx = d3.event.x;
        // d.fy = d3.event.y;
        let node = findNodeFromLocation(d3.event.x, d3.event.y);
        if (node && node.id !== d.id) {
            // dragging destination
            // console.log(node.label);
            let isNewTarget = !targetNode || (targetNode && targetNode.id !== node.id);
            if (targetNode && isNewTarget) {
                dragStream.next({
                    type: NodeTypes.TARGET_NODE,
                    action: NodeActions.REMOVE_NODE_HIGHLIGHT,
                    value: targetNode
                });
            }
            targetNode = node;
            if (isNewTarget) {
                dragStream.next({
                    type: NodeTypes.TARGET_NODE,
                    action: NodeActions.HIGHLIGHT_NODE,
                    value: targetNode
                });
            }
        } else {
            if (targetNode) {
                dragStream.next({
                    type: NodeTypes.TARGET_NODE,
                    action: NodeActions.REMOVE_NODE_HIGHLIGHT,
                    value: targetNode
                });
                targetNode = null;
            }
        }
    }
    function dragended(d) {
        // console.log("drag ended", d3.event);
        // console.log(d);
        // d.fx = null;
        // d.fy = null;
        if (startingNode) {
            dragStream.next({
                type: NodeTypes.STARTING_NODE,
                action: NodeActions.REMOVE_NODE_HIGHLIGHT,
                value: startingNode
            });
            if (targetNode) {
                // TODO: use getNeighbors to ignore this edge if nodes are already neighbours
                addEdge(startingNode, targetNode);
                dragStream.next({
                    type: NodeTypes.TARGET_NODE,
                    action: NodeActions.REMOVE_NODE_HIGHLIGHT,
                    value: targetNode
                });
                targetNode = null;
            }
            startingNode = null;
            clusterIsolatedNodes();
        }
        if (!d3.event.active) simulation.alphaTarget(0.1).restart();
    }
    return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
}

function resetData() {
    nodes = [...baseNodes];
    links = [...baseLinks];
    updateSimulation();
    // NOTE: need to cluster after visualization is updated otherwise isIsolatedNode
    // logic would be incorrect
    clusterIsolatedNodes();
}

function clusterIsolatedNodes() {
    // will modify nodes (and not baseNodes) such that all "isolated" nodes
    // are removed and each such node_type will have a single cluster node
    isolated_node_ids = [];
    isolated_node_types = [];
    for (let node of nodes) {
        if (isIsolatedNode(node)) {
            if (!isolatedNodesOfType[node.node_type]) {
                isolatedNodesOfType[node.node_type] = {};
            }
            isolated_node_ids.push(node.id);
            isolated_node_types.push(node.node_type);
            // keep in history for later cluster expand/collapse
            isolatedNodesOfType[node.node_type][node.id] = node;
        } else {
            // remove from isolated ones if it was isolated before
            if (isolatedNodesOfType[node.node_type]) {
                delete isolatedNodesOfType[node.node_type][node.id];
            }
        }
    }
    nodes = nodes.filter(v => isolated_node_ids.indexOf(v.id) < 0);
    // create and add cluster nodes
    new Set(isolated_node_types).forEach(node_type => {
        nodes.push({
            id: uuid(),
            isClustedNode: true,
            label: getClusterNodeLabel(node_type),
            node_type: node_type,
            x: width / 2, // TODO: need proper starting x
            y: width / 2  // TODO: need proper starting y
        });
    });
    updateSimulation();
}

function toggleCluster(node_type) {
    // expands or collapses a cluster of isolated nodes
    if (isolatedNodesOfType[node_type]) {
        let clusterNode = nodes.find(v => v.isClustedNode && v.node_type === node_type);
        if (clusterNode) { // clustered > expand
            // remove cluster node from active nodes
            nodes.splice(clusterNode.index, 1); // TODO: make sure index is correct
            // add isolated nodes of this cluster to active nodes
            for (let nodeId in isolatedNodesOfType[node_type]) {
                // position nodes at the cluster so they expand from this location
                let isolatedNode = isolatedNodesOfType[node_type][nodeId];
                isolatedNode.x = clusterNode.x;
                isolatedNode.y = clusterNode.y;
                nodes.push(isolatedNode);
            }
        } else { // expanded > collapse
            let isolated_node_ids = Object.keys(isolatedNodesOfType[node_type]);
            nodes = nodes.filter(v => isolated_node_ids.indexOf(v.id) < 0);
            nodes.push({
                id: uuid(),
                isClustedNode: true,
                label: getClusterNodeLabel(node_type),
                node_type: node_type,
                x: width / 2, // TODO: need proper starting x
                y: width / 2  // TODO: need proper starting y
            });
        }
        updateSimulation();
    }
}

function updateTest2() {
    // will add a new node with links in the graph
    // TODO:
}

function updateSimulation() {
    updateGraph();
    simulation.nodes(nodes).on("tick", () => {
        nodeElements.attr("transform", d => ("translate(" + d.x + "," + d.y + ")"));
        linkElements
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);
    });
    simulation.force('link').links(links);
    simulation.force('collision', d3.forceCollide().radius(d => {
        return 1.3 * d3.select("#cr" + d.id).attr("r");
    }));
    simulation.alphaTarget(0.0).restart();
    console.log("updated simulation...");
}

function updateGraph() {
    // links
    linkElements = linkGroup
        .selectAll("line")
        .data(links, function (link) {
            return link.target.id + "-" + link.source.id;
        });

    linkElements.exit().remove();

    let linkEnter = linkElements
        .enter()
        .append('line')
        .attr("class", d => "link " + getLinkClass(d.link_type))
        .attr("stroke-width", d => Math.sqrt(d.value));

    linkElements = linkEnter.merge(linkElements);

    // nodes
    nodeElements = nodeGroup
        .selectAll("g")
        .data(nodes, function (node) { return node.id });

    nodeElements.exit().remove();

    let nodeEnter = nodeElements
        .enter()
        .append("g")
        .classed("node", true)
        .call(drag())

    // tooltips on node elements
    nodeEnter.append("title")
        .text(d => d.label);
    // label inside each node
    nodeEnter
        .append("text")
        .classed("node_label", true)
        .text(d => d.label)
        .attr("x", 0)
        .attr("y", 0);
    // NOTE: we add text first so bbox has a proper size when adding circles

    nodeEnter.append("circle")
        .lower() // will place an element as the first child of its parent
        .attr("cx", 0)
        .attr("cy", 0)
        .attr("id", d => "cr" + d.id)
        .attr("class", d => getNodeClass(d.node_type) + (d.isClustedNode ? " cluster_node" : ""))
        .attr("r", function (d) {
            return Math.max(NODE_RADIUS, 2*NODE_LABEL_PADDING + this.parentNode.getBBox().width / 2);
        });
    // adding neighbour highlighting for selected node
    nodeEnter.on('click', selectNode);
    nodeEnter.on('dblclick', toggleNeighbourhoodView);

    nodeElements = nodeEnter.merge(nodeElements);
}

function toggleNeighbourhoodView(selectedNode) {
    if (selectedId === selectedNode.id) {
        selectedId = undefined
        resetData();
    } else {
        selectedId = selectedNode.id
        limitToNghs(selectedNode);
        updateSimulation();
    }
}

function selectNode(selectedNode) {
    d3.event.stopPropagation(); // prevents deselectAll
    let neighbors = getNeighbors(selectedNode);
    nodeElements
        .classed("focused", node => neighbors.indexOf(node.id) >= 0)
    nodeElements
        .classed("defocused", node => neighbors.indexOf(node.id) < 0)
    linkElements
        .classed('focused', link => isNeighborLink(selectedNode, link))
    linkElements
        .classed('defocused', link => !isNeighborLink(selectedNode, link))

    console.log("isolated:", isIsolatedNode(selectedNode));
}

function deselectAll() {
    nodeElements
        .classed("focused", false)
        .classed("defocused", false);
    linkElements
        .classed("focused", false)
        .classed("defocused", false);
}

document.addEventListener("click", function() {
    deselectAll();
});

function setupVisualization() {
    resetData();
}
