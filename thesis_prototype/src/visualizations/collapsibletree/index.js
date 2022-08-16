require("./style.scss");
const hx = require("hexagon-js");
import * as d3 from "d3";
const uuidv4 = require("uuid/v4");
import {
  rawSparqlQuery,
  fetchListFromInstance,
  isInstanceCollection
} from "../../scripts/rest_util";
import { shortenWithPrefix, unshorten } from "../../scripts/data";
import { sleep } from "../../scripts/util";
import { VisTypes, BaseVisualization } from "../BaseVisualization";
import { getLinkLabelSync, getTypeLabelSync } from "../../scripts/helpers";

// Originally based on https://bl.ocks.org/d3noob/1a96af738c89b88723eb63456beb6510
// For dynamic mutation of tree see discussion and ideas here https://github.com/d3/d3-hierarchy/issues/139#issuecomment-524638341
//  - we mutate the original data and recreate the entire graph instead of mutating the graph
// for async fetch of data from triple store we need sparql propery path queries
// see https://www.w3.org/TR/sparql11-property-paths/


// TODO:
// 1. create activeTreeData from a propery graph sparql query on an instance
// something like
//
// PREFIX foaf: <http://xmlns.com/foaf/0.1/#>
// PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
// PREFIX pxio: <http://www.pxio.de/#>
// PREFIX pxiopeople: <http://www.pxio.de/people/about/#>
// SELECT ?s ?p ?o
// WHERE
// {
//    ?s foaf:member | foaf:name | foaf:maker | rdfs:label | pxio:sharedWith | ^foaf:member | ^foaf:name | ^foaf:maker | ^rdfs:label | ^pxio:sharedWith ?o .
//    FILTER ( ?s = pxiopeople:users.mohsen )
// }
//
// where it checks all predicates in both ways
//
// NOTE: the above can be simplified with a select query like
// PREFIX pxiopeople: <http://www.pxio.de/people/about/#>
// SELECT * WHERE
// {
//   {pxiopeople:users.mohsen ?p ?o .}
//   UNION
//   {?s ?p pxiopeople:users.mohsen .}
// }
//
// where it returs all triples thei users.mohsen as subject or object
//
// 2. upon clicking a child, perform a new query with the selected node as target
// and dynamically change the data.
// 3. add defs and a new g to hold label text elements
//  3.1 when adding links, create a text elmnt with d.data.relation
//  3.2 also at the same time create a path in defs with this link path.d
//  and add it as textPath inside the corresponding text elmnt

// more TODO:
// - node label is not guaranteed to be unique (e.g. group member can also be maker)
// therefore we need to match old vs new nodes using the full triple info

const LEFT_OFFSET = 20; // TODO: must be large enough to have room for root label
const DEPTH_GAP = 180;
const MARGIN = {top: 20, right: 30, bottom: 20, left: 0};
const TRANSITION_DURATION = 700;
const NODE_RADIUS = 10;

export default class InstanceInfoTree extends BaseVisualization {

    constructor(tabContentId, options) {
        super(
            "instance_tree", // title
            tabContentId,
            options
        );
        this.vis_type = VisTypes.COLLAPSIBLE_TREE;
        this.seenInstanceParent = {}; // to keep track of what instances are already rendered
        let instance = this.options.initial_instance;
        this.baseContainer.classed("tree_selected", true);
        this.contentContainer.classed("tree_content", true);
        this.initDomElements();
        this.showingAllLabels = this.options.showingAllLabels;
        this.setTitle(instance);
        this.activeTreeData =  {
                name: instance,
            };
        this.width = 400 - (MARGIN.left + MARGIN.right);
        this.height = 300 - (MARGIN.top + MARGIN.bottom) - 30;
        this.treemap = d3.tree()
            .size([this.height, this.width]);
        const container = d3.select(this.getSelector(".tree_content"));
        this.svgP = container.append("svg")
            .classed("tree_svg", true)
            .attr("width", this.width + (MARGIN.left + MARGIN.right))
            .attr("height", this.height + (MARGIN.top + MARGIN.bottom));
        this.defs = this.svgP.append("defs");
        this.svg = this.svgP.append("g")
            .attr("transform", "translate(" + MARGIN.left + "," + MARGIN.top + ")");
        this.initRoot();
        this.makeMovableAndResizable((width, height) => {
            this.updateSize(width, height);
        });
    };

