import * as d3 from "d3";
import { NodeTypes, LinkTypes, NodeCluster, C } from "./types";
import { MIN_RADIUS, MAX_RADIUS } from "./index";
import { NODE_CONTROLS_STROKE_WEIGHT } from "./style_util";
export const MIN_NODE_WEIGHT = 0.5;

export const findNodeFromLocation = (x, y, nodes) => {
    return nodes.find(node => {
        let dx = node.x - x;
        let dy = node.y - y;
        let r = d3.select("#cr" + node.id).attr("r");
        return Math.sqrt(dx*dx + dy*dy) < r;
    });
}

export const isValidLink = (u, v) => {
    // return false if linking two nodes makes no sense
    // 1. disallow same node type links
    // TODO: later this can help create groups from two users, merge two user
    // groups, or create scenarios from pixel sources or displays and display groups
    if (u.node_type === v.node_type) return false;
    // 2. no links to cluster nodes
    if (u.isClustedNode || v.isClustedNode) return false;
    return true;
}

export const getLinkType = (u, v) => {
    // given two nodes, returns the link type that makes sense between them
    // NOTE: this assumes there can only be ONE relation between two entities!
    // NOTE: this method does not check if edge is valid! might still return a type
    let t2 = v.node_type;
    switch (u.node_type) {
    case NodeTypes.USER_NODE:
        if (t2 === NodeTypes.GROUP_NODE) {
            return LinkTypes.MEMBER_OF;
        } else {
            return LinkTypes.SHARED_WITH;
        }
        break;
    case NodeTypes.GROUP_NODE:
        if (t2 === NodeTypes.USER_NODE) {
            return LinkTypes.MEMBER_OF;
        } else {
            return LinkTypes.SHARED_WITH;
        }
        break;
    case NodeTypes.DISPLAY_NODE:
        if (t2 === NodeTypes.PIXEL_SOURCE_NODE) {
            return LinkTypes.PROJECTED_ON;
        } else if (t2 === NodeTypes.DISPLAY_GROUP_NODE) {
            return LinkTypes.MEMBER_OF;
        } else {
            return LinkTypes.SHARED_WITH;
        }
        break;
    case NodeTypes.DISPLAY_GROUP_NODE:
        if (t2 === NodeTypes.PIXEL_SOURCE_NODE) {
            return LinkTypes.PROJECTED_ON;
        } else if (t2 === NodeTypes.DISPLAY_NODE) {
            return LinkTypes.MEMBER_OF;
        } else {
            return LinkTypes.SHARED_WITH;
        }
        break;
    case NodeTypes.PIXEL_SOURCE_NODE:
        if (t2 === NodeTypes.DISPLAY_NODE || t2 === NodeTypes.DISPLAY_GROUP_NODE) {
            return LinkTypes.PROJECTED_ON;
        } else {
            return LinkTypes.SHARED_WITH;
        }
        break;
    default:
    }
    return LinkTypes.UNKNOWN_EDGE;
}

export const getNeighbors = (node, links) => {
    return links.reduce((neighbors, link) => {
        let targetId = typeof link.target === "object" ? link.target.id : link.target;
        let sourceId = typeof link.source === "object" ? link.source.id : link.source;
        if (targetId === node.id) {
            neighbors.push(sourceId);
        } else if (sourceId === node.id) {
            neighbors.push(targetId);
        }
        return neighbors;
    }, [node.id]);
}

export const getLinkId = (link) => {
    let targetId = typeof link.target === "object" ? link.target.id : link.target;
    let sourceId = typeof link.source === "object" ? link.source.id : link.source;
    return targetId + "-" + sourceId;
}

