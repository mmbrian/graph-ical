require("./style.scss");
import * as d3 from "d3";
const hx = require("hexagon-js");
const uuidv4 = require("uuid/v4");
import { VisTypes, BaseVisualization } from "../BaseVisualization";
import { shortenWithPrefix } from "../../scripts/data";
import {
    getRepositoryPrefixesSPARQL,
    rawSparqlQuery
} from "../../scripts/rest_util";

export default class DisplayGroup extends BaseVisualization {
    constructor(tabContentId, options) {
        super(
            "DisplayGroup", // title
            tabContentId,
            options
        );
        // TODO: use keywords to get props, might need to react to resize
        this.viewWidth = this.percentageToPx(this.options.width, "width");
        this.viewHeight = this.percentageToPx(this.options.height, "height");
        if (!options.title) {
          this.setTitle("DisplayGroup Example");
        }
        this.setTitleSuffix("[ Presentation Mode ]");
        this.vis_type = VisTypes.DISPLAY_GROUP;
        this.chartId = "dispgroup_" + uuidv4().replaceAll("-", "_");
        this.baseContainer.classed("dispgroup_container", true);
        this.contentContainer.classed("dispgroup_content", true);
        let self = this;
        self.isDraggingSource = false;
        // this.contentContainer.attr("ondragover", "event.preventDefault();");
        this.contentContainer.on("dragenter", function(event) {
            d3.event.preventDefault();
            self.isDraggingSource = true;
        });
        this.contentContainer.on("dragleave", function(event) {
            d3.event.preventDefault();
            self.isDraggingSource = false;
        });
        // this.contentContainer.attr("ondragover", "event.preventDefault();");
        this.contentContainer.on("dragover", function(event) {
            d3.event.preventDefault();
            if (self.isDraggingSource && self.selectedDisplayGroupInstance) {
                console.log("dragging someover over dg");
                // TODO: make sure dragging element is a pixel source
                // TODO: render rect over svg centered at cursor
            }
        });
        this.contentContainer.on("drop", function(evt) {
            self.isDraggingSource = false;
            self.dragDropStream.next({
                subject: self.selectedDisplayGroupInstance,
                type: "entities:DisplayGroup",
                event: d3.event
            });
        });

        this.makeMovableAndResizable();
        this.editToggle.classed("invisible", false);
        this.resetDom();
    }

    onEditDisplayGroup() {
        if (this.isInEditMode) {
            console.log("disable DG edit mode");
            // TODO disable moving/resizing of displays
            // TODO show projections
            // TODO enable moving/resizing of projections
            // TODO when moving/resizing projections, update their data in repo
            this.setTitleSuffix("[ Presentation Mode ]");
        } else {
            console.log("enable DG edit mode");
            // TODO: hide projections
            // TODO: make displays movable and resizable
            // TODO: when moving/resizing displays, update their data in repo
            this.setTitleSuffix("[ Edit Mode ]");
        }
        this.isInEditMode = !this.isInEditMode;
        this.editToggle.select("i").classed("selected", this.isInEditMode);
    }

    resetDom() {
        this.contentContainer.html("");
        this.svg = this.contentContainer
            .append("svg")
            .classed("display_group", true);
    }

    async addDisplayToRendering(displayData) {
        let self = this;
        let display = displayData["pxio:isFrom"];
        // // TODO: select display
        // window.instanceSelectStream.next({
        //     subject: display,
        //     type: "entities:Display",
        //     selectSource: "display-group"
        // });
        if (!this.displays) {
            this.displays = [];
        }
        let displayProps = {
            name: await this.getDisplayName(shortenWithPrefix(display)),
            x: parseFloat(displayData["pxio:x"]),
            y: parseFloat(displayData["pxio:y"]),
            z: parseInt(displayData["pxio:z"]),
            width: parseFloat(displayData["pxio:width"]),
            height: parseFloat(displayData["pxio:height"])
        };
        this.displays.push(displayProps);
        // updating svg
        let minX = Math.min(...this.displays.map(d => d.x));
        let maxX = Math.max(...this.displays.map(d => d.x + d.width));
        let minY = Math.min(...this.displays.map(d => d.y));
        let maxY = Math.max(...this.displays.map(d => d.y + d.height));
        let width = maxX - minX;
        let height = maxY - minY;
        this.svg
            .attr("width", this.viewWidth)
            .attr("height", this.viewHeight - 30)
            .attr("viewBox", (-50) + " " + (-50) + " " + (this.viewWidth + 100) + " " + (this.viewHeight + 100));
        let dispParent = this.svg
            .append("g")
            .classed("display", true)
            .attr("transform", "translate( " + displayProps.x + " " + displayProps.y + " )");
        dispParent
            .append("rect")
            .attr("width", displayProps.width)
            .attr("height", displayProps.height)
            .call(
                d3.drag()
                  .container(dispParent.node())
                  .on("start end", function() {
                      d3.select(this).classed("moving", d3.event.type === "start");
                      if (self.isInEditMode) {

                      }
                      console.log("drag start/end: " + d3.event.type);
                  })
                  .on("drag", function() {
                      if (self.isInEditMode) {
                          // let x = d3.event.x;
                          // let y = d3.event.y;
                          // console.log("dxdy");
                          // console.log(dx + ", " + dy);
                          // console.log("xy");
                          // console.log(d3.event.x + ", " + d3.event.y);
                          // console.log("dxy");
                          // console.log(displayProps.x + ", " + displayProps.y);
                          // console.log(d3.select(this.parentNode).attr("transform"));
                          // displayProps.x += dx;
                          // displayProps.y += dy;
                          // let mat = self.svg.node().getScreenCTM();
                          // let p = self.svg.node().createSVGPoint();
                          // p.x = x;
                          // p.y = y;
                          // p.matrixTransform(mat);
                          // d3.select(this.parentNode).attr("transform", "translate( " + p.x + " " + p.y + " )");
                      }
                      console.log("on drag!");
                  })
            );
        dispParent
            .append("text")
            .classed("display-name", true)
            .attr("x", 7)
            .attr("y", 21)
            .attr("fill", "#fff")
            .text(displayProps.name);
    }

