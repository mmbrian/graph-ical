const axios = require('axios');
const fetch = require('node-fetch');
const uuidv4 = require("uuid/v4");
const hx = require("hexagon-js");
const N3 = require('n3');
const { DataFactory } = N3;
const { namedNode, literal, quad, defaultGraph } = DataFactory;
const turtleParser = new N3.Parser({ format: 'Turtle' });
import {
    shortenWithPrefix,
    getNTripleFromShortUri,
    shortenWithPrefixIfNotAlready
} from "./data";
import { PxioEventType } from "./types";
// axios.defaults.headers.post['Content-Type'] ='application/x-www-form-urlencoded';

// export const RDF_SERVER_URL = "http://localhost:8080/rdf4j-server";
export const RDF_SERVER_URL = "http://138.197.181.155:8080/rdf4j-server";
export const getRepositoryPrefixesSPARQL = () => {
    return window.prefixesForSparqlQueries;
};

export const getRepositoryNamespaces = (repoUri) => {
    return new Promise(function(resolve, reject) {
        axios.get(repoUri + "/namespaces")
            .then(response => {
                console.log("fetched all repo namespaces.", response);
                if (response.data && response.data.results.bindings) {
                    let namespaces = response.data.results.bindings;
                    window.activeRepoNameSpaces = {};
                    window.activeRepoNameSpaceToPrefix = {};
                    for (let ns of namespaces) {
                        window.activeRepoNameSpaceToPrefix[ns.namespace.value] = ns.prefix.value;
                        window.activeRepoNameSpaces[ns.prefix.value] = ns.namespace.value;
                    }
                    // now we generate the header of every sparql query we might
                    // execute later on this repository
                    window.prefixesForSparqlQueries = "";
                    for (let prefix of Object.keys(window.activeRepoNameSpaces)) {
                        window.prefixesForSparqlQueries +=
                            "PREFIX " +
                            prefix +
                            ": <" +
                            window.activeRepoNameSpaces[prefix] + "> ";
                    }
                } else {
                    // TODO: notify user there are no namespaces
                    window.activeRepoNameSpaces = undefined;
                    window.activeRepoNameSpaceToPrefix = undefined;
                    resolve(undefined);
                }
                resolve(Object.keys(window.activeRepoNameSpaceToPrefix));
            })
            .catch(err => {
                window.activeRepoNameSpaces = undefined;
                window.activeRepoNameSpaceToPrefix = undefined;
                resolve(undefined);
            });
    });
};

export const getInstanceDescriptionWithoutMessingEvents = (instance) => {
    // returns all triples matching
    // (instance, *, *)
    // (*, *, instance)
    // //
    // SELECT ?s ?p ?o
    // WHERE {
    //   ?s ?p ?o
    //   FILTER (?s = instance || ?o = instance)
    //   FILTER NOT EXISTS {
    //     ?s rdf:type pxio:Event
    //   }
    // }
    // TODO: later need to include any transparent type here to be ignored similar to
    // DisplayInDisplayGroup
    let query = getRepositoryPrefixesSPARQL() +
        "SELECT ?s ?p ?o " +
        "WHERE { " +
        "   ?s ?p ?o " +
        "   FILTER (?s = " + instance + " || ?o = " + instance + ") " +
        "   FILTER NOT EXISTS { " +
        "       ?s rdf:type pxio:Event " +
        "   } " +
        "}";
    return new Promise(function(resolve, reject) {
        rawSparqlQuery(window.activeRepoURI, query)
            .then(response => {
                if (response.data) {
                    resolve(response.data.results.bindings);
                } else {
                    resolve([]);
                }
            })
            .catch(error => {
                console.error("Error when fetching instance description for " + instance, error);
                resolve([]);
            })
            .finally(() => {
                resolve([]);
            });
    });
};

export const doesTripleExist = (s, p, o) => {
    // returns true if spo exists in repository
    // ASK { s p o }
    console.log("asking for existence of: " + s + ", " + p + ", " + o);
    let query = getRepositoryPrefixesSPARQL() +
        "ASK { " + s + " " + p + " " + o + " }";
    return new Promise(function(resolve, reject) {
        rawSparqlQuery(window.activeRepoURI, query)
            .then(response => {
                if (response.status === 200) {
                    resolve(response.data.boolean);
                }
                console.log("spo ask response");
                console.log(response);
            })
            .catch(error => {
                console.error("Error when fetching triple existence: " + s + ", " + p + ", " + o, error);
                resolve(false);
            });
    });
};

export const doesRelationExistsBetweenTypes = (repoUri, sourceType, targetType, relation) => {
    let query = getRepositoryPrefixesSPARQL() +
        "SELECT ?s ?p ?o " +
        "WHERE { " +
        "   ?s ?p ?o " +
        "   FILTER EXISTS {" +
        "       ?s rdf:type " + sourceType +
        "   }" +
        "   FILTER EXISTS {" +
        "       ?o rdf:type " + targetType +
        "   }" +
        "   FILTER (?p = " + relation + ")" +
        "}";
    return new Promise(function(resolve, reject) {
        rawSparqlQuery(repoUri, query)
            .then(response => {
                if (response.data) {
                    resolve(response.data.results.bindings.length > 0);
                } else {
                    resolve(false);
                }
            })
            .catch(error => {
                console.error("Error when querying existence of relation " + relation + ": ", error);
                resolve(false);
            });
    });
};

