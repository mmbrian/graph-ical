const N3 = require('n3');
const turtleParser = new N3.Parser({ format: 'TriG' }); // should use TriG if ttl contains named graphs
const { DataFactory } = N3;
const { namedNode, literal, defaultGraph, quad } = DataFactory;
import * as d3 from "d3";
import { isTypePredicate } from "./template";
import { shortenWithPrefix, removePrefix, shortenWithoutPrefix } from "./data";
import Pickr from '@simonwep/pickr'; // https://github.com/Simonwep/pickr
const hx = require("hexagon-js");
import { NetworkTypes } from "../visualizations/network";
import { BaseVisualization } from "../visualizations/BaseVisualization";
import RDFVisualizer from "../visualizations/network";
import { importVisualizationsFromTemplate } from "./add_visualization";
import { TabManager } from "./tabs/tab_util";
import { PersonaManager } from "./persona/persona_manager";
import { getDragDataRDF, importDragBehavioursFromTemplate } from "./drag_util";
import {
    getIconUnicode,
    FONTAWESOME_UNICODE_ICONS,
    FONTAWESOME_ICONS
} from "./font-awesome-unicode-map";
const generateIconTexts = () => {
    let svg = d3.select("body")
        .append("svg")
        .classed("icon_texts_svg", true)
        .classed("invisible", true);
    // need to include all icons as text elements to be able to change icons
    // at runtime
    FONTAWESOME_ICONS.map(iconName => {
        let unicodeName = getIconUnicode(iconName);
        svg.append("text")
           .classed(unicodeName, true)
           .style("font-family", "Font Awesome 5 Free")
           .text(unicodeName);
    });
};
export const getIconText = (iconName) => {
    let unicodeName = getIconUnicode(iconName);
    return d3.select("svg.icon_texts_svg")
        .select("." + unicodeName)
        .text();
};
generateIconTexts();

export const hideAllTemplateCtxt = () => {
    d3.select(".node-template-select-container").classed("invisible", true);
    d3.select(".edge-template-select-container").classed("invisible", true);
    d3.select(".node-template-icon-select-container").classed("invisible", true);
};

// NOTE: for now we hide ctxts on right click, need to update it such that
// it reacts on click outside the area of active ctxt
document.addEventListener("contextmenu", function(e) {
    hideAllTemplateCtxt();
    e.preventDefault();
    return false;
});

window.pickr = Pickr.create({
    el: '.color-picker-toggle',
    theme: 'nano', // or 'monolith', or 'classic'
    swatches: [
        'rgba(244, 67, 54, 1)',
        'rgba(233, 30, 99, 0.95)',
        'rgba(156, 39, 176, 0.9)',
        'rgba(103, 58, 183, 0.85)',
        'rgba(63, 81, 181, 0.8)',
        'rgba(33, 150, 243, 0.75)',
        'rgba(3, 169, 244, 0.7)',
        'rgba(0, 188, 212, 0.7)',
        'rgba(0, 150, 136, 0.75)',
        'rgba(76, 175, 80, 0.8)',
        'rgba(139, 195, 74, 0.85)',
        'rgba(205, 220, 57, 0.9)',
        'rgba(255, 235, 59, 0.95)',
        'rgba(255, 193, 7, 1)'
    ],
    components: {
        // Main components
        preview: true,
        opacity: true,
        hue: true,
        // Input / output Options
        interaction: {
            // hex: true,
            rgba: true,
            // hsla: true,
            // hsva: true,
            // cmyk: true,
            input: true,
            // clear: true,
            save: true
        }
    }
});

// let dropdownExampleContent = "<div style='padding:10px;'>Example content!</div>";
let strokeTypesContent = d3.select("#stroke-types").html();

document.getElementById('icon-search-input').addEventListener('input', function (evt) {
    if (!updateIconList(this.value)) {
        let empty_message = d3.select(".icon-selection-container").append("span");
        empty_message.classed("empty_message", true);
        empty_message.text("No icons found...");
    }
});

document.getElementById('upload-template').addEventListener('change', readTemplateFile);
function readTemplateFile() {
    var files = this.files;
    if (files.length === 0) {
        console.log('No file is selected');
        return;
    }
    var reader = new FileReader();
    reader.onload = function(event) {
        loadTemplateData(event.target.result);
    };
    reader.readAsText(files[0]);
};

export const loadTemplateData = async (ttlString) => {
    console.log("loading template data...");
    let quads = await turtleParser.parse(ttlString);
    window.templateQuads = quads;
    console.log("found " + quads.length + " template quads.");
    await importTemplate(window.templateQuads);
};
const importTemplate = (quads) => {
    return new Promise(async function(resolve, reject) {
        // importing persona info if available
        if (PersonaManager.getInstance()) {
          await PersonaManager.getInstance().loadFromTemplate(quads);
        }
        // importing drag behaviors
        await importDragBehavioursFromTemplate(quads);
        // importing tabs
        await TabManager.getInstance().importTabsFromTemplate(quads);
        // importing visualizations next
        await importVisualizationsFromTemplate(quads);
        resolve();
    });
};