    updateSize(width, height) {
        this.width = width - (MARGIN.left + MARGIN.right);
        this.height = height - (MARGIN.top + MARGIN.bottom) - 30;
        this.treemap = d3.tree()
            .size([this.height, this.width]);
        this.svgP.attr("width", this.width + (MARGIN.left + MARGIN.right))
            .attr("height", this.height + (MARGIN.top + MARGIN.bottom));
        // TODO: update position of rendered tree
    }

    initDomElements () {
        this.addToggleSetting("Show all link labels", (showAll) => {
            this.showingAllLabels = showAll;
            this.svg.selectAll("text.link_label")
                .classed("force_show_labels", showAll);
        });
    };

    getTemplateRDF() {
        let quads = super.getTemplateRDF();
        const viewContext = this.getViewNamedGraph();
        // TODO: add collapsible specific template data to quads
        return quads;
    }

    async initRoot () {
        let self = this;
        this.root = d3.hierarchy(this.activeTreeData, function(d) { return d.children; });
        this.root.x0 = this.height / 2;
        this.root.y0 = LEFT_OFFSET;
        // if (this.root.children) {
        //     // Collapse after the second level
        //     this.root.children.forEach((ch) => { this.collapse(ch); });
        // }
        this.update(this.root);
        await sleep(500); // TODO: this delay should be the soonest we can perform the click
        this.svg.selectAll('g.node')
            .filter(d => d.id === this.root.id)
            .dispatch("click");

        self.maxTreeLabelWidth = -Infinity;
        // compute max label width once the entire tree is rendered
        this.svg.selectAll("text.tree_label").each(function (d, i) {
            let tl = d3.select(this).node().getComputedTextLength();
            if (tl > self.maxTreeLabelWidth) {
                self.maxTreeLabelWidth = tl;
            }
        });
        self.maxTreeLabelWidth = Math.max(self.maxTreeLabelWidth, 100);
    }

    async updateRootInstance (instance) {
        this.activeTreeData =  {
                name: instance,
            };
        if (this.root.Children) {
            this.collapse(this.root);
            await sleep(TRANSITION_DURATION + 10);
        }
        this.initRoot();
        this.setTitle(instance);
    }

    // Collapse the node and all it's children
    collapse(d) {
        if (d.children) {
            this.svg.selectAll('path.link')
                .filter(_d => _d.id === d.id)
                .classed("selected", false);
            d.children.forEach((ch) => { this.collapse(ch); });
            d.children = null;
            if (d.data.treeNode) {
                // also removes children from the active tree data
                d.data.treeNode.children = null;
            }
        }
    }