export const getEventDescription = (repoUri, eventInstance) => {
    let query = getRepositoryPrefixesSPARQL() +
        "SELECT ?s ?p ?o " +
        "WHERE { " +
        "   ?s ?p ?o " +
        "   FILTER (?s = " + eventInstance + ") " +
        "}";
    return new Promise(function(resolve, reject) {
        rawSparqlQuery(repoUri, query)
            .then(response => {
                if (response.data) {
                    resolve(
                      response.data.results.bindings
                    );
                } else {
                    resolve([]);
                }
            })
            .catch(error => {
                console.error("Error when fetching event description", error);
                resolve([]);
            });
    });
};
export const loadAllEvents = (repoUri) => {
    // NOTE: loads list of all events and their timestamps (no more data)
    //
    // PREFIX pxio: <http://www.pxio.de/rdf#>
    // PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    // SELECT ?event ?p ?time
    // WHERE {
    //   ?event ?p ?time
    //   FILTER EXISTS {
    //   	?event rdf:type pxio:Event .
    //   }
    //   FILTER EXISTS {
    //     ?event pxio:time ?time .
    //   }
    // }
    //
    let query = getRepositoryPrefixesSPARQL() +
        "SELECT ?event ?p ?time " +
        "WHERE { " +
        "   ?event ?p ?time " +
        "   FILTER EXISTS { " +
        "       ?event rdf:type pxio:Event . " +
        "   } " +
        "   FILTER EXISTS { " +
        "       ?event pxio:time ?time . " +
        "   } " +
        "}";
    return new Promise(function(resolve, reject) {
        rawSparqlQuery(repoUri, query)
            .then(response => {
                if (response.data) {
                    resolve(
                      response.data.results.bindings
                          .map(e => {
                              return {
                                  id: shortenWithPrefix(e.event.value),
                                  time: new Date(e.time.value)
                              };
                          })
                    );
                } else {
                    resolve([]);
                }
            })
            .catch(error => {
                console.error("Error when fetching all events", error);
                resolve([]);
            });
    });
};
export const getInstanceCreationStatements = (repoUri) => {
    // TODO: adapt and make it generic
    // returns all triples that indicate creation of an instance we're interested in
    // (DisplayInDisplayGroup instances are ignored as the event associated to them
    // is the relation change between display and display group which is tracked later)
    // //
    // SELECT ?instance ?type
    // WHERE {
    //   ?instance rdf:type ?type
    //   FILTER(?type != owl:Ontology)
    //   FILTER(?type != owl:ObjectProperty)
    //   FILTER(?type != owl:Class)
    //   FILTER(?type != rdf:Property)
    //   FILTER(?type != rdfs:Class)
    //   FILTER(?type != sh:NodeShape)
    //   FILTER(?type != sp:Construct)
    //   FILTER(?type != entities:DisplayInDisplayGroup)
    // }
    //
    let query = getRepositoryPrefixesSPARQL() +
        "SELECT ?instance ?type " +
        "WHERE { " +
        "   ?instance rdf:type ?type " +
        "   FILTER(?type != owl:Ontology) " +
        "   FILTER(?type != owl:ObjectProperty) " +
        "   FILTER(?type != owl:Class) " +
        "   FILTER(?type != rdf:Property) " +
        "   FILTER(?type != rdfs:Class) " +
        "   FILTER(?type != sh:NodeShape) " +
        "   FILTER(?type != sp:Construct) " +
        "   FILTER(?type != entities:DisplayInDisplayGroup) " +
        "   FILTER(?type != pxio:Event) " +
        "}";
    return new Promise(function(resolve, reject) {
        rawSparqlQuery(repoUri, query)
            .then(response => {
                if (response.data) {
                    resolve(response.data.results.bindings);
                } else {
                    resolve([]);
                }
            })
            .catch(error => {
                console.error("Error when fetching instance creation statements", error);
                resolve([]);
            });
    });
};
export const getInstanceRelationStatements = (repoUri) => {
    // returns all triples that indicate a relation between two instances we're interested in
    // (DisplayInDisplayGroup instances are ignored as the event associated to them
    // is the relation change between display and display group)
    // //
    // SELECT ?s ?p ?o
    // WHERE {
    //   ?s ?p ?o
    //   FILTER(?p != rdf:type)
    //   FILTER(!isLiteral(?o))
    //   FILTER EXISTS {
    //   	?s rdf:type ?stype .
    //     ?o rdf:type ?otype .
    //   }
    //   FILTER NOT EXISTS {
    //     ?s rdf:type rdfs:Class
    //   }
    //   FILTER NOT EXISTS {
    //     ?o rdf:type rdfs:Class
    //   }
    //   FILTER NOT EXISTS {
    //     ?s rdf:type entities:DisplayInDisplayGroup
    //   }
    //   FILTER NOT EXISTS {
    //     ?o rdf:type entities:DisplayInDisplayGroup
    //   }
    // }
    // TODO: later need to include any transparent type here to be ignored similar to
    // DisplayInDisplayGroup
    let query = getRepositoryPrefixesSPARQL() +
        "SELECT ?s ?p ?o " +
        "WHERE { " +
        "   ?s ?p ?o " +
        "   FILTER(?p != rdf:type) " +
        "   FILTER(!isLiteral(?o)) " +
        "   FILTER EXISTS { " +
        "       ?s rdf:type ?stype . " +
        "       ?o rdf:type ?otype . " +
        "   } " +
        "   FILTER NOT EXISTS { " +
        "       ?s rdf:type rdfs:Class " +
        "   } " +
        "   FILTER NOT EXISTS { " +
        "       ?o rdf:type rdfs:Class " +
        "   } " +
        "   FILTER NOT EXISTS { " +
        "       ?s rdf:type entities:DisplayInDisplayGroup " +
        "   } " +
        "   FILTER NOT EXISTS { " +
        "       ?o rdf:type entities:DisplayInDisplayGroup " +
        "   } " +
        "   FILTER NOT EXISTS { " +
        "       ?s rdf:type pxio:Event " +
        "   } " +
        "   FILTER NOT EXISTS { " +
        "       ?o rdf:type pxio:Event " +
        "   } " +
        "}";
    return new Promise(function(resolve, reject) {
        rawSparqlQuery(repoUri, query)
            .then(response => {
                if (response.data) {
                    resolve(response.data.results.bindings);
                } else {
                    resolve([]);
                }
            })
            .catch(error => {
                console.error("Error when fetching instance relation statements", error);
                resolve([]);
            });
    });
};
export const createEventsFromExistingData = async (repoUri) => {
    // return; // NOTE: disabled for now to prevent accidental creation of duplicate events
    // NOTE: this should only be called once to create event instances for existing
    // data. later we need to create event data as event happens either in UI or
    // in backend when data relations/instances change
    let instances = await getInstanceCreationStatements(repoUri);
    let relations = await getInstanceRelationStatements(repoUri);
    let quads = [];
    let eventTime = new Date();
    // 1. add quads for instance creation events
    for (let instance of instances) {
        let ref = shortenWithPrefix(instance.instance.value);
        let type = shortenWithPrefix(instance.type.value);
        // create event indicating creation of ref
        let evtInstance = namedNode("pxio:event_" + uuidv4());
        quads.push(quad(
            evtInstance,
            namedNode("rdf:type"),
            namedNode("pxio:Event"),
            defaultGraph()
        ));
        quads.push(quad(
            evtInstance,
            namedNode("pxio:time"),
            literal(eventTime.toISOString()),
            defaultGraph()
        ));
        quads.push(quad(
            evtInstance,
            namedNode("pxio:isLocal"),
            literal(false),
            defaultGraph()
        ));
        // now we need to describe the event
        quads.push(quad(
            evtInstance,
            namedNode("pxio:isForInstance"),
            literal(true),
            defaultGraph()
        ));
        quads.push(quad(
            evtInstance,
            namedNode("pxio:isAdded"),
            literal(true),
            defaultGraph()
        ));
        quads.push(quad(
            evtInstance,
            namedNode("pxio:isFor"),
            namedNode(ref),
            defaultGraph()
        ));
        quads.push(quad(
            evtInstance,
            namedNode("pxio:hasType"),
            namedNode(type),
            defaultGraph()
        ));
        // update time for next event
        eventTime.setSeconds(eventTime.getSeconds() + 10);
    }
    // 2. add quads for relation change events
    for (let rel of relations) {
        let subject = shortenWithPrefix(rel.s.value);
        let relation = shortenWithPrefix(rel.p.value);
        let object = shortenWithPrefix(rel.o.value);
        // create event indicating relation between subject and object
        let evtInstance = namedNode("pxio:event_" + uuidv4());
        quads.push(quad(
            evtInstance,
            namedNode("rdf:type"),
            namedNode("pxio:Event"),
            defaultGraph()
        ));
        quads.push(quad(
            evtInstance,
            namedNode("pxio:time"),
            literal(eventTime.toISOString()),
            defaultGraph()
        ));
        quads.push(quad(
            evtInstance,
            namedNode("pxio:isLocal"),
            literal(false),
            defaultGraph()
        ));
        // now we need to describe the event
        quads.push(quad(
            evtInstance,
            namedNode("pxio:isForInstance"),
            literal(false), // i.e. describing a relation
            defaultGraph()
        ));
        quads.push(quad(
            evtInstance,
            namedNode("pxio:isAdded"),
            literal(true),
            defaultGraph()
        ));
        quads.push(quad(
            evtInstance,
            namedNode("pxio:isForSubject"),
            namedNode(subject),
            defaultGraph()
        ));
        quads.push(quad(
            evtInstance,
            namedNode("pxio:isForObject"),
            namedNode(object),
            defaultGraph()
        ));
        quads.push(quad(
            evtInstance,
            namedNode("pxio:hasType"),
            namedNode(relation),
            defaultGraph()
        ));
        // update time for next event
        eventTime.setSeconds(eventTime.getSeconds() + 10);
    }
    // 3. now we need to push quads into repo, adding new data
    const writer = new N3.Writer({
        prefixes: {
            ...window.activeRepoNameSpaces
        }
    });
    quads.forEach(q => writer.addQuad(q));
    writer.end((error, result) => {
        return new Promise(function(resolve, reject) {
            if (!error) {
                axios.post(
                    repoUri + "/statements?context=null",
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
                });
            } else {
                console.log("error when parsing quads as turtle string.");
                console.log(error);
            }
          });
    });
};
export const getRawDataForNetwork = (network) => {
    // for capturing node information, uses the following example pattern
    // first we capture all triples where subject is a visible instance, and either object is a literal or predicate is some generic info such as type information
    // then for each visible link, we fetch all triples where subject and object types match the link and predicate also matches the link
    // finally we capture all triples describing a visible type (might be unnecessary here)
    //
    // e.g. query below assumes visible types are User and UserGroup and only one visible relation which is foaf:member between the two types
    // PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    // PREFIX pxio: <http://www.pxio.de/rdf#>
    // PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    // SELECT ?s ?p ?o WHERE { {
    //     ?s ?p ?o
    //     FILTER EXISTS{
    //       VALUES ?type1 { pxio:User pxio:UserGroup }
    //       ?s rdf:type ?type1 .
    //     }
    //     FILTER(
    //       isLiteral(?o) ||
    //       ?p IN (rdf:type)
    //     )
    //   } UNION {
    //     ?s ?p ?o
    //     FILTER EXISTS{
    //       VALUES ?type1 { pxio:User pxio:UserGroup }
    //       VALUES ?type2 { pxio:User pxio:UserGroup }
    //       ?s rdf:type ?type1 .
    //       ?o rdf:type ?type2 .
    //     }
    //     FILTER(?p = foaf:member)
    //   } UNION {
    //     ?s ?p ?o
    //     FILTER (?s IN (pxio:User, pxio:UserGroup))
    //   }
    // }
    let visibleInfo = network.getVisibleNodesAndLinkTypes();
    let visibleNodes = visibleInfo.nodeTypes;
    let visibleLinks = visibleInfo.linkTypes;
    if (!visibleNodes.length) {
        return Promise.resolve([]);
    }
    let query = getRepositoryPrefixesSPARQL() +
        "SELECT ?s ?p ?o WHERE { { " +
        "   ?s ?p ?o " +
        "   FILTER EXISTS { " +
        "       VALUES ?type1 { " + visibleNodes.join(" ") + " } " +
        "       ?s rdf:type ?type1 . " +
        "   } " +
        "   FILTER(" +
        "       isLiteral(?o) || " +
        "       ?p IN (rdf:type) " +
        "   ) " +
        "  } ";
    for (let link of visibleLinks) {
        query +=
            " UNION { " +
            "   ?s ?p ?o " +
            "   FILTER EXISTS { " +
            "       VALUES ?type1 { " + link.sourceType + " " + link.targetType + " } " +
            "       VALUES ?type2 { " + link.sourceType + " " + link.targetType + " } " +
            "       ?s rdf:type ?type1 . " +
            "       ?o rdf:type ?type2 . " +
            "   } " +
            "   FILTER(?p = " + link.relation + ")" +
            " } ";
    }
    // add class node infos
    query +=
        " UNION { " +
        "   ?s ?p ?o " +
        "   FILTER(?s IN (" + visibleNodes.join(", ") + "))" +
        " } ";
    // close query
    query += "} ";
    return new Promise(function(resolve, reject) {
        rawSparqlPost(window.activeRepoURI, query)
            .then(response => {
                if (response.data) {
                    console.log("fetched network data...");
                    console.log(response.data.results.bindings);
                    resolve(response.data.results.bindings);
                } else {
                    resolve([]);
                }
            })
            .catch(error => {
                console.error("Error when fetching network data", error);
                resolve([]);
            });
    });
};
export const getEventsForNetwork = (network, returnAllRelevantEvents = true) => {
    // TODO: rework query so that we look for visible types/links instead of filtering
    // out invisible ones. see changes made to getRawDataForNetwork
    if (!returnAllRelevantEvents) {
        console.log("Add property to network to limit number of events TODO:");
    } else {
        let invisInfo = network.getInvisNodesAndLinkTypes();
        let invisNodes = invisInfo.nodeTypes;
        let invisLinks = invisInfo.linkTypes;
        let query = getRepositoryPrefixesSPARQL() +
            "SELECT ?s ?p ?o " +
            "WHERE { " +
            "   ?s ?p ?o " +
            "   FILTER EXISTS { " +
            "       ?s rdf:type pxio:Event " +
            "   } " +
            "   FILTER(?o != pxio:Event) ";
        for (let type of invisNodes) {
            query +=
                "   FILTER NOT EXISTS { " +
                "       ?o rdf:type " + type + " " +
                "   } " +
                "   FILTER NOT EXISTS { " +
                "       ?s pxio:isForInstance true . " +
                "       ?s pxio:hasType " + type + " . " +
                "   } " +
                "   FILTER NOT EXISTS { " +
                "       ?s pxio:isForInstance false . " +
                "       ?s pxio:isForSubject ?q . " +
                "       FILTER EXISTS { " +
                "           ?q rdf:type " + type + " " +
                "       } " +
                "   } " +
                "   FILTER NOT EXISTS { " +
                "       ?s pxio:isForInstance false . " +
                "       ?s pxio:isForObject ?q . " +
                "       FILTER EXISTS { " +
                "           ?q rdf:type " + type + " " +
                "       } " +
                "   } ";
        }
        for (let link of invisLinks) {
            query +=
                "   FILTER NOT EXISTS { " +
                "       ?s pxio:isForInstance false . " +
                "       ?s pxio:isForObject ?n . " +
                "       ?s pxio:isForSubject ?m . " +
                "       ?s pxio:hasType " + link.relation + " " +
                "       FILTER EXISTS { " +
                "           ?n rdf:type " + link.targetType + " . " +
                "           ?m rdf:type " + link.sourceType + " " +
                "       } " +
                "   } ";
        }
        query +=
            "}";
        return new Promise(function(resolve, reject) {
            rawSparqlPost(window.activeRepoURI, query)
                .then(response => {
                    if (response.data) {
                        console.log("fetched network data...");
                        console.log(response.data.results.bindings);
                        let data = response.data.results.bindings;
                        let events = {};
                        for (let spo of data) {
                            let eventId = shortenWithPrefix(spo.s.value);
                            if (!(eventId in events)) {
                                events[eventId] = [];
                            }
                            events[eventId].push({
                                p: shortenWithPrefix(spo.p.value),
                                o: spo.o.value
                            });
                        }
                        // this will query all allowed events meaning events that are related
                        // to visible nodes and relations as set by network
                        // we need to now compute nodes and relations that we need to visualize
                        // in order to reflect graph describing these events
                        // this includes
                        resolve(events);
                    } else {
                        resolve([]);
                    }
                })
                .catch(error => {
                    console.error("Error when fetching network events", error);
                    resolve([]);
                });
        });
    }
};
export const getInstanceInfo = (repoUri, instance) => {
    let query = getRepositoryPrefixesSPARQL() +
        "SELECT ?p ?o " +
        "WHERE { " +
        instance + " ?p ?o " +
        "}";
    return new Promise(function(resolve, reject) {
        rawSparqlQuery(repoUri, query)
            .then(response => {
                // console.log("instance info is ", response);
                if (response.data) {
                    resolve(response.data.results.bindings);
                } else {
                    resolve([]);
                }
            })
            .catch(error => {
                console.error("Error when querying instance info for " + instance + ": ", error);
                resolve([]);
            });
    });
};

