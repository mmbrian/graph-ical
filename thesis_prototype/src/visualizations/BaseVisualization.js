require("./base_style.scss");
const N3 = require("n3");
const { DataFactory } = N3;
const { namedNode, literal, quad } = DataFactory;
import * as d3 from "d3";
const hx = require("hexagon-js");
const uuidv4 = require("uuid/v4");
import { makeResizableDiv, makeMovableDiv } from "../scripts/thirdparty";
import {
  TabManager
} from "../scripts/tabs/tab_util";
import { Subject } from "rxjs";
import { setColorPickerClr, showColorPicker } from "../scripts/template_style";

// TODO:
// 1. add logic to bring on top whichever visualization is being dragged/resized

export const VisTypes = Object.freeze({
  LIST_VIEW: "list-view",
  TABLE: "table-view",
  COLLAPSIBLE_TREE: "collapsible-tree",
  NETWORK: "network",
  LINE_CHART: "line-chart",
  TIMELINE: "timeline",
  DISPLAY_GROUP: "display-group",
  MARKDOWN: "markdown",
  SVGMAP: "svg-map",
  TIMELINE_CHART: "timeline-chart"
});

export const VisTemplateKeys = Object.freeze({
  ID: "id",
  TYPE: "type",
  TITLE: "title",
  TAB: "tab",
  SUBTAB: "subtab",
  CUSTOM_TITLE: "customTitle",
  TOP: "top",
  LEFT: "left",
  WIDTH: "width",
  HEIGHT: "height",
  CLR_BG: "background-color"
});

export const TEMPLATE_RDF_NAMESPACE = "pxio";
export const addTemplatePrefix = s => TEMPLATE_RDF_NAMESPACE + ":" + s;
export const removeTemplatePrefix = s => {
  let prefix = TEMPLATE_RDF_NAMESPACE + ":";
  if (s.startsWith(prefix)) {
    return s.substring(prefix.length);
  }
  return s;
};
export const TEMPLATE_VIEW_BASE_SPECS = "viewBaseSpecs";
export const TEMPLATE_VIEW_SPECIFIC_SPECS = "viewSpecific";
export const VISUALIZATION_ID_PREFIX = "base_visualization_";

export class BaseVisualization {
  constructor(defaultTitle, tabContentId, options) {
    // Here we keep a track of all visualization added for later
    // e.g. when exporting workspace template RDF
    BaseVisualization.visualizations.push(this);
    this.title = defaultTitle;
    this.tabContentId = tabContentId;
    let tabId = this.tabContentId.replace("tab-content-", "");
    this.subtabClass = TabManager.getInstance().getActiveSubtabClass(tabId);
    this.options = options;
    // get subtab class from options if available in options
    if (this.options[VisTemplateKeys.SUBTAB]) {
      this.subtabClass = this.options[VisTemplateKeys.SUBTAB];
    }
    if (this.options[VisTemplateKeys.ID]) {
      this.id = this.options[VisTemplateKeys.ID];
    } else {
      // TODO: make sure id has no invalid characters for a class name
      this.id = VISUALIZATION_ID_PREFIX + uuidv4().replaceAll("-", "_");
    }
    if (this.options.parent) {
      this.parent = this.options.parent;
      BaseVisualization.visualizations.pop();
      // TODO: keep this in visualization but ignore when storing as rdf
    } else {
      // NOTE: only uses active subtab if subtabClass was not provided
      this.baseContainer = d3
        .select(TabManager.getInstance().getActiveSubtabContentSelector(tabId, this.subtabClass))
        .append("div")
        .attr("class", this.id)
        .classed("view_base_container", true);
    }
    if (this.options.hasCoordsAndDims && !this.isContained()) {
      let coordValue;
      for (let spec of [
        VisTemplateKeys.TOP,
        VisTemplateKeys.LEFT,
        VisTemplateKeys.WIDTH,
        VisTemplateKeys.HEIGHT
      ]) {
        // this.baseContainer.style(spec, this.options[spec]);
        coordValue = this.percentageToPx(this.options[spec], spec);
        this.baseContainer.style(spec, coordValue + "px");
      }
    }
    // applying color settings
    if (this.options[VisTemplateKeys.CLR_BG]) {
      this.clrBackground = this.options[VisTemplateKeys.CLR_BG];
    } else {
      this.clrBackground = "#fff";
    }
    this.setBackground(this.clrBackground);
    // NOTE: this is expected class name that contains the entire dom related
    // to this visualization
    // setting up references to stream and objects visualization use
    // TODO: we can make this customizable depending on visualization
    // TODO: also we can reduce references by binding these to the BaseVisualization
    // class and not an instance of it (static class properties)
    this.infoSidebar = window.instanceInfoSidebar;
    this.selectStream = window.instanceSelectStream;
    this.dragStartStream = window.instanceDragStartStream;
    this.dragEnterStream = window.instanceDragEnterStream;
    this.dragLeaveStream = window.instanceDragLeaveStream;
    this.dragDropStream = window.instanceDragDropStream;
    this.highlighterStream = window.highlighterStream;
    if (this.isContained()) return;
    // init common dom elements
    this.initDom();
    if (this.options[VisTemplateKeys.TITLE]) {
      this.title = this.options[VisTemplateKeys.TITLE];
      this.setTitle(this.options[VisTemplateKeys.TITLE]);
    }
    this.setupSubscriptions();

    const strimPxToInt = s => parseInt(s.substring(0, s.length - 2));
    this.highlightStream = new Subject();
    this.highlightStream.subscribe({
      next: shouldHighlight => {
        this.highlighterStream.next({
          vis: this,
          add: shouldHighlight,
          remove: !shouldHighlight,
          id: this.highlightId,
          rect: {
            x: strimPxToInt(this.baseContainer.style(VisTemplateKeys.LEFT)),
            y: strimPxToInt(this.baseContainer.style(VisTemplateKeys.TOP)),
            w: strimPxToInt(this.baseContainer.style(VisTemplateKeys.WIDTH)),
            h: strimPxToInt(this.baseContainer.style(VisTemplateKeys.HEIGHT))
          }
        });
      }
    });
  }

