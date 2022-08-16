require("./style.scss");
const hx = require("hexagon-js");
import * as d3 from "d3";
const N3 = require('n3');
const { DataFactory } = N3;
const { namedNode, literal, quad } = DataFactory;
import { shortenWithPrefix } from "../data";
import {
  addTemplatePrefix,
  removeTemplatePrefix
} from "../../visualizations/BaseVisualization";
const uuidv4 = require("uuid/v4");

export class TabManager {
  constructor() {
    this.tabCount = 2;
    this.plusNewTabId = uuidv4();
    let currTabId = uuidv4();
    this.selectedTab = 0;
    this.tabNames = {};
    this.tabNames[currTabId] = "Dashboard";
    this.tabIdToIdx = {};
    this.tabIdToIdx[currTabId] = 0; // mapping this tab id to index for selection
    this.subTabs = {}; // maps tab id to its sub tabs
    this.activeSubTab = {}; // maps a tab id to its active subtab id
    this.subtabSelects = {}; // maps tab id to its subtab select object (need object for later navigation)
    this.setupTabLinking();
    // setting up singleton
    if (!TabManager.getInstance) {
      TabManager.getInstance = () => this; // one instance is globally accessible
    }
    // future instances are ignored by getInstance
  }

  getActiveSubtabContentSelector(tabId, subtabClass) {
      if (subtabClass) {
          return "#tab-content-" + tabId + " ." + subtabClass + " .tab-content-container";
      }
      // only use active subtab if subtabClass was not provided
      let subtabId = this.activeSubTab[tabId];
      if (subtabId) {
          // active subtab exists and has an id
          return "#tab-content-" + tabId + " .subtab_" + subtabId + " .tab-content-container";
      } else {
          // active subtab is default subtab
          return "#tab-content-" + tabId + " .default_subtab .tab-content-container";
      }
  }

  getActiveSubtabClass(tabId) {
      let subtabId = this.activeSubTab[tabId];
      if (subtabId) {
          // active subtab exists and has an id
          return "subtab_" + subtabId;
      } else {
          // active subtab is default subtab
          return "default_subtab";
      }
  }

  addSubtab(tabId, tabName) {
      let self = this;
      // register subtab for this tabId
      if (self.subTabs[tabId] === undefined) {
          self.subTabs[tabId] = {};
      }
      let newTabId = uuidv4();
      self.subTabs[tabId][newTabId] = tabName;
      // mark as active subtab for this tab
      self.activeSubTab[tabId] = newTabId;
      // update header DOM
      const subtabs = ["Home"];
      subtabs.push(...Object.values(self.subTabs[tabId]));
      d3.select("#tab" + tabId + " .subtab_select").html("");
      self.subtabSelects[tabId] = new hx.SingleSelect("#tab" + tabId + " .subtab_select", subtabs);
      self.subtabSelects[tabId].on("change", function(selected) {
          console.log("switched to subtab", selected.value);
          // hide all existing subtabs
          const tabContent = d3.select("div#tab-content-" + tabId);
          tabContent.selectAll(".subtab_container")
              .classed("hidden_subtab", true);
          //
          let subtabName = selected.value;
          if (subtabName === "Home") {
              self.activeSubTab[tabId] = undefined;
              tabContent.select(".default_subtab")
                  .classed("hidden_subtab", false);
              return;
          }
          // update active subtab for this tab
          for (let subtabId in self.subTabs[tabId]) {
              if (self.subTabs[tabId][subtabId] === subtabName) {
                  self.activeSubTab[tabId] = subtabId;
                  tabContent.select(".subtab_" + subtabId)
                      .classed("hidden_subtab", false);
                  return;
              }
          }
      });
      self.subtabSelects[tabId].value(tabName);
      // add DOM element for subtab
      const tabContent = d3.select("div#tab-content-" + tabId);
      // hide all existing subtabs
      tabContent.selectAll(".subtab_container")
          .classed("hidden_subtab", true);
      // add new subtab dom
      const subTabContent = tabContent.append("div")
          .classed("subtab_container", true)
          .classed("subtab_" + newTabId, true);
      subTabContent.append("div")
          .classed("tab-content-container", true);
  }

  removeSubtab(tabId, subtabId) {
    // TODO: remove subtab and all visualizations inside it
    // 1. ask for confirmation, informing user all visualization will be removed
    hx.modalRight({
      title: 'Are you sure?',
      renderBody: () => hx.div().text('This will remove all visualizations inside this subtab as well.'),
      renderFooter: thisModal =>
        hx.div()
          .add(hx.button('hx-btn hx-secondary')
          .on('click', () => {
            // TODO: confirmed
            console.log("confirmed");
            // 2. remove all visualizations inside subtab first
            // TODO
            // 3. remove subtab DOM
            // TODO
            // 4. remove subtab from subtab selector UI + data
            // TODO
            // 5. if inside tab manager, reset tab manager to reflect new data
            // TODO
            thisModal.hide();
          })
          .text('Yes'))
          .add(hx.button('hx-btn hx-secondary')
          .on('click', () => {
            thisModal.hide();
          })
          .text('No')),
    });
  }