export const exportTemplate = (filename) => {
    if (!filename.endsWith(".ttl")) {
        filename = filename + ".ttl";
    }
    let object;
    const writer = new N3.Writer({
        prefixes: {
            // gtemplate: 'https://pxio.de/graph-ical/styles/0.1/#',
            ...window.activeRepoNameSpaces
        }
    });
    // next we write UI info related to vis type decisions
    for (let vis of BaseVisualization.visualizations) {
        if (vis.options.ignoreInTemplate) continue;
        for (let quad of vis.getTemplateRDF()) {
            writer.addQuad(quad);
        }
    }
    // writing tab info
    for (let quad of TabManager.getInstance().getTabDataRDF()) {
        writer.addQuad(quad);
    }
    // writing persona info
    if (PersonaManager.getInstance()) {
      for (let quad of PersonaManager.getInstance().getTemplateRDF()) {
          writer.addQuad(quad);
      }
    }
    // writing drag behavior info
    // TODO: also change similar to tab util into a singleton object and remove window objects
    for (let quad of getDragDataRDF()) {
        writer.addQuad(quad);
    }
    //
    writer.end((error, result) => {
        if (!error) {
            var pom = document.createElement('a');
            pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(result));
            pom.setAttribute('download', filename);
            if (document.createEvent) {
                var event = document.createEvent('MouseEvents');
                event.initEvent('click', true, true);
                pom.dispatchEvent(event);
            }
            else {
                pom.click();
            }
        }
    });
};

