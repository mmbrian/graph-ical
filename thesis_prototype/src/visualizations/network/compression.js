import { getNeighbors } from "../../scripts/helpers";
import { NodeTypes, isLabelNode } from "../../scripts/types";
const hx = require("hexagon-js");
import * as d3 from "d3";

// here we have logic related to reducing clutter in visualized graph by
// only visualizing a selected set of nodes and links at a time depending
// on their weights and user customized "zoom" level. this is the most
// important parameter that can be changed live by user and it is also part
// of template language i.e. it will be store in template file.
//
// node/link scores come from different factors such as how recent they were
// added, type priorities, degree, how close to cusor they are, ...
// for now we only implement the following:
//
// 1. every node has a score that is their degree i.e. deg(v)
//  1.1 a configurable spinner can set whether this is 1-ngh, 2-ngh, 3-ngh, ...
//  i.e. m-ngh degree for a node is the sum of degrees from all of its
//  m-neighborhood (m = 1 is the normal degree)
//  1.2 this spinner ranges from 1 to max path length in the data and steps by 1
//
// 2. every node also has a priority score that is a fixed constant. i.e.
// in our data we assume group nodes are more important than user nodes, and
// pixel sources are more important than displays, ...
//  2.1 this should also be configurable. the way it works is in template info
//  section, user should be able to reorder resources (vertically). the closer
//  a resource is to top, the more important we consider their nodes. this score
//  however is smaller than minimum degree (<1) since degree is a more important
//  factor. i.e. priority scores are scaled between 0 and 1
//  2.2 this score should be computed as imp_score_i = imp_number_i / (max_imp + 1)
//  so that even for the most imortant category of nodes it should be smaller than 1
//
// 3. every edge has a weight that is computed as 1 / (its length), this means
// shorter edges get higher scores (more close nodes). length is computed as
// the sum of line segment lengths and not the curve length. obviously this
// score is also below 1 always.
//
// 4. every edge has a weight that should be larger the more straight the edge is.
// i.e. we want to see more or less straigh lines and therefore edges that already
// are straighter get more priority. to compute it, we compute the distance from
// label node to straigh edge center for each edge, then divide this distance by
// its max among the edges, i.e. in the end it would be a number between 0 and 1
// which is smaller if the edge is more straight. finally we set
// straighness_score_i = 1 - (d_i / max_d)
//
// Observation:
// 1. not normalizing node degree scores results in them solely deciding the
// selection and it very well might be we have no links selected at all. we
// need to also normalize them so they are comparable to links.
// NOTE: based on observation 1, all score computations are adapted such that
// best elements get a score one and worst get a score 0, further if there are
// multiple sources of 0-1 scores for an element, final score is divided by the
// number of such sources. i.e. eventually all scores range from 0 to 1.
// 2. edge length and straighness scores only make sense if nodes and edges are
// already rendered. if not, with random starting positions the decision is
// quite random. unless we initialize properly.
// TODO TODO TODO
// IMPORTANT!! replace edge score with a topology score:
// 5. edge score is the sum of its node degrees (normalized to 0-1)
// i.e. an edge between two important nodes is more important
// e.g. consider a group with many users, has access to a pixel source.
// 6. in above if pixel source is not involved in any other relation, still its
// sharing edge should be more important than group member edges. i.e. we also
// need edge class scores
// however, if pixel source is connected to any other node, then sharing edge
// already get a higher score than all the membership edges which is what we want.
// TODO TODO TODO

