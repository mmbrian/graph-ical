require("../styles/index.scss");
require("hexagon-js/dist/hexagon.css");
require("@fortawesome/fontawesome-free/scss/fontawesome.scss");
require("@fortawesome/fontawesome-free/scss/solid.scss");
require("@fortawesome/fontawesome-free/scss/regular.scss");
require("@fortawesome/fontawesome-free/scss/brands.scss");
require("@fortawesome/fontawesome-free/scss/v4-shims.scss");
const uuidv4 = require("uuid/v4");
const axios = require('axios');
import '@simonwep/pickr/dist/themes/nano.min.css';
const hx = require("hexagon-js");
import { fromEvent, Subject } from "rxjs";
import * as d3 from "d3";
import { shortenWithPrefix } from "./data";
import {
    storeTurtleDataToRepo,
    sparqlQuery,
    getRepositoryInstanceDescription,
    getInstanceType,
    getTypeToTypePredicates,
    createEventsFromExistingData,
    doesTripleExist,
    getRepositoryPredicatesForTypes,
    getRepositoryNamespaces,
    getRepositoryTypes,
    RDF_SERVER_URL
} from "./rest_util";
import { addDragBehavior, getDragBehaviours } from "./drag_util";
import {
    updateIconList,
    exportTemplate,
    loadTemplateData
} from "./template_style";
import { TabManager } from "./tabs/tab_util";
import { initAddUserDOM } from "./add_visualization";
import { PersonaManager } from "./persona/persona_manager";
/////////////////// temporary code
import {
  VisTypes,
  VisTemplateKeys,
  BaseVisualization
} from "../visualizations/BaseVisualization";
import InstanceInfoTree from "../visualizations/collapsibletree";
import RDFVisualizer from "../visualizations/network";
import {
  addVisualization
} from "./add_visualization";
import {
  localEventStream
} from "./events";
import {
    EventType,
    PxioEventType
} from "./types";
import { getLinkLabelSync, getTypeLabelSync } from "./helpers";
import { getRepoTypes, getRepoRelations, getTermTranslation } from "./rdf_terms_util";
/////
window.isInUserMode = false;
window.isInAddVisualizationMode = false;
//////////////////
TabManager.getInstance().initTabs();

////////////////////////////////
const getAllRepositories = () => {
    window.repositories = {};
    console.log("Fetching repositories........");
    return new Promise(async function(resolve, reject) {
        let loadingHandle = hx.notifyLoading("Fetching repositories...");
        console.log("Fetching repositories...");
        axios.get(RDF_SERVER_URL + "/repositories")
            .then(async (response) => {
                loadingHandle.close();
                let repos = response.data.results.bindings;
                if (!repos) {
                    hx.notifyNegative("Found no repositories.");
                } else {
                    for (let repo of repos) {
                        hx.notifyPositive("Found repository: " + repo.id.value);
                        window.repositories[repo.id.value] = repo.uri.value;
                    }
                    console.log("fetched repositories........");
                    setupRepositorySelectionUI();
                }
                resolve();
            });
    });
};

const selectRepository = (repoUri) => {
    return new Promise(async function(resolve, reject) {
        window.activeRepoURI = repoUri;
        await getRepositoryNamespaces(repoUri);
        await getRepositoryTypes(repoUri);
        await getRepositoryPredicatesForTypes(
          repoUri,
          window.activeRepoTypes.map(t => shortenWithPrefix(t))
        );
        resolve();
    });
};

const setupRepositorySelectionUI = () => {
    // NOTE: has to be called after repository data is fetched
    if (window.selectRepoClickEvent) {
        document.getElementById('select-repository').removeEventListener(
            'click',
            window.selectRepoClickEvent,
            false
        );
    } else {
        window.selectRepoClickEvent = async () => {
            d3.select("#repository-list").remove();
            d3.select("body").append("div").attr("id", "repository-list");
            let modalContentContainer = d3.select("#repository-list")
                .append("div")
                .classed("repository-info", true);
            for (let repo in window.repositories) {
                let repoItem = modalContentContainer.append("div")
                    .classed("repo-item", true);
                repoItem
                    .append("span")
                    .text(repo);
                repoItem.on("click", async () => {
                    // TODO: select repo and update UI accordingly
                    await selectRepository(window.repositories[repo]);
                    initAddUserDOM();
                    modal.close();
                });
            }
            let footer = d3.select("body")
                .append("div")
                .classed("select_repo_modal_footer", true);
            footer.append("button")
                .classed("hx-btn hx-secondary", true)
                .attr("id", "cancel-select-repo")
                .text("Cancel");
            hx.select('#cancel-select-repo').on('click', function(){
                modal.close();
            });
            let modal = hx.modalCenter({
                title: 'Select a RDF repository',
                renderBody: () => hx.select("#repository-list"),
                renderFooter: thisModal => hx.select(".select_repo_modal_footer")
            });
        };
    }
    document.getElementById('select-repository').addEventListener('click', window.selectRepoClickEvent);
};
////////////////////////////////

