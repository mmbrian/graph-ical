import { Subject  } from "rxjs";
const N3 = require('n3');
const { DataFactory } = N3;
const { namedNode, literal, quad, defaultGraph } = DataFactory;
const uuidv4 = require("uuid/v4");
import {
    getInstanceDescriptionWithoutMessingEvents,
    getRepositoryPrefixesSPARQL,
    rawSparqlQuery,
    deleteStatements,
    deleteQuads
} from "./rest_util";
import {
    PxioEventType,
    EventType
} from "./types";
import { BaseVisualization } from "../visualizations/BaseVisualization";
const axios = require('axios');

// this stream gets all events related to addition of instances or new relations
// between instances and it does:
// 1. add/remove relevant quads to/from repository
// 2. add relevant event quads to repository
// 3. notify new added events to all visualization to react accordingly
export const localEventStream = new Subject();
localEventStream.subscribe({
    next: async (payload) => {
        console.log("new local event with data");
        console.log(payload);
        // TODO
        // payload.subject
        // payload.predicate
        // payload.object
        // payload.subject_type
        // payload.object_type
        let event_date = (new Date()).toISOString();
        let event_id = "event_" + uuidv4();
        let quads_to_add = [];
        let quads_to_remove = [];
        // add event quads for this event:
        // (pxio:event_<uuid>, "rdf:type", "pxio:Event")
        // (pxio:event_<uuid>, "pxio:time", event_date)
        let evtInstance = namedNode("pxio:" + event_id);
        quads_to_add.push(quad(
            evtInstance,
            namedNode("rdf:type"),
            namedNode("pxio:Event"),
            defaultGraph()
        ));
        quads_to_add.push(quad(
            evtInstance,
            namedNode("pxio:time"),
            literal(event_date),
            defaultGraph()
        ));
        quads_to_add.push(quad(
            evtInstance,
            namedNode("pxio:isLocal"),
            literal(true),
            defaultGraph()
        ));
        switch (payload.event_type) {
            case EventType.ADD_INSTANCE:
                // add a new instance based on payload.subject_type to repository
                // (payload.subject, "rdf:type", payload.subject_type)
                let subject, newInstance;
                switch (payload.pxio_type) {
                    case PxioEventType.ADD_USER:
                        subject = "data:users_" + uuidv4();
                        newInstance = namedNode(subject);
                        // add name, firstname, and lastname
                        quads_to_add.push(quad(
                            newInstance,
                            namedNode("foaf:name"),
                            literal(payload.params.name),
                            defaultGraph()
                        ));
                        quads_to_add.push(quad(
                            newInstance,
                            namedNode("foaf:firstName"),
                            literal(payload.params.firstname),
                            defaultGraph()
                        ));
                        quads_to_add.push(quad(
                            newInstance,
                            namedNode("foaf:lastName"),
                            literal(payload.params.lastname),
                            defaultGraph()
                        ));
                        break;
                    case PxioEventType.ADD_GROUP:
                        subject = "data:group_" + uuidv4();
                        newInstance = namedNode(subject);
                        // add name
                        quads_to_add.push(quad(
                            newInstance,
                            namedNode("foaf:name"),
                            literal(payload.params.name),
                            defaultGraph()
                        ));
                        break;
                    case PxioEventType.ADD_DG:
                        subject = "data:dg_" + uuidv4();
                        newInstance = namedNode(subject);
                        // add name
                        quads_to_add.push(quad(
                            newInstance,
                            namedNode("foaf:name"),
                            literal(payload.params.name),
                            defaultGraph()
                        ));
                        break;
                    default:

                }
                quads_to_add.push(quad(
                    newInstance,
                    namedNode("rdf:type"),
                    namedNode(payload.subject_type),
                    defaultGraph()
                ));
                // add event quads for this event:
                // (pxio:event_<uuid>, "pxio:isForInstance", true)
                // (pxio:event_<uuid>, "pxio:isAdded", true)
                // (pxio:event_<uuid>, "pxio:isFor", payload.subject)
                // (pxio:event_<uuid>, "pxio:hasType", payload.subject_type)
                quads_to_add.push(quad(
                    evtInstance,
                    namedNode("pxio:isForInstance"),
                    literal(true),
                    defaultGraph()
                ));
                quads_to_add.push(quad(
                    evtInstance,
                    namedNode("pxio:isAdded"),
                    literal(true),
                    defaultGraph()
                ));
                quads_to_add.push(quad(
                    evtInstance,
                    namedNode("pxio:isFor"),
                    newInstance,
                    defaultGraph()
                ));
                quads_to_add.push(quad(
                    evtInstance,
                    namedNode("pxio:hasType"),
                    namedNode(payload.subject_type),
                    defaultGraph()
                ));
                break;
            case EventType.ADD_RELATION:
                // add
                // (payload.subject, payload.predicate, payload.object)
                quads_to_add.push(quad(
                    namedNode(payload.subject),
                    namedNode(payload.predicate),
                    namedNode(payload.object),
                    defaultGraph()
                ));
                if (payload.pxio_type === PxioEventType.ADD_D_TO_DG) {
                    // add other triples for describing relation of display
                    // to display group
                    let dInDgInstance = namedNode("pxio:display_in_dg_" + uuidv4());
                    quads_to_add.push(quad(
                        dInDgInstance,
                        namedNode("rdf:type"),
                        namedNode("entities:DisplayInDisplayGroup"),
                        defaultGraph()
                    ));
                    quads_to_add.push(quad(
                        dInDgInstance,
                        namedNode("pxio:isFrom"),
                        namedNode(payload.subject),
                        defaultGraph()
                    ));
                    quads_to_add.push(quad(
                        dInDgInstance,
                        namedNode("pxio:belongsTo"),
                        namedNode(payload.object),
                        defaultGraph()
                    ));
                    // TODO: initialize display at a proper position in DG
                    quads_to_add.push(quad(
                        dInDgInstance,
                        namedNode("pxio:x"),
                        literal(0),
                        defaultGraph()
                    ));
                    quads_to_add.push(quad(
                        dInDgInstance,
                        namedNode("pxio:y"),
                        literal(0),
                        defaultGraph()
                    ));
                    quads_to_add.push(quad(
                        dInDgInstance,
                        namedNode("pxio:z"),
                        literal(0),
                        defaultGraph()
                    ));
                    quads_to_add.push(quad(
                        dInDgInstance,
                        namedNode("pxio:width"),
                        literal(100),
                        defaultGraph()
                    ));
                    quads_to_add.push(quad(
                        dInDgInstance,
                        namedNode("pxio:height"),
                        literal(100),
                        defaultGraph()
                    ));
                }
                if (payload.pxio_type === PxioEventType.PROJECT) {
                    // TODO: add other triples for describing projection instance
                }
                // add event quads for this event:
                // (pxio:event_<uuid>, "pxio:isForInstance", false)
                // (pxio:event_<uuid>, "pxio:isAdded", true)
                // (pxio:event_<uuid>, "pxio:isForSubject", payload.subject)
                // (pxio:event_<uuid>, "pxio:isForObject", payload.object)
                // (pxio:event_<uuid>, "pxio:hasType", payload.predicate)
                quads_to_add.push(quad(
                    evtInstance,
                    namedNode("pxio:isForInstance"),
                    literal(false),
                    defaultGraph()
                ));
                quads_to_add.push(quad(
                    evtInstance,
                    namedNode("pxio:isAdded"),
                    literal(true),
                    defaultGraph()
                ));
                quads_to_add.push(quad(
                    evtInstance,
                    namedNode("pxio:isForSubject"),
                    namedNode(payload.subject),
                    defaultGraph()
                ));
                quads_to_add.push(quad(
                    evtInstance,
                    namedNode("pxio:isForObject"),
                    namedNode(payload.object),
                    defaultGraph()
                ));
                quads_to_add.push(quad(
                    evtInstance,
                    namedNode("pxio:hasType"),
                    namedNode(payload.predicate),
                    defaultGraph()
                ));
                break;
            case EventType.REMOVE_INSTANCE:
                // remove payload.subject from repository
                // (payload.subject, *, *)
                // (*, *, payload.subject)
                // 1. fetch all triples matching the above using sparql
                let subject_desc_quads = await getInstanceDescriptionWithoutMessingEvents(payload.subject);
                // 2. add all fetched quads into quads_to_remove
                subject_desc_quads = subject_desc_quads.map(spo => quad(
                    namedNode(spo.s.value),
                    namedNode(spo.p.value),
                    (spo.o.termType === "Literal" || spo.o.type === "literal") ? literal(spo.o.value) : namedNode(spo.o.value),
                    defaultGraph()
                ));
                // TODO: if spo.o is literal, we need full object to have object.datatypeString for later
                // translation to n-triple format. check if this works
                // NOTE: for now we pass pxio_type to deleteQuads that takes care of
                // literal to n-triple transformation based on exact instance type to be deleted
                quads_to_remove.push(...subject_desc_quads);

                // TODO: remove other traces of this instance
                // e.g. for a display group we need to remove complete DisplayInDisplayGroup instances
                // related to this removal

                // NOTE: this will break some event records which we should be
                // careful when reading event to fetch network nodes/links.
                // alternatively we can locate these events and mark them as
                // outdated or just remove them.
                // add event quads for this event:
                // (pxio:event_<uuid>, "pxio:isForInstance", true)
                // (pxio:event_<uuid>, "pxio:isAdded", false)
                // (pxio:event_<uuid>, "pxio:isFor", payload.subject)
                // (pxio:event_<uuid>, "pxio:hasType", payload.subject_type)
                quads_to_add.push(quad(
                    evtInstance,
                    namedNode("pxio:isForInstance"),
                    literal(true),
                    defaultGraph()
                ));
                quads_to_add.push(quad(
                    evtInstance,
                    namedNode("pxio:isAdded"),
                    literal(false),
                    defaultGraph()
                ));
                quads_to_add.push(quad(
                    evtInstance,
                    namedNode("pxio:isFor"),
                    namedNode(payload.subject),
                    defaultGraph()
                ));
                quads_to_add.push(quad(
                    evtInstance,
                    namedNode("pxio:hasType"),
                    namedNode(payload.subject_type),
                    defaultGraph()
                ));
                break;
            case EventType.REMOVE_RELATION:
                // remove
                // (payload.subject, payload.predicate, payload.object) from repository
                quads_to_remove.push(quad(
                    namedNode(payload.subject),
                    namedNode(payload.predicate),
                    namedNode(payload.object),
                    defaultGraph()
                ));
                // add event quads for this event:
                // (pxio:event_<uuid>, "pxio:isForInstance", false)
                // (pxio:event_<uuid>, "pxio:isAdded", false)
                // (pxio:event_<uuid>, "pxio:isForSubject", payload.subject)
                // (pxio:event_<uuid>, "pxio:isForObject", payload.object)
                // (pxio:event_<uuid>, "pxio:hasType", payload.predicate)
                quads_to_add.push(quad(
                    evtInstance,
                    namedNode("pxio:isForInstance"),
                    literal(false),
                    defaultGraph()
                ));
                quads_to_add.push(quad(
                    evtInstance,
                    namedNode("pxio:isAdded"),
                    literal(false),
                    defaultGraph()
                ));
                quads_to_add.push(quad(
                    evtInstance,
                    namedNode("pxio:isForSubject"),
                    namedNode(payload.subject),
                    defaultGraph()
                ));
                quads_to_add.push(quad(
                    evtInstance,
                    namedNode("pxio:isForObject"),
                    namedNode(payload.object),
                    defaultGraph()
                ));
                quads_to_add.push(quad(
                    evtInstance,
                    namedNode("pxio:hasType"),
                    namedNode(payload.predicate),
                    defaultGraph()
                ));
                break;
            default:
                console.error("unknown event type.");
        }
        // add quads_to_add to repo
        const writer = new N3.Writer({
            prefixes: {
                ...window.activeRepoNameSpaces
            }
        });
        console.log("quads to add are");
        console.log(quads_to_add);
        console.log("quads to remove are");
        console.log(quads_to_remove);
        // return;
        let reloadNotificationStream = new Subject();
        let notifCounter = 0;
        reloadNotificationStream.subscribe({
            next: c => {
                notifCounter += c;
                if (notifCounter >= 2) {
                    // => both remove and add tasks finished, update UI
                    // notify visualization to update
                    BaseVisualization.visualizations.map(v => v.updateWithLatestEventData());
                }
            }
        });
        quads_to_add.forEach(q => writer.addQuad(q));
        writer.end((error, result) => {
            return new Promise(function(resolve, reject) {
                if (!error) {
                    axios.post(
                        window.activeRepoURI + "/statements?context=null",
                        result,
                        {
                            headers: {
                                'content-type': 'application/x-turtle'
                            }
                        }
                    )
                    .then(response => {
                        console.log("finished adding event data.");
                        resolve();
                        reloadNotificationStream.next(1);
                    });
                } else {
                    console.log("error when parsing quads as turtle string.");
                    console.log(error);
                }
              });
        });
        // TODO remove quads_to_remove from repo
        deleteQuads(quads_to_remove, payload.pxio_type)
            .then(() => {
                reloadNotificationStream.next(1);
            });
        // const _writer = new N3.Writer({
        //     format: 'N-Triples',
        //     prefixes: {
        //         ...window.activeRepoNameSpaces
        //     }
        // });
        // quads_to_remove.forEach(q => _writer.addQuad(q));
        // window.qtr = quads_to_remove;
        // _writer.end((error, result) => {
        //     return new Promise(function(resolve, reject) {
        //         if (!error) {
        //             console.log("quads to remove as a turtle stream are");
        //             console.log(result);
        //             // deleteStatements(result)
        //             //     .then(response => {
        //             //         resolve();
        //             //         reloadNotificationStream.next(1);
        //             //     });
        //             // resolve();
        //             return;
        //             // TODO: use result in writing a sparql DELETE DATA query
        //             // see https://www.w3.org/TR/sparql11-update/#deleteData
        //             let query = getRepositoryPrefixesSPARQL() +
        //                 "DELETE DATA " +
        //                 "{ " +
        //                 "   " + result +
        //                 "}";
        //             new Promise(function(_resolve, _reject) {
        //                 rawSparqlQuery(window.activeRepoURI, query)
        //                     .then(response => {
        //                         console.log("deleted with response:");
        //                         console.log(response);
        //                         _resolve();
        //                         reloadNotificationStream.next(1);
        //                     })
        //                     .catch(error => {
        //                         console.error("Error when deleting statements.", error);
        //                         _resolve();
        //                         reloadNotificationStream.next(1);
        //                     });
        //             });
        //             // axios.post(
        //             //     repoUri + "/statements?context=null",
        //             //     result,
        //             //     {
        //             //         headers: {
        //             //             'content-type': 'application/x-turtle'
        //             //         }
        //             //     }
        //             // )
        //             // .then(response => {
        //             //     console.log("finished adding event data.");
        //             //     resolve();
        //             // });
        //             resolve();
        //         } else {
        //             console.log("error when parsing quads as turtle string.");
        //             console.log(error);
        //             resolve();
        //         }
        //       });
        // });
    }
});