export const getInstanceType = (repoUri, instance) => {
    // assumes instance is in short prefix form
    // NOTE: type is not shortened
    let query = getRepositoryPrefixesSPARQL() +
        "SELECT ?s ?p ?o " +
        "WHERE { " +
        instance + " rdf:type ?o " +
        "}";
    return new Promise(function(resolve, reject) {
        rawSparqlQuery(repoUri, query)
            .then(response => {
                console.log("type response is ", response);
                if (response.data) {
                    let type = response.data.results.bindings[0].o.value;
                    resolve(type);
                } else {
                    resolve("");
                }
            })
            .catch(error => {
                console.error("Error when querying instance data for " + instance + ": ", error);
                resolve("");
            });
    });
};

export const getTypeLiteralPredicates = (repoUri, type, forceLiteral = true) => {
    // assuming type is a shortened class in repository e.g. pxio:User
    // returns all predicates present on instances of this type that are
    // pointing to a literal object e.g. foaf:name
    let query = getRepositoryPrefixesSPARQL() +
        "SELECT DISTINCT ?p " +
        "WHERE { " +
        "   ?s ?p ?o " +
        "   FILTER EXISTS { " +
        "       ?s rdf:type " + type +
        "   } " +
        (forceLiteral ? "   FILTER (isLiteral(?o)) " : "") +
        "} " +
        "ORDER BY ?p ";
    return new Promise(function(resolve, reject) {
        rawSparqlQuery(repoUri, query)
            .then(response => {
                if (response.data) {
                    resolve(
                        response.data.results.bindings.map(r => r.p.value)
                    );
                } else {
                    resolve([]);
                }
            })
            .catch(error => {
                console.error("Error when querying literal predicates for " + type + ": " + error);
                resolve([]);
            });
    });
};

