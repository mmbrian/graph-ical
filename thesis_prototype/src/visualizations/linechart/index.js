require("./style.scss");
import * as d3 from "d3";
const hx = require("hexagon-js");
const uuidv4 = require("uuid/v4");
import { VisTypes, BaseVisualization } from "../BaseVisualization";
import {
    getRepositoryTypes,
    getTypeLiteralPredicates,
    getRepositoryInstancesForTypeWithCond,
    getObject
} from "../../scripts/rest_util";
import { shortenWithPrefix } from "../../scripts/data";

export default class LineChart extends BaseVisualization {
    constructor(tabContentId, options) {
        super(
            "LineChartExample", // title
            tabContentId,
            options
        );
        if (!options.title) {
          this.setTitle("Line Chart Example");
        }
        this.vis_type = VisTypes.LINE_CHART;
        this.chartId = "linechart_" + uuidv4().replaceAll("-", "_");
        this.baseContainer.classed("linechart_container", true);
        this.init();
        this.addSettingsUI();
        this.resetChart();
    }

    init() {
        let self = this;
        self.timeFormatter = d3.timeFormat("%Y-%m-%d - %H:%M:%S:%L");
        self.formatTime = (t) => self.timeFormatter(d3.isoParse(t));
        self.showLabels = true;
        self.showLegend = false;
        self.enableZoom = false;
    }

    getMockTime(n, incrementSec = 10) {
        // NOTE: we start from this fixed date
        let d = new Date("2020-12-11T07:30:06.955000");
        let times = [];
        times.push(d.toISOString());
        for (let i=1; i<n; i++) {
            let dt = new Date(times[times.length-1]);
            // incrementing by incrementSec seconds
            dt.setSeconds(dt.getSeconds() + incrementSec);
            times.push(dt.toISOString());
        }
        return times;
    }

    getMockData(n, multiplier = 1) {
       // NOTE: returns a random array of floating values
       let data = [];
       for (let i=0; i<n; i++) {
          data.push(Math.random() * multiplier);
          // data.push(0.5);
       }
       return data;
    }

    resetChart() {
        this.contentContainer.html("");
        this.setupEmptyChart();
    }

    addSettingsUI() {
        let self = this;
        this.addTextInputSetting(
          "Time Formatting",
          (newValue) => {
              self.timeFormatter = d3.timeFormat(newValue);
              self.formatTime = (t) => self.timeFormatter(d3.isoParse(t));
          },
          "Enter a formatting option for displaying time entries",
          "%Y-%m-%d - %H:%M:%S:%L"
        );
        this.addSettingsSeparator();
        this.addToggleSetting(
          "Show Labels",
          (shouldShow) => {
              if (self.graph) {
                  self.graph.labelsEnabled(shouldShow);
              }
              self.showLabels = shouldShow;
          },
          self.showLabels
        );
        this.addToggleSetting(
          "Show Legend",
          (shouldShow) => {
              if (self.graph) {
                  self.graph.legendEnabled(shouldShow);
              }
              self.showLegend = shouldShow;
          },
          self.showLegend
        );
        this.addToggleSetting(
          "Allow Zooming",
          (shouldAllow) => {
              if (self.graph) {
                  self.graph.zoomEnabled(shouldAllow);
              }
              self.enableZoom = shouldAllow;
          },
          self.enableZoom
        );
        this.addSettingsSeparator();
        self.addNewChartBtn = this.addButtonSetting(
            "Add New Line Chart",
            () => {
              self.newSeriesData = {
                  name: "New Series"
              };
              self.seriesNameTxtId = this.addTextInputSetting(
                  "Series name",
                  (newValue) => {
                      self.newSeriesData.name = newValue;
                  },
                  "Enter a name for this series",
                  "New Series"
              );
              // need a selector for selecting object type e.g. suite:Activity
              getRepositoryTypes(window.activeRepoURI)
                  .then(typeArray => {
                      if (typeArray) {
                          self.typeArray = typeArray.map(t => shortenWithPrefix(t));
                          self.newChartTypeSelectId = this.addSelectorSetting(
                              "Object type to create chart from",
                              (selectedType) => {
                                  this.selectedType = selectedType;
                                  self.onNewTypeSelected(selectedType);
                              },
                              self.typeArray,
                              self.typeArray[0]
                          );
                      }
                  });
            }
        );
    }