export const computeConnectedComponent = (node, links) => {
    // given a node, returns all links in a connected component part of the
    // graph defined by 'links' that includes node as a vertex
    let plannedToVisitNodes = [node];
    let componentNodes = [];
    let componentLinks = [];
    while (plannedToVisitNodes.length) {
        let currentNode = plannedToVisitNodes.pop();
        componentNodes.push(currentNode);
        for (let link of links
            .filter(link => !componentLinks.map(l => getLinkId(l)).includes(getLinkId(link)))
        ) { // TODO: ignores already visited component links, try to limit search to 1-neighbourhood links only
            let targetId = typeof link.target === "object" ? link.target.id : link.target;
            let sourceId = typeof link.source === "object" ? link.source.id : link.source;
            if (targetId === currentNode.id) {
                // next visit sourceId, if not already planned/visited
                if (!componentNodes.map(d => d.id).includes(sourceId) &&
                    !plannedToVisitNodes.map(d => d.id).includes(sourceId)) {
                    plannedToVisitNodes.push(link.source);
                    // add new component link along an unvisited path
                    componentLinks.push(link);
                }
            } else if (sourceId === currentNode.id) {
                // next visit targetId, if not already planned/visited
                if (!componentNodes.map(d => d.id).includes(targetId) &&
                    !plannedToVisitNodes.includes(targetId)) {
                    plannedToVisitNodes.push(link.target);
                    // add new component link along an unvisited path
                    componentLinks.push(link);
                }
            }
        }
    }
    return {
        nodes: componentNodes,
        links: componentLinks
    };
}

export const isNeighborLink = (node, link) => {
    let targetId = typeof link.target === "object" ? link.target.id : link.target;
    let sourceId = typeof link.source === "object" ? link.source.id : link.source;
    return targetId === node.id || sourceId === node.id;
}

export const getNodeOpacity = (node, neighbors) => {
    return neighbors.indexOf(node.id) >= 0 ? 1.0 : 0.5;
}
export const getLinkColor = (node, link) => {
    return isNeighborLink(node, link) ? 'green' : '#E5E5E5';
}

export const isIsolatedNode = (node, links, nodes) => {
    // true if there's at least 1 more node of this type and they are both
    // disconnected from any other node.
    // NOTE: if this is the only isolated node of its kind then we do not consider
    // it isolated as it should appear as itself and not within a cluster node
    // NOTE: all isolated nodes on a same kind are rendered only after user wants
    // to interact with the corresponding cluster node. by default they are replaced
    // by a single cluster node
    if (node.isClustedNode) return false;
    if (node.isLoggedInUser) return false;
    let nghs = getNeighbors(node, links);
    if (nghs.length > 1) return false;
    return nodes
        .filter(v => v.id !== node.id && v.node_type === node.node_type)
        .some(v => getNeighbors(v, links).length < 2);
}

export const getClusterNodeLabel = (node_type) => {
    switch (node_type) {
    case NodeTypes.USER_NODE:
        return "Users";
    case NodeTypes.GROUP_NODE:
        return "Groups";
    case NodeTypes.DISPLAY_NODE:
        return "Displays";
    case NodeTypes.DISPLAY_GROUP_NODE:
        return "Display Groups";
    case NodeTypes.PIXEL_SOURCE_NODE:
        return "Pixel Sources";
    case NodeTypes.SCENARIO_NODE:
        return "Scenarios";
    default:
        return "Unknown Cluster";
    }
}

export const getNodeClass = (node_type) => {
    switch (node_type) {
    case NodeTypes.USER_NODE:
        return "user";
    case NodeTypes.GROUP_NODE:
        return "group";
    case NodeTypes.DISPLAY_NODE:
        return "display";
    case NodeTypes.DISPLAY_GROUP_NODE:
        return "display_group";
    case NodeTypes.PIXEL_SOURCE_NODE:
        return "pixel_source";
    case NodeTypes.SCENARIO_NODE:
        return "scenario"
    default:
        return "unknown_node"
    }
}

export const getNodeSize = (node) => {
    // return a fraction "f" which has to be multiplied by MIN_RADIUS
    // as this category's default (min) node radius
    // max(f)*MIN_RADIUS must be strictly less than MAX_RADIUS so that
    // node size can always increase due to other measures i.e. focus
    // time, focused/not-focused, node edge weight (sum), ...
    if (node.isClustedNode) return 2.0 * MIN_NODE_WEIGHT;
    switch (node.node_type) {
    case NodeTypes.USER_NODE:
        return MIN_NODE_WEIGHT; // fraction of MIN_RADIUS
    case NodeTypes.GROUP_NODE:
        return 2 * MIN_NODE_WEIGHT; // fraction of MIN_RADIUS
    case NodeTypes.DISPLAY_NODE:
        return 1.3 * MIN_NODE_WEIGHT; // fraction of MIN_RADIUS
    case NodeTypes.DISPLAY_GROUP_NODE:
        return 2 * MIN_NODE_WEIGHT; // fraction of MIN_RADIUS
    case NodeTypes.PIXEL_SOURCE_NODE:
        return 1.5 * MIN_NODE_WEIGHT; // fraction of MIN_RADIUS
    case NodeTypes.SCENARIO_NODE:
        return 1.7 * MIN_NODE_WEIGHT; // fraction of MIN_RADIUS
    default:
        return MIN_NODE_WEIGHT;
    }
}