//////////////////////////////////////
//// Node Icon settings
let nodeIconVisibilityToggle = new hx.Toggle("#node-icon-visibility-toggle");
export const setNodeIconVisibility = (isVisible) => {
    nodeIconVisibilityToggle.value(isVisible);
}; // must be called from network prior to ctxt display
nodeIconVisibilityToggle.on('change', function (shouldShow) {
    let network = RDFVisualizer
        .getNetworkById(window.networkBeingModified);
    if (network) {
        network.setIconVisibilityForEntity(window.objectBeingStyled, shouldShow);
    } else {
        console.log("No network found!");
    }
});
export const showColorPicker = (event) => {
    window.pickr.show();
    d3.select(".pcr-app")
        .style("left", event.clientX + "px")
        .style("top", event.clientY + "px");
};
export const setColorPickerClr = (clr) => {
    // clr assumed to be a color in hex
    // silent mode is true so that save event is not called
    window.pickr.setColor(clr, true);
};
export const setNodeIconColor = (clr) => {
    d3.select("#node-icon-color").style("background", clr);
};
window.pickr.on("save", (color, instance) => {
    let cHex = color.toHEXA().toString();
    if (window.colorChangingOutsideNetwork) {
        d3.select("." + window.colorSelectionClass).style("background", cHex);
        if (window.colorChangingVisualization.isChangingBackgoundColor) {
            window.colorChangingVisualization.clrBackground = cHex;
        }
    } else {
        let network = RDFVisualizer
            .getNetworkById(window.networkBeingModified);
        if (network) {
            switch (network.colorChangingPart) {
                case "icon":
                    setNodeIconColor(cHex);
                    network.setIconColorForEntity(
                        window.objectBeingStyled,
                        cHex
                    );
                    break;
                case "shape":
                    setNodeSelectedColor(cHex);
                    network.setNodeColor(
                        window.objectBeingStyled,
                        cHex
                    );
                    break;
                default:
            }
        } else {
            console.log("No network found!");
        }
    }
    window.colorChangingOutsideNetwork = false;
    window.pickr.hide();
});
window.pickr.on("change",  (color, instance) => {
    let cHex = color.toHEXA().toString();
    if (window.colorChangingOutsideNetwork) {
        // TODO:
        d3.select("." + window.colorSelectionClass).style("background", cHex);
        if (window.colorChangingVisualization.isChangingBackgoundColor) {
            window.colorChangingVisualization.clrBackground = cHex;
        }
    } else {
        let type = window.objectBeingStyled;
        let network = RDFVisualizer
            .getNetworkById(window.networkBeingModified);
        if (network) {
            switch (network.colorChangingPart) {
                case "icon":
                    setNodeIconColor(cHex);
                    network.setIconColorForEntity(
                        type,
                        cHex
                    );
                    break;
                case "shape":
                    if (window.selectingColorFor === "shape") {
                        setNodeSelectedColor(cHex);
                        network.setNodeColor(
                            type,
                            cHex
                        );
                    } else if (window.selectingColorFor === "stroke") {
                        setNodeSelectedStrokeColor(cHex);
                        network.setNodeStrokeColor(
                            type,
                            cHex
                        );
                    }
                    break;
                case "edge":
                    setEdgeSelectedColor(cHex);
                    network.setLinkColor(
                        window.selectedLinkSourceType,
                        window.selectedLinkTargetType,
                        window.selectedLinkRelation,
                        cHex
                    );
                    break;
                default:
            }
        } else {
            console.log("No network found!");
        }
    }
});
//
document.getElementById("node-icon-color").addEventListener("click", (event) => {
    setColorPickerClr(d3.select("#node-icon-color").style("background"));
    showColorPicker(event);
});
//
export const setNodeIconSize = (size) => {
    d3.select("#node-icon-size-toggle")
        .property("value", size);
};
d3.select("#node-icon-size-toggle").on("input", function() {
    let type = window.objectBeingStyled;
    let network = RDFVisualizer
        .getNetworkById(window.networkBeingModified);
    if (network) {
        network.setIconSizeForEntity(type, this.value);
    } else {
        console.log("No network found!");
    }
});
export const setNodeIcon = (iconName) => {
    updateIconList("", iconName);
};
export const searchInIcons = (query) => {
    query = query.toLowerCase();
    return FONTAWESOME_ICONS.filter(
        name => {
            return name.includes(query);
        }
    );
};
export const updateIconList = (query, currentIconName = null) => {
    let iconNames = searchInIcons(query);
    let container = d3.select(".icon-selection-container");
    container.html("");
    // we add current icon first to appear on top
    let iconList = [];
    if (iconNames.includes(currentIconName)) {
        iconList.push(currentIconName);
        iconList.push(...iconNames.filter(name => name !== currentIconName));
    } else {
        iconList = iconNames;
    }
    // adding rest of icons based on query
    for (let iconName of iconList) {
        container
            .append("i")
            .attr("data", iconName)
            .classed(iconName, true)
            .classed("selected", iconName === currentIconName)
            .on("click", function() {
                container.selectAll("i").classed("selected", false);
                d3.select(this).classed("selected", true);
                let type = window.objectBeingStyled;
                let network = RDFVisualizer
                    .getNetworkById(window.networkBeingModified);
                if (network) {
                    network.setIconForEntity(
                        type,
                        iconName
                    );
                } else {
                    console.log("No network found!");
                }
            });
    }
    // returns true if any icons where found, otherwise we display an
    // empty message instead
    return iconNames.length > 0;
};
//////////////////////////////////////
//// Node settings
let nodeLabelVisibilityToggle = new hx.Toggle("#node-label-visibility-toggle");
export const setNodeLabelVisibility = (isVisible) => {
    nodeLabelVisibilityToggle.value(isVisible);
}; // must be called from network prior to ctxt display
nodeLabelVisibilityToggle.on('change', function (shouldShow) {
    let network = RDFVisualizer
        .getNetworkById(window.networkBeingModified);
    if (network) {
        network.setNodeLabelVisibility(window.objectBeingStyled, shouldShow);
    } else {
        console.log("No network found!");
    }
});
//
export const setNodeShapeSelection = (isCircle = true) => {
    d3.select("#shape-square").classed("selected", !isCircle);
    d3.select("#shape-circle").classed("selected", isCircle);
};
for (let shapeId of ["shape-square", "shape-circle"]) {
    d3.select("#" + shapeId).on("click", () => {
        let isCircle = shapeId === "shape-circle";
        setNodeShapeSelection(isCircle);
        let network = RDFVisualizer
            .getNetworkById(window.networkBeingModified);
        if (network) {
            network.setNodeShape(window.objectBeingStyled, isCircle);
        } else {
            console.log("No network found!");
        }
    });
}
//
export const setNodeSelectedColor = (clr) => {
    d3.select("#node-color").style("background", clr);
};
document.getElementById("node-color").addEventListener("click", (event) => {
    window.selectingColorFor = "shape";
    setColorPickerClr(d3.select("#node-color").style("background"));
    showColorPicker(event);
});
//
let nodeStrokeVisibilityToggle = new hx.Toggle("#stroke-visibility-toggle");
export const setNodeStrokeVisibility = (isVisible) => {
    nodeStrokeVisibilityToggle.value(isVisible);
}; // must be called from network prior to ctxt display
nodeStrokeVisibilityToggle.on('change', function (shouldShow) {
    let network = RDFVisualizer
        .getNetworkById(window.networkBeingModified);
    if (network) {
        network.setNodeStrokeVisibility(window.objectBeingStyled, shouldShow);
    } else {
        console.log("No network found!");
    }
});
//
export const setNodeStrokeStylePreview = (shape) => {
    d3.select("#node-edge-shape-dropdown")
      .select(".stroke-preview")
      .classed("dashed", false)
      .classed("solid", false)
      .classed(shape, true);
};
let nodeEdgeShapeDropdown = new hx.Dropdown("#node-edge-shape-dropdown", strokeTypesContent);
d3.select("#node-edge-shape-dropdown").on("click", () => {
    d3.selectAll("div.hx-dropdown-down .stroke-type").on("click", function() {
        let strokeStyle = d3.select(this).select(".stroke-preview")
            .attr("class")
            .split(" ").filter(x=>x!="stroke-preview")[0];
        let network = RDFVisualizer
            .getNetworkById(window.networkBeingModified);
        if (network) {
            network.setNodeStrokeShape(window.objectBeingStyled, strokeStyle);
            setNodeStrokeStylePreview(strokeStyle);
        } else {
            console.log("No network found!");
        }
        nodeEdgeShapeDropdown.hide();
    });
});
//
export const setNodeSelectedStrokeColor = (clr) => {
    d3.select("#stroke-color").style("background", clr);
};
document.getElementById("stroke-color").addEventListener("click", (event) => {
    window.selectingColorFor = "stroke";
    setColorPickerClr(d3.select("#stroke-color").style("background"));
    showColorPicker(event);
});
//
export const setNodeSelectedStrokeSize = (size) => {
    d3.select("#node-stroke-size-toggle")
        .property("value", size);
};
d3.select("#node-stroke-size-toggle").on("input", function() {
    let type = window.objectBeingStyled;
    let network = RDFVisualizer
        .getNetworkById(window.networkBeingModified);
    if (network) {
        network.setNodeStrokeSize(type, this.value);
    } else {
        console.log("No network found!");
    }
});
//
export const setNodeSelectedSize = (size) => {
    d3.select("#node-size-toggle")
        .property("value", size);
};
d3.select("#node-size-toggle").on("input", function() {
    let type = window.objectBeingStyled;
    let network = RDFVisualizer
        .getNetworkById(window.networkBeingModified);
    if (network) {
        network.setNodeSize(type, this.value);
    } else {
        console.log("No network found!");
    }
});
//
let nodeVisibilityToggle = new hx.Toggle("#node-visibility-toggle");
export const setNodeSelectedVisibility = (isVisible) => {
    nodeVisibilityToggle.value(isVisible);
}; // must be called from network prior to ctxt display
nodeVisibilityToggle.on('change', function (shouldShow) {
    let network = RDFVisualizer
        .getNetworkById(window.networkBeingModified);
    if (network) {
        network.setNodeVisibility(window.objectBeingStyled, shouldShow);
    } else {
        console.log("No network found!");
    }
});
//
export const initNodeLiteralPicker = (predicates, selected) => {
    disposeNodeLiteralPicker();
    let nodeLiteralPicker = new hx.SingleSelect('#node-literal-relation', predicates);
    nodeLiteralPicker.value(selected);
    nodeLiteralPicker.on("change", function(choice) {
        let network = RDFVisualizer
            .getNetworkById(window.networkBeingModified);
        if (network) {
            network.setNodeLabelProperty(
                window.objectBeingStyled,
                choice.value
            );
        } else {
            console.log("No network found!");
        }
    });
};
const disposeNodeLiteralPicker = () => {
    d3.select("#node-template-select-container")
      .select(".node-label-literal")
      .html("<div id=\"node-literal-relation\"></div>");
};
//
let edgeLabelVisibilityToggle = new hx.Toggle("#edge-label-visibility-toggle");
export const setEdgeLabelVisibility = (isVisible) => {
    edgeLabelVisibilityToggle.value(isVisible);
}; // must be called from network prior to ctxt display
edgeLabelVisibilityToggle.on('change', function (shouldShow) {
    let network = RDFVisualizer
        .getNetworkById(window.networkBeingModified);
    if (network) {
        network.setLinkLabelVisibility(
            window.selectedLinkSourceType,
            window.selectedLinkTargetType,
            window.selectedLinkRelation,
            shouldShow
        );
    } else {
        console.log("No network found!");
    }
});
//
let edgeVisibilityToggle = new hx.Toggle("#edge-visibility-toggle");
export const setEdgeVisibility = (isVisible) => {
    edgeVisibilityToggle.value(isVisible);
}; // must be called from network prior to ctxt display
edgeVisibilityToggle.on('change', function (shouldShow) {
    let network = RDFVisualizer
        .getNetworkById(window.networkBeingModified);
    if (network) {
        network.setLinkVisibility(
            window.selectedLinkSourceType,
            window.selectedLinkTargetType,
            window.selectedLinkRelation,
            shouldShow
        );
    } else {
        console.log("No network found!");
    }
});
//
export const setEdgeSelectedColor = (clr) => {
    d3.select("#edge-color-picker").style("background", clr);
};
document.getElementById("edge-color-picker").addEventListener("click", (event) => {
    showColorPicker(event);
});
