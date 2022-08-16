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
import TimelinesChart from 'timelines-chart';

export default class TimelineChart extends BaseVisualization {
  constructor(tabContentId, options) {
    super(
      "Timeline Chart Example", // title
      tabContentId,
      options
    );
    if (!options.title) {
      this.setTitle("Timeline Chart Example");
    }
    this.vis_type = VisTypes.TIMELINE_CHART;
    this.contentId = "timelinechart_" + uuidv4().replaceAll("-", "_");
    this.baseContainer.classed("timelinechart_container", true);
    this.initDOM();
    // TODO: load from vis options
  }

  initDOM() {
    let self = this;
    self.contentContainer
      .classed("timelinechart_content", true)
      .attr("id", self.contentId);
    let timelineContent = self.contentContainer.append("div")
      .classed("timelinetchart_vis", true);

    const myData = self.getRandomData(true);
    console.log(myData);

    TimelinesChart()(timelineContent.node())
      .zScaleLabel('My Scale Units')
      .zQualitative(true)
      .data(myData);

    this.makeMovableAndResizable();
  }

  getRandomData(ordinal = false) {

    const NGROUPS = 1,
    NLINES = 5,
    MINTIME = new Date(2021,8,1);

    const nCategories = 5,
    categoryLabels = ['Making Coffee','Boiling Water','WC','Watching TV','Working','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];

    const getGroupData = () => {
      const getSegmentsData = (ind) => {
        const nSegments = 5,
        segMaxLength = Math.round(((new Date())-MINTIME)/nSegments);
        let runLength = MINTIME;

        return [...Array(nSegments).keys()].map(i => {
          const tDivide = [Math.random(), Math.random()].sort(),
          start = new Date(runLength.getTime() + tDivide[0]*segMaxLength),
          end = new Date(runLength.getTime() + tDivide[1]*segMaxLength);

          runLength = new Date(runLength.getTime() + segMaxLength);

          return {
            timeRange: [start, end],
            val: ordinal ? categoryLabels[ind] : Math.random()
            //labelVal: is optional - only displayed in the labels
          };
        });
      };

      return [...Array(NLINES).keys()].map(i => ({
        label: 'Activity ' + categoryLabels[i],
        data: getSegmentsData(i)
      }));
    };

    return [{
      group: 'Activities',
      data: getGroupData()
    }];
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
