// TODO: if we decided to use dagre, add it properly
// function createDagreGraph() {
//     // Create a new directed graph
//     let g = new dagre.graphlib.Graph();
//     // Set an object for the graph label
//     g.setGraph({});
//     // Default to assigning a new object as a label for each new edge.
//     g.setDefaultEdgeLabel(function() { return {}; });
//     // Add nodes to the graph. The first argument is the node id. The second is
//     // metadata about the node. In this case we're going to add labels to each of
//     // our nodes.
//     nodes.forEach(node => {
//         let r = d3.select("#cr" + node.id).attr("r");
//         g.setNode(node.id, {
//             label: node.label,
//             width: 2*r,
//             height: 2*r
//         });
//     });
//     console.log("set nodes on dagre graph...");
//     // Add edges to the graph.
//     links.forEach(link => {
//         g.setEdge(link.source.id, link.target.id);
//     });
//     console.log("set edges on dagre graph...");
//     dagre.layout(g);
//     // TODO: need to somehow customize layouting here i.e. specify algorithm and its params
//     // also need a better way of applying this layout to the existing graph
//     console.log("computed layout info for g...");
//     return g;
// }
//
// function updateGraphFromDagreLayout() {
//     g = createDagreGraph();
//     console.log("graph dimensions", g.width, g.height);
//     g.nodes().forEach(nodeId => {
//         let dagre_node = g.node(nodeId);
//         let d3_node = nodes.find(n => n.id === nodeId);
//         nodes[d3_node.index].x = dagre_node.x;
//         nodes[d3_node.index].y = dagre_node.y;
//     });
// }