  removeTab(tabId) {
    // TODO: remove tab including all its subtabs via removeSubtab
    // 1. ask for confirmation, informing user all subtabs and visualizations
    // inside those will be removed
    // TODO
    // 2. remove every subtab via removeSubtab
    // TODO
    // 3. remove tab DOM
    // TODO
    // 4. remove tab data and selector UI
    // TODO
    // 5. if inside tab manager, reset tab manager to reflect new data
    // TODO
  }

  promptAddSubTab(tabId) {
      // TODO: use a better looking prompt dialog
      let newSubtabName = prompt("Please provide subtab name", "");
      if (newSubtabName) {
          this.addSubtab(tabId, newSubtabName);
      }
  }

  getTabDataRDF() {
      let tabContext = namedNode(addTemplatePrefix("tabData"));
      let quads = [];
      // number of tabs
      quads.push(quad(
          tabContext,
          namedNode(addTemplatePrefix("tabCount")),
          literal(Object.keys(this.tabNames).length),
          tabContext,
      ));
      // selected tab index
      quads.push(quad(
          tabContext,
          namedNode(addTemplatePrefix("selectedTab")),
          literal(this.selectedTab),
          tabContext,
      ));
      for (let tabId in this.tabNames) {
          let tabSubject = namedNode(addTemplatePrefix("tab_" + tabId));
          // register tab in the graph
          quads.push(quad(
              tabContext,
              namedNode(addTemplatePrefix("hasTab")),
              tabSubject,
              tabContext,
          ));
          // add tab name
          quads.push(quad(
              tabSubject,
              namedNode("foaf:name"),
              literal(this.tabNames[tabId]),
              tabContext,
          ));
          // add tab index
          quads.push(quad(
              tabSubject,
              namedNode(addTemplatePrefix("index")),
              literal(this.tabIdToIdx[tabId]),
              tabContext,
          ));
          // selected subtab
          if (this.activeSubTab[tabId]) {
            quads.push(quad(
                tabSubject,
                namedNode(addTemplatePrefix("activeSubtabId")),
                literal(this.activeSubTab[tabId]),
                tabContext,
            ));
          }
          // add subtab info
          for (let subtabId in this.subTabs[tabId]) {
              let subtabSubject = namedNode(addTemplatePrefix("subtab_" + subtabId));
              // register subtab for this tab
              quads.push(quad(
                  tabSubject,
                  namedNode(addTemplatePrefix("hasSubTab")),
                  subtabSubject,
                  tabContext,
              ));
              // add subtab id
              quads.push(quad(
                  subtabSubject,
                  namedNode(addTemplatePrefix("id")),
                  literal(subtabId),
                  tabContext,
              ));
              // add subtab name
              quads.push(quad(
                  subtabSubject,
                  namedNode("foaf:name"),
                  literal(this.subTabs[tabId][subtabId]),
                  tabContext,
              ));
          }
      }
      return quads;
  }

