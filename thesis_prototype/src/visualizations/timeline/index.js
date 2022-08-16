require("./style.scss");
import * as d3 from "d3";
const hx = require("hexagon-js");
const uuidv4 = require("uuid/v4");
import { VisTypes, BaseVisualization } from "../BaseVisualization";
import {
  loadAllEvents,
  getEventDescription
} from "../../scripts/rest_util";
import { shortenWithPrefix } from "../../scripts/data";

const randomDate = (start, end) => {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};
const mockDate = () => {
    return randomDate(new Date(2020, 0, 1), new Date());
};

export default class Timeline extends BaseVisualization {
    constructor(tabContentId, options) {
        super(
            "Timeline", // title
            tabContentId,
            options
        );
        if (!options.title) {
          this.setTitle("New Timeline");
        }
        this.vis_type = VisTypes.TIMELINE;
        this.timelineId = "timeline_" + uuidv4().replaceAll("-", "_");
        this.baseContainer.classed("timeline_container", true);
        this.contentContainer.classed("timeline_content", true);
        this.makeMovableAndResizable();
        this.addSearchDOM();
        this.initData() ;
    }

    addSearchDOM() {
        const container = this.contentContainer;
        const searchArea = container.append("div")
            .classed("search_container", true);
        searchArea.append("input")
            .attr("placeholder", "Search...")
            .on("input", function() {
                // TODO: perform search
            });
    }

    initData() {
        this.events = [];
        loadAllEvents(window.activeRepoURI)
            .then(data => {
                console.log("loaded all events");
                data.sort((a, b) => a.time - b.time);
                for (let d of data) {
                    this.events.push({
                        isLocal: false,
                        message: d.id,
                        dateString: d.time.toTimeString().split(' ')[0]
                    });
                }
                this.addUI();
            });
    }

    getEventInfoFromTriples(info) {
        // assuming info is an array of spo's describing an event
        info = info.map(i => {
           return {
              prop: shortenWithPrefix(i.p.value),
              value: i.o.value
           };
        });
        let ret = {};
        for (let pv of info) {
            switch (pv.prop) {
                case "pxio:isForInstance":
                    ret.isForInstance = pv.value === "true";
                    break;
                case "pxio:isAdded":
                    ret.isAdded = pv.value === "true";
                    break;
                case "pxio:isLocal":
                    ret.isLocal = pv.value === "true";
                    break;
                case "pxio:isFor":
                    ret.addedInstance = shortenWithPrefix(pv.value);
                    break;
                case "pxio:hasType":
                    ret.type = shortenWithPrefix(pv.value);
                    break;
                case "pxio:isForSubject":
                    ret.subject = shortenWithPrefix(pv.value);
                    break;
                case "pxio:isForObject":
                    ret.object = shortenWithPrefix(pv.value);
                    break;
                default:
            }
        }
        return ret;
    }

    fetchEventMessage(eventId, uiElement) {
        getEventDescription(window.activeRepoURI, eventId)
            .then(info => {
                info = this.getEventInfoFromTriples(info);
                // this.events.find(e => e.id = eventId).isLocal = info.isLocal;
                // TODO: update UI to reflect if this event is local or not
                let msg = "";
                if (info.isForInstance) {
                    // refers to instance creation/deletion
                    msg = info.isAdded ? "Added a new " : "Removed a ";
                    msg += info.type; // TODO: replace with type label
                    msg += "<br>";
                    msg += info.addedInstance;
                } else {
                    // refers to relation changes
                    msg = info.isAdded ? "Added a new relation " : "Removed existing relation ";
                    msg += info.type; // TODO: replace with type label
                    msg += "<br>";
                    msg += "between<br>";
                    msg += info.subject;
                    msg += "<br>and<br>";
                    msg += info.object;
                }
                uiElement.html(msg);
            });
    }

    addUI() {
        let hr;
        this.eventContainer = this.contentContainer
            .append("div")
            .classed("event-container", true);
        for (let event of this.events.reverse()) {
            this.eventContainer
                .append("div")
                .classed("event_type_indicator", true)
                .append("span")
                .html(event.isLocal ? "Local Event" : "<b>Cloud</b> Event");
            let itemContainer = this.eventContainer
                .append("div")
                .classed("event_item", true);
            if (event.isLocal) {
                // date comes first, then message
                itemContainer.classed("local", true);
                itemContainer
                    .append("div")
                    .classed("event_date", true)
                    .append("span")
                    .text(event.dateString);
                itemContainer
                    .append("div")
                    .classed("event_message", true)
                    .append("span")
                    .text(event.message);
            } else {
                // message comes first, then date
                let msgElem = itemContainer
                    .append("div")
                    .classed("event_message", true)
                    .append("span")
                    .text(event.message);
                this.fetchEventMessage(event.message, msgElem);
                itemContainer
                    .append("div")
                    .classed("event_date", true)
                    .append("span")
                    .text(event.dateString);
            }
            hr = this.eventContainer.append("hr");
        }
        hr.remove(); // remove last line
        this.eventContainer.append("div")
            .classed("bottom-empty-separator", true);
    }

    updateWithLatestEventData() {
        this.eventContainer.html("");
        this.initData();
        // TODO: does not have to fetch all events, only latest ones that are not
        // here yet
    }
}
