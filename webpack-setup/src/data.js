const fs = require('fs');
const N3 = require('n3');
const turtleParser = new N3.Parser({ format: 'Turtle' });
import { NodeTypes, LinkTypes } from "./types";

// initial data //////////////////
export const _baseNodes = [
    {
        id: "0", label: "Mohsen",
        node_type: NodeTypes.USER_NODE,
        isLoggedInUser: true
    },
    {id: "1", label: "Alex", node_type: NodeTypes.USER_NODE},
    {id: "2", label: "Andre", node_type: NodeTypes.USER_NODE},
    {id: "3", label: "Tim", node_type: NodeTypes.USER_NODE},
    {id: "4", label: "Paul", node_type: NodeTypes.USER_NODE},
    {id: "5", label: "Dev Team", node_type: NodeTypes.GROUP_NODE},
    {id: "6", label: "Sales Group", node_type: NodeTypes.GROUP_NODE},
    {id: "7", label: "steve.pxio.local", node_type: NodeTypes.DISPLAY_NODE},
    {id: "8", label: "Alex's Display", node_type: NodeTypes.DISPLAY_NODE},
    {id: "9", label: "pompei.pxio.local.network", node_type: NodeTypes.DISPLAY_NODE},
    {id: "10", label: "norbert", node_type: NodeTypes.DISPLAY_NODE},
    {id: "11", label: "DG1", node_type: NodeTypes.DISPLAY_GROUP_NODE},
    {id: "12", label: "Cat Heaven: where cats go if they play their cards right", node_type: NodeTypes.PIXEL_SOURCE_NODE},
    {id: "13", label: "Demo Video 1", node_type: NodeTypes.PIXEL_SOURCE_NODE},
    {id: "14", label: "Demo Video 2", node_type: NodeTypes.PIXEL_SOURCE_NODE},
    {id: "15", label: "Tim's Screen", node_type: NodeTypes.PIXEL_SOURCE_NODE},
    {id: "16", label: "Andre's Phone", node_type: NodeTypes.PIXEL_SOURCE_NODE},
    {id: "17", label: "Mohsen's iPhone", node_type: NodeTypes.PIXEL_SOURCE_NODE},
    {id: "18", label: "Who's Cat is the Cutest?", node_type: NodeTypes.PIXEL_SOURCE_NODE},
    {id: "19", label: "A Cat's Diary", node_type: NodeTypes.PIXEL_SOURCE_NODE},
    {id: "20", label: "Cats or Dogs? Get to know yourself", node_type: NodeTypes.PIXEL_SOURCE_NODE},
    {id: "21", label: "All my Cats", node_type: NodeTypes.PIXEL_SOURCE_NODE},
    {id: "22", label: "Perfect Human: Inside a Cat's Mind", node_type: NodeTypes.PIXEL_SOURCE_NODE},
    {id: "23", label: "Not just a Cat", node_type: NodeTypes.PIXEL_SOURCE_NODE},
];

export const _baseLinks = [
    {source: "0", target: "5", link_type: LinkTypes.OWNER_OF, value: 0.3},
    {source: "4", target: "5", link_type: LinkTypes.MEMBER_OF, value: 0.2},
    {source: "7", target: "11", link_type: LinkTypes.MEMBER_OF, value: 0.2},
    {source: "8", target: "1", link_type: LinkTypes.OWNER_OF, value: 0.3},
    {source: "10", target: "1", link_type: LinkTypes.SHARED_WITH, value: 0.1},
    {source: "12", target: "1", link_type: LinkTypes.SHARED_WITH, value: 0.1}
];
//////////////////////////////////

export const loadPrototypeData = (ttlString) => {
    let n = 0;
    let quads = [];
    turtleParser.parse(ttlString, (err, quad, prefixes) => {
        if (err) {
            console.error(err);
        }
        if (quad) {
            quads.push(quad);
        } else {
            console.log("prefixes are: ", prefixes);
            console.log(prefixes);
        }
    });
    window.activeQuads = quads;
    // TODO: figure out when exactly the parsing has finished
    setTimeout(() => {
        window.nodeLinkData = fetchPxioGraphDataFromTriples(window.activeQuads);
    }, 1000);
}