export const SPECIAL_PREDICATE_NO_LITERAL = "Prefixed URI (default)";
export const getLiteral = (repoUri, instance, predicate) => {
    // assums both inputs are shortened
    if (predicate === SPECIAL_PREDICATE_NO_LITERAL) {
        return new Promise(function(resolve, reject) {
            resolve(instance);
        });
    }
    // fetches (instance, predicate, label) for instance
    let query = getRepositoryPrefixesSPARQL() +
        "SELECT ?label " +
        "WHERE { " + instance + " " + predicate + " ?label }";
    return new Promise(function(resolve, reject) {
        rawSparqlQuery(repoUri, query)
            .then(response => {
                // console.log("label query result is");
                // console.log(response.data);
                if (response.data) {
                    resolve(
                        shortenWithPrefix(response.data.results.bindings[0].label.value)
                    );
                } else {
                    resolve("N/A");
                }
            })
            .catch(error => {
                console.error("Error when querying literal for " + instance + ": " + error);
                resolve("N/A");
            });
    });
};

export const getObject = (subject, predicate) => {
    // assums both inputs are shortened
    // returns the instance represented by (subject predicate ?object)
    let query = getRepositoryPrefixesSPARQL() +
        "SELECT ?object " +
        "WHERE { " + subject + " " + predicate + " ?object }";
    return new Promise(function(resolve, reject) {
        rawSparqlQuery(window.activeRepoURI, query)
            .then(response => {
                if (response.data) {
                    resolve(response.data.results.bindings[0].object.value);
                } else {
                    resolve(undefined);
                }
            })
            .catch(error => {
                console.error("Error when querying object for " + subject + ", " + predicate + ": " + error);
                resolve(undefined);
            });
    });
};