  setupSubscriptions() {
    // subscribe to streams
  }

  isContained() {
    return this.parent !== undefined;
  }

  setCloseCallback(callback) {
    this.closeCallback = callback;
  }

  initDom() {
    this.initDomHeader();
    this.initDomContentAndSettings();
    this.initDomBaseSettings();
  }

  getHeaderToggleContainer() {
    return this.headerContainer.select("div.vis-toggles");
  }

  initDomHeader() {
    // header container
    this.headerContainer = this.baseContainer
      .append("div")
      .classed("view_header", true)
      .classed("user_mode", window.isInUserMode);
    // span that holds view title
    this.headerContainer.append("span").classed("view-title", true);
    // container for header buttons
    const btnContainer = this.headerContainer
      .append("div")
      .classed("vis-toggles", true);
    // add new instance
    this.addNewInstanceBtn = btnContainer
      .append("div")
      .classed("vis-toggle add-instance-toggle", true)
      .classed("invisible", !this.options.isCreatable);
    this.addNewInstanceBtn.append("i").classed("fas fa-plus", true);
    this.addNewInstanceBtn.on("click", () => {
      this.onAddNewInstance();
    });
    this.editToggle = btnContainer
      .append("div")
      .classed("vis-toggle edit-toggle", true)
      .classed("invisible", true);
    this.editToggle.append("i").classed("fas fa-edit", true);
    this.editToggle.on("click", () => {
      this.onEditDisplayGroup();
    });
    // switch tab
    let switchTabBtn = btnContainer
      .append("div")
      .classed("vis-toggle switch-tab-toggle", true)
      .classed("user_mode", window.isInUserMode)
      .append("i")
      .classed("fas fa-share-square", true);
    switchTabBtn.on("click", () => {
      TabManager.getInstance().activeVisForMoving = this;
      TabManager.getInstance().moveToTab(d3.event, "." + this.id);
    });
    // view settings
    let settingsBtn = btnContainer
      .append("div")
      .classed("vis-toggle settings-toggle", true)
      .classed("user_mode", window.isInUserMode)
      .append("i")
      .classed("fas fa-cog", true);
    settingsBtn.on("click", () => {
      settingsBtn.classed("selected", !settingsBtn.classed("selected"));
      this.settingsContainer.classed(
        "invisible",
        !this.settingsContainer.classed("invisible")
      );
      this.contentContainer.classed(
        "invisible",
        !this.contentContainer.classed("invisible")
      );
    });
    // highlight toggle
    let highlightBtn = btnContainer
      .append("div")
      .classed("vis-toggle highlight-toggle", true)
      .classed("user_mode", window.isInUserMode)
      .append("i")
      .classed("fas fa-eye", true);
    highlightBtn.on("click", () => {
      this.setHighlighted(!this.isHighlighted);
    });
    // close button
    let closeBtn = btnContainer
      .append("div")
      .classed("vis-toggle close-toggle", true)
      .classed("user_mode", window.isInUserMode)
      .append("i")
      .classed("fas fa-times", true);
    closeBtn.on("click", () => {
      if (this.closeCallback) {
        this.closeCallback();
      }
      this.baseContainer.remove();
      BaseVisualization.visualizations = BaseVisualization.visualizations.filter(
        v => v.id !== this.id
      );
    });
  }