  importTabsFromTemplate(quads) {
      let self = this;
      console.log("Importing tabs...");
      return new Promise(async function(resolve, reject) {
          let tabQuads = quads.filter(q => shortenWithPrefix(q.graph.id) === addTemplatePrefix("tabData"));
          // tab count
          let tabCount = tabQuads.find(q => shortenWithPrefix(q.predicate.id) === addTemplatePrefix("tabCount"))
              .object.value;
          self.tabCount = parseInt(tabCount);
          // selected tab index
          let selectedTab = tabQuads.find(q => shortenWithPrefix(q.predicate.id) === addTemplatePrefix("selectedTab"));
          if (selectedTab) {
            self.selectedTab = parseInt(selectedTab.object.value);
          } else {
            self.selectedTab = 0; // first tab
          }
          let tabIds = tabQuads.filter(q =>
            shortenWithPrefix(q.predicate.id) === addTemplatePrefix("hasTab")
          ).map(q => removeTemplatePrefix(shortenWithPrefix(q.object.id)))
          .map(t => t.substring(4)); // removing initial tab_
          self.tabNames = {};
          self.tabIdToIdx = {};
          self.activeSubTab = {};
          self.subTabs = {};
          for (let i of tabIds) {
              let tabIdentifier = addTemplatePrefix("tab_" + i);
              // tab name
              let tabName = tabQuads.find(q =>
                  shortenWithPrefix(q.subject.id) === tabIdentifier &&
                  shortenWithPrefix(q.predicate.id) === "foaf:name"
              ).object.value;
              self.tabNames[i] = tabName;
              // tab index
              let tabIdx = tabQuads.find(q =>
                  shortenWithPrefix(q.subject.id) === tabIdentifier &&
                  shortenWithPrefix(q.predicate.id) === addTemplatePrefix("index")
              );
              if (tabIdx) {
                self.tabIdToIdx[i] = parseInt(tabIdx.object.value);
              } else {
                // if no index info is present, use read order as index
                self.tabIdToIdx[i] = Object.keys(self.tabNames).length - 1;
              }
              // active subtab
              let activeStId = tabQuads.find(q =>
                  shortenWithPrefix(q.subject.id) === tabIdentifier &&
                  shortenWithPrefix(q.predicate.id) === addTemplatePrefix("activeSubtabId")
              );
              if (activeStId) {
                self.activeSubTab[i] = activeStId.object.value;
              } else {
                self.activeSubTab[i] = undefined;
              }
              // fetch subtabs for this tab
              self.subTabs[i] = {};
              let subtabQuads = tabQuads.filter(q =>
                  shortenWithPrefix(q.subject.id) === tabIdentifier &&
                  shortenWithPrefix(q.predicate.id) === addTemplatePrefix("hasSubTab")
              );
              if (subtabQuads) {
                  // there are additional subtabs existing for this tab
                  let subtabReferences = subtabQuads.map(q => shortenWithPrefix(q.object.value));
                  for (let sbRef of subtabReferences) {
                      // get subtab id
                      let subtabId = tabQuads.find(q =>
                          shortenWithPrefix(q.subject.id) === sbRef &&
                          shortenWithPrefix(q.predicate.id) === addTemplatePrefix("id")
                      ).object.value;
                      // also get subtab name
                      let subtabName = tabQuads.find(q =>
                          shortenWithPrefix(q.subject.id) === sbRef &&
                          shortenWithPrefix(q.predicate.id) === "foaf:name"
                      ).object.value;
                      // add subtab info
                      self.subTabs[i][subtabId] = subtabName;
                  }
              } else {
                  // this tab only contains a default subtab
              }
          }
          await self.resetTabs();
          await self.initTabs(self.selectedTab, false);
          resolve();
          console.log("Imported tabs...");
      });
  }

  addTabHandle(tabId, tabsContainer, tabHandle) {
      let self = this;
      if (tabHandle === undefined) {
          tabHandle = tabsContainer.append("div")
              .classed("hx-tab", true)
              .attr("id", "tab" + tabId)
              .attr("data-content", "tab-content-" + tabId);
      }
      let tabHandleHeader = tabHandle.append("div")
          .classed("tab-main-header", true);
      let subtabHandle = tabHandle.append("div")
          .classed("subtab-header", true);
      // set up DOM for subtab header
      subtabHandle.append("div")
          .classed("subtab_select", true);
      let subtabs = ["Home"]; // TODO: make it so Home tab is renamable
      if (self.subTabs[tabId]) {
          // subtabs exist for this tab > add them to selector
          subtabs.push(...Object.values(self.subTabs[tabId]));
      }
      self.subtabSelects[tabId] = new hx.SingleSelect("#tab" + tabId + " .subtab_select", subtabs);
      // TODO: change handler is duplicated twice, need to turn it into a reusable function
      self.subtabSelects[tabId].on("change", function(selected) {
          console.log("switched to subtab", selected.value);
          // hide all existing subtabs
          const tabContent = d3.select("div#tab-content-" + tabId);
          tabContent.selectAll(".subtab_container")
              .classed("hidden_subtab", true);
          //
          let subtabName = selected.value;
          if (subtabName === "Home") {
              self.activeSubTab[tabId] = undefined;
              tabContent.select(".default_subtab")
                  .classed("hidden_subtab", false);
              return;
          }
          // update active subtab for this tab
          for (let subtabId in self.subTabs[tabId]) {
              if (self.subTabs[tabId][subtabId] === subtabName) {
                  self.activeSubTab[tabId] = subtabId;
                  tabContent.select(".subtab_" + subtabId)
                      .classed("hidden_subtab", false);
                  return;
              }
          }
      });
      if (self.activeSubTab[tabId]) {
        self.subtabSelects[tabId].value(self.subTabs[tabId][self.activeSubTab[tabId]]);
      } else {
        self.subtabSelects[tabId].value("Home");
      }
      subtabHandle.append("div")
          .classed("subtab_remove_btn", true)
          .append("i")
          .classed("fas fa-trash", true);
      // set up DOM for main header (tab name and controls)
      tabHandleHeader.append("span")
          .text(self.tabNames[tabId]);
      let tabMore = tabHandleHeader.append("div")
          .classed("tab-options-toggle", true)
          .append("i")
          .classed("fas fa-ellipsis-v", true);
      tabMore.on("click", () => {
          console.log("clicked more info on tab", tabId);
          // TODO: show options via ctxt
          // 1. modify tab name
          // 2. delete tab
          // 3. select/delete a subtab or modify its name
          // 4. add subtab
          let d_id = "tab-more-menu";
          d3.select("#" + d_id).remove();
          let container = d3.select("body")
            .append("div")
            .attr("id", d_id)
            .classed("ctxt-menu", true);
          container.append("button")
              .attr("id", "tab-menu-button");
          let menu = new hx.Menu("#tab-menu-button");
          menu.items([
              "Delete Tab",
              "Rename Tab",
              "Add Subtab"
          ]);
          menu.on("highlight", function(evt) {
              let selected = evt.content;
              menu.hide();
              console.log("selected", selected);
              if (selected === "Rename Tab") {
                  self.promptRenameTab(tabId);
              }
              if (selected === "Add Subtab") {
                  self.promptAddSubTab(tabId);
              }
          });
          d3.select("#tab-menu-button").dispatch("click");
          d3.select(".hx-dropdown")
            .style("top", event.clientY + "px")
            .style("left", event.clientX + "px");
      });
      tabHandleHeader.on("dblclick", () => {
          self.promptRenameTab(tabId);
      });
  }

