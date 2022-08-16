require("./style.scss");
import * as d3 from "d3";
const N3 = require('n3');
const { DataFactory } = N3;
const { namedNode, literal, quad } = DataFactory;
const hx = require("hexagon-js");
const uuidv4 = require("uuid/v4");
import {
    VisTypes,
    BaseVisualization,
    addTemplatePrefix,
    TEMPLATE_VIEW_SPECIFIC_SPECS
} from "../BaseVisualization";
const md = require('markdown-it')({
  linkify: true
});
// const md = require('markdown-it')();

export default class Markdown extends BaseVisualization {
    constructor(tabContentId, options) {
        super(
            "Markdown Example", // title
            tabContentId,
            options
        );
        if (!options.title) {
          this.setTitle("Markdown Example");
        }
        this.vis_type = VisTypes.MARKDOWN;
        this.contentId = "markdown_" + uuidv4().replaceAll("-", "_");
        this.baseContainer.classed("markdown_container", true);
        this.initDOM();
        // TODO: load from vis options
        if (this.options[TEMPLATE_VIEW_SPECIFIC_SPECS]) {
            this.rawMarkdown = this.options[TEMPLATE_VIEW_SPECIFIC_SPECS].rawMarkdown;
        } else {
            this.rawMarkdown = "# Test RAW markdown";
        }
        this.markdownInput.property("value", this.rawMarkdown);
    }

    initDOM() {
        let self = this;
        self.contentContainer
            .classed("markdown_content", true)
            .attr("id", self.contentId);
        self.markdownInput = self.contentContainer
            .append("textarea")
            .classed("markdown_input", true);
        self.markdownInput.on("input", function () {
            self.rawMarkdown = this.value;
        });
        //
        self.markdownRenderDiv = self.contentContainer
            .append("div")
            .classed("markdown_output", true);
        //
        let toggleId = "preview_toggle_" + uuidv4().replaceAll("-", "_");
        self.previewToggle = self.contentContainer.append("button")
            .classed("hx-btn preview-toggle", true)
            .classed(toggleId, true)
            .text("Preview Mode");
        self.togglePreview = new hx.Toggle(self.getSelector("." + toggleId));
        self.togglePreview.value(false);
        self.togglePreview.on('change', (isInPreviewMode) => {
            self.renderMarkdown(isInPreviewMode);
        });
        //
        this.makeMovableAndResizable();
    }

    renderMarkdown(isInPreviewMode) {
        this.markdownInput.classed("invisible", isInPreviewMode);
        if (!isInPreviewMode) return;
        this.renderedMarkdown = md.render(this.rawMarkdown);
        this.markdownRenderDiv.html(this.renderedMarkdown);
        window.mdd = this.markdownRenderDiv;
    }

    onToggleUserMode() {
        super.onToggleUserMode();
        this.togglePreview.value(window.isInUserMode);
        this.previewToggle.classed("invisible", window.isInUserMode);
        this.renderMarkdown(window.isInUserMode);
    }

    getTemplateRDF() {
        let quads = super.getTemplateRDF();
        const viewContext = this.getViewNamedGraph();
        // raw markdown content
        quads.push(quad(
            namedNode(addTemplatePrefix(TEMPLATE_VIEW_SPECIFIC_SPECS)),
            namedNode(addTemplatePrefix("rawMarkdown")),
            literal(this.rawMarkdown),
            viewContext,
        ));
        return quads;
    }
}