  onAddNewInstance() {
    // override in child
  }

  updateWithLatestEventData() {
    // override in child. this is called when a new event is added to repo
    // visualization should compute new data to visualize based on latest events
  }

  initDomContentAndSettings() {
    this.contentContainer = this.baseContainer
      .append("div")
      .classed("view_content_container", true);
    this.settingsContainer = this.baseContainer
      .append("div")
      .classed("view_settings_container invisible", true);
  }

  initDomBaseSettings() {
    // add settings to allow custom title
    let hasCustomTitle =
      this.options[VisTemplateKeys.CUSTOM_TITLE] &&
      this.options[VisTemplateKeys.CUSTOM_TITLE] === "true";
    this.addToggleSetting(
      "Use Custom View Title",
      useCustomTitle => {
        this.isUsingCustomTitle = useCustomTitle;
        // TODO: store this decision to render toggle with correct state
        // when importing from template RDF
        if (useCustomTitle) {
          this.settingsContainer
            .select("." + this.titleInputClass)
            .attr("disabled", null);
        } else {
          this.settingsContainer
            .select("." + this.titleInputClass)
            .attr("disabled", "");
          // set title back to default title
          this.setTitle(this.title);
        }
      },
      hasCustomTitle
    );
    this.titleInputClass = this.addTextInputSetting(
      "Custom View Title",
      title => {
        this.setTitle(title, false);
      },
      "Enter view title...",
      this.viewTitle
    );
    if (!hasCustomTitle) {
      // disable input by default
      this.settingsContainer
        .select("." + this.titleInputClass)
        .attr("disabled", "");
    }
    this.addBackgroundColorSetting(this.clrBackground);
    this.addSettingsSeparator();
  }

  setTitle(title, updateSetting = true) {
    this.viewTitle = title;
    if (this.hasTitleSuffix) {
      d3.select("." + this.id + " .view-title").text(
        title + " " + this.titleSuffix
      );
    } else {
      d3.select("." + this.id + " .view-title").text(title);
    }
    if (updateSetting) {
      this.settingsContainer
        .select("." + this.titleInputClass)
        .node().value = title;
    }
  }

  setTitleSuffix(suffix) {
    if (this.isContained()) return;
    this.titleSuffix = suffix;
    let el = d3.select("." + this.id + " .view-title");
    let title = el.text();
    if (this.hasTitleSuffix || title.includes("[")) {
      // need to remove suffix from title
      title = title.substring(0, title.indexOf("[") - 1);
    }
    el.text(title + " " + suffix);
    this.hasTitleSuffix = true;
  }

  addSpinnerSetting(label, onChange, min, max, value, step) {
    let inputId = "spinner_" + uuidv4().replaceAll("-", "_");
    this.settingsContainer
      .append("label")
      .classed("hx-form-label", true)
      .text(label);
    const input = this.settingsContainer
      .append("input")
      .classed("param-spinner", true)
      .attr("type", "range")
      .attr("min", min + "")
      .attr("max", max + "")
      .attr("step", step + "")
      .classed(inputId, true);
    input.node().value = value;
    input.on("input", function() {
      onChange(this.value);
    });
    return inputId;
  }

  addToggleSetting(textDescription, onChange, initialValue = false) {
    let toggleId = "toggle_" + uuidv4().replaceAll("-", "_");
    this.settingsContainer
      .append("button")
      .classed("hx-btn param-toggle", true)
      .classed(toggleId, true)
      .text(textDescription);
    let toggle = new hx.Toggle(this.getSelector("." + toggleId));
    toggle.value(initialValue);
    toggle.on("change", onChange);
    return toggleId;
  }

  addButtonSetting(textDescription, onClick, extraClasses = "") {
    let btnId = "btn_" + uuidv4().replaceAll("-", "_");
    let btn = this.settingsContainer
      .append("button")
      .classed("hx-btn hx-primary " + extraClasses, true)
      .classed(btnId, true)
      .text(textDescription);
    btn.on("click", () => {
      onClick(d3.event);
    });
    return btnId;
  }

