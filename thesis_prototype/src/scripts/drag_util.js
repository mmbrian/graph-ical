const hx = require("hexagon-js");
import * as d3 from "d3";
const N3 = require('n3');
const { DataFactory } = N3;
const { namedNode, literal, quad } = DataFactory;
import { shortenWithPrefix } from "./data";
import { doesRelationExistsBetweenTypes } from "./rest_util";
// TODO: fix this import, maybe setting this class to singleton already fixes it
// import {
//   addTemplatePrefix,
// } from "../visualizations/BaseVisualization";
const uuidv4 = require("uuid/v4");

// TODO: import from base visualization
// TEMPORARY CODE!!
const TEMPLATE_RDF_NAMESPACE = "pxio";
const addTemplatePrefix = s => TEMPLATE_RDF_NAMESPACE + ":" + s;
/////////////

// TODO: remove variables from window context
// TODO: also add UI code in singleton class here
window.dragBehaviours = [];

export const addDragBehavior = async (params) => {
    // TODO: make sure new behaviour does not already exist
    let source = params.source;
    let target = params.target;
    if (params.shouldVerifyDirection) {
        // TODO: need to figure out which type is source/target in repo
        let shouldSwap = !(await doesRelationExistsBetweenTypes(
            window.activeRepoURI,
            params.source,
            params.target,
            params.relation
        ));
        if (shouldSwap) {
            source = params.target;
            target = params.source;
        }
    }
    window.dragBehaviours.push({
        source: source,
        target: target,
        relation: params.relation,
        addText: params.addText,
        removeText: params.removeText
    });
};

export const getDragBehaviours = (source, target) => {
    return window.dragBehaviours.filter(db => {
        return (db.source === source && db.target === target) ||
            (db.source === target && db.target === source);
    });
};

export const getDragDataRDF = () => {
    let dragContext = namedNode(addTemplatePrefix("dragBehaviours"));
    let dragData = namedNode(addTemplatePrefix("dragData"));
    let quads = [];
    // number of behaviours
    quads.push(quad(
        dragData,
        namedNode(addTemplatePrefix("behaviorCount")),
        literal(window.dragBehaviours.length),
        dragContext,
    ));
    for (let db of window.dragBehaviours) {
        let dbSubject = namedNode(addTemplatePrefix("db_" + uuidv4()));
        // register behavior in the graph
        quads.push(quad(
            dragData,
            namedNode(addTemplatePrefix("hasBehavior")),
            dbSubject,
            dragContext,
        ));
        // source info
        quads.push(quad(
            dbSubject,
            namedNode(addTemplatePrefix("hasSource")),
            // literal(db.source),
            namedNode(db.source), // requires prefix to be stored in template as well
            dragContext,
        ));
        // target info
        quads.push(quad(
            dbSubject,
            namedNode(addTemplatePrefix("hasTarget")),
            namedNode(db.target),
            dragContext,
        ));
        // relation
        quads.push(quad(
            dbSubject,
            namedNode(addTemplatePrefix("hasRelation")),
            namedNode(db.relation),
            dragContext,
        ));
        // add text
        quads.push(quad(
            dbSubject,
            namedNode(addTemplatePrefix("hasAddText")),
            literal(db.addText),
            dragContext,
        ));
        // remove text
        quads.push(quad(
            dbSubject,
            namedNode(addTemplatePrefix("hasRemoveText")),
            literal(db.removeText),
            dragContext,
        ));
    }
    return quads;
};

export const importDragBehavioursFromTemplate = (quads) => {
    console.log("Importing drag behaviors...");
    return new Promise(async function(resolve, reject) {
        let dbQuads = quads.filter(q => shortenWithPrefix(q.graph.id) === addTemplatePrefix("dragBehaviours"));
        if (!dbQuads.length) resolve();
        window.dbCount = dbQuads.find(q => shortenWithPrefix(q.predicate.id) === addTemplatePrefix("behaviorCount"))
            .object.value;
        window.dbCount = parseInt(window.dbCount);
        window.dragBehaviours = [];
        let dbItems = dbQuads.filter(q =>
          shortenWithPrefix(q.predicate.id) === addTemplatePrefix("hasBehavior")
        ).map(q => shortenWithPrefix(q.object.id));
        for (let dbItem of dbItems) {
          let db = {};
          // source
          db.source = dbQuads.find(q =>
            shortenWithPrefix(q.subject.id) === dbItem &&
            shortenWithPrefix(q.predicate.id) === addTemplatePrefix("hasSource")
          ).object.value;
          db.source = shortenWithPrefix(db.source);
          // target
          db.target = dbQuads.find(q =>
            shortenWithPrefix(q.subject.id) === dbItem &&
            shortenWithPrefix(q.predicate.id) === addTemplatePrefix("hasTarget")
          ).object.value;
          db.target = shortenWithPrefix(db.target);
          // relation
          db.relation = dbQuads.find(q =>
            shortenWithPrefix(q.subject.id) === dbItem &&
            shortenWithPrefix(q.predicate.id) === addTemplatePrefix("hasRelation")
          ).object.value;
          db.relation = shortenWithPrefix(db.relation);
          // add text
          db.addText = dbQuads.find(q =>
            shortenWithPrefix(q.subject.id) === dbItem &&
            shortenWithPrefix(q.predicate.id) === addTemplatePrefix("hasAddText")
          ).object.value;
          // remove text
          db.removeText = dbQuads.find(q =>
            shortenWithPrefix(q.subject.id) === dbItem &&
            shortenWithPrefix(q.predicate.id) === addTemplatePrefix("hasRemoveText")
          ).object.value;
          // add behavior
          window.dragBehaviours.push(db);
        }
        resolve();
        console.log("Imported drag behaviors...");
    });
};
