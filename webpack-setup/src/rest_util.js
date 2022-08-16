const axios = require('axios');
const fetch = require('node-fetch');
const hx = require("hexagon-js");
import { fetchPxioGraphDataFromTriples, loadPrototypeData } from "./data";
import { resetData } from "./index";

// axios.defaults.headers.post['Content-Type'] ='application/x-www-form-urlencoded';

export const getRepositories = () => {
    let loadingHandle = hx.notifyLoading("Fetching repositories...");
    console.log("Fetching repositories...");
    axios.get("http://localhost:8080/rdf4j-server/repositories")
        .then(response => {
            loadingHandle.close();
            // console.log(response);
            let repos = response.data.results.bindings;
            if (!repos) {
                hx.notifyNegative("Found no repositories.");
            } else {
                for (let repo of repos) {
                    hx.notifyPositive("Found repository: " + repo.id.value);
                    window.activeRepoURI = repo.uri.value;
                    // getRepositoryStatements(window.activeRepoURI);
                }
            }
        });
}

export const getRepositoryStatements = (repoUri) => {
    let loadingHandle = hx.notifyLoading("Fetching statements from ", repoUri);
    axios.get(repoUri + "/statements")
        .then(response => {
            loadingHandle.close();
            // console.log(response);
            if (response.data) {
                console.log("translating statements into triple data...");
                loadPrototypeData(response.data);
                setTimeout(() => {
                    resetData();
                }, 1500);
                // console.log(fetchPxioGraphDataFromTriples(response.data));
            }
            // let repos = response.data.results.bindings;
            // if (!repos) {
            //     hx.notifyNegative("Found no repositories.");
            // } else {
            //     for (let repo of repos) {
            //         hx.notifyPositive("Found repository: " + repo.id.value);
            //         window.activeRepoURI = repo.uri.value;
            //     }
            // }
        });
}

export const storeTurtleDataToRepo = (repoUri, turtleEncodedData) => {
    // NOTE: stores data without any contexts
    // see https://rdf4j.org/documentation/reference/rest-api/
    let loadingHandle = hx.notifyLoading("Storing data to ", repoUri);
    axios.post(
        repoUri + "/statements?context=null",
        turtleEncodedData,
        {
            headers: {
                'content-type': 'application/x-turtle'
            }
        }
    )
        .then(response => {
            loadingHandle.close();
            console.log("finished store request.");
        });
}

export const sparqlQuery = (repoUri, query) => {
    // see https://rdf4j.org/documentation/reference/rest-api/
    // const params = new URLSearchParams();
    // params.append('query', query);
    const params = {
        'query': query
    };
    axios.get(
        repoUri,
        { params },
        {
            headers: {
                // 'Host': 'localhost',
                // 'content-type': 'application/sparql-query',
                'content-type': 'application/x-www-form-urlencoded',
                'Accept': 'application/sparq-results+json',
            }
        })
        .then(response => {
            console.log("finished performing construct query.");
            console.log(response);
            if (response.data) {
                loadPrototypeData(response.data);
                setTimeout(() => {
                    resetData();
                }, 1500);
            }
        });
}