    update(source, isExpanding = true) {
        let self = this;
        // Assigns the x and y position for the nodes
        var treeData = self.treemap(self.root);
        // Compute the new tree layout.
        self.nodes = treeData.descendants();
        self.links = treeData.descendants().slice(1);
        var oldNodes;

        // Normalize for fixed-depth.
        self.nodes.forEach(function(d){
            d.y = d.depth * 180 + LEFT_OFFSET;
        });

        // ****************** Nodes section ***************************

        // Update the nodes...
        var node = self.svg.selectAll('g.node')
            .data(self.nodes, function(d) {return d.id || (d.id = uuidv4()); });

        // Enter any new modes at the parent's previous position.
        var nodeEnter = node.enter().append('g')
            .attr('class', (d) => {
                let isRoot = d.depth === 0;
                return 'node' + (isRoot ? " root_node" : "");
            })
            .attr("transform", function(d) {
                return "translate(" + source.y0 + "," + source.x0 + ")";
            })
            .on('click', function (d, e) {
                self.click(d, e, self);
            });

        // Add Circle for the nodes
        nodeEnter.append('circle')
            .attr('class', 'node')
            .attr('r', 1e-6)
            .style("fill", function(d) {
                return d._children ? "lightsteelblue" : "#fff";
            });

        // Add labels for the nodes
        nodeEnter.append('text')
            .classed("tree_label", true)
            .attr("dy", ".35em")
            .attr("x", function(d) {
                return d.children || d._children ? -13 : 13;
            })
            .attr("text-anchor", function(d) {
                return d.children || d._children ? "end" : "start";
            })
            .text(function(d) { return d.data.name; });
        nodeEnter.select("text")
            .filter(d => d.depth === 0)
            .text("");
        // UPDATE
        var nodeUpdate = nodeEnter.merge(node);

        // Transition to the proper position for the node
        nodeUpdate.transition()
            .duration(TRANSITION_DURATION)
            .attr("transform", function(d) {
                return "translate(" + d.y + "," + d.x + ")";
            });

        // Update the node attributes and style
        nodeUpdate.select('circle.node')
            .attr('r', NODE_RADIUS)
            .style("fill", function(d) {
                return d._children ? "lightsteelblue" : "#fff";
            })
            .attr('cursor', 'pointer');


        // Remove any exiting nodes
        var nodeExit = node.exit().transition()
            .duration(TRANSITION_DURATION)
            .attr("transform", function(d) {
                return "translate(" + source.y + "," + source.x + ")";
            })
            .remove();

        // On exit reduce the node circles size to 0
        nodeExit.select('circle')
            .attr('r', 1e-6);

        // On exit reduce the opacity of text labels
        nodeExit.select('text')
            .style('fill-opacity', 1e-6);

        // ****************** links section ***************************

        // Update the links...
        var link = self.svg.selectAll('path.link')
            .data(self.links, function(d) { return d.id; });

        // Enter any new links at the parent's previous position.
        var linkEnter = link.enter().insert('path', "g")
            .attr("class", "link")
            .attr('d', function(d) {
                // console.log("link d", d);
                var o = {x: source.x0, y: source.y0};
                return diagonal(o, o);
            })
            .on("mouseover", function (d, e) {
                // console.log("mouse hover");
                self.svg.selectAll("text.link_label")
                    .filter(_d => d.id === _d.id)
                    .classed("visible", true);
            })
            .on("mouseout", function (d, e) {
                // console.log("mouse out");
                self.svg.selectAll("text.link_label")
                    .filter(_d => d.id === _d.id)
                    .classed("visible", false);
            });

        let labelPaths = self.defs.selectAll("path")
            .data(self.links, function(d) { return d.id; });
        labelPaths
            .enter()
            .append("path")
            .classed("link_textPath", true)
            .attr("id", d => "textPathFor" + d.id);
        labelPaths.exit().remove();

        let labelTexts = self.svg.selectAll("text.link_label")
            .data(self.links, function(d) { return d.id; });
        labelTexts
            .enter()
            .append("text")
            .classed("link_label", true)
            .classed("force_show_labels", self.showingAllLabels)
            .each(function (d) {
                let _self = d3.select(this);
                _self.append("textPath")
                    .attr("startOffset", 70)//NODE_RADIUS + 3)
                    .attr("href", "#textPathFor" + d.id)
                    .text(d => d.data.relation);
            });
        labelTexts.exit().remove();

        // UPDATE
        var linkUpdate = linkEnter.merge(link);

        // Transition back to the parent element position
        linkUpdate.transition()
            .on("start", (d) => {
                if (isExpanding) {
                    self.updateWidth();
                }
                // defs.select("path#textPathFor" + d.id)
                //     .classed("invisible", true);
                self.svg.selectAll("text.link_label")
                    .filter(_d => _d.id === d.id)
                    .classed("invis", true);
            })
            .on("end", (d) => {
                if (!isExpanding) {
                    self.updateWidth();
                }
                self.defs.select("path#textPathFor" + d.id)
                    .attr("d", diagonal(d.parent, d));
                self.svg.selectAll("text.link_label")
                    .filter(_d => _d.id === d.id)
                    .classed("invis", false);
            })
            .duration(TRANSITION_DURATION)
            .attr('d', function(d){
                 return diagonal(d.parent, d);
             });

        // Remove any exiting links
        var linkExit = link.exit().transition()
            .on("end", () => { self.updateWidth(); })
            .duration(TRANSITION_DURATION)
            .attr('d', function(d) {
                var o = {x: source.x, y: source.y};
                let newPathD = diagonal(o, o);
                self.defs.select("path#textPathFor" + d.id)
                   .attr("d", newPathD);
                return newPathD;
            })
            .remove();

        // Store the old positions for transition.
        self.nodes.forEach(function(d){
            d.x0 = d.x;
            d.y0 = d.y;
        });
    }