  addBackgroundColorSetting(clr = "#fff") {
    let btnId = this.addButtonSetting(
      "Background Color",
      evt => {
        window.colorChangingOutsideNetwork = true;
        window.colorSelectionClass = this.id;
        window.colorChangingVisualization = this;
        this.isChangingBackgoundColor = true;
        setColorPickerClr(clr);
        showColorPicker(evt);
      },
      "color-btn"
    );
    d3.select(this.getSelector("." + btnId)).style("background", clr);
  }

  setBackground(clr = "#fff") {
    d3.select("." + this.id).style("background", clr);
  }

  addTextSetting(textDescription, updateStream, extraClasses = "") {
    let txtId = "txt_" + uuidv4().replaceAll("-", "_");
    let txt = this.settingsContainer
      .append("span")
      .classed("setting-text " + extraClasses, true)
      .classed(txtId, true)
      .text(textDescription);
    updateStream.subscribe({
      next: payload => {
        txt.text(payload.text);
      }
    });
    return txtId;
  }

  addSettingsSeparator() {
    let sepId = "sep_" + uuidv4().replaceAll("-", "_");
    this.settingsContainer.append("hr").classed(sepId, true);
  }

  addTextInputSetting(
    label,
    onValueChange,
    placeholder = "",
    initialValue = ""
  ) {
    let inputId = "input_" + uuidv4().replaceAll("-", "_");
    let inputLabelId = "input_label_" + uuidv4().replaceAll("-", "_");
    this.settingsContainer
      .append("label")
      .classed("hx-form-label", true)
      .classed(inputLabelId, true)
      .text(label);
    const input = this.settingsContainer
      .append("input")
      .classed("hx-input", true)
      .classed(inputId, true)
      .attr("placeholder", placeholder);
    input.node().value = initialValue;
    input.on("input", function() {
      onValueChange(this.value);
    });
    return [inputId, inputLabelId];
  }

  addSelectorSetting(label, onValueChange, valuesArray, selectedValue) {
    let selectId = "select_" + uuidv4().replaceAll("-", "_");
    let selectLabelId = "select_label_" + uuidv4().replaceAll("-", "_");
    this.settingsContainer
      .append("label")
      .classed("hx-form-label", true)
      .classed(selectLabelId, true)
      .text(label);
    this.settingsContainer
      .append("div")
      .classed("list_selector", true)
      .classed(selectId, true);
    const select = new hx.SingleSelect(
      this.getSelector("." + selectId),
      valuesArray
    );
    select.on("change", function(selected) {
      onValueChange(selected.value);
    });
    select.value(selectedValue);
    return [selectId, selectLabelId];
  }

  removeSetting(settingClassIds) {
    if (typeof settingClassIds === "string") {
      this.settingsContainer.select("." + settingClassIds).remove();
    } else {
      for (let classId of settingClassIds) {
        this.settingsContainer.select("." + classId).remove();
      }
    }
  }

  makeMovableAndResizable(resizeCallback = () => {}) {
    this.resizeCallback = resizeCallback;
    if (window.isInUserMode) return;
    d3.select(this.getSelector(".view_header")).classed(
      "resizable-header",
      true
    );
    makeResizableDiv("." + this.id, resizeCallback);
    makeMovableDiv("." + this.id, ".resizable-header");
    this.isMovableResizable = true;
  }

  onToggleUserMode() {
    console.log("vis toggle user mode", window.isInUserMode);
    // 1.
    if (!window.isInUserMode) {
      d3.select(this.getSelector(".view_header")).classed(
        "resizable-header",
        false
      );
      this.isMovableResizable = false;
    } else {
      this.makeMovableAndResizable(this.resizeCallback);
    }
    // 2.
    this.headerContainer.classed("user_mode", window.isInUserMode);
    d3.select(this.getSelector(".switch-tab-toggle")).classed(
      "user_mode",
      window.isInUserMode
    );
    d3.select(this.getSelector(".settings-toggle")).classed(
      "user_mode",
      window.isInUserMode
    );
    d3.select(this.getSelector(".highlight-toggle")).classed(
      "user_mode",
      window.isInUserMode
    );
    d3.select(this.getSelector(".close-toggle")).classed(
      "user_mode",
      window.isInUserMode
    );
  }

  getSelector(selector) {
    // returns a selection that is within this visualization
    return "." + this.id + " " + selector;
  }

  setHighlighted(shouldHighlight) {
    this.isHighlighted = shouldHighlight;
    d3.select(this.getSelector(".highlight-toggle i")).classed(
      "selected",
      shouldHighlight
    );
    this.highlightStream.next(shouldHighlight);
  }

  getViewNamedGraph() {
    // NOTE: prefix needs to be added appropriately before storing triple
    return namedNode(addTemplatePrefix(this.id));
  }