  promptRenameTab(tabId) {
      // TODO: use a better looking prompt dialog
      let newTabName = prompt("Modify Tab Name", this.tabNames[tabId]);
      this.renameTab(tabId, newTabName);
      // NOTE: no longer need to update handle here, renameTab does it
  }

  resetTabs() {
      let self = this;
      // reset DOM and tab objects
      self.tabCount++; // +1 for "+" tab
      d3.select("#tabs").remove();
      return new Promise(function(resolve, reject) {
          const tabsContainer = d3.select("body").append("div")
              .classed("hx-tabs hx-flag-tabs tab-bar", true)
              .attr("id", "tabs");
          // for (let tabId in self.tabNames) {
          for (let tabId of Object.keys(self.tabNames).sort((a, b) => self.tabIdToIdx[a]-self.tabIdToIdx[b])) {
              self.addTabHandle(tabId, tabsContainer);
          }
          if (!window.isInUserMode) {
              // + (new tab)
              self.tabIdToIdx[self.plusNewTabId] = self.tabCount - 1;
              const newTab = tabsContainer.append("div")
                  .classed("hx-tab plus-new-tab", true)
                  .attr("id", "tab" + self.plusNewTabId)
                  .attr("data-content", "tab-content-" + self.plusNewTabId);
              newTab.append("i").classed("fas fa-plus", true);
          }
          const tabContents = tabsContainer.append("div")
              .classed("hx-tabs-content demo-tabs-content-padded", true);
          for (let tabId in self.tabNames) {
              let tabContent = tabContents.append("div")
                  .classed("hx-tab-content", true)
                  .attr("id", "tab-content-" + tabId);
              // add default subtab container
              const tabDefaultSubtabContent = tabContent.append("div")
                  .classed("default_subtab subtab_container", true);
              tabDefaultSubtabContent.append("div")
                  .classed("tab-content-container", true);
              if (self.subTabs[tabId]) {
                  // subtabs exist for this tab > add their containers
                  for (let subtabId in self.subTabs[tabId]) {
                      const subtabContent = tabContent.append("div")
                          .classed("subtab_" + subtabId + " subtab_container hidden_subtab", true);
                      subtabContent.append("div")
                          .classed("tab-content-container", true);
                  }
              }
          }
          if (!window.isInUserMode) {
              // + (new tab)
              const newTabContent = tabContents.append("div")
                  .classed("hx-tab-content plus-new-tab-content", true)
                  .attr("id", "tab-content-" + self.plusNewTabId);
              // add default subtab container
              const newTabDefaultSubtabContent = newTabContent.append("div")
                  .classed("default_subtab subtab_container", true);
              newTabDefaultSubtabContent.append("div")
                  .classed("tab-content-container", true);
          }
          resolve();
      });
  }

  async initTabs(selectedTab = 0, createDom = true) {
      let self = this;
      if (createDom) { await self.initTabsDOM(); }
      return new Promise(function(resolve, reject) {
          self.tabs = new hx.Tabs('#tabs');
          self.tabs.on('change', function(data) {
              console.log("tabs on change", data);
              if (data.id === self.tabCount-1) {
                  // new tab selected
                  self.addNewTab();
              } else {
                  let tabId = Object.keys(self.tabIdToIdx).find(k => self.tabIdToIdx[k] === data.id);
                  self.activeTabContentId = "tab-content-" + tabId;
                  self.selectedTab = data.id;
              }
          });
          self.tabs.select(selectedTab, true);
          let tabId = Object.keys(self.tabIdToIdx).find(k => self.tabIdToIdx[k] === selectedTab);
          self.activeTabContentId = "tab-content-" + tabId;
          resolve();
      });
  };