    updateWidth() {
        // resize svg based on the farthest visible node
        let maxY = Math.max(...this.nodes.map(n => n.y));
        this.svgP.attr("width", maxY + LEFT_OFFSET + 2*this.maxTreeLabelWidth);
    };

    setOldNodeId(node) {
        // TODO: also check parent names
        let oldNode = this.oldNodes.find(n => {
            return n.data.name === node.data.name &&
                n.data.relation === node.data.relation;
        });
        if (oldNode) {
            node.id = oldNode.id;
            if (node.children) {
                node.children.forEach(ch => this.setOldNodeId(ch));;
            }
        }
    }

    // Toggle children on click.
    async click(d, e, self) {
        console.log("clicked ", d);
        // TODO: select should not happen as it changes the root of tree here
        // there should be another mechanism to update selected instance details
        // without actually selecting here
        // self.selectStream.next({
        //     subject: unshorten(d.data.name),
        //     // type: self.entityTitle,
        //     selectSource: "collapsible-tree",
        //     // sameList: true,
        //     domSelector: (x) => self.getSelector(x)
        // });
        if (!d.children) {
            // first we check if anywhere in current tree this clicked instance
            // is expanded, if so, we need to collapse it first
            let duplicate = self.nodes.find(n => {
                return n.data.name === d.data.name &&
                    n.id !== d.id;
            });
            if (duplicate && duplicate.children) {
                console.log("found DUPLICATE!!!");
                self.collapse(duplicate);
                self.update(duplicate, false);
                await sleep(TRANSITION_DURATION + 10);
            }
            isInstanceCollection(d.data.name)
                .then(async (isList) => {
                    let children = [];
                    if (isList) {
                        children = await self.getInstanceListItems(d.data.name);
                    } else {
                        children = await self.getInstanceOneNeighbourhood(d.data.name);
                    }
                    if (typeof children === "object") {
                        // first we mutate the original data to include newlly fetched data
                        let isRoot = false;
                        if (!d.data.isChild && self.activeTreeData.name === d.data.name) {
                            self.activeTreeData.children = children;
                            isRoot = true;
                        } else {
                            // check all descendants
                            updateDescendantChildren(self.activeTreeData, d, children);
                        }
                        // console.log("active tree is now", self.activeTreeData, d);
                        // need to keep track of old node ids
                        self.oldNodes = self.nodes; // TODO: copy, self might cause reference issues
                        // now we recreate the tree
                        self.root = d3.hierarchy(self.activeTreeData, function(d) { return d.children; });
                        // now we make sure any existing node gets the same id so
                        // that transition apply to old dom element and not create new ones
                        self.setOldNodeId(self.root);
                        self.update(d, true);
                        d.data.selected = true;
                        if (!isRoot) {
                            // highlight the link to root
                            self.svg.selectAll('path.link')
                                .filter(_d => _d.id === d.id)
                                .classed("selected", true);
                        }
                    }
                });
        } else {
            self.collapse(d);
            self.update(d, false);
        }
    }

    getInstanceListItems(instance) {
        return new Promise(async function(resolve, reject) {
            let items = await fetchListFromInstance(instance);
            let ret = [];
            for (let i=0; i<items.length; i++) {
                ret.push({
                    relation: i+1,
                    name: items[i], // TODO or get a literal label for item
                    isChild: true
                });
            }
            resolve(ret);
        });
    }

