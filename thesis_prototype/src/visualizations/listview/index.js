require("./style.scss");
const N3 = require('n3');
const { DataFactory } = N3;
const { namedNode, literal, quad } = DataFactory;
import * as d3 from "d3";
const hx = require("hexagon-js");
import { shortenWithPrefix } from "../../scripts/data";
import {
    getRepositoryInstancesForType,
    getTypeLiteralPredicates,
    getLiteral,
    SPECIAL_PREDICATE_NO_LITERAL
} from "../../scripts/rest_util";
import {
  VisTypes,
  BaseVisualization,
  VisTemplateKeys,
  addTemplatePrefix,
  TEMPLATE_VIEW_SPECIFIC_SPECS
} from "../BaseVisualization";
import {
  localEventStream
} from "../../scripts/events";
import {
    EventType,
    PxioEventType
} from "../../scripts/types";

export default class ListView extends BaseVisualization {
    constructor(tabContentId, options) {
        super(
            "", // title
            tabContentId,
            options
        );
        console.log("list view loaded with options", options);
        this.vis_type = VisTypes.LIST_VIEW;
        let ignoreCustomQuery = false;
        if (this.options[TEMPLATE_VIEW_SPECIFIC_SPECS]) {
            this.entityTitle = shortenWithPrefix(this.options[TEMPLATE_VIEW_SPECIFIC_SPECS][VisTemplateKeys.TYPE]);
            this.isReactingToSelection = this.options[TEMPLATE_VIEW_SPECIFIC_SPECS].isReactingToSelection === "true";
            this.isUsingCustomQuery = this.options[TEMPLATE_VIEW_SPECIFIC_SPECS].isUsingCustomQuery === "true";
            if (this.options[TEMPLATE_VIEW_SPECIFIC_SPECS].customQuery !== "null") {
                this.options.customQuery = this.options[TEMPLATE_VIEW_SPECIFIC_SPECS].customQuery;
                ignoreCustomQuery = true;
            }
            this.options.deleteEndpoint = this.options[TEMPLATE_VIEW_SPECIFIC_SPECS].deleteEndpoint;
            this.options.deleteProp = this.options[TEMPLATE_VIEW_SPECIFIC_SPECS].deleteProp;
            this.options.isDeletable = this.options[TEMPLATE_VIEW_SPECIFIC_SPECS].isDeletable === "true";
            this.options.isHorizontal = this.options[TEMPLATE_VIEW_SPECIFIC_SPECS].isHorizontal === "true";
            this.options.isEditable = this.options[TEMPLATE_VIEW_SPECIFIC_SPECS].isEditable === "true";
            this.options.isCreatable = this.options[TEMPLATE_VIEW_SPECIFIC_SPECS].isCreatable === "true";
            this.selectedLabelRelation = this.options[TEMPLATE_VIEW_SPECIFIC_SPECS].labelRelation;
        } else {
            this.entityTitle = shortenWithPrefix(this.options.entityType);
            this.isReactingToSelection = false;
            this.isUsingCustomQuery = this.options.customQuery !== "null";
            this.options.isDeletable = false;
            this.options.isHorizontal = false;
            this.options.isEditable = false;
            this.options.isCreatable = false;
        }
        this.toggleCreatable();
        // entity_type is expected to be the rdf class name for which we're
        // adding a listview
        this.baseContainer.classed("listview_ui_container", true);
        if (!options.title) {
            this.title = this.entityTitle;
            this.setTitle(this.entityTitle);
        }
        this.fetchPotentialLabelRelations()
            .then(() => {
                this.addSettingsUI();
                this.setupSubscriptions();
                this.addListViewUIforEntity(ignoreCustomQuery);
            });
    }

    fetchPotentialLabelRelations() {
        let self = this;
        return new Promise(async function(resolve, reject) {
            let potentialLabelRelations = await getTypeLiteralPredicates(window.activeRepoURI, self.entityTitle, false);
            self.potentialLabelRelations = potentialLabelRelations.map(r => shortenWithPrefix(r));
            // self.selectedLabelRelation = self.potentialLabelRelations[0];
            // inserting SPECIAL_PREDICATE_NO_LITERAL at the beginning of array
            self.potentialLabelRelations.splice(0, 0, SPECIAL_PREDICATE_NO_LITERAL);
            if (!self.selectedLabelRelation) {
              self.selectedLabelRelation = SPECIAL_PREDICATE_NO_LITERAL;
            }
            resolve();
        });
    }