export const isInstanceCollection = (instance) => {
    // assums instance is shortened
    // returns true if this instance points to a collection e.g. a list by
    // checking if it has a rdf:first relation
    let query = getRepositoryPrefixesSPARQL() +
        "ASK { " + instance + " rdf:first ?label }";
    return new Promise(function(resolve, reject) {
        rawSparqlQuery(window.activeRepoURI, query)
            .then(response => {
                if (response.data) {
                    resolve(response.data.boolean);
                } else {
                    resolve(false);
                }
            })
            .catch(error => {
                console.error("Error when checking if instance is list for " + instance + ": " + error);
                resolve(false);
            });
    });
};

export const fetchListFromInstance = (instance) => {
    // assums instance is shortened
    // returns instances in the list represented by instance
    return new Promise(function(resolve, reject) {
        isInstanceCollection(instance)
            .then(async (isList) => {
                let ret = [];
                if (isList) {
                    let next = shortenWithPrefix(await getObject(instance, "rdf:first"));
                    let rest = shortenWithPrefix(await getObject(instance, "rdf:rest"));
                    let isEmpty = rest === "rdf:nil";
                    ret.push(next);
                    while (!isEmpty) {
                        next = shortenWithPrefix(await getObject(rest, "rdf:first"));
                        rest = shortenWithPrefix(await getObject(rest, "rdf:rest"));
                        isEmpty = rest === "rdf:nil";
                        ret.push(next);
                    }
                } else {
                    // nothing to do as the instance did not point to a list
                }
                resolve(ret);
            });
    });
};

// TODO: fetch repo uri using rest api
const VOCABULARY_REPO_URI = "http://mmbrian.mm.dev.pxio.net:8080/rdf4j-server/repositories/rdf_rdfs_owl_foaf_vocabularies";
export const getTypeToTypePredicates = (typeA, typeB) => {
    // NOTE: typeA and typeB are assumed to be shortened
    let query = getRepositoryPrefixesSPARQL() +
        "SELECT ?domain ?property ?range " +
        "WHERE { " +
        "  ?property rdfs:domain ?domain ; " +
        "            rdfs:range ?range . " +
        "  FILTER (?domain = " + typeA + " || EXISTS {" + typeA + " rdfs:subClassOf ?domain}) " +
        "  FILTER (?range = " + typeB + " || EXISTS {" + typeB + " rdfs:subClassOf ?range}) " +
        "}";
    return new Promise(function(resolve, reject) {
        rawSparqlQuery(VOCABULARY_REPO_URI, query)
            .then(response => {
                // console.log("predicate response is ", response);
                if (response.data) {
                    let triples = response.data.results.bindings;
                    resolve(triples.map(spo => spo.property.value));
                } else {
                    resolve([]);
                }
            })
            .catch(error => {
                console.error("Error when querying instance data for " + instance + ": ", error);
                resolve([]);
            });
    });
};