export const fetchPxioGraphDataFromTriples = (quads) => {
    // given an array of pxio RDF triples, detects what Nodes and Edges
    // they belong to and returns them
    // TODO:
    // - only limited to ownership, membeship, and sharing links atm
    // - only detects pixel-source, user, group, display, and display group instances atm
    //
    console.log("Given ", quads.length, " triples...");
    console.log(quads[0]);
    let subjectToTriples = {};
    let tmpSubject;
    // first we find all triples that describe the same subject
    for (let quad of quads) {
        tmpSubject = quad.subject.value;
        if (tmpSubject in subjectToTriples) {
            subjectToTriples[tmpSubject].push({
                predicate: quad.predicate.value,
                object: quad.object.value
            });
        } else {
            subjectToTriples[tmpSubject] = [
                {
                    predicate: quad.predicate.value,
                    object: quad.object.value
                }
            ];
        }
    }
    console.log("found ", Object.keys(subjectToTriples).length, " subjects...");
    let instanceToIds = {}; // used to map instance subjects to their node ids
    // this is used for adding edges
    let baseNodes = [];
    let baseLinks = [];
    let tmpNode;
    let nodeIdCounter = 0;
    const TYPE_PREDICATE_VALUE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
    const NAME_PREDICATE_VALUE = "http://xmlns.com/foaf/0.1/#name";
    // in this round we detect entity instances and create nodes based on them
    for (let subject in subjectToTriples) {
        // console.log(subject, subjectToTriples[subject]);
        // console.log("---");
        if (subjectToTriples[subject].some(e => e.predicate === TYPE_PREDICATE_VALUE)) {
            // console.log("subject has type!");
            tmpNode = {};
            // subject has type > it is an entity instance > we process it
            for (let description of subjectToTriples[subject]) {
                // check for type
                if (description.predicate === TYPE_PREDICATE_VALUE) {
                    switch (description.object) {
                        case "http://xmlns.com/foaf/0.1/#Group":
                            tmpNode.node_type = NodeTypes.GROUP_NODE;
                            break;
                        case "http://xmlns.com/foaf/0.1/#Person":
                            tmpNode.node_type = NodeTypes.USER_NODE;
                            break;
                        case "http://www.pxio.de/cloud/entities/#DisplayGroup":
                            tmpNode.node_type = NodeTypes.DISPLAY_GROUP_NODE;
                            break;
                        case "http://www.pxio.de/cloud/entities/#Display":
                            tmpNode.node_type = NodeTypes.DISPLAY_NODE;
                            break;
                        case "http://www.pxio.de/cloud/entities/#PixelSource":
                            tmpNode.node_type = NodeTypes.PIXEL_SOURCE_NODE;
                            break;
                        default:
                    }
                }
                // check for name
                if (description.predicate === NAME_PREDICATE_VALUE) {
                    tmpNode.label = description.object;
                    // TODO: add triple to describe signed-in user, here we
                    // hardcode for now
                    if (tmpNode.label === "Mohsen") {
                        tmpNode.isLoggedInUser = true;
                    }
                }
            }
            // add id (used in the next step to add links)
            tmpNode.id = nodeIdCounter++ + "";
            instanceToIds[subject] = tmpNode.id;
            // add node
            // baseNodes.push(tmpNode);
            baseNodes.push(JSON.parse(JSON.stringify(tmpNode)));
        }
    }
    const OWNER_PREDICATE_VALUE = "http://xmlns.com/foaf/0.1/#maker";
    const SHARING_PREDICATE_VALUE = "http://www.pxio.de/#sharedWith";
    const MEMBER_PREDICATE_VALUE = "http://xmlns.com/foaf/0.1/#member";
    let nodeId, targetId;
    // in this round we add edges using existing nodes and their ids
    for (let subject in subjectToTriples) {
        if (subjectToTriples[subject].some(e => e.predicate === TYPE_PREDICATE_VALUE)) {
            // subject has type > it is an entity instance > we process it
            nodeId = instanceToIds[subject];
            for (let description of subjectToTriples[subject]) {
                // check for ownership
                if (description.predicate === OWNER_PREDICATE_VALUE) {
                    targetId = instanceToIds[description.object];
                    // add link
                    baseLinks.push({
                        source: nodeId,
                        target: targetId,
                        link_type: LinkTypes.OWNER_OF,
                        value: 0.2 // TODO: add value to rdf description
                    });
                }
                // check for membership
                if (description.predicate === MEMBER_PREDICATE_VALUE) {
                    targetId = instanceToIds[description.object];
                    // add link
                    baseLinks.push({
                        source: nodeId,
                        target: targetId,
                        link_type: LinkTypes.MEMBER_OF,
                        value: 0.2 // TODO: add value to rdf description
                    });
                }
                // check for sharing
                if (description.predicate === SHARING_PREDICATE_VALUE) {
                    targetId = instanceToIds[description.object];
                    // add link
                    baseLinks.push({
                        source: nodeId,
                        target: targetId,
                        link_type: LinkTypes.SHARED_WITH,
                        value: 0.2 // TODO: add value to rdf description
                    });
                }
            }
        }
    }
    // we're done
    return {
        nodes: baseNodes,
        links: baseLinks
    };
}
