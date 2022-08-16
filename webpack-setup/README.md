NOTE!
This code is deprecated. further updates on the prototype are done in thesis_prototype project.


- Based on https://github.com/lifenautjoe/webpack-starter-basic
- See also https://webpack.js.org/starter-kits/
- Original demo from Mike Bostock: http://bl.ocks.org/mbostock/ad70335eeef6d167bc36fd3c04378048
- Also inspired by https://medium.com/ninjaconcept/interactive-dynamic-force-directed-graphs-with-d3-da720c6d7811 (especially for interactivity)
Modifications:
1. disjoint force-directed layout. see https://observablehq.com/@d3/disjoint-force-directed-graph?collection=@d3/d3-force
2. added fisheye feature. see https://observablehq.com/@maliky/force-directed-graph-a-to-z
 2.1 for better fisheye see https://observablehq.com/@benmaier/a-visually-more-appealing-fisheye-function
3. added collision detection so that nodes do not collide. see https://bl.ocks.org/d3indepth/9d9f03a0016bc9df0f13b0d52978c02f
4. added label support
 4.1 made node size adjust to label size.
 4.2 for styling labels see http://tutorials.jenkov.com/svg/text-element.html
5. added selection highlight support:
 - highlights immediate neighborhood and defocuses rest
 - selecting outside nodes deselects all
 - only node selection so far
6. added initial dynamic graph rendering support
 - node selection renders subgraph that is immediate neighbourhood of selected node
 - selecting same node will reset the view back to original graph
7. added UI to add edges
 - can add edges between any two existing nodes
 - removed drag/move to support edge addition by drag
 - adding edge uses an rxjs observable that updates UI accordingly
8. added basic types and styling for nodes and edges based on types
 - see https://coolors.co/ for generating color palettes
9. now selecting node only higlights neighborhood and double click switches to neighborhood view
10. remove fisheye
11. added node clustering:
 - isolated nodes of the same kind are clustered if they are more than 1
 - when adding edges, a cluster node will expand once targeted into all its isolated parts, after drag operation is done, nodes are clustered again
12. adjusted collision radius based on node radius also after updates
13. made addEdge type-aware. will assign the correct type to a link
14. added validation to add edge to prevent adding edges when it makes no sense
 - for now this still allows UI action and only logs an error and prevents update
 - same-node links can later be used to create groups/scenarios/...
15. added webpack + dev-server support and modularized current code
16. added hexagonjs and font-awesome
17. fixed logged in user node at the center and styled it differently

* Important TODO:
1. extend selection logic to use context when selecting a neighbourhood this means for instance when selecting a pixel source that is connected to a display or display group, the user node initiating that projection needs to be highlighted as well which is probably not a neighbour.
2. layouting strategy needs to be fixed. if dagre works well this can all be moved to vuejs and use dagger to update positions.
3. fix build

* TODO:
1. set max size for nodes and trim labels if they exceed that size
