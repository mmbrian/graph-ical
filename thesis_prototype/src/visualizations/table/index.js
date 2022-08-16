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
    EventType,
} from "../../scripts/types";

export default class Table extends BaseVisualization {
    constructor(tabContentId, options) {
        super(
            "", // title
            tabContentId,
            options
        );
        console.log("list view loaded with options", options);
        this.vis_type = VisTypes.TABLE;
        if (this.options[TEMPLATE_VIEW_SPECIFIC_SPECS]) {
            this.entityTitle = shortenWithPrefix(this.options[TEMPLATE_VIEW_SPECIFIC_SPECS][VisTemplateKeys.TYPE]);
            this.isReactingToSelection = this.options[TEMPLATE_VIEW_SPECIFIC_SPECS].isReactingToSelection === "true";
        } else {
            this.entityTitle = shortenWithPrefix(this.options.entityType);
            this.isReactingToSelection = false;
        }
        // entity_type is expected to be the rdf class name for which we're
        // adding a listview
        this.baseContainer.classed("table_ui_container", true);
        if (!options.title) {
            this.title = this.entityTitle;
            this.setTitle(this.entityTitle);
        }
        this.fetchLiteralRelations()
            .then(async () => {
                await this.addSettingsUI();
                this.setupSubscriptions();
                this.addTableUIforEntity();
            });
    }

    fetchLiteralRelations() {
        let self = this;
        return new Promise(async function(resolve, reject) {
            let literalRelations = await getTypeLiteralPredicates(window.activeRepoURI, self.entityTitle, false);
            self.literalRelations = literalRelations.map(r => shortenWithPrefix(r));
            resolve();
        });
    }

    addSettingsUI() {
        let self = this;
        return new Promise(function(resolve, reject) {
          self.addToggleSetting("React to Selection", (shouldReact) => {
              self.isReactingToSelection = shouldReact;
          }, self.isReactingToSelection);
          // add column settings
          let colNumber = 1;
          self.colInfo = {};
          for (let literalRelation of self.literalRelations) {
            self.colInfo[colNumber] = {
              title: literalRelation,
              isVisible: true,
            };
            self.addSettingsSeparator();
            self.addTextInputSetting("Column #" + colNumber + " title", (colTitle) => {
                self.colInfo[colNumber].title = colTitle;
            }, "Enter a title for this column", literalRelation);
            self.addToggleSetting("Is Column Visible", (isVisible) => {
                self.colInfo[colNumber].isVisible = isVisible;
            }, true);
            self.addSelectorSetting(
                "Column Content",
                (colRelation) => {
                    self.colInfo[colNumber].relation = colRelation;
                    d3.selectAll(self.getSelector(".item")).each(function (d, i) {
                        let instanceShortName = d3.select(this)
                            .select("span.instance_id").text();
                        let instanceLabelSpan = d3.select(this)
                            .select("span.col_" + colNumber);
                        getLiteral(
                            window.activeRepoURI,
                            instanceShortName,
                            colRelation
                        ).then(label => {
                            instanceLabelSpan.text(label);
                        });
                    });
                },
                self.literalRelations,
                literalRelation
            );
            colNumber++;
          }
          resolve();
        });
    }

    setupSubscriptions() {
        let self = this;
        // this.selectStream.subscribe({
        //     next: (payload) => {
        //         if (payload.type === self.entityTitle && payload.selectSource === self.vis_type) return;
        //         // TODO: do a better job of ignoring selections here
        //         // for now we ignore if selected instance has the same type
        //         if (self.isReactingToSelection) {
        //             let _selected = shortenWithPrefix(payload.subject);
        //             // ignore if selected instance was previously selected as well
        //             if (self.selectedInstance && self.selectedInstance === _selected) return;
        //             self.selectedInstance = _selected;
        //             // self.resetUIwithQuery();
        //             console.log("listview hears selection", payload);
        //             console.log(self.vis_type + " " + self.entityTitle);
        //         } else {
        //             // self.selectStream.next({
        //             //     subject: payload.subject,
        //             //     type: self.entityTitle,
        //             //     selectSource: payload.selectSource,
        //             //     sameList: false,
        //             //     domSelector: (x) => self.getSelector(x)
        //             // });
        //         }
        //     }
        // });
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
        // reacting to selection
        quads.push(quad(
            namedNode(addTemplatePrefix(TEMPLATE_VIEW_SPECIFIC_SPECS)),
            namedNode(addTemplatePrefix("isReactingToSelection")),
            literal(this.isReactingToSelection),
            viewContext,
        ));
        return quads;
    }

    addTableUIforEntity() {
        let self = this;
        // UI only renders after an async query fetches its data
        getRepositoryInstancesForType(self.options.repoUri, self.entityTitle, null)
            .then(async (entityInstances) => {
                if (entityInstances.length > 0) {
                    // console.log("Found " + entityInstances.length + " instances.");
                    const container = self.contentContainer;
                    // // adding header row first
                    // const tableHeader = container.append('div')
                    //     .classed('table_header', true);
                    // for (let ck in self.colInfo) {
                    //   tableHeader.append("span")
                    //       .classed("col_" + ck, true)
                    //       .text(self.colInfo[ck].title);
                    // }
                    // adding items next
                    const contentContainer = container.append("div")
                        .classed("content_container", true);
                    const content = contentContainer.append("div")
                        .classed("content", true);
                    await self.updateTable(content, entityInstances);
                    self.makeMovableAndResizable();
                } else {
                    console.log("found no instances for type:", self.entityTitle);
                }
            });
    }

    async updateTable(container, entityInstances) {
        let self = this;
        // TODO: need to dispose listeners when reseting container
        container.html("");
        console.log("col info is");
        console.log(self.colInfo);
        // adding header row first // TODO: make is stick to top, outside this container
        const tableHeader = container.append('div')
            .classed('item', true);
        for (let ck in self.colInfo) {
          tableHeader.append("span")
              .classed("col_" + ck, true)
              .attr("title", self.colInfo[ck].title)
              .text(self.colInfo[ck].title);
        }
        // let hasUpdatedHeaderCells = false;
        // now items
        for (let instance of entityInstances) {
            let instanceShortName = shortenWithPrefix(instance);
            let instanceItem = container.append("div")
                .classed("item", true);
            for (let ck in self.colInfo) {
              if (self.colInfo[ck].isVisible) {
                let colText = await getLiteral(
                  window.activeRepoURI,
                  instanceShortName,
                  self.colInfo[ck].relation
                );
                instanceItem.append("span")
                    .classed("col_" + ck, true)
                    .attr("title", colText)
                    .text(colText);
                // if (!hasUpdatedHeaderCells) {
                //   // TODO: this is a hack to get header row cells same size as first row cells
                //   // need to be reworked
                //   tableHeader.select("span.col_" + ck)
                //     .append("span")
                //     .classed("invisible", true)
                //     .text(colText);
                // }
              }
            }
            // hasUpdatedHeaderCells = true;
            instanceItem.append("span")
                .classed("invisible instance_id", true)
                .text(instanceShortName);
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
        }
    }
}
