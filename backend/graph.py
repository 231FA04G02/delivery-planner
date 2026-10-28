"""
graph.py  –  City map model using NetworkX.

The city is represented as an undirected weighted graph where:
  - Nodes  = depot + delivery locations, each with (x, y) coordinates
  - Edges  = road segments with a 'distance' attribute (km)

A realistic 15-node demo map is baked in so the app works out of the box.
"""

import math
import networkx as nx


# ---------------------------------------------------------------------------
# Node catalogue  (id, label, x, y)
# ---------------------------------------------------------------------------
DEFAULT_NODES = [
    ("depot",  "Depot (HQ)",    5.0,  5.0),
    ("A",      "Alpha Mall",    2.0,  8.0),
    ("B",      "Beta Residency",8.0,  9.0),
    ("C",      "City Hospital", 1.0,  5.0),
    ("D",      "Delta Park",    3.0,  2.0),
    ("E",      "Echo Tower",    6.0,  1.0),
    ("F",      "Flora Heights", 9.0,  3.0),
    ("G",      "Grand Station", 9.0,  7.0),
    ("H",      "Harbor Wharf",  7.0, 10.0),
    ("I",      "Iris Gardens",  4.0, 10.0),
    ("J",      "Junction Cross",5.0,  7.0),
    ("K",      "Kings Plaza",   3.0,  6.0),
    ("L",      "Lotus Towers",  7.0,  5.0),
    ("M",      "Metro Square",  6.0,  8.0),
    ("N",      "North Point",   2.0,  3.0),
]

# Edge list  (u, v, distance_km)
DEFAULT_EDGES = [
    ("depot", "J",  2.2),
    ("depot", "K",  2.4),
    ("depot", "L",  2.0),
    ("depot", "E",  4.1),
    ("J",     "A",  3.6),
    ("J",     "M",  1.4),
    ("J",     "K",  1.5),
    ("K",     "A",  2.5),
    ("K",     "C",  1.8),
    ("K",     "N",  3.2),
    ("A",     "I",  2.3),
    ("A",     "C",  2.2),
    ("I",     "H",  3.1),
    ("I",     "M",  2.7),
    ("M",     "B",  1.9),
    ("M",     "H",  2.5),
    ("M",     "G",  2.2),
    ("B",     "H",  2.0),
    ("B",     "G",  1.8),
    ("G",     "L",  2.2),
    ("G",     "F",  3.5),
    ("L",     "F",  2.8),
    ("L",     "E",  3.0),
    ("F",     "E",  3.1),
    ("E",     "D",  2.5),
    ("D",     "N",  1.7),
    ("N",     "C",  2.3),
    ("C",     "depot", 4.0),
]


def build_graph(nodes=None, edges=None) -> nx.Graph:
    """Return a NetworkX Graph from node/edge lists.

    Each node carries 'x', 'y', and 'label' attributes.
    Each edge carries 'distance' and 'weight' (same value, weight needed by nx).
    """
    nodes = nodes or DEFAULT_NODES
    edges = edges or DEFAULT_EDGES

    G = nx.Graph()
    for node_id, label, x, y in nodes:
        G.add_node(node_id, label=label, x=x, y=y)

    for u, v, dist in edges:
        G.add_edge(u, v, distance=round(dist, 2), weight=round(dist, 2))

    return G


def euclidean_distance(G: nx.Graph, u: str, v: str) -> float:
    """Straight-line distance between two nodes (heuristic for A*)."""
    xu, yu = G.nodes[u]["x"], G.nodes[u]["y"]
    xv, yv = G.nodes[v]["x"], G.nodes[v]["y"]
    return math.hypot(xu - xv, yu - yv)


def graph_to_dict(G: nx.Graph) -> dict:
    """Serialise graph to a JSON-friendly dict for the frontend."""
    nodes = []
    for nid, data in G.nodes(data=True):
        nodes.append({
            "id":    nid,
            "label": data.get("label", nid),
            "x":     data["x"],
            "y":     data["y"],
        })

    edges = []
    for u, v, data in G.edges(data=True):
        edges.append({
            "source":   u,
            "target":   v,
            "distance": data["distance"],
        })

    return {"nodes": nodes, "edges": edges}