// TODO: move highlight logic to a separate module
window.highlightedRects = {};
window.highlighterStream = new Subject();
window.window.highlighterStream.subscribe({
    next: args => {
        if (args.add) {
            let id = uuidv4();
            window.highlightedRects[id] = args.rect;
            args.vis.highlightId = id;
        }
        if (args.remove) {
            delete window.highlightedRects[args.id];
        }
        if (Object.keys(window.highlightedRects).length > 0) {
            renderHighlightedVisualizations(Object.values(window.highlightedRects));
        } else {
            d3.select("div.overlay-container").html("");
        }
    }
});
const renderHighlightedVisualizations = (rects) => {
    let isInsideAnyRect = (x, y) => {
        for (let r of rects) {
            if (x >= r.x && x <= r.x + r.w) {
                if (y >= r.y && y <= r.y + r.h) {
                    return true;
                }
            }
        }
        return false;
    };
    let overlayArea = d3.select("div.overlay-container");
    // remove previous dimmed divs
    overlayArea.html("");
    // compute x and y arrays (sorted)
    let xArray = [31, window.innerWidth];
    let yArray = [85, window.innerHeight];
    rects.map(r => {
        xArray.push(r.x);
        yArray.push(r.y);
        xArray.push(r.x + r.w);
        yArray.push(r.y + r.h);
        return r;
    });
    xArray = Array.from(new Set(xArray));
    yArray = Array.from(new Set(yArray));
    xArray = xArray.sort(function(a, b) {
        return a - b;
    });
    yArray = yArray.sort(function(a, b) {
        return a - b;
    });
    for (let i=0; i<xArray.length - 1; i++) {
        let left = xArray[i];
        let w = xArray[i+1] - left;
        let top = yArray[0];
        for (let j=0; j<yArray.length-1; j++) {
            let h = yArray[j+1] - top;
            //
            let mx = left + w * 0.5;
            let my = top + h * 0.5;
            if (!isInsideAnyRect(mx, my)) {
                // add overlay
                let overlay = overlayArea.append("div")
                    .classed("overlay-area", true)
                    .classed("placeholder", window.isInAddVisualizationMode && w > 100 && h > 100)
                    .style("top", top + "px")
                    .style("left", left + "px")
                    .style("width", w + "px")
                    .style("height", h + "px");
                overlay.on("click", () => {
                    BaseVisualization.getAllVisualizations().forEach((vis, i) => {
                        vis.setHighlighted(false);
                    });
                });
            }
            top = yArray[j+1];
        }
    }
};

