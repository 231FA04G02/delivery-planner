"""
app.py  –  Flask API server for the Delivery Route Planner.

All graph data (nodes + edges), tasks, and capacity are supplied by the
client at request time.  No hardcoded defaults exist.

Endpoints
---------
POST /api/search   Run A*, BFS, Dijkstra on a user-supplied graph
POST /api/plan     Full planning pipeline on a user-supplied graph
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, jsonify, request
from flask_cors import CORS

from backend.graph   import build_graph, graph_to_dict
from backend.search  import compare_all
from backend.planner import plan_route

app = Flask(__name__, static_folder="../frontend", static_url_path="")
CORS(app)


# ---------------------------------------------------------------------------
# Serve the frontend SPA
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return app.send_static_file("index.html")


# ---------------------------------------------------------------------------
# Helper – build a NetworkX graph from the request payload
# ---------------------------------------------------------------------------

def _graph_from_payload(data: dict):
    """
    Expect:
      nodes: [ {id, label, x, y}, … ]
      edges: [ {source, target, distance}, … ]
    Returns (G, error_string_or_None)
    """
    raw_nodes = data.get("nodes", [])
    raw_edges = data.get("edges", [])

    if len(raw_nodes) < 2:
        return None, "At least 2 nodes are required."
    if len(raw_edges) < 1:
        return None, "At least 1 edge is required."

    node_tuples = []
    for n in raw_nodes:
        try:
            node_tuples.append((
                str(n["id"]),
                str(n.get("label", n["id"])),
                float(n["x"]),
                float(n["y"]),
            ))
        except (KeyError, ValueError) as e:
            return None, f"Invalid node data: {e}"

    edge_tuples = []
    for e in raw_edges:
        try:
            edge_tuples.append((
                str(e["source"]),
                str(e["target"]),
                float(e["distance"]),
            ))
        except (KeyError, ValueError) as ex:
            return None, f"Invalid edge data: {ex}"

    node_ids = {t[0] for t in node_tuples}
    for u, v, _ in edge_tuples:
        if u not in node_ids:
            return None, f"Edge references unknown node '{u}'."
        if v not in node_ids:
            return None, f"Edge references unknown node '{v}'."

    G = build_graph(node_tuples, edge_tuples)
    return G, None


# ---------------------------------------------------------------------------
# API: path search comparison
# ---------------------------------------------------------------------------

@app.route("/api/search", methods=["POST"])
def api_search():
    data = request.get_json(force=True)

    G, err = _graph_from_payload(data)
    if err:
        return jsonify({"error": err}), 400

    source = str(data.get("source", ""))
    target = str(data.get("target", ""))

    if not source or source not in G.nodes:
        return jsonify({"error": f"Source node '{source}' not found."}), 400
    if not target or target not in G.nodes:
        return jsonify({"error": f"Target node '{target}' not found."}), 400
    if source == target:
        return jsonify({"error": "Source and target must be different."}), 400

    results = compare_all(G, source, target)

    for algo_result in results.values():
        algo_result["path_coords"] = [
            {
                "x":     G.nodes[n]["x"],
                "y":     G.nodes[n]["y"],
                "id":    n,
                "label": G.nodes[n].get("label", n),
            }
            for n in algo_result["path"]
        ]

    results["graph"] = graph_to_dict(G)
    return jsonify(results)


# ---------------------------------------------------------------------------
# API: full delivery plan
# ---------------------------------------------------------------------------

@app.route("/api/plan", methods=["POST"])
def api_plan():
    data = request.get_json(force=True)

    G, err = _graph_from_payload(data)
    if err:
        return jsonify({"error": err}), 400

    tasks    = data.get("tasks", [])
    capacity = float(data.get("capacity", 50.0))
    depot    = str(data.get("depot", ""))

    if not depot or depot not in G.nodes:
        return jsonify({"error": f"Depot node '{depot}' not found in graph."}), 400
    if not tasks:
        return jsonify({"error": "No delivery tasks provided."}), 400

    for t in tasks:
        nid = t.get("node_id", "")
        if nid not in G.nodes:
            return jsonify({"error": f"Task node '{nid}' not found in graph."}), 400

    try:
        plan = plan_route(G, tasks, capacity, depot)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    plan["graph"] = graph_to_dict(G)
    return jsonify(plan)


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_ENV", "development") != "production"
    app.run(host="0.0.0.0", port=port, debug=debug)