export const computeSelectedNodesAndLinks = (vis, allNodes, allLinks, c, nodeClassCount) => {
    // given a fixed cap c that ranges from min_c = total_num_of_resource_types
    // to max_c = |allNodes| + |allLinks|, this methods first assigns scores
    // to each node/link, then sorts all of them based on their scores descendingly
    // and select the top c nodes/links.
    // the method finally also adds nodes to all selected links (in case their)
    // nodes are not selected. and return the set of selected nodes and links
    // plus this extra set of nodes. this is at every time only a subset of true
    // nodes and links in the graph. this subset is the entire graph once c is
    // set by user to its max value.
    //
    // NOTE: allNodes also includes edge label nodes
    // this methods returns a refined set of nodes, links and realLinks
    // for every node type that is partially represented in the final set of
    // nodes (not all instances included) we also add a cluster node. this
    // effectively replaces the old cluster logic
    let allNodesAndLinks = [];
    let node_class_score = 0;
    let node_degree = 0;
    let edge_length_score = 0;
    let edge_straighness_score = 0;
    let max_edge_mid_distance = -Infinity;
    let min_edge_mid_distance = Infinity;
    let max_node_degree = -Infinity;
    let min_edge_length = Infinity;
    let max_edge_length = -Infinity;
    let max_edge_degree = -Infinity;
    for (let node of allNodes) {
        // we use edge label nodes to identify links and compute their scores
        if (isLabelNode(node)) {
            // // 3.1 computing edge length score
            // let source = vis.getNodeById(node.source_node);
            // let target = vis.getNodeById(node.target_node);
            // let dx1 = node.x - source.x;
            // let dx2 = node.x - target.x;
            // let dy1 = node.y - source.y;
            // let dy2 = node.y - target.y;
            // let edge_length = Math.sqrt(dx1*dx1 + dy1*dy1) + Math.sqrt(dx2*dx2 + dy2*dy2);
            // if (edge_length < min_edge_length) {
            //     min_edge_length = edge_length;
            // }
            // if (edge_length > max_edge_length) {
            //     max_edge_length = edge_length;
            // }
            // // NOTE: edge length score is also computed such that shortest edge
            // // gets a score of 1, and longest 0
            // node.edge_length = edge_length;
            // // 4.1 we cannot compute straighness score here, we should first
            // // compute the max distance to mid point per edge, then later we
            // // use it to compute straighness scores
            // let dx = node.x - (source.x + target.x)*.5;
            // let dy = node.y - (source.y + target.y)*.5;
            // // TODO: ideally we should compute actual distance to the line segment
            // // between source and target and not the distance to mid-point
            // let d_i = Math.sqrt(dx*dx + dy*dy);
            // if (d_i > max_edge_mid_distance) {
            //     max_edge_mid_distance = d_i;
            // }
            // if (d_i < min_edge_mid_distance) {
            //     min_edge_mid_distance = d_i;
            // }
            // node.d_i = d_i;
        } else {
            // 1. computing node degree score
            let ngh = getNeighbors(node, allLinks);
            node.degree = ngh.length - 1; // -1 since it also includes the node itself
            // need to normalize degree scroes based on max degree before computing
            // final node score
            if (node.degree > max_node_degree) {
                max_node_degree = node.degree;
            }
            // 2. computing node class score
            if (nodeClassCount && node.class_index) {
                // class_index is 0 for the highest priority class, and increases by
                // 1 for other classes. least priority class gets index nodeClassCount-1
                node.class_score = 1 - (node.class_index / (nodeClassCount-1));
            } else {
                node.class_score = 0;
            }
        }
    }
    for (let node of allNodes.filter(n => !isLabelNode(n))) {
        // summing up node scores
        node.score = node.degree / max_node_degree + node.class_score;
        // two scores ranging from 0 to 1 > we normalize futher
        if (node.class_score > 0) {
            // only divide by 2 if class score is computed, otherwise we have 1
            // score
            node.score /= 2;
        }
        allNodesAndLinks.push(node);
        // NOTE:
        // node with max degree gets a score 1 from degree score.
        // same thing should apply to other scores. i.e. max should be always 1.
    }
    // 5.1 computing edge degrees based on already computed node degrees
    // here we only compute degrees and the max, scores based on these degrees
    // depend on the max which is why they are computed in the last step.
    for (let node of allNodes.filter(n => isLabelNode(n))) {
        let source = allNodes.find(n => {
            if (typeof node.source_node === "object") {
                return n.id === node.source_node.id;
            }
            return n.id === node.source_node;
        });
        let target = allNodes.find(n => {
            if (typeof node.target_node === "object") {
                return n.id === node.target_node.id;
            }
            return n.id === node.target_node;
        });
        if (source && target) {
            node.edge_degree = source.degree + target.degree;
        } else {
            node.edge_degree = 0;
        }
        if (node.edge_degree > max_edge_degree) {
            max_edge_degree = node.edge_degree;
        }
    }
    let d_mid_distance = max_edge_mid_distance - min_edge_mid_distance;
    let d_edge_length = max_edge_length - min_edge_length;
    for (let node of allNodes.filter(n => isLabelNode(n))) {
        // 4.2 now we can compute straighness scores for all links
        // edge with max straightness should get a score 1, and 0 for min straighness
        let t = (node.d_i - min_edge_mid_distance) / d_mid_distance;
        node.edge_straighness_score = 1 - t;
        // 3.2 we now use max and min edge lengths to computed a normalized score
        t = (node.edge_length - min_edge_length) / d_edge_length;
        node.edge_length_score = 1 - t;
        // 5.2
        node.edge_degree_score = node.edge_degree / max_edge_degree;
        // summing up scores
        // TODO: ignoring edge straighness and length scores for now untill initialization
        // of nodes is adapted such that they make sense.
        // node.score = node.edge_straighness_score + node.edge_length_score;
        node.score = node.edge_degree_score;
        // // two scores ranging from 0 to 1 > we normalize futher
        // node.score /= 2;
        allNodesAndLinks.push(node);
    }
    // NOTE: allNodes contains both nodes and links (by their edge label nodes)
    // next we sort allNodes based on "score" property descendingly.
    let sorted = allNodesAndLinks.sort((a, b) => b.score - a.score);
    // now we can select top c elements
    let finalNodeSet = [];
    let finalNodeSetIds = [];
    let finalEdgeSet = [];
    let currElement;
    let tmpNode;
    for (let i = 0; i<Math.min(c, sorted.length); i++) {
        currElement = sorted[i];
        if (isLabelNode(currElement)) {
            // selected element is a link. we need to also add its endpoints
            // in the result regardless of their selection (but no duplicates)
            // first we add the edge itself (both links with this label node)
            let edgeLinks = allLinks.filter(l => l.link_id && l.link_id === currElement.link_id);
            finalEdgeSet.push(...edgeLinks);
            // also need to add label node
            finalNodeSet.push(currElement);
            // TODO: do we need final realLinks?
            // next we add its endpoints
            if (currElement.source_node.id) {
                tmpNode = vis.getNodeById(currElement.source_node.id);
            } else {
                tmpNode = vis.getNodeById(currElement.source_node);
            }
            // only add source node if we haven't already done so
            if (!finalNodeSetIds.includes(tmpNode.id)) {
                finalNodeSetIds.push(tmpNode.id);
                finalNodeSet.push(tmpNode);
            }
            // same for target
            if (currElement.target_node.id) {
                tmpNode = vis.getNodeById(currElement.target_node.id);
            } else {
                tmpNode = vis.getNodeById(currElement.target_node);
            }
            if (!finalNodeSetIds.includes(tmpNode.id)) {
                finalNodeSetIds.push(tmpNode.id);
                finalNodeSet.push(tmpNode);
            }
        } else {
            // selected element is a node. we should add it unless it was added
            // before by a selected link
            if (!finalNodeSetIds.includes(currElement.id)) {
                finalNodeSetIds.push(currElement.id);
                finalNodeSet.push(currElement);
            }
        }
    }
    // finally we add a cluster node for each node type that does not have all
    // its nodes included in finalSet.
    // TODO: add cluster nodes
    // before we return data, we also update compression statu info
    let V = allNodes.filter(n => !isLabelNode(n)).length;
    let E = allNodes.filter(n => isLabelNode(n)).length;
    let v = finalNodeSet.filter(n => !isLabelNode(n)).length;
    let e = finalNodeSet.filter(n => isLabelNode(n)).length;
    updateCompressionStatusInfo({
        num_rendered_vertices: v,
        num_rendered_edges: e,
        num_hidden_elements: (V+E)-(v+e),
        c_max: V+E
    }, vis);
    // finalNodeSet and finalEdgeSet includes everything that needs to be rendered
    return {
        nodes: finalNodeSet,
        links: finalEdgeSet,
        c_max: V+E
    };
};

const updateCompressionStatusInfo = (cStats, vis) => {
    // TODO: min should be set based on template of the original graph i.e. 5 resources
    // in our pxio example since we have 5 class types
    // d3.select(vis.getSelector(".compression-toggle"))
    //     .attr("max", cStats.c_max);
    //
    let compressionStatsBar = hx.visualizationBar({
        segments: [
            {
                id: 'node_count',
                label: 'Nodes',
                count: cStats.num_rendered_vertices,
                type: 'danger',
            },
            {
                id: 'edge_count',
                label: 'Relations',
                count: cStats.num_rendered_edges,
                type: 'warning',
            },
            {
                id: 'compressed',
                label: 'Hidden Elements',
                count: cStats.num_hidden_elements,
            },
        ],
    });
    hx.select(vis.getSelector('.compressionStatusBar')).set([
        compressionStatsBar
    ]);
};