    addSettingsUI() {
        let self = this;
        this.addSelectorSetting(
            "Label Relation",
            (newLabelRelation) => {
                console.log("label relation changed to", newLabelRelation);
                self.selectedLabelRelation = newLabelRelation;
                d3.selectAll(self.getSelector(".item")).each(function (d, i) {
                    let instanceShortName = d3.select(this)
                        .select("span.instance_id").text();
                    let instanceLabelSpan = d3.select(this)
                        .select("span.instance_label");
                    getLiteral(
                        window.activeRepoURI,
                        instanceShortName,
                        self.selectedLabelRelation
                    ).then(label => {
                        instanceLabelSpan.text(label);
                    });
                });
            },
            this.potentialLabelRelations,
            this.potentialLabelRelations ? this.selectedLabelRelation : SPECIAL_PREDICATE_NO_LITERAL // TODO: make it a prop of this vis that is stored and loaded via template
        );
        this.addSettingsSeparator();
        this.addToggleSetting("Horizontal List", (isHorizontal) => {
            this.options.isHorizontal = isHorizontal;
            this.updateOrientation();
        }, this.options.isHorizontal);
        this.addSettingsSeparator();
        this.addToggleSetting("React to Selection", (shouldReact) => {
            this.isReactingToSelection = shouldReact;
        }, this.isReactingToSelection);
        this.addTextInputSetting("Custom Query", (query) => {
            this.options.customQuery = query;
        }, "Enter a SPARQL query...", this.options.customQuery);
        this.addToggleSetting("Use Custom Query", (shouldUseCustomQ) => {
            this.isUsingCustomQuery = shouldUseCustomQ;
            this.resetUIwithQuery();
        }, this.isUsingCustomQuery);
        this.addTextInputSetting("Delete Endpoint", (deleteEp) => {
            this.options.deleteEndpoint = deleteEp;
        }, "Enter a REST endpoint for deleting an instance...", this.options.deleteEndpoint);
        this.addTextInputSetting("Delete Property", (deleteProp) => {
            this.options.deleteProp = deleteProp;
        }, "Enter a predicate to use when deleting...", this.options.deleteProp);
        this.addToggleSetting("Is Deletable?", (isDeletable) => {
            this.options.isDeletable = isDeletable;
            this.updateToggles();
        }, this.options.isDeletable);
        this.addToggleSetting("Is Editable?", (isEditable) => {
            this.options.isEditable = isEditable;
            this.updateToggles();
        }, this.options.isEditable);
        this.addToggleSetting("Is Creatable?", (isCreatable) => {
            this.options.isCreatable = isCreatable;
            this.toggleCreatable();
        }, this.options.isCreatable);
    }

    toggleCreatable() {
        this.addNewInstanceBtn
            .classed("invisible", !this.options.isCreatable);
    }

    onEditInstance(instance) {
        // TODO: open add new instance menu filled with instance details and their
        // values (do not add new instance but edit existing one)
        console.log("Chose to edit " + instance);
    }

