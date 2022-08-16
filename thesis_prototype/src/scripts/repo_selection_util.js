// const hx = require("hexagon-js");
// import * as d3 from "d3";
// import {
//   getRepositoryNamespaces,
//   getRepositoryTypes,
//   RDF_SERVER_URL
// } from "./rest_util";
// import { initAddUserDOM } from "./add_visualization";
//
// export const getAllRepositories = () => {
//     window.repositories = {};
//     console.log("Fetching repositories........");
//     return new Promise(async function(resolve, reject) {
//         let loadingHandle = hx.notifyLoading("Fetching repositories...");
//         console.log("Fetching repositories...");
//         axios.get(RDF_SERVER_URL + "/repositories")
//             .then(async (response) => {
//                 loadingHandle.close();
//                 let repos = response.data.results.bindings;
//                 if (!repos) {
//                     hx.notifyNegative("Found no repositories.");
//                 } else {
//                     for (let repo of repos) {
//                         hx.notifyPositive("Found repository: " + repo.id.value);
//                         window.repositories[repo.id.value] = repo.uri.value;
//                     }
//                     console.log("fetched repositories........");
//                     setupRepositorySelectionUI();
//                 }
//                 resolve();
//             });
//     });
// };
//
// export const selectRepository = (repoUri) => {
//     return new Promise(async function(resolve, reject) {
//         window.activeRepoURI = repoUri;
//         await getRepositoryNamespaces(repoUri);
//         await getRepositoryTypes(repoUri);
//         resolve();
//     });
// };
//
// const setupRepositorySelectionUI = () => {
//     // NOTE: has to be called after repository data is fetched
//     if (window.selectRepoClickEvent) {
//         document.getElementById('select-repository').removeEventListener(
//             'click',
//             window.selectRepoClickEvent,
//             false
//         );
//     } else {
//         window.selectRepoClickEvent = async () => {
//             d3.select("#repository-list").remove();
//             d3.select("body").append("div").attr("id", "repository-list");
//             let modalContentContainer = d3.select("#repository-list")
//                 .append("div")
//                 .classed("repository-info", true);
//             for (let repo in window.repositories) {
//                 let repoItem = modalContentContainer.append("div")
//                     .classed("repo-item", true);
//                 repoItem
//                     .append("span")
//                     .text(repo);
//                 repoItem.on("click", async () => {
//                     // TODO: select repo and update UI accordingly
//                     await selectRepository(window.repositories[repo]);
//                     initAddUserDOM();
//                 });
//             }
//             let footer = d3.select("body")
//                 .append("div")
//                 .classed("select_repo_modal_footer", true);
//             footer.append("button")
//                 .classed("hx-btn hx-secondary", true)
//                 .attr("id", "cancel-select-repo")
//                 .text("Cancel");
//             hx.select('#cancel-select-repo').on('click', function(){
//                 modal.close();
//             });
//             let modal = hx.modalCenter({
//                 title: 'Select a RDF repository',
//                 renderBody: () => hx.select("#repository-list"),
//                 renderFooter: thisModal => hx.select(".select_repo_modal_footer")
//             });
//         };
//     }
//     document.getElementById('select-repository').addEventListener('click', window.selectRepoClickEvent);
// };
