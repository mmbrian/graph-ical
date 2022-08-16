# RDF Visualizer

Webpack template based on https://github.com/wbkd/webpack-starter

### Notes
1. we assume an RDF4J server is running on port 8080 on localhost.
2. at the moment, script accesses an RDF4J triple score via REST API which is by default blocked due to browser's CORS policy. a workaround
with Opera is to launch it with
```
C:\...\Opera> .\launcher.exe --disable-web-security --user-data-dir="c:\nocorsbrowserdata"
```


### Installation

```
npm install
```

### Start Dev Server

```
npm start
```

### Build Prod Version

```
npm run build
```

### Features:

* ES6 Support via [babel](https://babeljs.io/) (v7)
* SASS Support via [sass-loader](https://github.com/jtangelder/sass-loader)
* Linting via [eslint-loader](https://github.com/MoOx/eslint-loader)

When you run `npm run build` we use the [mini-css-extract-plugin](https://github.com/webpack-contrib/mini-css-extract-plugin) to move the css to a separate file. The css file gets included in the head of the `index.html`.