    onAddNewInstance(params) {
        let self = this;
        d3.select("body").append("div").attr("id", "add-instance-modal");
        let modalContainer = d3.select("#add-instance-modal")
            .append("div")
            .classed("new_instance_form", true);
        let footer = d3.select("body")
            .append("div")
            .classed("new_instance_modal_footer", true);
        footer.append("button")
            .classed("hx-btn hx-secondary", true)
            .attr("id", "add-new-instance")
            .text(params ? "Submit Changes" : "Add");
        let typeLabel; // TODO: fetch by sparql query
        //// temp logic
        if (this.entityTitle === "entities:DisplayGroup") {
            typeLabel = "Display Group";
            let entry = modalContainer.append("div").classed("field", true);
            entry.append("span").text("Name");
            entry.append("input")
                .classed("name", true)
                .property("value", params ? params[0] : "");
        }
        if (this.entityTitle === "pxio:User") {
            typeLabel = "User";
            let entry = modalContainer.append("div").classed("field", true);
            entry.append("span").text("Name");
            entry.append("input").classed("name", true)
                .property("value", params ? params[0] : "");
            entry = modalContainer.append("div").classed("field", true);
            entry.append("span").text("First name");
            entry.append("input").classed("first-name", true)
                .property("value", params ? params[1] : "");
            entry = modalContainer.append("div").classed("field", true);
            entry.append("span").text("Last name");
            entry.append("input").classed("last-name", true)
                .property("value", params ? params[2] : "");
        }
        if (this.entityTitle === "pxio:UserGroup") {
            typeLabel = "Group";
            let entry = modalContainer.append("div").classed("field", true);
            entry.append("span").text("Group name");
            entry.append("input").classed("name", true)
                .property("value", params ? params[0] : "");
        }
        ////
        hx.select('#add-new-instance').on('click', function(){
            // TODO: add new instance
            let name = modalContainer.select("input.name").property("value");
            if (self.entityTitle === "pxio:User") {
                let firstname = modalContainer.select("input.first-name").property("value");
                let lastname = modalContainer.select("input.last-name").property("value");
                localEventStream.next({
                    subject_type: self.entityTitle,
                    event_type: EventType.ADD_INSTANCE,
                    pxio_type: PxioEventType.ADD_USER,
                    params: {
                        name: name,
                        firstname: firstname,
                        lastname: lastname
                    }
                });
            }
            if (self.entityTitle === "pxio:UserGroup") {
                localEventStream.next({
                    subject_type: self.entityTitle,
                    event_type: EventType.ADD_INSTANCE,
                    pxio_type: PxioEventType.ADD_GROUP,
                    params: {
                        name: name
                    }
                });
            }
            if (self.entityTitle === "entities:DisplayGroup") {
                localEventStream.next({
                    subject_type: self.entityTitle,
                    event_type: EventType.ADD_INSTANCE,
                    pxio_type: PxioEventType.ADD_DG,
                    params: {
                        name: name
                    }
                });
            }
            modal.close();
        });
        let modalTitle;
        if (params) {
            modalTitle = 'Edit ' + typeLabel;
        } else {
            modalTitle = 'Add a new ' + typeLabel;
        }
        let modal = hx.modalCenter({
            title: modalTitle,
            renderBody: () => hx.select("#add-instance-modal"),
            renderFooter: thisModal => hx.select(".new_instance_modal_footer")
        });
    }

    updateToggles() {
        this.contentContainer.selectAll("div.delete_toggle")
            .classed("invisible", !this.options.isDeletable);
        this.contentContainer.selectAll("div.edit_toggle")
            .classed("invisible", !this.options.isEditable);
    }

    updateOrientation() {
        this.contentContainer.select(".content")
            .classed("horizontal_style", this.options.isHorizontal);
    }

    setupSubscriptions() {
        let self = this;
        this.selectStream.subscribe({
            next: (payload) => {
                if (payload.type === self.entityTitle && payload.selectSource === self.vis_type) return;
                // TODO: do a better job of ignoring selections here
                // for now we ignore if selected instance has the same type
                if (self.isReactingToSelection) {
                    let _selected = shortenWithPrefix(payload.subject);
                    // ignore if selected instance was previously selected as well
                    if (self.selectedInstance && self.selectedInstance === _selected) return;
                    self.selectedInstance = _selected;
                    self.resetUIwithQuery();
                    console.log("listview hears selection", payload);
                    console.log(self.vis_type + " " + self.entityTitle);
                } else {
                    // self.selectStream.next({
                    //     subject: payload.subject,
                    //     type: self.entityTitle,
                    //     selectSource: payload.selectSource,
                    //     sameList: false,
                    //     domSelector: (x) => self.getSelector(x)
                    // });
                }
            }
        });
    }