    removeNewChartSettings() {
        let self = this;
        if (self.xAxisSettingIds) {
            self.removeSetting(self.xAxisSettingIds);
        }
        if (self.yAxisSettingIds) {
            self.removeSetting(self.yAxisSettingIds);
        }
        if (self.condIds) {
            self.removeSetting(self.condIds);
        }
        if (self.setupChartBtnId) {
            self.removeSetting(self.setupChartBtnId);
        }
        if (self.newChartTypeSelectId) {
            self.removeSetting(self.newChartTypeSelectId);
        }
        if (self.seriesNameTxtId) {
            self.removeSetting(self.seriesNameTxtId);
        }
    }

    onNewTypeSelected(selectedType) {
        let self = this;
        // remove old selectors
        if (self.xAxisSettingIds) {
            self.removeSetting(self.xAxisSettingIds);
        }
        if (self.yAxisSettingIds) {
            self.removeSetting(self.yAxisSettingIds);
        }
        if (self.condIds) {
            self.removeSetting(self.condIds);
        }
        if (self.setupChartBtnId) {
            self.removeSetting(self.setupChartBtnId);
        }
        self.newSeriesData.type = selectedType;
        // add selectors for xaxis and yaxis
        getTypeLiteralPredicates(window.activeRepoURI, this.selectedType)
            .then(predicates => {
                if (predicates) {
                    self.literalRelArray = predicates.map(p => shortenWithPrefix(p));
                    self.xAxisSettingIds = this.addSelectorSetting(
                        "Date property (X axis)",
                        (selectedRel) => {
                            this.selectedXaxisRel = selectedRel;
                        },
                        self.literalRelArray,
                        self.literalRelArray[0]
                    );
                    self.yAxisSettingIds = this.addSelectorSetting(
                        "Value property (Y axis)",
                        (selectedRel) => {
                            this.selectedYaxisRel = selectedRel;
                        },
                        self.literalRelArray,
                        self.literalRelArray[0]
                    );
                    self.condIds = this.addTextInputSetting(
                      "SPARQL FILTER Condition",
                      (newValue) => {
                          self.selectedCondStatement = newValue;
                      },
                      "Enter a condition like FILTER EXISTS {?subject ?p ?o}",
                      ""
                    );
                    self.setupChartBtnId = this.addButtonSetting(
                        "Done (Sets up the chart)",
                        () => {
                            self.fetchGraphData();
                        }
                    );
                } else {
                    console.log("No literal predicates found for type", this.selectedType);
                }
            });
    }

    fetchGraphData() {
        let self = this;
        console.log("Fetching graph data...");
        getRepositoryInstancesForTypeWithCond(window.activeRepoURI, self.selectedType, self.selectedCondStatement)
            .then(async (instances) => {
                if (instances) {
                    instances = instances.map(i => shortenWithPrefix(i));
                    self.newSeriesData.xArray = [];
                    self.newSeriesData.yArray = [];
                    let x, y;
                    for (let instance of instances) {
                        x = await getObject(instance, self.selectedXaxisRel);
                        y = await getObject(instance, self.selectedYaxisRel);
                        self.newSeriesData.xArray.push(x);
                        self.newSeriesData.yArray.push(parseFloat(y)); // TODO: parse based on actual type
                    }
                    self.newSeriesData.data_length = self.newSeriesData.xArray.length;
                    console.log("Finished procesing data...");
                    self.addNewLineChart(self.newSeriesData);
                    self.removeNewChartSettings();
                }
            });
    }

