# Welcome to Graph-ical!

Here you can learn how to use Graph-ical. a prototype application which was part of my Master thesis titled 'Domain-Independent and Customizable User Interface Builder for RDF Data'


## Quick Demo

There is a live version of Graph-ical available at
http://138.197.181.155
This version is a static Single Page Application working with a remove RDF4J repository at http://138.197.181.155:8080/rdf4j-workbench/repositories/NONE/repositories

All you need is to add your own RDF data by creating a new repository.


### Local Setup
In order to be able to run Graph-ical locally you need to first setup an RDF4J server on the default 8080 port. there are multiple ways you can do this

### Docker
There exists a docker container at https://hub.docker.com/r/eclipse/rdf4j-workbench where you can also find all the relevant details how to set it up .

### Local Webserver Setup
Alternatively you may setup an RDF4J Server and Workbench using Apache Tomcat webserver. Here https://rdf4j.org/documentation/tools/server-workbench/ you can find all the relevant information on how to set it up.

Once you have your local repository set up all you need to do is to go to

    src/scripts/rest_util.js

And comment and uncomment lines 18 and 17 respectively.

### Running Graph-ical from Source Code
Make sure you have node v10.0.0 installed. If you have other versions of node then the recommended approach is to use Node Version Manager (nvm) and switch to this version of node. You can find out how to do this from https://github.com/nvm-sh/nvm

Once nvm is installed simply run

    nvm install 10.0.0
    nvm use 10.0.0

Once node v10 is setup, go to

    thesis_prototype/

(where package.json resides) and run

    npm install 
    npm run start

Alternatively you can also build the project and host the build project locally. to this end first build the project via

    npm run build

Then from a console at 

    thesis_prototype/build

And provided you have Python installed run 

-   Python 2 —  `python -m SimpleHTTPServer 8000`
-   Python 3 —  `python -m http.server 8000

This should be sufficient in order to be able to access Graph-ical. you might have to be able to run your browser in no CORS mode in case RDF4J is not properly set up wrt to CORS policy. If you are using a Chromium based browser this is done via passing the following argument when running the browser

     --disable-web-security

To play around with custom data you may check out the repositories at http://138.197.181.155:8080/rdf4j-workbench/repositories/NONE/repositories
You can export those repositories from RDF4J workbench and import the triple into a local repository of your own.

The workflow for using Graph-ical is partly described in my thesis document. A more in-depth document covering all features (features to come in the future!) is a work in progress which I will provide here once it is ready.

## NOTE
Current version of Graph-ical (v0.9) is still beta and prone to bugs and errors. It is to be used as a prototype and not at all in a production environment. Also certain features discussed in the thesis document are either disabled or belong to older iterations of the software.

Also this project and the latest version of this document are currently hosted publicly at https://github.com/mmbrian/graph-ical and will receive updates in the same repository.