export const getPredicateLabel = (predicate) => {
    return predicate;
    // TODO: fix
    let query = getRepositoryPrefixesSPARQL() +
        "SELECT ?o " +
        "WHERE { " +
        "  " + predicate + " rdfs:label ?o ." +
        "}";
    return new Promise(function(resolve, reject) {
        rawSparqlQuery(VOCABULARY_REPO_URI, query)
            .then(response => {
                // console.log("predicate response is ", response);
                if (response.data) {
                    let triples = response.data.results.bindings;
                    let label = triples.map(spo => spo.o.value)[0];
                    resolve(label ? label : predicate);
                } else {
                    resolve(predicate);
                }
            })
            .catch(error => {
                console.error("Error when querying predicate data for " + predicate + ": ", error);
                resolve(predicate);
            });
    });
};

export const getRepositoryTypes = (repoUri) => {
    // perform the following query
    // PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    // PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    // SELECT DISTINCT ?type
    // WHERE {
    //   ?s ?p ?type
    //   FILTER ( ?p = rdf:type || ?p = rdfs:type )
    // }
    return new Promise(async function(resolve, reject) {
        let query = getRepositoryPrefixesSPARQL() +
            "SELECT DISTINCT ?type " +
            "WHERE { " +
            "   ?s ?p ?type " +
            "   FILTER ( ?p = rdf:type || ?p = rdfs:type ) " +
            "}";
        rawSparqlQuery(repoUri, query)
            .then(response => {
                if (response.data) {
                    let types = response.data.results.bindings;
                    let typeArray = types.map(t => t.type.value);
                    window.activeRepoTypes = typeArray;
                    window.activeRepoShortenedTypes = typeArray.map(t => shortenWithPrefix(t));
                    resolve(typeArray);
                }
            })
            .catch(error => {
                window.activeRepoTypes = [];
                console.error("Error when querying types: ", error);
                resolve([]);
            });
    });
};

export const getRepositoryNonTrivialTypes = async (repoUri) => {
    // returns all types which do not belong to any of the following namespaces
    // also excludes Event type
    let allTypes = await getRepositoryTypes(repoUri);
    let namespaces = await getRepositoryNamespaces(repoUri);
    // TODO: make this available in localStorage so that user can add/remove trivial types
    let trivialTypePrefixes = [
        "http://www.w3.org/2002/07/owl#",
        "http://www.w3.org/2001/XMLSchema#",
        "http://www.w3.org/2000/01/rdf-schema#",
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
        "http://www.w3.org/ns/shacl#",
        "http://spinrdf.org/spin#",
        "http://spinrdf.org/sp#",
        "http://purl.org/dc/elements/1.1/"
    ];
    return allTypes.filter(t => {
        if (t !== "http://www.pxio.de/rdf#Event") {
            return !trivialTypePrefixes.some(prefix => t.startsWith(prefix));
        }
        return false;
    });
};
export const getRepositoryPredicatesForTypes = async (repoUri, shortenedTypes) => {
    // returns all predicates between two instances of given types.
    // if types is the output of getRepositoryNonTrivialTypes, this means all
    // predicates that might show up in UI at some point.
    // NOTE: assumes types are prefixed e.g. pxio:User
    // e.g. the following returns all relations between two classes User and UserGroup
    // SELECT DISTINCT ?rel
    // WHERE {
    //   ?s ?rel ?o
    //   FILTER EXISTS {
    //     VALUES ?type1 { pxio:User pxio:UserGroup }
    //     VALUES ?type2 { pxio:User pxio:UserGroup }
    // 	   ?s rdf:type ?type1 .
    //     ?o rdf:type ?type2
    //   }
    // }
    return new Promise(async function(resolve, reject) {
        let query = getRepositoryPrefixesSPARQL() +
            "SELECT DISTINCT ?relation " +
            "WHERE { " +
            "   ?s ?relation ?o " +
            "   FILTER EXISTS { " +
            "     VALUES ?type1 { " + shortenedTypes.join(" ") + " }" +
            "     VALUES ?type2 { " + shortenedTypes.join(" ") + " }" +
            "     ?s rdf:type ?type1 . " +
            "     ?o rdf:type ?type2 " +
            "   }" +
            "}";
        rawSparqlQuery(repoUri, query)
            .then(response => {
                if (response.data) {
                    let relations = response.data.results.bindings;
                    let relationArray = relations.map(r => r.relation.value);
                    window.activeRepoRelations = relationArray;
                    resolve(relationArray);
                }
            })
            .catch(error => {
                console.error("Error when querying relation between types: ", error);
                window.activeRepoRelations = [];
                resolve([]);
            });
    });

};