    // setupGraph() {
    //     let self = this;
    //     if (!self.data) {
    //         // TODO: make chart resizable even when empty so we wont have to do this mock initialization
    //         // mock data
    //         // get data
    //         let n = 100;
    //         let times = self.getMockTime(n);
    //         let data = self.getMockData(n);
    //         for (let i=0; i<n; i++) {
    //             data[i] = {
    //                 date: d3.isoParse(times[i]),
    //                 close: data[i]
    //             };
    //         }
    //         self.data = data;
    //     }
    //
    //     self.contentContainer
    //         .classed("linechart_content", true)
    //         .attr("id", self.chartId);
    //
    //     if (!self.width) {
    //         self.width = 500;
    //         self.height = 500 - 30;
    //     }
    //     // set the dimensions and margins of the graph
    //     var margin = {top: 20, right: 20, bottom: 150, left: 50},
    //         width = self.width - margin.left - margin.right,
    //         height = self.height - margin.top - margin.bottom;
    //
    //     // set the ranges
    //     var x = d3.scaleTime().range([0, width]);
    //     var y = d3.scaleLinear().range([height, 0]);
    //
    //     // define the line
    //     self.valueline = d3.line()
    //         .x(function(d) { return x(d.date); })
    //         .y(function(d) { return y(d.close); });
    //
    //     // append the svg obgect to the body of the page
    //     // appends a 'group' element to 'svg'
    //     // moves the 'group' element to the top left margin
    //     self.rootSvg = d3.select('#' + self.chartId)
    //         .append("svg")
    //         .attr("width", width + margin.left + margin.right)
    //         .attr("height", height + margin.top + margin.bottom);
    //     self.svg = self.rootSvg
    //         .append("g")
    //         .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    //
    //     // Scale the range of the data
    //     x.domain(d3.extent(self.data, function(d) { return d.date; }));
    //     y.domain([0, d3.max(self.data, function(d) { return d.close; })]);
    //
    //     // Add the valueline path.
    //     self.svg.append("path")
    //         .data([self.data])
    //         .attr("class", "line")
    //         .attr("d", self.valueline);
    //
    //     // Add the X Axis
    //     self.svg.append("g")
    //         .attr("class", "axis xaxis")
    //         .attr("transform", "translate(0," + height + ")")
    //         .call(d3.axisBottom(x)
    //                 .tickFormat(d3.timeFormat("%Y-%m-%d - %M-%S-%L")))
    //         .selectAll("text")
    //           .style("text-anchor", "end")
    //           .attr("dx", "-.8em")
    //           .attr("dy", ".15em")
    //           .attr("transform", "rotate(-65)");
    //
    //     // Add the Y Axis
    //     self.svg.append("g")
    //         .attr("class", "axis yaxis")
    //         .call(d3.axisLeft(y));
    //
    //     this.makeMovableAndResizable((width, height) => {
    //         self.updateOnResize(width, height);
    //     });
    // }
    //
    // updateOnResize(width, height) {
    //     let self = this;
    //     this.width = width;
    //     this.height = height - 30;
    //     // update graph
    //     var margin = {top: 20, right: 20, bottom: 150, left: 50};
    //     width = self.width - margin.left - margin.right;
    //     height = self.height - margin.top - margin.bottom;
    //     // set the ranges
    //     var x = d3.scaleTime().range([0, width]);
    //     var y = d3.scaleLinear().range([height, 0]);
    //     // define the line
    //     self.valueline = d3.line()
    //         .x(function(d) { return x(d.date); })
    //         .y(function(d) { return y(d.close); });
    //     //
    //     self.rootSvg
    //         .attr("width", width + margin.left + margin.right)
    //         .attr("height", height + margin.top + margin.bottom);
    //     // Scale the range of the data
    //     x.domain(d3.extent(self.data, function(d) { return d.date; }));
    //     y.domain([0, d3.max(self.data, function(d) { return d.close; })]);
    //     //
    //     self.svg.select("path.line").attr("d", self.valueline);
    //     self.svg.select("g.xaxis")
    //         .attr("transform", "translate(0," + height + ")")
    //         .call(d3.axisBottom(x)
    //                 .tickFormat(d3.timeFormat("%Y-%m-%d - %M-%S-%L")));
    //     self.svg.select("g.yaxis")
    //         .call(d3.axisLeft(y));
    // }

    sparkline (options) {
        console.log("sparkline data is", options);
        return hx.card.group()
            .add(
              hx.card.fixed.section().add(
                hx.card.text({
                  text: options.text
                })
              )
            )
            .add(
              hx.card.section().add(
                hx.sparkline({
                  strokeColor: options.sparklineColor,
                  data: options.sparklineData
                }
              )
            ));
    }

    addNewLineChart(seriesData) {
        let self = this;
        if (!this.allSeriesData) {
            this.nSeries = 1;
            seriesData.clr = hx.theme().plot.colors[0];
            this.allSeriesData = {1: seriesData};
        } else {
            this.nSeries++;
            seriesData.clr = hx.theme().plot.colors[this.nSeries-1]; // TODO make sure color exists, make color customizable asap
            this.allSeriesData[this.nSeries] = seriesData;
        }

        self.graph.removeAxis(self.axis);
        self.axis = self.graph.addAxis({
            x: {
                title: 'Time',
                formatter: (x) => self.formatTime(seriesData.xArray[parseInt(x)])
            },
            y: {
                title: 'Value',
                scalePaddingMax: 0.1
            }
        });
        // console.log("adding series with info", seriesData);
        // TODO: check if we have to add all series again
        for (let series of Object.values(self.allSeriesData)) {
            console.log("adding series", series);
            self.axis.addSeries('line', {
                title: series.name,
                data: hx.range(series.data_length).map(i => {
                    return {
                        x: i,
                        y: series.yArray[i]
                    };
                }),
                labelFormatters: {
                  'x': (x) => self.formatTime(series.xArray[parseInt(x)]),
                  'y': (y) => y //hx.format.si(3)
                },
                labelInterpolated: false,
                markersEnabled: true,
                strokeEnabled: true,
                strokeColor: series.clr,
                fillEnabled: true,
                fillColor: hx.color(series.clr).alpha(0.2).toString(),
                group: series.name // NOTE: same group series are added on top of each other!
            });
        }
        self.graph.render();
    }

