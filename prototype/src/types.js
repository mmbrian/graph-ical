// Enums /////////////////////////
const NodeTypes = Object.freeze({
    STARTING_NODE: "starting-node",
    TARGET_NODE: "target-node",
    USER_NODE: "user-node",
    GROUP_NODE: "group-node",
    DISPLAY_NODE: "display-node",
    DISPLAY_GROUP_NODE: "display-group-node",
    PIXEL_SOURCE_NODE: "pixel-source-node"
});
const NodeActions = Object.freeze({
    HIGHLIGHT_NODE: "highlight-node",
    REMOVE_NODE_HIGHLIGHT: "remove-node-highlight"
});
const LinkTypes = Object.freeze({
    OWNER_OF: "ownership",
    MEMBER_OF: "membership",
    SHARED_WITH: "sharing",
    PROJECTED_ON: "projection",
    UNKNOWN_EDGE: "unknown"
});
//////////////////////////////////
