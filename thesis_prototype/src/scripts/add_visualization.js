require("../styles/add_visualization.scss");
import * as d3 from "d3";
const hx = require("hexagon-js");
import { getDefaultQueryForListView } from "./rest_util";
import { shortenWithPrefix, shortenWithoutPrefix } from "./data";
import ListView from "../visualizations/listview";
import Table from "../visualizations/table";
import InstanceInfoTree from "../visualizations/collapsibletree";
import RDFVisualizer, { NetworkTypes } from "../visualizations/network";
import LineChart from "../visualizations/linechart";
import Timeline from "../visualizations/timeline";
import DisplayGroup from "../visualizations/displaygroup";
import Markdown from "../visualizations/markdown";
import SVGMap from "../visualizations/svgmap";
import TimelineChart from "../visualizations/timelinechart";
import {
  VisTypes,
  VisTemplateKeys,
  TEMPLATE_VIEW_BASE_SPECS,
  TEMPLATE_VIEW_SPECIFIC_SPECS,
  VISUALIZATION_ID_PREFIX
} from "../visualizations/BaseVisualization";
import { TabManager } from './tabs/tab_util';

export const initAddUserDOM = () => {
  initAddUIDOM();
};

export const addVisualization = visData => {
  console.log("Adding visualization", visData);
  switch (visData[VisTemplateKeys.TYPE]) {
    case VisTypes.DISPLAY_GROUP:
      console.log("Adding display group view...");
      let dg = new DisplayGroup(visData[VisTemplateKeys.TAB], {
        hasCoordsAndDims: visData[VisTemplateKeys.TOP] !== undefined,
        ...visData
      });
      break;
    case VisTypes.TIMELINE:
      console.log("Adding timeline...");
      let timeline = new Timeline(visData[VisTemplateKeys.TAB], {
        hasCoordsAndDims: visData[VisTemplateKeys.TOP] !== undefined,
        ...visData
      });
      break;
    case VisTypes.LIST_VIEW:
      console.log("Adding list view...");
      let lv = new ListView(visData[VisTemplateKeys.TAB], {
        entityType: window.activeEntityForListView, // will be ignored if template info contains entity type
        repoUri: window.activeRepoURI,
        async: true,
        customQuery: window.useCustomQueryOnListView
          ? window.customListViewQuery
          : null,
        hasCoordsAndDims: visData[VisTemplateKeys.TOP] !== undefined,
        ...visData
      });
      break;
    case VisTypes.TABLE:
      console.log("Adding table...");
      // TODO: update
      let table = new Table(visData[VisTemplateKeys.TAB], {
        entityType: window.activeEntityForListView, // will be ignored if template info contains entity type
        repoUri: window.activeRepoURI,
        async: true,
        customQuery: window.useCustomQueryOnListView
          ? window.customListViewQuery
          : null,
        hasCoordsAndDims: visData[VisTemplateKeys.TOP] !== undefined,
        ...visData
      });
      break;
    case VisTypes.COLLAPSIBLE_TREE:
      console.log("Adding collapsible tree...");
      let cTree = new InstanceInfoTree(visData[VisTemplateKeys.TAB], {
        initial_instance: visData[VisTemplateKeys.TITLE],
        repoUri: window.activeRepoURI,
        namespaces: window.activeRepoNameSpaces,
        hasCoordsAndDims: visData[VisTemplateKeys.TOP] !== undefined,
        ...visData
      });
      break;
    case VisTypes.NETWORK:
      console.log("Adding network...");
      let network = new RDFVisualizer(
        NetworkTypes.BASE_GRAPH,
        visData[VisTemplateKeys.TAB],
        {
          hasCoordsAndDims: visData[VisTemplateKeys.TOP] !== undefined,
          ...visData
        }
      );
      break;
    case VisTypes.LINE_CHART:
      console.log("Adding line chart...");
      let linechart = new LineChart(visData[VisTemplateKeys.TAB], {
        hasCoordsAndDims: visData[VisTemplateKeys.TOP] !== undefined,
        ...visData
      });
      break;
    case VisTypes.MARKDOWN:
      console.log("Adding markdown...");
      let markdown = new Markdown(visData[VisTemplateKeys.TAB], {
        hasCoordsAndDims: visData[VisTemplateKeys.TOP] !== undefined,
        ...visData
      });
      break;
    case VisTypes.SVGMAP:
      console.log("Adding svgmap...");
      let svgmap = new SVGMap(visData[VisTemplateKeys.TAB], {
        hasCoordsAndDims: visData[VisTemplateKeys.TOP] !== undefined,
        ...visData
      });
      break;
    case VisTypes.TIMELINE_CHART:
      console.log("Adding timeline chart...");
      let timelinechart = new TimelineChart(visData[VisTemplateKeys.TAB], {
        hasCoordsAndDims: visData[VisTemplateKeys.TOP] !== undefined,
        ...visData
      });
      break;
    default:
      console.log("Unkown Visualization could not be added.", visData.type);
  }
};