    getTemplateRDF() {
        let quads = super.getTemplateRDF();
        const viewContext = this.getViewNamedGraph();
        // entity type
        quads.push(quad(
            namedNode(addTemplatePrefix(TEMPLATE_VIEW_SPECIFIC_SPECS)),
            namedNode(addTemplatePrefix("type")),
            namedNode(this.entityTitle),
            viewContext,
        ));
        // custom query settings
        quads.push(quad(
            namedNode(addTemplatePrefix(TEMPLATE_VIEW_SPECIFIC_SPECS)),
            namedNode(addTemplatePrefix("isUsingCustomQuery")),
            literal(this.isUsingCustomQuery),
            viewContext,
        ));
        quads.push(quad(
            namedNode(addTemplatePrefix(TEMPLATE_VIEW_SPECIFIC_SPECS)),
            namedNode(addTemplatePrefix("customQuery")),
            literal(this.options.customQuery),
            viewContext,
        ));
        // reacting to selection
        quads.push(quad(
            namedNode(addTemplatePrefix(TEMPLATE_VIEW_SPECIFIC_SPECS)),
            namedNode(addTemplatePrefix("isReactingToSelection")),
            literal(this.isReactingToSelection),
            viewContext,
        ));
        // edit/creatable
        quads.push(quad(
            namedNode(addTemplatePrefix(TEMPLATE_VIEW_SPECIFIC_SPECS)),
            namedNode(addTemplatePrefix("isEditable")),
            literal(this.options.isEditable),
            viewContext,
        ));
        quads.push(quad(
            namedNode(addTemplatePrefix(TEMPLATE_VIEW_SPECIFIC_SPECS)),
            namedNode(addTemplatePrefix("isCreatable")),
            literal(this.options.isCreatable),
            viewContext,
        ));
        // delete settings
        quads.push(quad(
            namedNode(addTemplatePrefix(TEMPLATE_VIEW_SPECIFIC_SPECS)),
            namedNode(addTemplatePrefix("isDeletable")),
            literal(this.options.isDeletable),
            viewContext,
        ));
        quads.push(quad(
            namedNode(addTemplatePrefix(TEMPLATE_VIEW_SPECIFIC_SPECS)),
            namedNode(addTemplatePrefix("deleteProp")),
            literal(this.options.deleteProp),
            viewContext,
        ));
        quads.push(quad(
            namedNode(addTemplatePrefix(TEMPLATE_VIEW_SPECIFIC_SPECS)),
            namedNode(addTemplatePrefix("deleteEndpoint")),
            literal(this.options.deleteEndpoint),
            viewContext,
        ));
        // orientation
        quads.push(quad(
            namedNode(addTemplatePrefix(TEMPLATE_VIEW_SPECIFIC_SPECS)),
            namedNode(addTemplatePrefix("isHorizontal")),
            literal(this.options.isHorizontal),
            viewContext,
        ));
        // label relation
        quads.push(quad(
            namedNode(addTemplatePrefix(TEMPLATE_VIEW_SPECIFIC_SPECS)),
            namedNode(addTemplatePrefix("labelRelation")),
            literal(this.selectedLabelRelation), // label uri stored as string here
            viewContext,
        ));
        return quads;
    }

    resetUIwithQuery() {
        let self = this;
        let query = self.options.customQuery;
        if (this.isReactingToSelection) {
            // custom query needs to be translated first
            // NOTE: selected_instance must be referenced in the query as SELECTED
            let selected_instance = self.selectedInstance;
            query = self.options.customQuery.replaceAll("SELECTED", selected_instance);
        }
        if (!self.isUsingCustomQuery) {
            query = null;
        }
        let contentElement = self.contentContainer.select("div.content");
        // UI only renders after an async query fetches its data
        getRepositoryInstancesForType(self.options.repoUri, self.entityTitle, query)
            .then(entityInstances => {
                // remove old content
                contentElement.html("");
                console.log("Found instances for type");
                console.log(entityInstances);
                if (entityInstances.length > 0) {
                    // console.log("Found " + entityInstances.length + " instances.");
                    self.updateListOnQueryChange("", contentElement, entityInstances);
                    self.contentContainer.select("div.search_container")
                        .select("input")
                        .on("input", function() {
                            self.updateListOnQueryChange(this.value, contentElement, entityInstances);
                        });
                } else {
                    console.log("found no instances for type:", self.entityTitle);
                }
            });
    }

    addListViewUIforEntity(ignoreCustomQuery = false) {
        let self = this;
        if (self.options.async) {
            // UI only renders after an async query fetches its data
            getRepositoryInstancesForType(self.options.repoUri, self.entityTitle, ignoreCustomQuery ? null : self.options.customQuery)
                .then(entityInstances => {
                    if (entityInstances.length > 0) {
                        // console.log("Found " + entityInstances.length + " instances.");
                        const container = self.contentContainer;
                        const searchArea = container.append("div")
                            .classed("search_container", true);
                        const contentContainer = container.append("div")
                            .classed("content_container", true);
                        const content = contentContainer.append("div")
                            .classed("content", true)
                            .classed("horizontal_style", self.options.isHorizontal);
                        self.updateListOnQueryChange("", content, entityInstances);
                        searchArea.append("input")
                            .attr("placeholder", "Search...")
                            .on("input", function() {
                                self.updateListOnQueryChange(this.value, content, entityInstances);
                            });
                        self.makeMovableAndResizable();
                        if (ignoreCustomQuery) {
                            // first time loading a list with custom query
                            // remove content if react to selectio is true
                            if (self.isReactingToSelection) {
                                content.html("");
                            }
                        }
                    } else {
                        console.log("found no instances for type:", self.entityTitle);
                    }
                });
        }
    }

