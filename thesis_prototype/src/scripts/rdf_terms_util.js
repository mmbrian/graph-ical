const hx = require("hexagon-js");
import * as d3 from "d3";
const N3 = require('n3');
const { DataFactory } = N3;
const { namedNode, literal, quad } = DataFactory;
import { shortenWithPrefix } from "./data";

// TODO: remove variables from window context
// TODO: init from repo info with existing sparql methods
window.rdfRelationToLabel = {
  "foaf:member": "member",
  "foaf:maker": "maker",
  "foaf:name": "name",
  "pxio:sharedWith": "shared with",
  "rdf:type": "type",
  "foaf:depiction": "depiction",
  "pxio:projectedOn": "projected on",
  "foaf:img": "image",
};
window.rdfTypeToLabel = {
  "pxio:User": "User",
  "pxio:UserGroup": "Group",
  "entities:DisplayGroup": "Display Group",
  "entities:Display": "Display",
  "entities:PixelSource": "Pixel Source",
};

export const getRepoTypes = () => {
    // TODO: replace with existing sparql query
    return window.activeRepoTypes.map(t => shortenWithPrefix(t));
    // return Object.keys(window.rdfTypeToLabel);
};

export const getRepoRelations = () => {
    // TODO: replace with existing sparql query
    return window.activeRepoRelations.map(r => shortenWithPrefix(r));
    // return Object.keys(window.rdfRelationToLabel);
};

export const getTermTranslation = (term) => {
    if (term in window.rdfRelationToLabel) {
        return window.rdfRelationToLabel[term];
    }
    if (term in window.rdfTypeToLabel) {
        return window.rdfTypeToLabel[term];
    }
    return term;
};

// TODO:
// - add methods to export/import tab data in template
export const getLabelsInfoRDF = () => {
    // let tabContext = namedNode(addTemplatePrefix("dragData"));
    // let quads = [];
    // // number of tabs
    // quads.push(quad(
    //     namedNode(addTemplatePrefix("dragData")),
    //     namedNode(addTemplatePrefix("tabCount")),
    //     literal(Object.keys(window.tabNames).length),
    //     tabContext,
    // ));
    // for (let tabId in window.tabNames) {
    //     let tabSubject = namedNode(addTemplatePrefix("tab_" + tabId));
    //     // register tab in the graph
    //     quads.push(quad(
    //         namedNode(addTemplatePrefix("dragData")),
    //         namedNode(addTemplatePrefix("hasTab")),
    //         tabSubject,
    //         tabContext,
    //     ));
    //     // add tab name
    //     quads.push(quad(
    //         tabSubject,
    //         namedNode("foaf:name"),
    //         literal(window.tabNames[tabId]),
    //         tabContext,
    //     ));
    // }
    // return quads;
};

export const importLabelsInfoFromTemplate = (quads) => {
    // console.log("Importing tabs...");
    // return new Promise(async function(resolve, reject) {
    //     let tabQuads = quads.filter(q => shortenWithPrefix(q.graph.id) === addTemplatePrefix("dragData"));
    //     window.tabCount = tabQuads.find(q => shortenWithPrefix(q.predicate.id) === addTemplatePrefix("tabCount"))
    //         .object.value;
    //     window.tabCount = parseInt(window.tabCount);
    //     window.tabNames = {};
    //     for (let i=1; i<=window.tabCount; i++) {
    //         let tabIdentifier = addTemplatePrefix("tab_" + i);
    //         let tabName = tabQuads.find(q =>
    //             shortenWithPrefix(q.subject.id) === tabIdentifier &&
    //             shortenWithPrefix(q.predicate.id) === "foaf:name"
    //         ).object.value;
    //         window.tabNames[i] = tabName;
    //     }
    //     await resetTabs();
    //     await initTabs(0, false);
    //     resolve();
    //     console.log("Imported tabs...");
    // });
};