  initTabsDOM() {
      let self = this;
      return new Promise(function(resolve, reject) {
          const tabsContainer = d3.select("body").append("div")
              .classed("hx-tabs hx-flag-tabs tab-bar", true)
              .attr("id", "tabs");
          // default tab
          let defaultTabId = Object.keys(self.tabIdToIdx).find(k => self.tabIdToIdx[k] === 0);
          self.addTabHandle(defaultTabId, tabsContainer);
          if (!window.isInUserMode) {
              // + (new tab)
              const tab2 = tabsContainer.append("div")
                  .classed("hx-tab plus-new-tab", true)
                  .attr("id", "tab" + self.plusNewTabId)
                  .attr("data-content", "tab-content-" + self.plusNewTabId);
              tab2.append("i").classed("fas fa-plus", true);
          }
          const tabContents = tabsContainer.append("div")
              .classed("hx-tabs-content demo-tabs-content-padded", true);
          const tab1Content = tabContents.append("div")
              .classed("hx-tab-content", true)
              .attr("id", "tab-content-" + defaultTabId);
          // add default subtab container
          const tab1DefaultSubtabContent = tab1Content.append("div")
              .classed("default_subtab subtab_container", true);
          tab1DefaultSubtabContent.append("div")
              .classed("tab-content-container", true);
          if (!window.isInUserMode) {
              const tab2Content = tabContents.append("div")
                  .classed("hx-tab-content plus-new-tab-content", true)
                  .attr("id", "tab-content-" + self.plusNewTabId);
              const tab2DefaultSubtabContent = tab2Content.append("div")
                  .classed("default_subtab subtab_container", true);
              tab2DefaultSubtabContent.append("div")
                  .classed("tab-content-container", true);
          }
          resolve();
      });
  }

  addNewTab(selectNewTab = true) {
      let self = this;
      // TODO: style alert to ask for tab name
      return new Promise(async function(resolve, reject) {
          let tabName = prompt("Please enter a name", "New Tab");
          if (!tabName) return;
          let newTabId = self.plusNewTabId;
          self.tabIdToIdx[newTabId] = self.tabCount - 1;
          self.activeTabContentId = "tab-content-" + newTabId;
          self.tabNames[newTabId] = tabName;
          d3.select("#tab" + newTabId)
              .classed("plus-new-tab", false)
              .html("");
          self.addTabHandle(newTabId, null, d3.select("#tab" + newTabId));
          // update class on the new tab content
          d3.select("div#" + self.activeTabContentId).classed("plus-new-tab-content", false);
          // add new tab item and content for "plus new tab" option
          self.plusNewTabId = uuidv4();
          let newTabItem = d3.select("#tabs")
              .append("div")
              .attr("id", "tab" + self.plusNewTabId)
              .classed("hx-tab plus-new-tab", true)
              .attr("data-content", "tab-content-" + self.plusNewTabId);
          newTabItem.html('<i class="fas fa-plus"></i>');
          d3.select(".hx-tabs-content")
              .append("div")
              .classed("hx-tab-content plus-new-tab-content", true)
              .attr("id", "tab-content-" + self.plusNewTabId)
              .append("div")
              .classed("default_subtab subtab_container", true)
              .append("div")
              .classed("tab-content-container", true);
          d3.select(".hx-tabs-content").raise(); // since toggles have to be before content container in DOM
          self.tabCount++;
          let tabToSelect = self.tabCount-2; // new tab
          if (!selectNewTab) {
              // tabToSelect = self.selectedTab-1;
              tabToSelect = self.selectedTab;
          }
          await self.initTabs(tabToSelect, false);
          resolve(tabName);
      });
  }