export const importVisualizationsFromTemplate = quads => {
  console.log("Importing visualizations...");
  return new Promise(function(resolve, reject) {
    let visualizations = {};
    let visualizationQuads = quads.filter(q => {
      return shortenWithoutPrefix(q.graph.id).startsWith(
        VISUALIZATION_ID_PREFIX
      );
    });
    for (let quad of visualizationQuads) {
      let graphNode = shortenWithoutPrefix(quad.graph.id);
      if (!(graphNode in visualizations)) {
        visualizations[graphNode] = {};
      }
      let styleSubject = shortenWithoutPrefix(quad.subject.id);
      if (!(styleSubject in visualizations[graphNode])) {
        visualizations[graphNode][styleSubject] = {};
      }
      visualizations[graphNode][styleSubject][
        shortenWithoutPrefix(quad.predicate.id)
      ] = quad;
    }
    for (let visId in visualizations) {
      let visData = {};
      for (let visSubject in visualizations[visId]) {
        if (visSubject === TEMPLATE_VIEW_BASE_SPECS) {
          // global options e.g. coords, title, ...
          for (let visStyle in visualizations[visId][visSubject]) {
            visData[visStyle] =
              visualizations[visId][visSubject][visStyle].object.value;
          }
        } else if (visSubject === TEMPLATE_VIEW_SPECIFIC_SPECS) {
          // global options specific to this view type
          if (!visData[TEMPLATE_VIEW_SPECIFIC_SPECS]) {
            visData[TEMPLATE_VIEW_SPECIFIC_SPECS] = {};
          }
          for (let visStyle in visualizations[visId][visSubject]) {
            visData[TEMPLATE_VIEW_SPECIFIC_SPECS][visStyle] =
              visualizations[visId][visSubject][visStyle].object.value;
          }
        } else {
          // other options e.g. network template styles
          visData[visSubject] = {};
          for (let visStyle in visualizations[visId][visSubject]) {
            visData[visSubject][visStyle] =
              visualizations[visId][visSubject][visStyle].object.value;
          }
        }
      }
      addVisualization(visData);
    }
    resolve();
  });
};

