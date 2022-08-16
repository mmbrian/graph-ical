// Enums /////////////////////////
export const NodeTypes = Object.freeze({
    // helper types
    STARTING_NODE: "starting-node",
    TARGET_NODE: "target-node",
    // default entity types
    USER_NODE: "user-node",
    GROUP_NODE: "group-node",
    DISPLAY_NODE: "display-node",
    DISPLAY_GROUP_NODE: "display-group-node",
    PIXEL_SOURCE_NODE: "pixel-source-node",
    SCENARIO_NODE: "scenario-node"
});
// NOTE: order is based on semantic of the data (around a circle)
// and other considerations, (see notes)
export const NodeCluster = {
    "pixel-source-node": 0,
    "group-node": 1,
    "user-node": 2,
    "display-node": 3,
    "display-group-node": 4,
    "scenario-node": 5
};
// number of entity clusters
export const C = 6; // (Pixel Sources) + Groups + Users + Displays + Display Groups + Scenarios

export const NodeActions = Object.freeze({
    HIGHLIGHT_NODE: "highlight-node",
    REMOVE_NODE_HIGHLIGHT: "remove-node-highlight"
});
export const LinkTypes = Object.freeze({
    OWNER_OF: "ownership",
    MEMBER_OF: "membership",
    SHARED_WITH: "sharing",
    PROJECTED_ON: "projection",
    UNKNOWN_EDGE: "unknown",
});

export const VisualizationTypes = Object.freeze({
    BASE_GRAPH: "base-graph", // base graph that contains all RDF statements to be rendered
    TEMPLATE_GRAPH: "template-graph", // contains only a template subset of the parent graph
    QUERY_GRAPH: "query-graph" // contains only a subset of RDF statement based on a SPARQL query
});
//////////////////////////////////
