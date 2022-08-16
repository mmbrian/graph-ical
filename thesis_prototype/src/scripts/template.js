const uuidv4 = require("uuid/v4");
import * as d3 from "d3";
import { shortenWithPrefix } from "./data";

export const TYPE_PREDICATES = [
    "www.w3.org/1999/02/22-rdf-syntax-ns#type",
    "www.w3.org/2000/01/rdf-schema#subclassof"
];
export const isTypePredicate = (p) => {
    p = p.toLowerCase();
    if (p.startsWith("https://")) { p = p.substring(8); }
    else if (p.startsWith("http://")) { p = p.substring(7); }
    return TYPE_PREDICATES.includes(p);
};

export const ABSTRACT_SUBJECTS = [
    // RDFS abstract types
    "www.w3.org/2000/01/rdf-schema#resource",
    "www.w3.org/2000/01/rdf-schema#class",
    // OWL abstract types
    "www.w3.org/2002/07/owl#class",
    "www.w3.org/2002/07/owl#thing",
    // // RDF abstract types
    // "www.w3.org/1999/02/22-rdf-syntax-ns#bag",
    // "www.w3.org/1999/02/22-rdf-syntax-ns#seq",
    // "www.w3.org/1999/02/22-rdf-syntax-ns#alt",
    // "www.w3.org/1999/02/22-rdf-syntax-ns#list",
    // WoT
    "www.w3.org/2019/wot/td#thing",
];
export const isAbstractSubject = (s) => {
    s = s.toLowerCase();
    if (s.startsWith("https://")) { s = s.substring(8); }
    else if (s.startsWith("http://")) { s = s.substring(7); }
    return ABSTRACT_SUBJECTS.includes(s);
};
