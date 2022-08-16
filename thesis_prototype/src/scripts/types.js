// Enums /////////////////////////
export const NodeTypes = Object.freeze({
    // helper types
    STARTING_NODE: "starting-node",
    TARGET_NODE: "target-node",
    EDGE_LABEL_NODE: "edge-label-node",
});

export const isLabelNode = (d) => d && d.node_type === NodeTypes.EDGE_LABEL_NODE;

export const NodeActions = Object.freeze({
    HIGHLIGHT_NODE: "highlight-node",
    REMOVE_NODE_HIGHLIGHT: "remove-node-highlight"
});
export const LinkTypes = Object.freeze({
    EDGE_LABEL: "label-link",
    UNKNOWN_EDGE: "unknown",
});

export const PxioEventType = Object.freeze({
    ADD_U_TO_G: "Add User to Group",
    REMOVE_U_FROM_G: "Remove User from Group",
    ADD_D_TO_DG: "Add Display to Display Group",
    REMOVE_D_FROM_DG: "Remove Display from Display Group",
    PROJECT: "Project Source on Display Group",
    REMOVE_PROJECTION: "Remove Source Projection from Display Group",
    SHARE_DG_WITH_USER: "Share Display Group with User",
    SHARE_DG_WITH_GROUP: "Share Display Group with User Group",
    SHARE_SOURCE_WITH_USER: "Share Pixel Source with User",
    SHARE_SOURCE_WITH_GROUP: "Share Pixel Source with User Group",
    UNSHARE_DG_WITH_USER: "Remove Sharing between Display Group and User",
    UNSHARE_DG_WITH_GROUP: "Remove Sharing between Display Group and User Group",
    UNSHARE_SOURCE_WITH_USER: "Remove Sharing between Pixel Source and User",
    UNSHARE_SOURCE_WITH_GROUP: "Remove Sharing between Pixel Source and User Group",
    REMOVE_USER: "Remove User",
    ADD_USER: "Add User",
    REMOVE_GROUP: "Remove Group",
    ADD_GROUP: "Add Group",
    REMOVE_DG: "Remove Display Group",
    ADD_DG: "Add Display Group",
    CANCEL: "Cancel"
});

export const EventType = Object.freeze({
    ADD_INSTANCE: "add-instance",
    REMOVE_INSTANCE: "remove-instance",
    ADD_RELATION: "add-relation",
    REMOVE_RELATION: "remove-relation"
});
//////////////////////////////////
