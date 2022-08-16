// initial data //////////////////
let baseNodes = [
  {id: "0", label: "Mohsen", node_type: NodeTypes.USER_NODE},
  {id: "1", label: "Alex", node_type: NodeTypes.USER_NODE},
  {id: "2", label: "Andre", node_type: NodeTypes.USER_NODE},
  {id: "3", label: "Tim", node_type: NodeTypes.USER_NODE},
  {id: "4", label: "Paul", node_type: NodeTypes.USER_NODE},
  {id: "5", label: "Dev Team", node_type: NodeTypes.GROUP_NODE},
  {id: "6", label: "Sales Group", node_type: NodeTypes.GROUP_NODE},
  {id: "7", label: "steve.pxio.local", node_type: NodeTypes.DISPLAY_NODE},
  {id: "8", label: "Alex's Display", node_type: NodeTypes.DISPLAY_NODE},
  {id: "9", label: "pompei.pxio.local", node_type: NodeTypes.DISPLAY_NODE},
  {id: "10", label: "norbert", node_type: NodeTypes.DISPLAY_NODE},
  {id: "11", label: "DG1", node_type: NodeTypes.DISPLAY_GROUP_NODE},
  {id: "12", label: "Cat Heaven", node_type: NodeTypes.PIXEL_SOURCE_NODE},
  {id: "13", label: "Demo Video 1", node_type: NodeTypes.PIXEL_SOURCE_NODE},
  {id: "14", label: "Demo Video 2", node_type: NodeTypes.PIXEL_SOURCE_NODE},
  {id: "15", label: "Tim's Screen", node_type: NodeTypes.PIXEL_SOURCE_NODE},
  {id: "16", label: "Andre's Phone", node_type: NodeTypes.PIXEL_SOURCE_NODE}
]

let baseLinks = [
    {source: "0", target: "5", link_type: LinkTypes.OWNER_OF, value: 0.1},
    {source: "4", target: "5", link_type: LinkTypes.MEMBER_OF, value: 0.1},
    {source: "7", target: "11", link_type: LinkTypes.MEMBER_OF, value: 0.2},
    {source: "8", target: "1", link_type: LinkTypes.OWNER_OF, value: 0.2},
    {source: "10", target: "1", link_type: LinkTypes.SHARED_WITH, value: 0.2}
]

let nodes = [...baseNodes]
let links = [...baseLinks]
//////////////////////////////////