  moveToTab(e, identifier) {
      let self = this;
      // removing previous ctxt selector
      if (!d3.select("div#ctxt-tab-selector").empty()) {
          d3.select("div#ctxt-tab-selector").remove();
      }
      // adding new ctxt at the cursor position
      let ctxt = d3.select("body")
          .append("div")
          .classed("ctxt-menu", true)
          .attr("id", "ctxt-tab-selector");
      ctxt.style("top", e.clientY + "px")
          .style("left", e.clientX + "px");
      // finding all tabs including current, only excluding the current subtab maybe?
      let currTabId = Object.keys(self.tabNames).find(id => self.tabIdToIdx[id] === self.selectedTab);
      const tabKeys = Object.keys(self.tabNames);
      const fullTabSubtabList = tabKeys.map(tabId => {
        let ch = ['Home'];
        if (tabId in self.subTabs) {
          ch.push(...Object.values(self.subTabs[tabId])); // keys are subtab Ids, mapped to their names
        }
        return {
          text: self.tabNames[tabId],
          children: ch.map(subTabName => {
            return {
              value: subTabName, // this is what is rendered
              tabId: tabId, // this we only need in on change listener
            };
          })
        };
      });
      fullTabSubtabList.push({
        value: "New Tab",
        isNewTab: true
      });
      let selector = new hx.SingleSelect('#ctxt-tab-selector', fullTabSubtabList, {
          showSearch: true,
      });
      selector.on('change', async function(data) {
          console.log("ctxt move tab selected", data);
          let tabName = data.value.value; // NOTE: actually a subtab name in case not a new tab
          let toSubtabId;
          let toId;
          if (data.value.isNewTab) {
              // TODO: update, maybe also return tabId
              // add new tab and move to this tab
              tabName = await self.addNewTab(false);
              toSubtabId = undefined; // indicating default subtab
              toId = Object.keys(self.tabNames).find(id => self.tabNames[id] === tabName);
              console.log("moving to new tab with", toId, toSubtabId);
          } else {
              toId = data.value.tabId;
              if (tabName === 'Home') {
                toSubtabId = undefined; // indicating default subtab
              } else {
                toSubtabId = Object.keys(self.subTabs[toId])
                  .find(subtabId => self.subTabs[toId][subtabId] === tabName);
              }
          }
          let fromIndex = self.selectedTab;
          let fromId = Object.keys(self.tabIdToIdx).find(id => self.tabIdToIdx[id] === fromIndex);
          // move to selected tab
          let toIndex = self.tabIdToIdx[toId];
          let fromSubtabId = self.activeSubTab[fromId];
          let fromSubtabClass = fromSubtabId === undefined ? "default_subtab" : ("subtab_" + fromSubtabId);
          let toSubtabClass = toSubtabId === undefined ? "default_subtab" : ("subtab_" + toSubtabId);
          let source = "#tab-content-" + fromId + " ." + fromSubtabClass + " .tab-content-container " + identifier;
          let target = "#tab-content-" + toId + " ." + toSubtabClass + " .tab-content-container";
          appendTo(source, target);
          self.tabs.select(toIndex, true);
          // also select correct subtab at destination
          if (data.value.isNewTab) {
            // tabName is actually a tab name (newly created tab) and we're moving to default subtab
            self.subtabSelects[toId].value('Home');
          } else {
            // tabName is an existing subtab
            self.subtabSelects[toId].value(tabName);
          }
          self.activeVisForMoving.tabContentId = "tab-content-" + toId;
          ctxt.remove();
      });
      selector.on('dropdown.hideend', () => {
          ctxt.remove();
      });
  }

  getTabIdFromName(tabName) {
      for (let tabId in this.tabNames) {
          if (this.tabNames[tabId] === tabName) {
              return tabId;
          }
      }
      return undefined;
  }

  getSubTabIdFromName(tabId, subtabName) {
      if (!tabId) return undefined;
      for (let subtabId in this.subTabs[tabId]) {
          if (this.subTabs[tabId][subtabId] === subtabName) {
              return subtabId;
          }
      }
      return undefined;
  }

  navigateToTab(tabId) {
      let toIndex = this.tabIdToIdx[tabId];
      this.tabs.select(toIndex, true);
      // select default subtab
      this.subtabSelects[tabId].value("Home");
  }

  navigateToSubtab(tabId, subtabId) {
      this.navigateToTab(tabId);
      // select requested subtab
      this.subtabSelects[tabId].value(this.subTabs[tabId][subtabId]);
  }

  setupTabLinking() {
    let self = this;
    // NOTE: in order to be able to navigate to subtabs from markdown generated links
    // we intercept all links in the document here
    const interceptClickEvent = (e) => {
      let href;
      let target = e.target || e.srcElement;
      if (target.tagName === 'A') {
          //tell the browser not to respond to the link click
          e.preventDefault();
          href = decodeURI(target.getAttribute('href'));
          console.log("link clicked " + href);
          // NOTE: we're assuming links to subtabs are in the following form
          // tab/<tabName>/subtab/<subtabName>
          // or
          // tab/<tabName> (navigates to default subtab)
          if (!href) return;
          let splits = href.split("/");
          if (splits.length === 4) {
              if (splits[0] === "tab" && splits[2] === "subtab") {
                  let tabName = splits[1];
                  let subtabName = splits[3];
                  let tabId = self.getTabIdFromName(tabName);
                  let subtabId = self.getSubTabIdFromName(tabId, subtabName);
                  // navigate to requested subtab (subtabId) for tabId
                  self.navigateToSubtab(tabId, subtabId);
              }
          } else if (splits.length === 2) {
              if (splits[0] === "tab") {
                  let tabName = splits[1];
                  let tabId = self.getTabIdFromName(tabName);
                  // navigate to default subtab for tabId
                  self.navigateToTab(tabId);
              }
          }
      }
    };
    //listen for link click events at the document level
    if (document.addEventListener) {
        document.addEventListener('click', interceptClickEvent);
    } else if (document.attachEvent) {
        document.attachEvent('onclick', interceptClickEvent);
    }
  }