window.instanceDragStartStream = new Subject();
window.instanceDragStartStream.subscribe({
    next: args => {
        window.dragSource = args;
    }
});
window.instanceDragEnterStream = new Subject();
window.instanceDragEnterStream.subscribe({
    next: args => {
        // args.d3elem
        args.d3elem.classed("droptarget", true);
    }
});
window.instanceDragLeaveStream = new Subject();
window.instanceDragLeaveStream.subscribe({
    next: args => {
        // args.d3elem
        args.d3elem.classed("droptarget", false);
    }
});
window.instanceDragDropStream = new Subject();
const renderRelationSelectMenu = async (event) => {
    let d_id = "relation-select-menu";
    d3.select("#" + d_id).remove();
    let container = d3.select("body")
      .append("div")
      .attr("id", d_id)
      .classed("ctxt-menu", true);
    container.append("button")
        .attr("id", "relation-menu-button");
    let menu = new hx.Menu("#relation-menu-button");
    // we need to generate menu items based on drag source/target
    menu.items(await getDragMenuItems());
    d3.select("#relation-menu-button").dispatch("click");
    d3.select(".hx-dropdown")
      .style("top", event.clientY + "px")
      .style("left", event.clientX + "px");
    menu.on("highlight", function(evt) {
        let selected = evt.content;
        console.log("selected " + selected);
        if (selected === "Cancel") {
            menu.hide();
            return;
        }
        let s = window.dragSource;
        let t = window.dragTarget;
        let dbs = getDragBehaviours(s.type, t.type);
        // need to find drag behavior that created this ctxt message
        let selected_db = dbs.find(db => db.addText === selected || db.removeText === selected);
        let event_type = selected_db.addText === selected ? EventType.ADD_RELATION : EventType.REMOVE_RELATION;
        let swapped = s.type !== selected_db.source;
        localEventStream.next({
            subject: swapped ? t.subject : s.subject,
            object: swapped ? s.subject : t.subject,
            predicate: selected_db.relation,
            subject_type: swapped ? t.type : s.type,
            object_type: swapped ? s.type : t.type,
            event_type: event_type,
        });
        // TODO: not enough. also need to be able to tell what other data changes
        // are required when designing drag behavior. e.g. when adding a display
        // to a display group some initialization is required. this however can
        // be bound to an api call that uses instance name so we don't have to
        // do it from here

        // let swapped = false;
        // switch (selected) {
        //     case PxioEventType.ADD_U_TO_G:
        //         swapped = s.type !== "pxio:UserGroup";
        //         localEventStream.next({
        //             subject: swapped ? t.subject : s.subject,
        //             object: swapped ? s.subject : t.subject,
        //             predicate: "foaf:member",
        //             subject_type: swapped ? t.type : s.type,
        //             object_type: swapped ? s.type : t.type,
        //             event_type: EventType.ADD_RELATION,
        //             pxio_type: selected
        //         });
        //         break;
        //     case PxioEventType.REMOVE_U_FROM_G:
        //         swapped = s.type !== "pxio:UserGroup";
        //         localEventStream.next({
        //             subject: swapped ? t.subject : s.subject,
        //             object: swapped ? s.subject : t.subject,
        //             predicate: "foaf:member",
        //             subject_type: swapped ? t.type : s.type,
        //             object_type: swapped ? s.type : t.type,
        //             event_type: EventType.REMOVE_RELATION,
        //             pxio_type: selected
        //         });
        //         break;
        //     case PxioEventType.ADD_D_TO_DG:
        //         swapped = s.type !== "entities:Display";
        //         localEventStream.next({
        //             subject: swapped ? t.subject : s.subject,
        //             object: swapped ? s.subject : t.subject,
        //             predicate: "foaf:member",
        //             subject_type: swapped ? t.type : s.type,
        //             object_type: swapped ? s.type : t.type,
        //             event_type: EventType.ADD_RELATION,
        //             pxio_type: selected
        //         });
        //         break;
        //     case PxioEventType.REMOVE_D_FROM_DG:
        //         swapped = s.type !== "entities:Display";
        //         localEventStream.next({
        //             subject: swapped ? t.subject : s.subject,
        //             object: swapped ? s.subject : t.subject,
        //             predicate: "foaf:member",
        //             subject_type: swapped ? t.type : s.type,
        //             object_type: swapped ? s.type : t.type,
        //             event_type: EventType.REMOVE_RELATION,
        //             pxio_type: selected
        //         });
        //         break;
        //     case PxioEventType.PROJECT:
        //         swapped = s.type !== "entities:PixelSource";
        //         localEventStream.next({
        //             subject: swapped ? t.subject : s.subject,
        //             object: swapped ? s.subject : t.subject,
        //             predicate: "pxio:projectedOn",
        //             subject_type: swapped ? t.type : s.type,
        //             object_type: swapped ? s.type : t.type,
        //             event_type: EventType.ADD_RELATION,
        //             pxio_type: selected
        //         });
        //         break;
        //     case PxioEventType.REMOVE_PROJECTION:
        //         swapped = s.type !== "entities:PixelSource";
        //         localEventStream.next({
        //             subject: swapped ? t.subject : s.subject,
        //             object: swapped ? s.subject : t.subject,
        //             predicate: "pxio:projectedOn",
        //             subject_type: swapped ? t.type : s.type,
        //             object_type: swapped ? s.type : t.type,
        //             event_type: EventType.REMOVE_RELATION,
        //             pxio_type: selected
        //         });
        //         break;
        //     case PxioEventType.SHARE_DG_WITH_USER:
        //     case PxioEventType.SHARE_DG_WITH_GROUP:
        //         swapped = s.type !== "entities:DisplayGroup";
        //         localEventStream.next({
        //             subject: swapped ? t.subject : s.subject,
        //             object: swapped ? s.subject : t.subject,
        //             predicate: "pxio:sharedWith",
        //             subject_type: swapped ? t.type : s.type,
        //             object_type: swapped ? s.type : t.type,
        //             event_type: EventType.ADD_RELATION,
        //             pxio_type: selected
        //         });
        //         break;
        //     case PxioEventType.UNSHARE_DG_WITH_USER:
        //     case PxioEventType.UNSHARE_DG_WITH_GROUP:
        //         swapped = s.type !== "entities:DisplayGroup";
        //         localEventStream.next({
        //             subject: swapped ? t.subject : s.subject,
        //             object: swapped ? s.subject : t.subject,
        //             predicate: "pxio:sharedWith",
        //             subject_type: swapped ? t.type : s.type,
        //             object_type: swapped ? s.type : t.type,
        //             event_type: EventType.REMOVE_RELATION,
        //             pxio_type: selected
        //         });
        //         break;
        //     case PxioEventType.SHARE_SOURCE_WITH_USER:
        //     case PxioEventType.SHARE_SOURCE_WITH_GROUP:
        //         swapped = s.type !== "entities:PixelSource";
        //         localEventStream.next({
        //             subject: swapped ? t.subject : s.subject,
        //             object: swapped ? s.subject : t.subject,
        //             predicate: "pxio:sharedWith",
        //             subject_type: swapped ? t.type : s.type,
        //             object_type: swapped ? s.type : t.type,
        //             event_type: EventType.ADD_RELATION,
        //             pxio_type: selected
        //         });
        //         break;
        //     case PxioEventType.UNSHARE_SOURCE_WITH_USER:
        //     case PxioEventType.UNSHARE_SOURCE_WITH_GROUP:
        //         swapped = s.type !== "entities:PixelSource";
        //         localEventStream.next({
        //             subject: swapped ? t.subject : s.subject,
        //             object: swapped ? s.subject : t.subject,
        //             predicate: "pxio:sharedWith",
        //             subject_type: swapped ? t.type : s.type,
        //             object_type: swapped ? s.type : t.type,
        //             event_type: EventType.REMOVE_RELATION,
        //             pxio_type: selected
        //         });
        //         break;
        //   default:
        //
        // }
        menu.hide();
    });
};