window._getUniqueRelationsBetweenTypes_prev_input = [];
window._getUniqueRelationsBetweenTypes_prev_output = [];
export const getUniqueRelationsBetweenTypes = (shortenedTypes, useCache = false) => {
    // NOTE: if useCache is set to true, we check if input shortenedTypes is the
    // same as previous input, if so we will return previously cached output and
    // do not perform sparql query.
    // gives a list of types, returns information about all existing relations
    // in repository between instances of these types. returned info contains
    // triples describing subject type, relation, and object type
    // e.g.
    // SELECT DISTINCT ?subjectType ?relation ?objectType
    // WHERE {
    // ?s ?relation ?o .
    // VALUES ?subjectType { pxio:User pxio:UserGroup entities:Display entities:DisplayGroup }
    // VALUES ?objectType { pxio:User pxio:UserGroup entities:Display entities:DisplayGroup }
    // FILTER EXISTS {
    //   ?s rdf:type ?subjectType .
    //   ?o rdf:type ?objectType .
    // }
    // }
    if (useCache && shortenedTypes.length === window._getUniqueRelationsBetweenTypes_prev_input.length) {
        // sizes match
        if (shortenedTypes.every(x => window._getUniqueRelationsBetweenTypes_prev_input.includes(x))) {
            // all element also match
            return Promise.resolve(window._getUniqueRelationsBetweenTypes_prev_output);
        }
    } else {
        window._getUniqueRelationsBetweenTypes_prev_input = shortenedTypes;
    }
    let query = getRepositoryPrefixesSPARQL() +
        "SELECT DISTINCT ?subjectType ?relation ?objectType " +
        "WHERE { " +
        "   ?s ?relation ?o . " +
        "   VALUES ?subjectType { " + shortenedTypes.join(" ") + " }" +
        "   VALUES ?objectType { " + shortenedTypes.join(" ") + " }" +
        "   FILTER EXISTS { " +
        "     ?s rdf:type ?subjectType . " +
        "     ?o rdf:type ?objectType " +
        "   }" +
        "}";
    return new Promise(function(resolve, reject) {
        rawSparqlQuery(window.activeRepoURI, query)
            .then(response => {
                if (response.data) {
                    let relInfo = response.data.results.bindings;
                    let ret = relInfo.map(spo => {
                        return {
                            subject: shortenWithPrefix(spo.subjectType.value),
                            relation: shortenWithPrefix(spo.relation.value),
                            object: shortenWithPrefix(spo.objectType.value)
                        };
                    });
                    window._getUniqueRelationsBetweenTypes_prev_output = JSON.parse(JSON.stringify(ret));
                    resolve(ret);
                }
            })
            .catch(error => {
                console.error("Error when querying relation ingo between types: ", error);
                window._getUniqueRelationsBetweenTypes_prev_output = [];
                resolve([]);
            });
    });
};

export const getDefaultQueryForListView = (type) => {
    return "SELECT DISTINCT ?subject " +
        "WHERE { " +
        "  ?subject rdf:type " + type + " . " +
        "}";
};

export const getRepositoryInstancesForType =
    (repoUri, type, customQuery = "") => {
    // performs the following query
    // e.g. if type is foaf:Person
    //
    // PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    // PREFIX foaf: <http://xmlns.com/foaf/0.1/#>
    // SELECT DISTINCT ?subject
    // WHERE {
    //   ?subject rdf:type foaf:Person .
    // }
    //
    // NOTE: assumes type is a shortened uri
    // TODO: consider cases where type info is not using rdf:type
    // TODO: also consider adding all prefixes or make sure all
    // prefixes from query are added e.g. entities
    let prefixes = getRepositoryPrefixesSPARQL();
    let query = prefixes +
        "SELECT DISTINCT ?subject " +
        "WHERE { " +
        "  ?subject rdf:type " + type + " . " +
        "}";
    if (customQuery) {
        query = prefixes + customQuery;
    }
    return new Promise(function(resolve, reject) {
        rawSparqlQuery(repoUri, query)
            .then(response => {
                if (response.data) {
                    let instances = response.data.results.bindings;
                    resolve(instances.map(i => i.subject.value));
                } else {
                    resolve([]);
                }
            })
            .catch(error => {
                console.error("Error when querying instances for " + type + ": ", error);
                resolve([]);
            });
    });
};

export const getRepositoryInstancesForTypeWithCond =
    (repoUri, type, condition = "") => {
    // performs the following query
    // e.g. if type is foaf:Person
    //
    // PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    // PREFIX foaf: <http://xmlns.com/foaf/0.1/#>
    // SELECT DISTINCT ?subject
    // WHERE {
    //   ?subject rdf:type foaf:Person .
    //   condition
    // }
    //
    // assuming condition is of the form `FILTER EXISTS {?subject ...}`
    // NOTE: assumes type is a shortened uri
    // TODO: add support for blank nodes
    let prefixes = getRepositoryPrefixesSPARQL();
    let query = prefixes +
        "SELECT DISTINCT ?subject " +
        "WHERE { " +
        "  ?subject a " + type + " . " +
        "  " + condition +
        "}";
    return new Promise(function(resolve, reject) {
        rawSparqlQuery(repoUri, query)
            .then(response => {
                if (response.data) {
                    let instances = response.data.results.bindings;
                    resolve(instances.map(i => i.subject.value));
                } else {
                    resolve([]);
                }
            })
            .catch(error => {
                console.error("Error when querying instances for " + type + ": ", error);
                resolve([]);
            });
    });
};

export const getRepositoryInstanceDescription = (repoUri, instance) => {
    // performs the following query
    // assuming instance is http://www.pxio.de/people/about/#users.mohsen
    // PREFIX pxiopeople: <http://www.pxio.de/people/about/#>
    // DESCRIBE pxiopeople:users.mohsen
    //
    console.log("Getting rep description for", instance);
    let query =getRepositoryPrefixesSPARQL() +
        "DESCRIBE " + shortenWithPrefix(instance);
    return new Promise(function(resolve, reject) {
        rawSparqlQuery(repoUri, query)
            .then(response => {
                if (response.data) {
                    // passing no callbacks so that data is processed synchronously
                    // see https://github.com/rdfjs/N3.js/blob/master/src/N3Parser.js
                    let quads = turtleParser.parse(response.data);
                    // NOTE: ignoring descriptions of any related event
                    resolve(quads.map(q => {
                        return {
                            s: q.subject.id,
                            sType: q.subject.termType,
                            p: q.predicate.id,
                            o: q.object.id,
                            oType: q.object.termType
                        };
                    }).filter(q => !shortenWithPrefix(q.s).startsWith("pxio:event_")));
                } else {
                    resolve([]);
                }
            })
            .catch(error => {
                console.error("Error when querying instance description for " + instance + ": ", error);
                resolve([]);
            });
    });
};