    updateListOnQueryChange(query, container, entityInstances) {
        let self = this;
        // TODO: need to dispose listeners when reseting container
        container.html("");
        query = query.toLowerCase();
        for (let instance of entityInstances) {
            let instanceShortName = shortenWithPrefix(instance);
            // TODO: fetch instance name/label in a better/faster way
            getLiteral(
                window.activeRepoURI,
                instanceShortName,
                self.selectedLabelRelation
            ).then(label => {
                // let label = instanceShortName;
                if (label.toLocaleLowerCase().indexOf(query) < 0) {
                    // label not matching query
                } else {
                    let instanceItem = container.append("div")
                        .classed("item", true);
                        // .classed("hx-drag-element", true);
                    instanceItem.append("span")
                        .classed("instance_label", true)
                        .text(label);
                    instanceItem.append("span")
                        .classed("invisible instance_id", true)
                        .text(instanceShortName);
                    let toggleContainer = instanceItem.append("div")
                        .classed("instance-toggle-container", true);
                    let editToggle = toggleContainer.append("div")
                        .classed("instance_toggle edit_toggle", true);
                    editToggle
                        .classed("invisible", !self.options.isEditable)
                        .classed("disabled", true) // TODO: temporary
                        .append("i")
                        .classed("fas fa-edit", true);
                    editToggle.on("click", function() {
                        d3.event.stopPropagation();
                        self.onEditInstance(instanceShortName);
                    });
                    let deleteToggle = toggleContainer.append("div")
                        .classed("instance_toggle delete_toggle", true);
                    deleteToggle
                        .classed("invisible", !self.options.isDeletable)
                        .append("i")
                        .classed("fas fa-trash-alt", true);
                    deleteToggle.on("click", function() {
                        d3.event.stopPropagation();
                        localEventStream.next({
                            subject: instanceShortName,
                            subject_type: self.entityTitle,
                            event_type: EventType.REMOVE_INSTANCE,
                            pxio_type: PxioEventType.REMOVE_USER
                        });
                    });
                    instanceItem.on("click", () => {
                        console.log("selecting:", instance, self.selectStream);
                        self.selectStream.next({
                            subject: instance,
                            type: self.entityTitle,
                            selectSource: "list-view",
                            sameList: true,
                            domSelector: (x) => self.getSelector(x)
                        });
                    });
                    instanceItem.on("dblclick", () => {
                        d3.event.stopPropagation();
                        self.onEditInstance(instanceShortName);
                        // TODO: move to ctxt menu as this behaviour is changed
                        // self.infoSidebar.show();
                        // console.log("opening info sidebar...");
                    });
                    instanceItem.attr("draggable", true);
                    instanceItem.attr("ondragover", "event.preventDefault();");
                    instanceItem.on("dragstart", function() {
                        // console.log("dragstart", label);
                        self.dragStartStream.next({
                            subject: instanceShortName,
                            type: self.entityTitle
                        });
                    });
                    instanceItem.on("dragenter", function() {
                        // console.log("dragenter", label);
                        self.dragEnterStream.next({
                            subject: instanceShortName,
                            type: self.entityTitle,
                            d3elem: instanceItem
                        });
                    });
                    instanceItem.on("dragleave", function() {
                        // console.log("dragleave", label);
                        self.dragLeaveStream.next({
                            subject: instanceShortName,
                            type: self.entityTitle,
                            d3elem: instanceItem
                        });
                    });
                    instanceItem.on("drop", function(event) {
                        self.dragDropStream.next({
                            subject: instanceShortName,
                            type: self.entityTitle,
                            event: d3.event,
                            d3elem: instanceItem
                        });
                    });
                }
            });
        }
    }

    updateWithLatestEventData() {
        this.resetUIwithQuery();
        // TODO: only need to reset if new evets add/remove instances of this type
    }
}