    setupEmptyChart() {
        let self = this;
        self.contentContainer
            .classed("linechart_content", true);
        let chartContainer = self.contentContainer
            .append("div")
            .attr("id", self.chartId);
        let contextSparklineContainer = self.contentContainer
            .append("div")
            .attr("id", self.chartId + "_sparklines");
        self.graph = new hx.Graph('#' + self.chartId);
        self.graph.labelsEnabled(self.showLabels);
        self.graph.legendEnabled(self.showLegend);
        self.graph.zoomEnabled(self.enableZoom);
        window.ag = self.graph;
        window.times = self.getMockTime(50);
        self.axis = self.graph.addAxis({
            x: {
                title: 'Time',
                formatter: (x) => self.formatTime(window.times[parseInt(x)])
            },
            y: {
                title: 'Power (W)',
                scalePaddingMax: 0.1
            }
        });

        let createData = function(n) {
            let data = self.getMockData(n, 350);
            return hx.range(n).map(function(i){
                return {
                    x: i,
                    y: data[i]
                };
            });
        };
        let seriesData = createData(50);

        window.gseries = self.axis.addSeries('line', {
            title: 'Variable ' + (1),
            data: seriesData,
            labelFormatters: {
              'x': (x) => self.formatTime(window.times[parseInt(x)]),
              'y': (y) => y //hx.format.si(3)
            },
            labelInterpolated: false,
            markersEnabled: true,
            strokeEnabled: true,
            strokeColor: "#f00",
            fillEnabled: false,
            fillColor: hx.color("#f00").alpha(0.2).toString(),
            group: 'some-group'
        });

        self.axis.addSeries('line', {
            title: 'Variable ' + (2),
            data: createData(50),
            labelFormatters: {
              'x': (x) => self.formatTime(window.times[parseInt(x)]),
              'y': (y) => y //hx.format.si(3)
            },
            labelInterpolated: false,
            markersEnabled: true,
            strokeEnabled: true,
            strokeColor: "#0f0",
            fillEnabled: false,
            fillColor: hx.color("#f00").alpha(0.2).toString(),
            group: 'some-group'
        });

        self.axis.addSeries('line', {
            title: 'Variable ' + (3),
            data: createData(50),
            labelFormatters: {
              'x': (x) => self.formatTime(window.times[parseInt(x)]),
              'y': (y) => y //hx.format.si(3)
            },
            labelInterpolated: false,
            markersEnabled: true,
            strokeEnabled: true,
            strokeColor: "#00f",
            fillEnabled: false,
            fillColor: hx.color("#f00").alpha(0.2).toString(),
            group: 'some-group'
        });

        self.graph.render();

        // hx.select('#' + self.chartId + "_sparklines")
        //   .add(
        //     hx.card().add(
        //       self.sparkline({
        //           text: 'Overview',
        //           sparklineColor: hx.theme().plot.colors[0],
        //           sparklineData: hx.range(seriesData.length).map((i) => seriesData[i])
        //       })
        //     )
        //   );

        this.makeMovableAndResizable((w, h) => {
            // NOTE: checked that removing and adding series is fast enough,
            // need that for rendering large data
            // if (self.chartMode === ChartMode.FANCY) {
            //     window.gaxis.removeSeries(window.gseries);
            //     window.gseries = window.gaxis.addSeries('line', {
            //         title: 'Series ' + (1),
            //         data: createData(randomSign(), randomSign(), randomSign()),
            //         labelInterpolated: true,
            //         markersEnabled: true,
            //         strokeEnabled: true,
            //         strokeColor: "#f00",
            //         fillEnabled: true,
            //         fillColor: hx.color("#f00").alpha(0.2).toString(),
            //         group: 'some-group'
            //     });
            // }
        });
    }
}