const getDragMenuItems = async () => {
    let s = window.dragSource;
    let t = window.dragTarget;
    if (s.type === t.type) return []; // no relations
    let dbs = getDragBehaviours(s.type, t.type);
    let items = [];
    for (let db of dbs) {
        let fwdDirExists = await doesTripleExist(s.subject, db.relation, t.subject);
        let bwdDirExists = await doesTripleExist(t.subject, db.relation, s.subject);
        if (fwdDirExists || bwdDirExists) {
            items.push(db.removeText);
        } else {
            items.push(db.addText);
        }
    }
    // // all types that appear in pxio prototype
    // // user management
    // let USER_TYPE = "pxio:User";
    // let GROUP_TYPE = "pxio:UserGroup";
    // // mapping
    // let DG_TYPE = "entities:DisplayGroup";
    // let DISPLAY_TYPE = "entities:Display";
    // let SOURCE_TYPE = "entities:PixelSource";
    // // since these are split into two tabs there is not many combinations
    // let sUorG = s.type === USER_TYPE || s.type === GROUP_TYPE;
    // let tUorG = t.type === USER_TYPE || t.type === GROUP_TYPE;
    // if (sUorG && tUorG) {
    //     window.dragAction = "user-group-membership";
    //     // check if user is already in group
    //     let fwdDirExists = await doesTripleExist(s.subject, "foaf:member", t.subject);
    //     let bwdDirExists = await doesTripleExist(t.subject, "foaf:member", s.subject);
    //     if (fwdDirExists || bwdDirExists) {
    //         items.push(PxioEventType.REMOVE_U_FROM_G);
    //     } else {
    //         items.push(PxioEventType.ADD_U_TO_G);
    //     }
    // }
    // let sDorDG = s.type === DISPLAY_TYPE || s.type === DG_TYPE;
    // let tDorDG = t.type === DISPLAY_TYPE || t.type === DG_TYPE;
    // if (sDorDG && tDorDG) {
    //     // check if display is already in group
    //     let fwdDirExists = await doesTripleExist(s.subject, "foaf:member", t.subject);
    //     let bwdDirExists = await doesTripleExist(t.subject, "foaf:member", s.subject);
    //     window.dragAction = "display-displaygroup-membership";
    //     if (fwdDirExists || bwdDirExists) {
    //         items.push(PxioEventType.REMOVE_D_FROM_DG);
    //     } else {
    //         items.push(PxioEventType.ADD_D_TO_DG);
    //     }
    // }
    // let sSorDG = s.type === SOURCE_TYPE || s.type === DG_TYPE;
    // let tSorDG = t.type === SOURCE_TYPE || t.type === DG_TYPE;
    // if (sSorDG && tSorDG) {
    //     // check if source is already projected on DG
    //     let fwdDirExists = await doesTripleExist(s.subject, "pxio:projectedOn", t.subject);
    //     let bwdDirExists = await doesTripleExist(t.subject, "pxio:projectedOn", s.subject);
    //     window.dragAction = "source-displaygroup-projection";
    //     if (fwdDirExists || bwdDirExists) {
    //         items.push(PxioEventType.REMOVE_PROJECTION);
    //     } else {
    //         items.push(PxioEventType.PROJECT);
    //     }
    // }
    // let sSorU = s.type === SOURCE_TYPE || s.type === USER_TYPE;
    // let tSorU = t.type === SOURCE_TYPE || t.type === USER_TYPE;
    // if (sSorU && tSorU) {
    //     // check if source is already shared with user
    //     let fwdDirExists = await doesTripleExist(s.subject, "pxio:sharedWith", t.subject);
    //     let bwdDirExists = await doesTripleExist(t.subject, "pxio:sharedWith", s.subject);
    //     window.dragAction = "source-user-sharing";
    //     if (fwdDirExists || bwdDirExists) {
    //         items.push(PxioEventType.UNSHARE_SOURCE_WITH_USER);
    //     } else {
    //         items.push(PxioEventType.SHARE_SOURCE_WITH_USER);
    //     }
    // }
    // let sSorG = s.type === SOURCE_TYPE || s.type === GROUP_TYPE;
    // let tSorG = t.type === SOURCE_TYPE || t.type === GROUP_TYPE;
    // if (sSorG && tSorG) {
    //     // check if source is already shared with user
    //     let fwdDirExists = await doesTripleExist(s.subject, "pxio:sharedWith", t.subject);
    //     let bwdDirExists = await doesTripleExist(t.subject, "pxio:sharedWith", s.subject);
    //     window.dragAction = "source-group-sharing";
    //     if (fwdDirExists || bwdDirExists) {
    //         items.push(PxioEventType.UNSHARE_SOURCE_WITH_GROUP);
    //     } else {
    //         items.push(PxioEventType.SHARE_SOURCE_WITH_GROUP);
    //     }
    // }
    // let sDGorU = s.type === DG_TYPE || s.type === USER_TYPE;
    // let tDGorU = t.type === DG_TYPE || t.type === USER_TYPE;
    // if (sDGorU && tDGorU) {
    //     // check if source is already shared with user
    //     let fwdDirExists = await doesTripleExist(s.subject, "pxio:sharedWith", t.subject);
    //     let bwdDirExists = await doesTripleExist(t.subject, "pxio:sharedWith", s.subject);
    //     window.dragAction = "source-user-sharing";
    //     if (fwdDirExists || bwdDirExists) {
    //         items.push(PxioEventType.UNSHARE_DG_WITH_USER);
    //     } else {
    //         items.push(PxioEventType.SHARE_DG_WITH_USER);
    //     }
    // }
    // let sDGorG = s.type === DG_TYPE || s.type === GROUP_TYPE;
    // let tDGorG = t.type === DG_TYPE || t.type === GROUP_TYPE;
    // if (sDGorG && tDGorG) {
    //     // check if source is already shared with user
    //     let fwdDirExists = await doesTripleExist(s.subject, "pxio:sharedWith", t.subject);
    //     let bwdDirExists = await doesTripleExist(t.subject, "pxio:sharedWith", s.subject);
    //     window.dragAction = "source-group-sharing";
    //     if (fwdDirExists || bwdDirExists) {
    //         items.push(PxioEventType.UNSHARE_DG_WITH_GROUP);
    //     } else {
    //         items.push(PxioEventType.SHARE_DG_WITH_GROUP);
    //     }
    // }
    if (items.length) {
        items.push(PxioEventType.CANCEL);
    }
    return items;
};
window.instanceDragDropStream.subscribe({
    next: async (args) => {
        args.d3elem.classed("droptarget", false);
        window.dragTarget = args;
        console.log("drag dopped", window.dragSource, window.dragTarget);
        if (!window.dragSource.type) {
          // TODO: fetch instance type using getInstanceType(window.activeRepoURI, instanceShortName)
        }
        if (!window.dragTarget.type) {
          // TODO: fetch instance type using getInstanceType(window.activeRepoURI, instanceShortName)
        }
        if (window.isInUserMode) {
            renderRelationSelectMenu(args.event);
        } else {
            let selectedRelation = "";
            let addCtxtText = "";
            let removeCtxtText = "";
            let isRelationFromExistingData = false;
            //
            d3.select("body").append("div").attr("id", "relation-list");
            let modalContentContainer = d3.select("#relation-list")
                .append("div")
                .classed("relation-info", true);
            // first adding info on source and target
            modalContentContainer.append("div")
                .classed("modal-subtitle", true)
                .append("span")
                .text("Behaviour is for");
            let sourceInfo = modalContentContainer.append("div")
                .classed("source-info", true);
            sourceInfo.append("span").text("Source");
            sourceInfo.append("span").text(getTypeLabelSync(window.dragSource.type));
            let targetInfo = modalContentContainer.append("div")
                .classed("target-info", true);
            targetInfo.append("span").text("Target");
            targetInfo.append("span").text(getTypeLabelSync(window.dragTarget.type));
            // next:
            // 1. we need to show all possible relations between a source and target from repo
            modalContentContainer.append("div")
                .classed("modal-subtitle", true)
                .append("span")
                .text("Choose relation from existing data");
            let relations = await getRepositoryPredicatesForTypes(
                window.activeRepoURI,
                [window.dragSource.type, window.dragTarget.type]
            );
            let relationsContainer = modalContentContainer.append("div")
                .classed("existing-relations-list", true);
            for (let relation of relations) {
                let relShort = shortenWithPrefix(relation);
                let relOption = relationsContainer.append("div")
                    .append("span")
                    .text(relShort + " (" + getLinkLabelSync(relShort) + ")");
                relOption.on("click", function() {
                    relationsContainer.selectAll("span").classed("selected", false);
                    d3.select(this).classed("selected", true);
                    selectedRelation = relShort;
                    isRelationFromExistingData = true;
                });
            }
            // 2. also allow user to enter a custom relation
            modalContentContainer.append("div")
                .classed("modal-subtitle", true)
                .append("span")
                .text("Alternatively, choose a custom relation");
            modalContentContainer.append("div")
                .classed("input-container", true)
                .append("input")
                .attr("placeholder", "Enter a custom relation e.g. foaf:member")
                .on("input", function() {
                    relationsContainer.selectAll("span").classed("selected", false);
                    selectedRelation = this.value;
                    isRelationFromExistingData = false;
                });
            // next:
            // 1. allow user to add a text for ctxt menu when drag happens in user mode. e.g. "Add user to group"
            modalContentContainer.append("div")
                .classed("modal-subtitle", true)
                .append("span")
                .text("Context menu message when adding relation");
            modalContentContainer.append("div")
                .classed("input-container", true)
                .append("input")
                .attr("placeholder", "E.g. Add User to Group")
                .on("input", function() {
                    addCtxtText = this.value;
                });
            // 2. allow user to add alternate text for ctxt menu when drag happens and relation already exists e.g. "Remove user from group"
            modalContentContainer.append("div")
                .classed("modal-subtitle", true)
                .append("span")
                .text("Context menu message when removing relation");
            modalContentContainer.append("div")
                .classed("input-container", true)
                .append("input")
                .attr("placeholder", "E.g. Remove User from Group")
                .on("input", function() {
                    removeCtxtText = this.value;
                });
            //
            let footer = d3.select("body")
                .append("div")
                .classed("new_relations_modal_footer", true);
            footer.append("button")
                .classed("hx-btn hx-secondary", true)
                .attr("id", "add-new-relation")
                .text("Add Drag Behaviour");
            footer.append("button")
                .classed("hx-btn hx-secondary", true)
                .attr("id", "cancel-add-new-relation")
                .text("Cancel");
            hx.select('#cancel-add-new-relation').on('click', function(){
                modal.close();
            });
            hx.select('#add-new-relation').on('click', function(){
                // add new relation for drag behaviour
                addDragBehavior({
                    source: window.dragSource.type,
                    target: window.dragTarget.type,
                    relation: selectedRelation,
                    addText: addCtxtText,
                    removeText: removeCtxtText,
                    shouldVerifyDirection: isRelationFromExistingData
                });
                modal.close();
            });
            let modal = hx.modalCenter({
                title: 'Add new relation on Drag',
                renderBody: () => hx.select("#relation-list"),
                renderFooter: thisModal => hx.select(".new_relations_modal_footer")
            });
        }
    }
});