const initAddUIDOM = () => {
  d3.select("#add-ui-modal").remove();
  const container = d3
    .select("body")
    .append("div")
    .attr("id", "add-ui-modal")
    .classed("custom-modal invisible", true);
  const content = container.append("div").classed("custom-modal-content", true);
  const header = content.append("div").classed("custom-modal-header", true);
  header.append("span").text("Choose a New Visualization Type");
  const closeBtn = header
    .append("div")
    .classed("close", true)
    .attr("id", "add-ui-close-toggle")
    .on("click", () => {
      container.classed("invisible", true);
    });
  closeBtn.append("i").classed("fas fa-times", true);
  const visSelectionView = content
    .append("div")
    .classed("custom-modal-body vis-selection", true);
  // list view
  const listViewBtn = visSelectionView
    .append("div")
    .classed("vis-type vis-list", true)
    .on("click", () => {
      footer1.classed("invisible", true);
      footer2.classed("invisible", false);
      visSelectionView.classed("invisible", true);
      entitySelectionView.classed("invisible", false);
      window.isAddingTable = false;
      footer2.select("span.vis-type-selection").text("List View");
    });
  listViewBtn
    .append("img")
    .attr("src", "./public/visualization_sketches/list_sketch.png");
  listViewBtn
    .append("span")
    .classed("vis-title", true)
    .text("List View");
  // list view
  const tableBtn = visSelectionView
    .append("div")
    .classed("vis-type vis-table", true)
    .on("click", () => {
      footer1.classed("invisible", true);
      footer2.classed("invisible", false);
      visSelectionView.classed("invisible", true);
      entitySelectionView.classed("invisible", false);
      window.isAddingTable = true;
      footer2.select("span.vis-type-selection").text("Table");
    });
  tableBtn
    .append("img")
    .attr("src", "./public/visualization_sketches/list_sketch.png");
  tableBtn
    .append("span")
    .classed("vis-title", true)
    .text("Table");
  // collapsible tree
  const treeBtn = visSelectionView
    .append("div")
    .classed("vis-type vis-tree", true)
    .on("click", () => {
      container.classed("invisible", true);
      let visData = {};
      visData[VisTemplateKeys.TITLE] = "pxiopeople:users_mohsen";
      visData[VisTemplateKeys.TAB] = TabManager.getInstance().activeTabContentId;
      visData[VisTemplateKeys.TYPE] = VisTypes.COLLAPSIBLE_TREE;
      addVisualization(visData);
      // TODO: pass activeRepoNameSpaces after they are fetched successfully or
      // update this instance accordingly. this can be done via a stream that
      // pushes an update to all visualization after repo info is fetched
    });
  treeBtn
    .append("img")
    .attr("src", "./public/visualization_sketches/tree_sketch.png");
  treeBtn
    .append("span")
    .classed("vis-title", true)
    .text("Collapsible Tree");
  // network
  const networkBtn = visSelectionView
    .append("div")
    .classed("vis-type vis-network", true)
    .on("click", () => {
      container.classed("invisible", true);
      let visData = {};
      visData[VisTemplateKeys.TAB] = TabManager.getInstance().activeTabContentId;
      visData[VisTemplateKeys.TYPE] = VisTypes.NETWORK;
      addVisualization(visData);
    });
  networkBtn
    .append("img")
    .attr("src", "./public/visualization_sketches/network_sketch.png");
  networkBtn
    .append("span")
    .classed("vis-title", true)
    .text("Network");
  // line chart
  const lineChartBtn = visSelectionView
    .append("div")
    .classed("vis-type vis-linechart", true)
    .on("click", () => {
      container.classed("invisible", true);
      let visData = {};
      visData[VisTemplateKeys.TAB] = TabManager.getInstance().activeTabContentId;
      visData[VisTemplateKeys.TYPE] = VisTypes.LINE_CHART;
      addVisualization(visData);
    });
  lineChartBtn
    .append("img")
    .attr("src", "./public/visualization_sketches/linechart_sketch.png");
  lineChartBtn
    .append("span")
    .classed("vis-title", true)
    .text("Line Chart");
  // timeline
  const timelineBtn = visSelectionView
    .append("div")
    .classed("vis-type vis-timeline", true)
    .on("click", () => {
      container.classed("invisible", true);
      let visData = {};
      visData[VisTemplateKeys.TAB] = TabManager.getInstance().activeTabContentId;
      visData[VisTemplateKeys.TYPE] = VisTypes.TIMELINE;
      addVisualization(visData);
    });
  timelineBtn
    .append("img")
    .attr("src", "./public/visualization_sketches/timeline-tmp.png");
  timelineBtn
    .append("span")
    .classed("vis-title", true)
    .text("Timeline");
  // markdown
  const markdownBtn = visSelectionView
    .append("div")
    .classed("vis-type vis-markdown", true)
    .on("click", () => {
      container.classed("invisible", true);
      let visData = {};
      visData[VisTemplateKeys.TAB] = TabManager.getInstance().activeTabContentId;
      visData[VisTemplateKeys.TYPE] = VisTypes.MARKDOWN;
      addVisualization(visData);
    });
  markdownBtn
    .append("img")
    .attr("src", "./public/visualization_sketches/markdown.png");
  markdownBtn
    .append("span")
    .classed("vis-title", true)
    .text("Markdown");
  // svgmap
  const svgmapBtn = visSelectionView
    .append("div")
    .classed("vis-type vis-svgmap", true)
    .on("click", () => {
      container.classed("invisible", true);
      let visData = {};
      visData[VisTemplateKeys.TAB] = TabManager.getInstance().activeTabContentId;
      visData[VisTemplateKeys.TYPE] = VisTypes.SVGMAP;
      addVisualization(visData);
    });
  svgmapBtn
    .append("img")
    .attr("src", "./public/visualization_sketches/svgmap.jpg");
  svgmapBtn
    .append("span")
    .classed("vis-title", true)
    .text("Interactive SVG");
  // timeline chart
  const timelinechartBtn = visSelectionView
    .append("div")
    .classed("vis-type vis-timelinechart", true)
    .on("click", () => {
      container.classed("invisible", true);
      let visData = {};
      visData[VisTemplateKeys.TAB] = TabManager.getInstance().activeTabContentId;
      visData[VisTemplateKeys.TYPE] = VisTypes.TIMELINE_CHART;
      addVisualization(visData);
    });
  timelinechartBtn
    .append("img")
    .attr("src", "./public/visualization_sketches/svgmap.jpg");
  timelinechartBtn
    .append("span")
    .classed("vis-title", true)
    .text("Timeline Chart");
  // display group
  // TODO: add steps to configure UI
  const dispgroupBtn = visSelectionView
    .append("div")
    .classed("vis-type vis-dispgroup", true)
    .on("click", () => {
      container.classed("invisible", true);
      let visData = {};
      visData[VisTemplateKeys.TAB] = TabManager.getInstance().activeTabContentId;
      visData[VisTemplateKeys.TYPE] = VisTypes.DISPLAY_GROUP;
      addVisualization(visData);
    });
  dispgroupBtn
    .append("img")
    .attr("src", "./public/visualization_sketches/dg_tmp.png");
  dispgroupBtn
    .append("span")
    .classed("vis-title", true)
    .text("Display Group");
  // entity selection view (for listview vis (for now))
  const entitySelectionView = content
    .append("div")
    .classed("custom-modal-body entity-selection invisible", true);
  // custom query view (for list view vis)
  const customSparqlQueryForListView = content
    .append("div")
    .classed("custom-modal-body custom-query invisible", true);
  const chbCqContainer = customSparqlQueryForListView.append("div");
  const cqChb = chbCqContainer
    .append("input")
    .attr("type", "checkbox")
    .attr("id", "cq-chb")
    .attr("name", "cq-chb")
    .attr("checked", "");
  cqChb.on("input", function() {
    if (!this.checked) {
      window.useCustomQueryOnListView = true;
      textAreaCustomQuery.attr("disabled", null);
    } else {
      window.useCustomQueryOnListView = false;
      textAreaCustomQuery.node().value = getDefaultQueryForListView(
        window.activeTypeForListView
      );
      textAreaCustomQuery.attr("disabled", "");
    }
  });
  chbCqContainer
    .append("label")
    .attr("for", "cq-chb")
    .text("Use Defaul SPARQL Query");
  const textAreaCustomQuery = customSparqlQueryForListView
    .append("textarea")
    .attr("id", "lv-custom-sparql-query")
    .attr("name", "lv-custom-sparql-query")
    .attr("disabled", "");
  customSparqlQueryForListView
    .append("button")
    .attr("id", "add-list-view-btn")
    .attr("name", "add-list-view")
    .attr("type", "button")
    .text("Add List View")
    .on("click", () => {
      window.customListViewQuery = textAreaCustomQuery.node().value;
      let visData = {};
      visData[VisTemplateKeys.TAB] = TabManager.getInstance().activeTabContentId;
      visData[VisTemplateKeys.TYPE] = VisTypes.LIST_VIEW;
      addVisualization(visData);
      container.classed("invisible", true);
    });
  // footers
  // generic footer (1st modal view)
  const footer1 = content
    .append("div")
    .classed("custom-modal-footer generic-view-footer", true);
  footer1.append("span").text("Selecting a Visualization Type");
  // footer after list view is selected
  const footer2 = content
    .append("div")
    .classed("custom-modal-footer list-view-footer invisible", true);
  footer2.append("span").classed("vis-type-selection", true).text("List View");
  footer2.append("span").text(">");
  footer2.append("span").text("Choose a Class Type");
  // footer after a class type for list view is selected
  const footer3 = content
    .append("div")
    .classed(
      "custom-modal-footer list-view-custom-query-footer invisible",
      true
    );
  footer3.append("span").classed("vis-type-selection", true).text("List View");
  footer3.append("span").text(">");
  footer3.append("span").classed("selected_entity", true);
  footer3.append("span").text(">");
  footer3.append("span").text("Customize SPARQL Query");

  // TODO:
  populateEntitySelectionModalView(entitySelectionView);
  //
  document.getElementById("add-ui").addEventListener("click", () => {
    container.classed("invisible", false);
    footer1.classed("invisible", false);
    footer2.classed("invisible", true);
    visSelectionView.classed("invisible", false);
    entitySelectionView.classed("invisible", true);
    customSparqlQueryForListView.classed("invisible", true);
    footer3.classed("invisible", true);
  });
};