export const storeTurtleDataToRepo = (repoUri, turtleEncodedData) => {
    // NOTE: stores data without any contexts
    // see https://rdf4j.org/documentation/reference/rest-api/
    let loadingHandle = hx.notifyLoading("Storing data to ", repoUri);
    axios.post(
        repoUri + "/statements?context=null",
        turtleEncodedData,
        {
            headers: {
                'content-type': 'application/x-turtle'
            }
        }
    )
        .then(response => {
            loadingHandle.close();
            console.log("finished store request.");
        });
};

export const rawSparqlQuery = (repoUri, query) => {
    // see https://rdf4j.org/documentation/reference/rest-api/
    const params = {
        'query': query
    };
    return new Promise(function(resolve, reject) {
        axios.get(
            repoUri,
            { params },
            {
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/sparq-results+json',
                }
            })
            .then(response => {
                resolve(response);
            })
            .catch(error => {
                reject(error);
            });
    });

};

export const rawSparqlPost = (repoUri, query) => {
    // see https://rdf4j.org/documentation/reference/rest-api/
    return new Promise(function(resolve, reject) {
        axios.post(
            repoUri,
            'query=' + encodeURI(query),
            {
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/sparql-results+json',
                }
            })
            .then(response => {
                resolve(response);
            })
            .catch(error => {
                reject(error);
            });
    });
};

export const deleteQuads = (quads, pxio_type) => {
    // TODO: getNTripleFromShortUri assumes all quads are between uris and does
    // not support literal objects. need to write a method to translate literals
    // to N-Triple format:
    // e.g. "some string" becomes "some string" (no changes)
    // but "true" as a boolean becomes "true"^^<http://www.w3.org/2001/XMLSchema#boolean>
    // need to also see how other types need translation
    return new Promise(function(resolve, reject) {
        let deleteActions = [];
        for (let q of quads) {
            let _obj = null;
            if (q.object.termType === "Literal") {
                switch (pxio_type) {
                    case PxioEventType.REMOVE_USER:
                        _obj = q.object.value; // N-Triple repr of a string is itself
                        break;
                    default:
                }
            } else {
                _obj = getNTripleFromShortUri(shortenWithPrefixIfNotAlready(q.object.value));
            }
            deleteActions.push(axios.delete(
                window.activeRepoURI + "/statements",
                {
                    headers: {
                      'Accept': 'text/boolean',
                    },
                    params: {
                        subj: getNTripleFromShortUri(shortenWithPrefixIfNotAlready(q.subject.value)),
                        pred: getNTripleFromShortUri(shortenWithPrefixIfNotAlready(q.predicate.value)),
                        obj: _obj
                    }
                }
            ));
        }
        Promise.all(deleteActions)
            .then(response => {
                console.log("delete quads response");
                console.log(response);
                resolve();
            }).catch(error => {
                console.log("error when deleting quads");
                console.log(error);
                resolve();
            });
    });
};

export const deleteStatements = (statementDataString) => {
    // see https://rdf4j.org/documentation/reference/rest-api/
    return new Promise(function(resolve, reject) {
        // this works! but only deletes a single triple
        // axios.delete(
        //     window.activeRepoURI + "/statements",
        //     {
        //         headers: {
        //           'Accept': 'text/boolean',
        //         },
        //         params: {
        //             subj: "<http://localhost:8080/data/test/groups_dev>",
        //             pred: "<http://xmlns.com/foaf/0.1/member>",
        //             obj: "<http://www.pxio.de/people/about/#users_paul>"
        //         }
        //     }
        // )
        // TODO: try with statementDataString be fully in N-Triple format not shortenned uris!
        axios.post(
            window.activeRepoURI + "/statements",
            {
                headers: {
                    'content-type': 'application/sparql-update',
                    'Accept': 'text/boolean',
                },
                params: {
                    'update': "DELETE DATA { " + statementDataString + "}"
                }
            }
        )
        // axios({
        //     method: "post",
        //     url: window.activeRepoURI + "/statements?context=null",
        //     data: "DELETE WHERE " +
        //         "{ " +
        //         "  " + statementDataString +
        //         "}",
        //     headers: {
        //       'content-type': 'application/sparql-update',
        //     }
        // })
        .then(response => {
            console.log("delete data response");
            console.log(response);
            resolve();
        }).catch(error => {
            console.log("error when deleting data");
            console.log(error);
            resolve();
        });
        // axios.post(
        //     window.activeRepoURI + "/transactions",
        //     {
        //         headers: {
        //             'content-type': 'application/x-www-form-urlencoded',
        //             'Accept': 'application/sparq-results+json',
        //         }
        //     })
        //     .then(response => {
        //         console.log("transaction response:");
        //         console.log(response);
        //         console.log("request data would be");
        //         console.log(statementDataString);
        //         let transactionUri = response.headers.location;
        //         axios({
        //             method: "post",
        //             // url: transactionUri + "?action=DELETE",
        //             url: transactionUri,
        //             data: statementDataString,
        //             params: {
        //                 action: "DELETE",
        //             },
        //             // data: "DELETE DATA " +
        //             // "{ " +
        //             // "  " + statementDataString +
        //             // "}",
        //             headers: { 'content-type': 'text/turtle' }
        //         }).then(response => {
        //             console.log("delete transaction response:");
        //             console.log(response);
        //             if (response.status === 200) {
        //                 axios({
        //                     method: "post",
        //                     // url:   transactionUri + "?action=COMMIT",
        //                     url: transactionUri,
        //                     params: {
        //                         action: "COMMIT",
        //                     },
        //                 }).then(response => {
        //                     console.log("delete transaction commit response:");
        //                     console.log(response);
        //                     resolve(response);
        //                 });
        //             }
        //         });
        //     })
        //     .catch(error => {
        //         reject(error);
        //     });
    });
};
