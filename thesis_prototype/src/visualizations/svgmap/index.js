require("./style.scss");
import * as d3 from "d3";
const N3 = require("n3");
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

export default class SVGMap extends BaseVisualization {
  constructor(tabContentId, options) {
    super(
      "Interactive SVG Example", // title
      tabContentId,
      options
    );
    if (!options.title) {
      this.setTitle("Interactive SVG Example");
    }
    this.vis_type = VisTypes.SVGMAP;
    this.contentId = "svgmap_" + uuidv4().replaceAll("-", "_");
    this.baseContainer.classed("svgmap_container", true);
    this.initDOM();
    // TODO: load from vis options
  }

  initDOM() {
    let self = this;
    self.contentContainer
      .classed("svgmap_content", true)
      .attr("id", self.contentId);

    d3.xml("../../../public/sense_prototype/Mitarbeiterwohnung_Michael_Meiser_v1.svg")
      .then(data => {
        self.contentContainer.node().append(data.documentElement);
        const svg = self.contentContainer.select("svg");
        // // adding zoom
        // svg.call(d3.zoom().on("zoom", function () {
        //    svg.attr("transform", d3.event.transform)
        // }))
        // adding click handlers
        svg.selectAll("image").on("click", function() {
          console.log("clicked an image!");
          d3.select(this).classed("selected", !d3.select(this).classed("selected"));
        });
      });

    this.makeMovableAndResizable();
  }

  // getTemplateRDF() {
  //   let quads = super.getTemplateRDF();
  //   const viewContext = this.getViewNamedGraph();
  //   // raw markdown content
  //   quads.push(
  //     quad(
  //       namedNode(addTemplatePrefix(TEMPLATE_VIEW_SPECIFIC_SPECS)),
  //       namedNode(addTemplatePrefix("rawMarkdown")),
  //       literal(this.rawMarkdown),
  //       viewContext
  //     )
  //   );
  //   return quads;
  // }
}
