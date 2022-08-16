import * as d3 from "d3";
import { NodeTypes, LinkTypes } from "./types";
import { MIN_RADIUS, MAX_RADIUS } from "../visualizations/network";
// import { NODE_CONTROLS_AREA_SIZE } from "../visualizations/network/style_util";
import { getTermTranslation } from "./rdf_terms_util";
export const MIN_NODE_WEIGHT = 0.5;

export const findNodeFromLocation = (x, y, nodes) => {
    return nodes.find(node => {
        let dx = node.x - x;
        let dy = node.y - y;
        let r = d3.select("#cr" + node.id).attr("r");
        return Math.sqrt(dx*dx + dy*dy) < r;
    });
};

export const isValidLink = (u, v) => {
    // return false if linking two nodes makes no sense
    // 1. disallow same node type links
    // TODO: later this can help create groups from two users, merge two user
    // groups, or create scenarios from pixel sources or displays and display groups
    if (u.node_type === v.node_type) return false;
    // 2. no links to cluster nodes
    if (u.isClustedNode || v.isClustedNode) return false;
    return true;
};

export const getLinkType = (u, v) => {
    return LinkTypes.UNKNOWN_EDGE;
};

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
};

export const getLinkId = (link) => {
    let targetId = typeof link.target === "object" ? link.target.id : link.target;
    let sourceId = typeof link.source === "object" ? link.source.id : link.source;
    return targetId + "-" + sourceId;
};

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
};

export const isNeighborLink = (node, link) => {
    let targetId = typeof link.target === "object" ? link.target.id : link.target;
    let sourceId = typeof link.source === "object" ? link.source.id : link.source;
    return targetId === node.id || sourceId === node.id;
};

export const getNodeOpacity = (node, neighbors) => {
    return neighbors.indexOf(node.id) >= 0 ? 1.0 : 0.5;
};
export const getLinkColor = (node, link) => {
    return isNeighborLink(node, link) ? 'green' : '#E5E5E5';
};

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
};

export const getClusterNodeLabel = (node_type) => {
    return "Unknown Cluster";
};

export const getNodeClass = (node_type) => {
    switch (node_type) {
    case NodeTypes.EDGE_LABEL_NODE:
        return "edge_label";
    default:
        return "unknown_node";
    }
};

export const getClusterStartingPosition = (clusterKey, network) => {
    // C:  number of rendered types
    // i: the index of cluster key (node-type) when all types
    // for rendered instances are sorted in a list
    let types = network.baseNodes.map(n => n.node_type);
    let uniqueTypes = Array.from(new Set(types)).sort();
    let C = uniqueTypes.length;
    let i = uniqueTypes.indexOf(clusterKey);
    // i represents cluster index from NodeCluster
    // returns cluster starting point on a circle centered around viewbox center
    let viewboxCenterX = 0;
    let viewboxCenterY = 0;
    let viewboxCenterOffset = Math.min(network.width, network.height) / 3.5;
    let ret = {
        x: Math.cos(i / C * 2 * Math.PI) * viewboxCenterOffset + viewboxCenterX,
        y: Math.sin(i / C * 2 * Math.PI) * viewboxCenterOffset + viewboxCenterY
    };
    return ret;
};

export const getLinkLabelSync = (link) => {
    // TODO: this is temporary. has to be fetched from repo
    return getTermTranslation(link);
    // switch (link) {
    //     case "foaf:member":
    //         return "member";
    //     case "foaf:maker":
    //         return "maker";
    //     case "foaf:name":
    //         return "name";
    //     case "pxio:sharedWith":
    //         return "shared with";
    //     case "rdf:type":
    //         return "type";
    //     case "foaf:depiction":
    //         return "depiction";
    //     case "pxio:projectedOn":
    //         return "projected on";
    //     case "foaf:img":
    //         return "image";
    //     default:
    //         return link;
    // }
};

export const getTypeLabelSync = (type) => {
    // TODO: this is temporary. has to be fetched from repo
    return getTermTranslation(type);
    // switch (type) {
    //     case "pxio:User":
    //         return "User";
    //     case "pxio:UserGroup":
    //         return "Group";
    //     case "entities:DisplayGroup":
    //         return "Display Group";
    //     case "entities:Display":
    //         return "Display";
    //     case "entities:PixelSource":
    //         return "Pixel Source";
    //     default:
    //         return type;
    // }
};