const populateEntitySelectionModalView = entitySelection => {
  for (let entity of window.activeRepoTypes) {
    const entityItem = entitySelection
      .append("div")
      .classed("entity-item", true);
    entityItem.append("span").text(shortenWithPrefix(entity));
    entityItem.on("click", () => {
      let shortenedType = shortenWithPrefix(entity);
      window.activeTypeForListView = shortenedType;
      window.activeEntityForListView = entity;
      if (window.isAddingTable) {
        let visData = {};
        visData[VisTemplateKeys.TAB] = TabManager.getInstance().activeTabContentId;
        visData[VisTemplateKeys.TYPE] = VisTypes.TABLE;
        addVisualization(visData);
        d3.select("#add-ui-modal").classed("invisible", true);
        return;
      }
      d3.select("span.selected_entity").text(shortenedType);
      entitySelection.classed("invisible", true);
      d3.select(".list-view-footer").classed("invisible", true);
      d3.select(".custom-query").classed("invisible", false);
      d3.select(".list-view-custom-query-footer").classed("invisible", false);
      document.getElementById(
        "lv-custom-sparql-query"
      ).value = getDefaultQueryForListView(shortenedType);
    });
  }
};

// When the user clicks anywhere outside of the modal, close it
window.addEventListener("click", function(event) {
  if (event.target.id == "add-ui-modal") {
    d3.select("#add-ui-modal").classed("invisible", true);
  }
});
