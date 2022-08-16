require("./style.scss");
import * as d3 from "d3";
const hx = require("hexagon-js");
const N3 = require('n3');
const { DataFactory } = N3;
const { namedNode, literal, quad } = DataFactory;
import {
  addTemplatePrefix,
} from "../../visualizations/BaseVisualization";
import { shortenWithPrefix } from "../data";

const TEMPLATE_PERSONA_SPECS = "persona_stats";

// TODO
// 1. integrate into visualizations and tabs i.e.
//   > tabs or subtabs can be limited to certain personas
//   > visualizations can also be limited to certain personas

export class PersonaManager {
  constructor() {
    this.personas = {
      // admin: "Admin User",
      // user: "End-User"
    };
    // rdfContext used for storing/loading persona info from a template
    this.rdfContext = namedNode(addTemplatePrefix("persona_info"));
    // setting up singleton
    if (!PersonaManager.getInstance) {
      PersonaManager.getInstance = () => this; // one instance is globally accessible
    }
    // future instances are ignored by getInstance
  }

  addPersona(id, label) {
    if (id in this.personas) {
      console.log("Persona with this id already exists.");
      // persona id must be unique
      return;
    }
    if (label && label.length > 0) {
      // assign label to this persona id e.g. personas["admin"] = "Pxio Admin"
      this.personas[id] = label;
    } else {
      console.log("Invalid persona label.");
    }
  }

  editPersonaLabel(id, newLabel) {
    if (id in this.personas && newLabel && newLabel.length > 0) {
      this.personas[id] = newLabel;
    } else {
      console.log("Persona with this id does not exist or invalid label.");
    }
  }

  removePersona(id) {
    delete this.personas[id];
  }

  getSerializedPersonaInfo(id) {
    if (id in this.personas) {
      return id + "|" + this.personas[id];
    } else {
      console.log("Persona with this id does not exist.");
      return "";
    }
  }

  deserializePersonaInfo(persona_info) {
    let ind = persona_info.indexOf("|");
    if (ind > 0) {
      return {
        id: persona_info.substring(0, ind),
        label: persona_info.substring(ind+1)
      };
    } else {
      console.log("Invalid persona info.");
      return undefined;
    }
  }

  getTemplateRDF() {
    // returns RDF graph containing info about personas that can be stored along
    // with a template. this is basically their id and associated label info
    let quads = [];
    // first we store how many personas we have
    quads.push(quad(
      namedNode(addTemplatePrefix(TEMPLATE_PERSONA_SPECS)),
      namedNode(addTemplatePrefix("count")),
      literal(Object.keys(this.personas).length),
      this.rdfContext
    ));
    // now for each persona we store label and id
    for (let pid in this.personas) {
      quads.push(quad(
        namedNode(addTemplatePrefix(TEMPLATE_PERSONA_SPECS)),
        namedNode(addTemplatePrefix("hasPersona")),
        literal(this.getSerializedPersonaInfo(pid)),
        this.rdfContext
      ));
    }
    return quads;
  }

  loadFromTemplate(quads) {
    // given template RDF graph, loads any persona information contained in the
    // graph
    this.personas = {};
    return new Promise((resolve, reject) => {
      let personaQuads = quads.filter(q => q.graph.id === this.rdfContext.id);
      if (personaQuads.length > 0) {
        let personaCount = personaQuads.find(q => q.predicate.id === addTemplatePrefix("count"))
          .object.value;
        let personaInfoQuads = personaQuads.filter(q => q.predicate.id === addTemplatePrefix("hasPersona"));
        for (let pInfo of personaInfoQuads.map(q => q.object.value)) {
          let info = this.deserializePersonaInfo(pInfo);
          if (info) {
            this.addPersona(info.id, info.label);
            this.selectedPersona = info.id;
          }
        }
      }
      resolve();
    });
  }

  onSelectedPersonaView(pid) {
    this.selectedPersona = pid;
    // TODO: use this.selectedPersona to adapt visualizations
  }

