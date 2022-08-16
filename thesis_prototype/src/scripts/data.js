const N3 = require('n3');
const turtleParser = new N3.Parser({ format: 'Turtle' });
import { NodeTypes, LinkTypes } from "./types";
import { isTypePredicate, isAbstractSubject } from "./template";
import * as d3 from "d3";
const uuidv4 = require("uuid/v4");

// initial data //////////////////
export const _baseNodes = [];
export const _baseLinks = [];
//////////////////////////////////

export const shortenWithPrefix = (uri) => {
    // console.log("shortening", uri);
    // given an rdf URI, tries to shorten it in case it starts with a known prefix
    // e.g. "http://xmlns.com/foaf/0.1/#name" becomes "foaf:name"
    // TODO: only use window.activeRepoNameSpaceToPrefix
    if (window.activeRepoNameSpaceToPrefix) {
        // console.log("has activeRepoNameSpaceToPrefix");
        let namespace = Object.keys(window.activeRepoNameSpaceToPrefix).find(ns => uri.startsWith(ns));
        if (namespace) {
            return window.activeRepoNameSpaceToPrefix[namespace] + ":" + uri.substring(namespace.length);
        }
        return uri;
    } else if (window.rdfNamespaces) {
        // console.log("has rdfNamespaces");
        let namespace = window.rdfNamespaces.find(ns => uri.startsWith(ns));
        if (namespace) {
            return window.namespaceToPrefix[namespace] + ":" + uri.substring(namespace.length);
        }
        return uri;
    }
};

export const unshorten = (shortenedUri) => {
    let idx = shortenedUri.indexOf(":");
    let prefix = shortenedUri.substring(0, idx);
    let uriWithoutPrefix = shortenedUri.substring(idx+1);
    return window.activeRepoNameSpaces[prefix] + uriWithoutPrefix;
};

export const shortenWithPrefixIfNotAlready = (uri) => {
    if (uri.startsWith("http://")) return shortenWithPrefix(uri);
    return uri;
};

export const getNTripleFromShortUri = (shorted) => {
    let _i = shorted.indexOf(":");
    let prefix = shorted.substring(0, _i);
    let value = shorted.substring(_i + 1);
    let prefix_uri = window.activeRepoNameSpaces[prefix];
    return "<" + prefix_uri + value + ">";
};

export const shortenWithoutPrefix = (uri) => {
    let ret = shortenWithPrefix(uri);
    return ret.substring(ret.indexOf(":") + 1);
};

export const removePrefix = (uri) => {
    let namespace = window.rdfNamespaces.find(ns => uri.startsWith(ns));
    if (namespace) {
        return uri.substring(namespace.length);
    }
    return uri;
};