  getTemplateRDF() {
    // TODO: update and include subtab info
    let quads = [];
    const specSubject = namedNode(addTemplatePrefix(TEMPLATE_VIEW_BASE_SPECS));
    const viewContext = this.getViewNamedGraph();
    // id
    quads.push(
      quad(
        specSubject,
        namedNode(addTemplatePrefix(VisTemplateKeys.ID)),
        literal(this.id),
        viewContext
      )
    );
    // type
    quads.push(
      quad(
        specSubject,
        namedNode(addTemplatePrefix(VisTemplateKeys.TYPE)),
        literal(this.vis_type),
        viewContext
      )
    );
    // tab content id
    quads.push(
      quad(
        specSubject,
        namedNode(addTemplatePrefix(VisTemplateKeys.TAB)),
        literal(this.tabContentId),
        viewContext
      )
    );
    // subtab class
    quads.push(
      quad(
        specSubject,
        namedNode(addTemplatePrefix(VisTemplateKeys.SUBTAB)),
        literal(this.subtabClass),
        viewContext
      )
    );
    // title
    quads.push(
      quad(
        specSubject,
        namedNode(addTemplatePrefix(VisTemplateKeys.TITLE)),
        literal(this.viewTitle),
        viewContext
      )
    );
    // is having custom title
    quads.push(
      quad(
        specSubject,
        namedNode(addTemplatePrefix(VisTemplateKeys.CUSTOM_TITLE)),
        literal(this.isUsingCustomTitle),
        viewContext
      )
    );
    // background color
    quads.push(
      quad(
        specSubject,
        namedNode(addTemplatePrefix(VisTemplateKeys.CLR_BG)),
        literal(this.clrBackground),
        viewContext
      )
    );
    // coordinates and dimensions
    for (let spec of [
      VisTemplateKeys.TOP,
      VisTemplateKeys.LEFT,
      VisTemplateKeys.WIDTH,
      VisTemplateKeys.HEIGHT
    ]) {
      quads.push(
        quad(
          specSubject,
          namedNode(addTemplatePrefix(spec)),
          // literal(this.baseContainer.style(spec)),
          literal(
            this.pxToPercentage(this.baseContainer.style(spec), spec) + "%"
          ),
          viewContext
        )
      );
    }
    return quads;
  }

  pxToPercentage(value, spec) {
    let px = value;
    if (typeof value === "string") {
      if (value.endsWith("px")) {
        px = value.substring(0, value.length - 2);
      }
      px = parseInt(px);
    }
    let ratio = 0;
    let nominator = px;
    let denominator;
    // NOTE:
    // 112 is header height + tab bar height
    // 31 is width of both left and right sidebar toggles
    switch (spec) {
      case VisTemplateKeys.LEFT:
        nominator -= 31; // accounting left sidebar
        denominator = window.innerWidth - 2 * 31; // accounting both sidebars
        break;
      case VisTemplateKeys.WIDTH:
        denominator = window.innerWidth - 2 * 31; // accounting both sidebars
        break;
      case VisTemplateKeys.TOP:
        nominator -= 112; // accounting top area
        denominator = window.innerHeight - 112;
        break;
      case VisTemplateKeys.HEIGHT:
        denominator = window.innerHeight - 112;
        break;
      default:
    }
    ratio = nominator / denominator;
    return Math.round((ratio * 100 + Number.EPSILON) * 100) / 100;
  }

  percentageToPx(value, spec) {
    let px = value;
    if (typeof value === "string") {
      if (value.endsWith("%")) {
        px = value.substring(0, value.length - 1);
      }
      px = parseFloat(px);
    }
    px = px / 100;
    // NOTE:
    // 112 is header height + tab bar height
    // 31 is width of both left and right sidebar toggles
    switch (spec) {
      case VisTemplateKeys.LEFT:
        px = Math.round(px * (window.innerWidth - 2 * 31)) + 31;
        break;
      case VisTemplateKeys.WIDTH:
        px = Math.round(px * (window.innerWidth - 2 * 31));
        break;
      case VisTemplateKeys.TOP:
        px = Math.round(px * (window.innerHeight - 112)) + 112;
        break;
      case VisTemplateKeys.HEIGHT:
        px = Math.round(px * (window.innerHeight - 112));
        break;
      default:
    }
    return px;
  }
}
// class variable containing instances of added visualizations
BaseVisualization.visualizations = [];
BaseVisualization.getAllVisualizations = () => {
  return BaseVisualization.visualizations;
};

// // TODO: just for debugging purposes, remove from window later
// window.BV = BaseVisualization;