  onPersonaManagerRequested() {
    let _self = this;
    this.container_id = "persona-list";
    d3.select("#" + this.container_id).remove();
    d3.select("body").append("div").attr("id", this.container_id);
    this.modalContentContainer = d3.select("#" + this.container_id)
        .append("div")
        .classed("persona-info", true);
    for (let pid in this.personas) {
      let pItem = this.modalContentContainer.append("div")
        .classed("persona-item", true);
      let idViewContainer = pItem
        .append("div")
        .classed("id-container", true);
      idViewContainer
          .append("span")
          .classed("id", true)
          .text(pid);
      idViewContainer
          .append("i")
          .classed("fa fa-eye hidden view-indicator", true)
          .classed("hidden", this.selectedPersona !== pid)
          .attr('title', 'Currently viewing as this persona');
      pItem
        .on('click', () => {
          this.modalContentContainer.selectAll('i.view-indicator').classed('hidden', true);
          idViewContainer.select('i.view-indicator').classed('hidden', false);
          this.onSelectedPersonaView(pid);
        });
      let labelContainer = pItem
          .append('div')
          .classed('label-container', true);
      labelContainer
        .append("span")
        .classed("label", true)
        .text(this.personas[pid]);
      labelContainer
        .append("input")
        .classed("label-input hidden", true)
        .property('value', this.personas[pid]);
      pItem
          .append("i")
          .classed("fa fa-edit persona-edit-btn", true)
          .on('click', function () {
            let self = d3.select(this);
            let isEditing = self.classed('fa-check');
            let parent = d3.select(this.parentNode);
            parent.select('input.label-input').classed('hidden', isEditing);
            parent.select('span.label').classed('hidden', !isEditing);
            self.classed('fa-edit', isEditing).classed('fa-check', !isEditing);
            if (!isEditing) {
            } else {
              // edit persona label
              let newLabel = parent.select('input.label-input').property('value');
              _self.editPersonaLabel(pid, newLabel);
              parent.select('span.label').text(newLabel);
            }
          });
      pItem
          .append("i")
          .classed("fa fa-trash persona-remove-btn", true)
          .on('click', () => {
            // remove persona with pid
            this.removePersona(pid);
            // need to re-render modal
            this.modal.close();
            this.onPersonaManagerRequested();
          });
    }
    let addPersonaItem = this.modalContentContainer.append("div")
      .classed("add-persona-item", true);
    // contains two parts > add button and when clicked two inputs that are
    // rendered instead of the button with a confirm button to add. so at any
    // time only one of these two states is visible.
    // 1. add button state
    let addPersonaBtnContainer = addPersonaItem.append("div")
      .classed("add-persona-btn", true);
    addPersonaBtnContainer.append('i').classed("fa fa-plus", true);
    addPersonaBtnContainer.append("span").classed("label", true).text("Add New Persona");
    addPersonaBtnContainer.on('click', () => {
      addPersonaBtnContainer.classed('hidden', true);
      addNewPersonaInfoContainer.classed('hidden', false);
    });
    // 2. adding new persona state
    let addNewPersonaInfoContainer = addPersonaItem.append("div")
      .classed("add-persona-info hidden", true);
    let idInput = addNewPersonaInfoContainer.append("input")
      .attr('placeholder', "Tag")
      .classed("persona-id", true);
    let labelInput = addNewPersonaInfoContainer.append("input")
      .attr('placeholder', "Label")
      .classed("persona-label", true);
    let confirmBtn = addNewPersonaInfoContainer.append("div")
      .classed("add-persona-confirm", true);
    confirmBtn.append('i').classed('fa fa-check', true);
    confirmBtn.on('click', () => {
      addPersonaBtnContainer.classed('hidden', false);
      addNewPersonaInfoContainer.classed('hidden', true);
      console.log("Adding new persona: " + idInput.property('value') + " " + labelInput.property('value'));
      this.addPersona(idInput.property('value'), labelInput.property('value'));
      // to update UI we close and re-open the modal
      this.modal.close();
      this.onPersonaManagerRequested();
    });
    let cancelBtn = addNewPersonaInfoContainer.append("div")
      .classed("add-persona-cancel", true);
    cancelBtn.append('i').classed('fa fa-times', true);
    cancelBtn.on('click', () => {
      addPersonaBtnContainer.classed('hidden', false);
      addNewPersonaInfoContainer.classed('hidden', true);
    });
    //
    // d3.select("body").select(".add_new_persona_footer").remove();
    // let footer = d3.select("body").append("div")
    //   .classed("add_new_persona_footer", true);
    // footer.append("button")
    //     .classed("hx-btn hx-secondary", true)
    //     .attr("id", "cancel-select-persona")
    //     .text("Cancel");
    // hx.select('#cancel-select-persona').on('click', function(){
    //     this.modal.close();
    // });
    this.modal = hx.modalRight({
        title: 'Manage Personas',
        renderBody: () => hx.select("#" + this.container_id),
        // renderFooter: thisModal => hx.select(".add_new_persona_footer")
    });
  }
}

window.personaManager = new PersonaManager();
// can also be accessed via PersonaManager.getInstance()
// only instantiation is required, not storing the reference