  renameTab(tabId, newTabName) {
    // TODO: also make sure tab names are unique
    if (newTabName) {
      this.tabNames[tabId] = newTabName;
      // update UI as well
      // 1. updating tab handle
      // NOTE: tab handle is a div with id tab+<tabId>
      let tabHandleContainer = d3.select("div#tab" + tabId);
      tabHandleContainer.select("div.tab-main-header").select("span").text(newTabName);
      // 2. NOTE: no need to update in tab manager as it is recreated upon display
      return true;
    } else {
      console.log("New tab name is empty.");
      return false;
    }
  }

  renameSubtab(tabId, subtabId, newSubtabName) {
    // rename subtame if new name is valid (subtabs inside a single tab must have unique names)
    let subtabNames = Object.values(this.subTabs[tabId]);
    let oldName = this.subTabs[tabId][subtabId];
    if (newSubtabName !== oldName) {
      if (!subtabNames.includes(newSubtabName)) {
        this.subTabs[tabId][subtabId] = newSubtabName;
        // also rename inside the subtab select UI
        const subtabs = ["Home"];
        subtabs.push(...Object.values(this.subTabs[tabId]));
        this.subtabSelects[tabId].hide();
        this.subtabSelects[tabId].clearCache(); // NOTE: must be called to update UI correctly
        this.subtabSelects[tabId].items(subtabs);
        // also need to change selected subtab if it is active
        if (this.activeSubTab[tabId] === subtabId) {
          this.subtabSelects[tabId].value(newSubtabName);
        }
        return true;
      }
    }
    return false;
  }