    // TODO: change this method to use sparql DESCRIBE statement, e.g.
    //
    // PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    // PREFIX foaf: <http://xmlns.com/foaf/0.1/#>
    // DESCRIBE ?x
    // WHERE {
    //   ?x rdf:type foaf:Person.
    //   ?x foaf:name "Mohsen";
    // }
    //
    // returns all statements regarding pxiopeople:users.mohsen as subject or object
    //
    getInstanceOneNeighbourhood(instance) {
        // computes all triples matching the form
        //      instance ?p ?o
        // or
        //      ?s ?p instance
        // NOTE: instance has to have a valid prefix (short form e.g. pxiopeople:users.mohsen)
        // NOTE: we need to remove any new children with existing info
        // const prefix = instance.substring(0, instance.indexOf(":"));
        // console.log("prefixes are:", window.activeRepoNameSpaces);
        // const prefixUri = window.activeRepoNameSpaces[prefix];
        // we add all prefixes cause they might appear in minus statements
        let self = this;
        let prefixStatements = "";
        for (let prefix in window.activeRepoNameSpaces) {
            prefixStatements += "PREFIX " + prefix + ": <" + window.activeRepoNameSpaces[prefix] + ">";
        }
        let query = prefixStatements;
        let parent = self.seenInstanceParent[instance];
        let minusStatements = "";
        if (parent) {
            query += "SELECT ?s ?p ?o WHERE {" +
                "{" + instance + " ?p ?o ." +
                " FILTER(?o != " + parent + ") .}" +
                "UNION" +
                "{?s ?p " + instance + " ." +
                " FILTER(?s != " + parent + ") .}" +
                "}";
        } else {
            query += "SELECT * WHERE {" +
                "{" + instance + " ?p ?o .}" +
                "UNION" +
                "{?s ?p " + instance + " .}" +
                "}";
        }
        // console.log("performing query: ", query);
        return new Promise(function(resolve, reject) {
            rawSparqlQuery(self.options.repoUri, query)
                .then(response => {
                    if (response.data) {
                        let ret = response.data.results.bindings;
                        // console.log("query response is", ret);
                        // need to transform ret into an array of objects with name and
                        // relation to add as children to instance node in the tree
                        let children = [];
                        for (let spo of ret) {
                            let child = {};
                            let isUriInstance = true;
                            child.relation = getLinkLabelSync(shortenWithPrefix(spo.p.value));
                            if (spo.o) {
                                child.name = shortenWithPrefix(spo.o.value);
                                isUriInstance = spo.o.type === "uri";
                            } else {
                                child.name = shortenWithPrefix(spo.s.value);
                                isUriInstance = spo.s.type === "uri";
                                if (child.name.startsWith("pxio:event_")) {
                                    // NOTE: ignoring descriptions about events
                                    continue;
                                }
                            }
                            if (isUriInstance) {
                                // we keep track of spo information for every child instance
                                // so that when they are clicked we exclude the spos
                                // about them we have already fetched before
                                self.seenInstanceParent[child.name] = instance;
                            }
                            child.isChild = true;
                            children.push(child);
                        }
                        resolve(children);
                    } else {
                        reject("No children found");
                    }
                })
                .catch(error => {
                    reject("Error when querying children");
                });
        });
    }
}

InstanceInfoTree.getAllTrees = () => {
    return BaseVisualization.visualizations.filter(
        v => v.vis_type === VisTypes.COLLAPSIBLE_TREE
    );
};

// Creates a curved (diagonal) path from parent to the child nodes
export const diagonal = (s, d) => {
    let path = `M ${s.y} ${s.x}
    C ${(s.y + d.y) / 2} ${s.x},
      ${(s.y + d.y) / 2} ${d.x},
      ${d.y} ${d.x}`;
    return path;
};

const updateDescendantChildren = (source, target, newChildren) => {
    // checks if any of source.children matches target, then will update
    // it with newChildren
    // TODO: also make sure parents match
    if (source.children) {
        for (let ch of source.children) {
            if (ch.name === target.data.name && ch.relation === target.data.relation) {
                ch.children = newChildren;
                target.data.treeNode = ch;
                return;
            }
        }
        // if no matches were found at this depth, recursively look into data
        // in deeper depths of the tree
        for (let ch of source.children) {
            updateDescendantChildren(ch, target, newChildren);
        }
    }
};