window.instanceSelectStream = new Subject();
window.instanceSelectStream.subscribe({
    next: cmd => {
        console.log("selected " + cmd.subject, cmd);
        let instanceShortName = shortenWithPrefix(cmd.subject);
        InstanceInfoTree.getAllTrees().map(t => t.updateRootInstance(instanceShortName));
        if (cmd.selectSource === "list-view" && cmd.sameList) {
            // no scroll/reordering required
        } else {
            // TODO: scroll the list to the selected item
            // TODO: later re-order items so selected item comes on top
        }
        // const itemTypeClass = cmd.type.replace(":", "_");
        // const listContainer = d3.select("." + itemTypeClass);
        // if (listContainer) {

        // TODO: need to find the related visualization that also visualize content
        // of this type (looping over all visualization instances)
        // we need to find the item on the list corresponding to this selection
        if (cmd.selectSource === "list-view") {
            const listItems = d3.selectAll(cmd.domSelector(".item"));
            listItems.classed("selected", false);
            listItems.each(function (d) {
                let litem = d3.select(this);
                if (litem.select("span.invisible").text() === cmd.subject) {
                    // found it!
                    litem.classed("selected", true);
                }
            });
        };
        // next we find the item in the graph
        // TODO: loop over all vis types later and find item on all
        // first deselect all
        RDFVisualizer.getAllNetworks().map(network => {
            network.nodeElements.selectAll("circle.inner").classed("selected", false);
            network.nodeElements.selectAll("rect.inner").classed("selected", false);
            // now selecting
            let cNode = network.nodeElements
                .filter(d => d.subject === cmd.subject);
            cNode.select("circle.inner").classed("selected", true);
            cNode.select("rect.inner").classed("selected", true);
        });
        // next we populate instance details in left sidebar
        let instanceInfoContainer = d3.select("#instanceInfoSidebar").select(".info-table");
        instanceInfoContainer.html("");
        getRepositoryInstanceDescription(window.activeRepoURI, cmd.subject)
            .then(instanceInfo => {
                console.log("instance info is ", instanceInfo);
                for (let info of instanceInfo) {
                    let infoRow = instanceInfoContainer.append("div")
                        .classed("instance-info", true);
                    let infoHeader = infoRow.append("div")
                        .classed("info-header", true);
                    let isReversed = info.o === cmd.subject;
                    infoHeader.append("i")
                        .attr("class", "fas predicate-direction " + (isReversed ? "fa-arrow-left" : "fa-arrow-right"));
                    infoHeader.append("span").text(getLinkLabelSync(shortenWithPrefix(info.p)));
                    if (isReversed) {
                        if (info.sType === "Literal") {
                            infoHeader.append("span").text(info.s);
                        } else {
                            let infoContent = infoRow.append("div")
                                .classed("info-content", true);
                            infoHeader.append("span").text(shortenWithPrefix(info.s));
                            infoHeader.append("i")
                                .attr("class", "fas fa-plus expand-uri")
                                .on("click", function() {
                                    let toggleEl = d3.select(this);
                                    toggleEl.classed("fa-plus", !toggleEl.classed("fa-plus"));
                                    toggleEl.classed("fa-minus", !toggleEl.classed("fa-minus"));
                                    if (infoContent.classed("expanded")) {
                                        infoContent.classed("expanded", false);
                                        infoContent.html("");
                                    } else {
                                        infoContent.classed("expanded", true);
                                        infoContent
                                            .append("iframe")
                                            .attr("src", info.s)
                                            .attr("width", 500-10)
                                            .attr("height", 200);
                                    }
                                });
                        }
                    } else {
                        if (info.oType === "Literal") {
                            infoHeader.append("span").text(info.o);
                        } else {
                            let infoContent = infoRow.append("div")
                                .classed("info-content", true);
                            infoHeader.append("span").text(getTypeLabelSync(shortenWithPrefix(info.o)));
                            infoHeader.append("i")
                                .attr("class", "fas fa-plus expand-uri")
                                .on("click", function() {
                                    let toggleEl = d3.select(this);
                                    toggleEl.classed("fa-plus", !toggleEl.classed("fa-plus"));
                                    toggleEl.classed("fa-minus", !toggleEl.classed("fa-minus"));
                                    if (infoContent.classed("expanded")) {
                                        infoContent.classed("expanded", false);
                                        infoContent.html("");
                                    } else {
                                        infoContent.classed("expanded", true);
                                        infoContent
                                            .append("iframe")
                                            .attr("src", info.o)
                                            .attr("width", 500-10)
                                            .attr("height", 200);
                                    }
                                });
                        }
                    }
                }
            });
        // }
    }
});