    setupSubscriptions() {
        let self = this;
        this.selectStream.subscribe({
            next: payload => {
                let selectedInstance = payload.subject;
                // TODO: get type dynamically
                if (payload.type === "entities:DisplayGroup") {
                    let dg = shortenWithPrefix(selectedInstance);
                    self.selectedDisplayGroupInstance = dg;
                    // TODO: found all DisplayInDisplayGroup instances that belongTo this group
                    this.getDisplayGroupDisplayInfo(dg)
                        .then(info => {
                            this.resetDom();
                            for (let d of info) {
                                this.renderDisplayFromInfo(d)
                                    .then(dinfo => {
                                        let displayData = {};
                                        let keys = dinfo.map(i => shortenWithPrefix(i.prop.value));
                                        let values = dinfo.map(i => i.value.value);
                                        keys.forEach((key, i) => displayData[key] = values[i]);
                                        this.addDisplayToRendering(displayData);
                                    });
                            }
                        });
                }
            }
        });
    }

    getDisplayGroupDisplayInfo(dg) {
        return new Promise(async function(resolve, reject) {
            let query = getRepositoryPrefixesSPARQL() +
                "SELECT ?displayInfo " +
                "WHERE { " +
                "   ?displayInfo rdf:type entities:DisplayInDisplayGroup ." +
                "   ?displayInfo pxio:belongsTo " + dg + " ." +
                "}";
            rawSparqlQuery(window.activeRepoURI, query)
                .then(response => {
                    if (response.data) {
                        let info = response.data.results.bindings;
                        if (info) {
                            info = info.map(i => shortenWithPrefix(i.displayInfo.value));
                            resolve(info);
                        }
                        resolve([]);
                    }
                })
                .catch(error => {
                    console.error("Error when fetching display gorup info: " + error);
                    resolve([]);
                });
        });
    }

    renderDisplayFromInfo(displayInDGinstance) {
        return new Promise(async function(resolve, reject) {
            let query = getRepositoryPrefixesSPARQL() +
                "SELECT ?prop ?value " +
                "WHERE { " +
                "   " + displayInDGinstance + " ?prop ?value ." +
                "}";
            rawSparqlQuery(window.activeRepoURI, query)
                .then(response => {
                    if (response.data) {
                        let info = response.data.results.bindings;
                        if (info) {
                            resolve(info);
                        }
                        resolve([]);
                    }
                })
                .catch(error => {
                    console.error("Error when fetching display info: " + error);
                    resolve([]);
                });
        });
    }

    getDisplayName(instance) {
        return new Promise(async function(resolve, reject) {
            let query = getRepositoryPrefixesSPARQL() +
                "SELECT ?name " +
                "WHERE { " +
                "   " + instance + " foaf:name ?name ." +
                "}";
            rawSparqlQuery(window.activeRepoURI, query)
                .then(response => {
                    if (response.data) {
                        let name = response.data.results.bindings[0];
                        if (name) {
                            resolve(name.name.value);
                        }
                        resolve(instance);
                    }
                })
                .catch(error => {
                    console.error("Error when fetching display name: " + error);
                    resolve(instance);
                });
        });
    }

    updateWithLatestEventData() {
        if (this.selectedDisplayGroupInstance) {
            // TODO: check if dg was delected and ignore the following logic
            let dg = this.selectedDisplayGroupInstance;
            this.getDisplayGroupDisplayInfo(dg)
                .then(info => {
                    this.resetDom();
                    for (let d of info) {
                        this.renderDisplayFromInfo(d)
                            .then(dinfo => {
                                let displayData = {};
                                let keys = dinfo.map(i => shortenWithPrefix(i.prop.value));
                                let values = dinfo.map(i => i.value.value);
                                keys.forEach((key, i) => displayData[key] = values[i]);
                                this.addDisplayToRendering(displayData);
                            });
                    }
                });
        }
    }

}
