let findNodeFromLocation = (x, y) => {
    return nodes.find(node => {
        let dx = node.x - x;
        let dy = node.y - y;
        let r = d3.select("#cr" + node.id).attr("r");
        return Math.sqrt(dx*dx + dy*dy) < r;
    });
}

function addEdge(u, v) {
    if (!isValidLink(u, v)) {
        console.log("Link no allowed!");
        return;
    }
    let type = getLinkType(u, v);
    // update active graph
    links.push({
        source: u,
        target: v,
        link_type: type,
        value: 0.2 // TODO
    });
    // also change base graph
    baseLinks.push({
        source: u,
        target: v,
        link_type: type,
        value: 0.2
    })
    updateSimulation();
}

function isValidLink(u, v) {
    // return false if linking two nodes makes no sense
    // 1. disallow same node type links
    // TODO: later this can help create groups from two users, merge two user
    // groups, or create scenarios from pixel sources or displays and display groups
    if (u.node_type === v.node_type) return false;
    // 2. no links to cluster nodes
    if (u.isClustedNode || v.isClustedNode) return false;
    return true;
}

function getLinkType(u, v) {
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

function limitToNghs(selectedNode) {
    // given a selected node, modifies links and nodes in the graph to contrain
    // it only to immediate neighbourhood of the selected graph

    var neighbors = getNeighbors(selectedNode);
    var newNodes = baseNodes.filter(function (node) {
        return neighbors.indexOf(node.id) > -1 || node.level === 1
    });

    var diff = {
        removed: nodes.filter(function (node) { return newNodes.indexOf(node) === -1 }),
        added: newNodes.filter(function (node) { return nodes.indexOf(node) === -1 })
    };

    diff.removed.forEach(function (node) { nodes.splice(nodes.indexOf(node), 1) });
    diff.added.forEach(function (node) { nodes.push(node) });

    links = links.filter(function (link) {
        return link.target.id === selectedNode.id || link.source.id === selectedNode.id
    });
}

function getNeighbors(node) {
    return links.reduce((neighbors, link) => {
        if (link.target.id === node.id) {
            neighbors.push(link.source.id);
        } else if (link.source.id === node.id) {
            neighbors.push(link.target.id);
        }
        return neighbors;
    }, [node.id]);
}

function isNeighborLink(node, link) {
    return link.target.id === node.id || link.source.id === node.id;
}

function getNodeOpacity(node, neighbors) {
    return neighbors.indexOf(node.id) >= 0 ? 1.0 : 0.5;
}
function getLinkColor(node, link) {
    return isNeighborLink(node, link) ? 'green' : '#E5E5E5';
}

function isIsolatedNode(node) {
    // true if there's at least 1 more node of this type and they are both
    // disconnected from any other node.
    // NOTE: if this is the only isolated node of its kind then we do not consider
    // it isolated as it should appear as itself and not within a cluster node
    // NOTE: all isolated nodes on a same kind are rendered only after user wants
    // to interact with the corresponding cluster node. by default they are replaced
    // by a single cluster node
    let nghs = getNeighbors(node);
    if (nghs.length > 1) return false;
    return nodes
        .filter(v => v.id !== node.id && v.node_type === node.node_type)
        .some(v => getNeighbors(v).length < 2);
}

function getClusterNodeLabel(node_type) {
    switch (node_type) {
    case NodeTypes.USER_NODE:
        return "Users";
        break;
    case NodeTypes.GROUP_NODE:
        return "Groups";
        break;
    case NodeTypes.DISPLAY_NODE:
        return "Displays";
        break;
    case NodeTypes.DISPLAY_GROUP_NODE:
        return "Display Groups";
        break;
    case NodeTypes.PIXEL_SOURCE_NODE:
        return "Pixel Sources";
        break;
    default:
    }
}

function getNodeClass(node_type) {
    switch (node_type) {
    case NodeTypes.USER_NODE:
        return "user";
        break;
    case NodeTypes.GROUP_NODE:
        return "group";
        break;
    case NodeTypes.DISPLAY_NODE:
        return "display";
        break;
    case NodeTypes.DISPLAY_GROUP_NODE:
        return "display_group";
        break;
    case NodeTypes.PIXEL_SOURCE_NODE:
        return "pixel_source";
        break;
    default:
    }
}

function getLinkClass(link_type) {
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