document.getElementById("legend-toggle").addEventListener("click", function(ev) {
    if (legendSidebar.visible) {
        legendSidebar.hide();
    } else {
        legendSidebar.show();
    }
});

document.getElementById('export-template-button').addEventListener('click', () => {
    let filename = prompt("Please enter a file name...", "my_template");
    exportTemplate(filename);
});
document.getElementById('import-template-button').addEventListener('click', () => {
    document.getElementById('upload-template').click();
});

document.getElementById('import-ttl-button').addEventListener('click', () => {
    document.getElementById('upload').click();
});
// document.getElementById('upload').addEventListener('change', readFileAsString);
// function readFileAsString() {
//     var files = this.files;
//     if (files.length === 0) {
//         console.log('No file is selected');
//         return;
//     }
//     var reader = new FileReader();
//     reader.onload = function(event) {
//         window.prototypeTurtleDataString = event.target.result;
//         loadPrototypeData(event.target.result);
//         setTimeout(() => {
//             RDFVisualizer.getAllNetworks().map(network => {
//                 network.resetData();
//             });
//         }, 1500);
//     };
//     reader.readAsText(files[0]);
// };

const legendSidebar = new hx.SideCollapsible(
    '#legendSidebar', {
        position: 'right',
        // animate: false
    }
);