export const getNodeRadiusInfo = (node, links) => {
    let r = (getNodeSize(node) + getNodeWeight(node, links)) * MIN_RADIUS;
    r = Math.min(r, MAX_RADIUS);
    return {
        r: r, // actual radius used for rendering
        R: r + NODE_CONTROLS_STROKE_WEIGHT // radius used for collision forces
        // we add NODE_CONTROLS_STROKE_WEIGHT so that control are always within node region
    };
}

export const getNodeDegree = (node, links) => {
    // number of edges connected to this node
    let n = 0;
    for (let link of links) {
        if (isNeighborLink(node, link)) {
            n++;
        }
        // TODO: in future we can increase weight of node due to degree
        // by summing up all edges in the connected sub-graph (component)
        // instead of immediate neighbours i.e. nodes which are in bigger
        // components are more important and should be rendered bigger
    }
    return n;
}

export const getNodeFocusFactor = (node) => {
    // 1. return higher the more recent a node is used or the newer it is
    // added (new vfb, newlly created display group, ...)
    // 2. also return higher the more time user is focused on this node
    // with cursor
    // 3. also return higher if node is hovered right now or if it was
    // hovered just recently (fade reduce importance on hover changes)
    // TODO:
}

export const getNodeWeight = (node, links) => {
    // return a number representing importance of a node. the larger the
    // weight the larger it should be relatively rendered. weight is
    // calculated based on different factors such as degree of node in
    // the graph or focus factors (see above)
    // NOTE: for now we just use degree
    // NOTE: nodes have a min weight of > 0 so that innerRadius is always smaller
    // than the actual radius
    return MIN_NODE_WEIGHT + getNodeDegree(node, links) / 3.0; // full +1 factor for every 3 neighbours
    // TODO: if node.isClustedNode, make weight based on number of nodes within
    // this cluster
}

export const getNodeIcon = (node_type) => {
    switch (node_type) {
    case NodeTypes.USER_NODE:
        return "\uf2bd"; // fa-user-circle
    case NodeTypes.GROUP_NODE:
        return "\uf0c0"; // fa-users
    case NodeTypes.DISPLAY_NODE:
        return "\uf26c"; // fa-tv
    case NodeTypes.DISPLAY_GROUP_NODE:
        return "\uf009"; // fa-th-large
    case NodeTypes.PIXEL_SOURCE_NODE:
        return "\uf87c"; // fa-photo-video
    case NodeTypes.SCENARIO_NODE:
        return ""; // TODO: find a good scenario icon
    default:
        return "\uf059"; // fa-question-circle
    }
}

export const getNodeClusterNumber = (node) => {
    return NodeCluster[node.node_type];
}

export const getClusterStartingPosition = (i) => {
    // i represents cluster index from NodeCluster
    // returns cluster starting point on a circle centered around viewbox center
    // TODO: instead of basically position around a circle, use category
    // centroids as described in notes
    // NOTE: for now use this logic as initial position of every node that
    // is to be added to cluster i
    let viewboxCenterX = 0;
    let viewboxCenterY = 0;
    let viewboxCenterOffset = window.innerWidth / 3.0;
    return {
        x: Math.cos(i / C * 2 * Math.PI) * viewboxCenterOffset + viewboxCenterX,
        y: Math.sin(i / C * 2 * Math.PI) * viewboxCenterOffset + viewboxCenterY
    }
}

export const getLinkClass = (link_type) => {
    switch (link_type) {
    case LinkTypes.OWNER_OF:
        return "owner";
        break;
    case LinkTypes.MEMBER_OF:
        return "member";
        break;
    case LinkTypes.SHARED_WITH:
        return "shared";
        break;
    case LinkTypes.PROJECTED_ON:
        return "projected";
        break;
    default:
    }
}