  openTabManager() {
    // opens a modal allowing user to manage tabs, subtabs and their persona permissions
    // first we remove prev tab manager DOM
    d3.select("#tab-manager").remove();
    // now we add a new tree instance
    let container = d3.select("body")
      .append("div")
      .attr("id", "tab-manager")
      .classed("hx-tree tab-tree", true);
    // adding tabs
    for (let tabId in this.tabNames) {
      let tabContainer = container.append("div")
        .classed("hx-tree-node", true);
      // tab title part
      let tabTitleContainer = tabContainer.append("div")
        .classed("hx-tree-node-parent", true)
        .append("div")
        .classed("hx-tree-node-content existing-tab-content", true);
      let tabLabelContainer = tabTitleContainer
        .append("div")
        .classed("tab-label-container", true);
      // static label span
      tabLabelContainer
        .append("span")
        .classed("tab-label", true)
        .text(this.tabNames[tabId]);
      // label input (for renaming)
      tabLabelContainer
        .append("input")
        .classed("tab-label-input hidden", true)
        .property("value", this.tabNames[tabId]);
      let tabControls = tabTitleContainer
        .append("div")
        .classed("tab-controls", true);
      let renameBtn = tabControls
        .append("i")
        .classed("fa fa-edit rename-tab-label-btn", true);
      renameBtn.on("click", () => {
        // rename tab with tabId
        let label = tabLabelContainer.select("span.tab-label");
        let input = tabLabelContainer.select("input.tab-label-input");
        let isRenaming = label.classed("hidden");
        if (isRenaming) {
          // confirm renaming
          let newTabName = input.property("value");
          if (this.renameTab(tabId, newTabName)) {
            // update UI
            label.text(newTabName);
          }
        }
        tabControls.select("i.rename-tab-label-btn")
          .classed("fa-edit", isRenaming)
          .classed("fa-check", !isRenaming);
        input.classed("hidden", isRenaming);
        label.classed("hidden", !isRenaming);
      });
      let deleteBtn = tabControls
        .append("i")
        .classed("fa fa-trash", true);
      deleteBtn.on("click", () => {
        // TODO: prompt remove tab with tabId
        console.log("requested remove tab", this.tabNames[tabId]);
      });
      // add subtabs (tab children)
      let subTabContainer = tabContainer
        .append("div")
        .classed("hx-tree-node-children", true); // "add style > display:none"
      // default (Home) tab
      let subTab = subTabContainer
        .append("div")
        .classed("hx-tree-node", true)
        .append("div")
        .classed("hx-tree-node-content existing-tab-content", true);
      subTab
        .append("span")
        .classed("tab-label", true)
        .text("Home"); // TODO: make it editable also for default subtab
      let subTabControls = subTab
        .append("div")
        .classed("tab-controls", true);
      renameBtn = subTabControls
        .append("i")
        .classed("fa fa-edit", true);
      renameBtn.on("click", () => {
        // TODO: prompt rename default subtab
        console.log("requested rename default subtab for", this.tabNames[tabId]);
      });
      // NOTE: HOME subtab cannot be removed! only renaming is possible
      // deleteBtn = tabControls
      //   .append("i")
      //   .classed("fa fa-trash", true);
      // existing subtabs
      if (tabId in this.subTabs) {
        // tab has other pages than just Home
        for (let subtabId in this.subTabs[tabId]) {
          let _subTab = subTabContainer
            .append("div")
            .classed("hx-tree-node", true)
            .append("div")
            .classed("hx-tree-node-content existing-tab-content", true);
          let _subtabLabelContainer = _subTab.append("div")
            .classed("tab-label-container", true);
          // static label span
          _subtabLabelContainer
            .append("span")
            .classed("tab-label", true)
            .text(this.subTabs[tabId][subtabId]);
          // label input (for renaming)
          _subtabLabelContainer
            .append("input")
            .classed("tab-label-input hidden", true)
            .property("value", this.subTabs[tabId][subtabId]);
          // _subTab
          //   .append("span")
          //   .classed("tab-label", true)
          //   .text(this.subTabs[tabId][subtabId]);
          let _subTabControls = _subTab
            .append("div")
            .classed("tab-controls", true);
          renameBtn = _subTabControls
            .append("i")
            .classed("fa fa-edit rename-tab-label-btn", true);
          renameBtn.on("click", () => {
            // rename subtab with subtabId for tab with tabId
            let label = _subtabLabelContainer.select("span.tab-label");
            let input = _subtabLabelContainer.select("input.tab-label-input");
            let isRenaming = label.classed("hidden");
            if (isRenaming) {
                // confirm renaming
                let newSubtabName = input.property("value");
                if (this.renameSubtab(tabId, subtabId, newSubtabName)) {
                  label.text(newSubtabName);
                }
            }
            _subTabControls.select("i.rename-tab-label-btn")
              .classed("fa-edit", isRenaming)
              .classed("fa-check", !isRenaming);
            input.classed("hidden", isRenaming);
            label.classed("hidden", !isRenaming);
          });
          deleteBtn = _subTabControls
            .append("i")
            .classed("fa fa-trash", true);
          deleteBtn.on("click", () => {
            // TODO: prompt remove subtab with subtabId for tab with tabId
            console.log("requested remove subtab", this.subTabs[tabId][subtabId], "for", this.tabNames[tabId]);
            this.removeSubtab(tabId, subtabId);
          });
        }
      }
      // add new subtab
      let addNewSubTab = subTabContainer
        .append("div")
        .classed("hx-tree-node add-new-subtab", true)
        .append("div")
        .classed("hx-tree-node-content", true);
      addNewSubTab
        .append("i")
        .classed("fa fa-plus", true);
      addNewSubTab
        .append("span")
        .text("New Subtab");
      addNewSubTab.on("click", () => {
        // TODO: prompt add new subtab for tabId
        console.log("requested add new subtab for", this.tabNames[tabId]);
      });
    }
    // footer
    d3.select("body").select(".add_new_tab_footer").remove();
    let footer = d3.select("body").append("div")
      .classed("add_new_tab_footer", true);
    footer.append("div")
        .attr("id", "add-new-tab-btn");
    footer.append("i").classed("fa fa-plus", true);
    footer.append("span")
        .text("Add New Tab");
    footer.on('click', () => {
        // TODO: render add new tab UI
        console.log("requested add new tab");
    });
    //
    let tabTree = new hx.Tree('#tab-manager');
    this.modal = hx.modalRight({
        title: 'Manage Tabs',
        renderBody: () => hx.select("#tab-manager"),
        renderFooter: thisModal => hx.select(".add_new_tab_footer")
    });
  }
}

window.tabManager = new TabManager();
// can also be accessed via TabManager.getInstance()
// only instantiation is required, not storing the reference

const appendTo = (source, target) => {
    // const sourceSelection = d3.select(source);
    // const targetSelection = d3.select(target);
    // // appends a clone of source selection to target selection and removes the
    // // original source (cuts source to target)
    // const clone = sourceSelection.node().cloneNode(true);
    // targetSelection.node().appendChild(clone);
    // sourceSelection.remove();
    // TODO: to remove jquery dependency we need to implement a way of cloning
    // such that all event listeners are also cloned. this can only be done
    // manually by keeping track of them and adding them to the cloned object.
    // jquery already takes care of that with appendTo
    // see:
    // https://api.jquery.com/appendto/
    // http://wbkd.github.io/d3-extended/appendTo.js.html
    // https://api.jquery.com/clone/
    // https://developer.mozilla.org/en-US/docs/Web/API/Node/cloneNode
    // https://stackoverflow.com/questions/15408394/how-to-copy-a-dom-node-with-event-listeners
    $(source).appendTo(target);
};