window.instanceInfoSidebar = new hx.SideCollapsible(
    '#instanceInfoSidebar', {
        position: 'left',
        // animate: false
    }
);

document.getElementById('store').addEventListener('click', () => {
    storeTurtleDataToRepo(window.activeRepoURI, window.prototypeTurtleDataString);
});

document.getElementById('create-events').addEventListener('click', async () => {
    await createEventsFromExistingData(window.activeRepoURI);
    console.log("Event are now created...");
    // NOTE: this is already called once for this repo, should not be called again as it should
    // create duplicate events (could prevent that by adding event detection)
});
//
// document.getElementById('sparql-query').addEventListener('click', () => {
//     let query = prompt("Enter a SPARQL Query", "construct {?s ?p ?o} where {?s ?p ?o}");
//     sparqlQuery(window.bg, window.activeRepoURI, query);
// });
document.getElementById('translate-rdf-terms').addEventListener('click', async () => {
    d3.select("body").append("div").attr("id", "rdf-terms-list");
    let modalContentContainer = d3.select("#rdf-terms-list")
        .append("div")
        .classed("rdf-terms-info", true);
    // TODO
    modalContentContainer.append("div")
        .classed("modal-subtitle", true)
        .append("span")
        .text("Types in Repository");
    for (let type of getRepoTypes()) {
        // TODO:
        let termInfoContainer = modalContentContainer.append("div")
            .classed("term-info", true);
        termInfoContainer.append("span").text(type);
        termInfoContainer.append("input").property("value", getTermTranslation(type))
            .on("input", function () {
                window.rdfTypeToLabel[type] = this.value;
            });
    }
    modalContentContainer.append("div")
        .classed("modal-subtitle", true)
        .append("span")
        .text("Relations in Repository");
    for (let rel of getRepoRelations()) {
      let termInfoContainer = modalContentContainer.append("div")
          .classed("term-info", true);
      termInfoContainer.append("span").text(rel);
      termInfoContainer.append("input").property("value", getTermTranslation(rel))
          .on("input", function () {
              window.rdfRelationToLabel[type] = this.value;
          });
    }
    let footer = d3.select("body")
        .append("div")
        .classed("rdf_terms_modal_footer", true);
    footer.append("button")
        .classed("hx-btn hx-secondary", true)
        .attr("id", "submit-rdf-term-translations")
        .text("Apply");
    footer.append("button")
        .classed("hx-btn hx-secondary", true)
        .attr("id", "cancel-change-rdf-terms")
        .text("Cancel");
    hx.select('#cancel-change-rdf-terms').on('click', function(){
        modal.close();
    });
    hx.select('#submit-rdf-term-translations').on('click', function(){
        // TODO
        modal.close();
    });
    let modal = hx.modalCenter({
        title: 'Modify RDF Term Labels in UI',
        renderBody: () => hx.select("#rdf-terms-list"),
        renderFooter: thisModal => hx.select(".rdf_terms_modal_footer")
    });
});

let expert_mode_toggle = new hx.Toggle("#btn_domain_expert_toggle");
expert_mode_toggle.value(!window.isInUserMode);
expert_mode_toggle.on('change', (shouldExpertMode) => {
  window.isInUserMode = !shouldExpertMode;
  // inform all visualizations
  BaseVisualization.getAllVisualizations().forEach((vis, i) => vis.onToggleUserMode());
  // adjust other UI (add new tabs)
  d3.select(".plus-new-tab").classed("invisible", !shouldExpertMode);
  d3.select("#translate-rdf-terms").classed("invisible", !shouldExpertMode);
  d3.select("#add-ui").classed("invisible", !shouldExpertMode);
  d3.select("#export-template-button").classed("invisible", !shouldExpertMode);
  d3.select("#create-events").classed("invisible", !shouldExpertMode);
});

document.getElementById('persona-manager').addEventListener('click', async () => {
    console.log("Opening persona manager...");
    PersonaManager.getInstance().onPersonaManagerRequested();
});

document.getElementById('tab-manager-toggle').addEventListener('click', async () => {
    console.log("Opening tab manager...");
    TabManager.getInstance().openTabManager();
});

document.addEventListener("DOMContentLoaded", async () => {
    // TODO: make is such that user starts with having to select repo
    await getAllRepositories();
    // initAddUserDOM();
    console.log("document loaded.");
    // window.dd = d3;
    updateIconList("");
    /////////////////// temporary code
    // let visData = {
    //     top: "100px",
    //     left: "100px",
    //     width: "600px",
    //     height: "600px"
    // };
    // visData[VisTemplateKeys.TAB] = window.activeTabContentId;
    // visData[VisTemplateKeys.TYPE] = VisTypes.NETWORK;
    // addVisualization(visData);
    //////////////////
});
