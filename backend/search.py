"""
search.py  –  Shortest-path algorithms.

Three algorithms are implemented and compared:
  1. A*          – informed search with straight-line-distance heuristic
  2. BFS         – uninformed breadth-first search (treats all edges equal)
  3. Dijkstra    – uniform-cost search (uses edge weights)

Each function returns a SearchResult dict:
  {
    "algorithm":     str,
    "path":          list[str],          # ordered node IDs
    "distance":      float,              # total road distance
    "nodes_explored":int,                # states popped from the frontier
    "exec_time_ms":  float,
  }
"""

import heapq
import time
import math
from collections import deque

import networkx as nx
from .graph import euclidean_distance


# ---------------------------------------------------------------------------
# A*  (informed search)
# ---------------------------------------------------------------------------

def astar(G: nx.Graph, source: str, target: str) -> dict:
    """A* with straight-line-distance heuristic h(n) = euclid(n, target)."""
    start_time = time.perf_counter()

    # (f, g, node, path)
    open_heap = []
    h0 = euclidean_distance(G, source, target)
    heapq.heappush(open_heap, (h0, 0.0, source, [source]))

    visited = {}          # node → best g found so far
    nodes_explored = 0

    while open_heap:
        f, g, node, path = heapq.heappop(open_heap)
        nodes_explored += 1

        # Skip if we already found a cheaper path to this node
        if node in visited and visited[node] <= g:
            continue
        visited[node] = g

        if node == target:
            elapsed = (time.perf_counter() - start_time) * 1000
            return {
                "algorithm":      "A*",
                "path":           path,
                "distance":       round(g, 3),
                "nodes_explored": nodes_explored,
                "exec_time_ms":   round(elapsed, 4),
            }

        for neighbour in G.neighbors(node):
            edge_w = G[node][neighbour]["distance"]
            g_new  = g + edge_w
            h_new  = euclidean_distance(G, neighbour, target)
            f_new  = g_new + h_new
            if neighbour not in visited or visited[neighbour] > g_new:
                heapq.heappush(open_heap, (f_new, g_new, neighbour, path + [neighbour]))

    elapsed = (time.perf_counter() - start_time) * 1000
    return {
        "algorithm":      "A*",
        "path":           [],
        "distance":       float("inf"),
        "nodes_explored": nodes_explored,
        "exec_time_ms":   round(elapsed, 4),
    }


# ---------------------------------------------------------------------------
# BFS  (uninformed – ignores edge weights, finds fewest-hop path)
# ---------------------------------------------------------------------------

def bfs(G: nx.Graph, source: str, target: str) -> dict:
    """BFS: fewest-hop path; total distance computed afterwards."""
    start_time = time.perf_counter()

    queue   = deque([(source, [source])])
    visited = {source}
    nodes_explored = 0

    while queue:
        node, path = queue.popleft()
        nodes_explored += 1

        if node == target:
            dist = sum(
                G[path[i]][path[i + 1]]["distance"]
                for i in range(len(path) - 1)
            )
            elapsed = (time.perf_counter() - start_time) * 1000
            return {
                "algorithm":      "BFS",
                "path":           path,
                "distance":       round(dist, 3),
                "nodes_explored": nodes_explored,
                "exec_time_ms":   round(elapsed, 4),
            }

        for neighbour in G.neighbors(node):
            if neighbour not in visited:
                visited.add(neighbour)
                queue.append((neighbour, path + [neighbour]))

    elapsed = (time.perf_counter() - start_time) * 1000
    return {
        "algorithm":      "BFS",
        "path":           [],
        "distance":       float("inf"),
        "nodes_explored": nodes_explored,
        "exec_time_ms":   round(elapsed, 4),
    }


# ---------------------------------------------------------------------------
# Dijkstra  (uninformed but weight-aware)
# ---------------------------------------------------------------------------

def dijkstra(G: nx.Graph, source: str, target: str) -> dict:
    """Dijkstra's algorithm – manually implemented for node-count tracking."""
    start_time = time.perf_counter()

    # (cost, node, path)
    heap = [(0.0, source, [source])]
    dist_map = {}
    nodes_explored = 0

    while heap:
        cost, node, path = heapq.heappop(heap)
        nodes_explored += 1

        if node in dist_map:
            continue
        dist_map[node] = cost

        if node == target:
            elapsed = (time.perf_counter() - start_time) * 1000
            return {
                "algorithm":      "Dijkstra",
                "path":           path,
                "distance":       round(cost, 3),
                "nodes_explored": nodes_explored,
                "exec_time_ms":   round(elapsed, 4),
            }

        for neighbour in G.neighbors(node):
            if neighbour not in dist_map:
                new_cost = cost + G[node][neighbour]["distance"]
                heapq.heappush(heap, (new_cost, neighbour, path + [neighbour]))

    elapsed = (time.perf_counter() - start_time) * 1000
    return {
        "algorithm":      "Dijkstra",
        "path":           [],
        "distance":       float("inf"),
        "nodes_explored": nodes_explored,
        "exec_time_ms":   round(elapsed, 4),
    }


# ---------------------------------------------------------------------------
# Compare all three
# ---------------------------------------------------------------------------

def compare_all(G: nx.Graph, source: str, target: str) -> dict:
    """Run A*, BFS, and Dijkstra and return a side-by-side comparison."""
    results = {
        "astar":    astar(G, source, target),
        "bfs":      bfs(G, source, target),
        "dijkstra": dijkstra(G, source, target),
    }

    # Add node labels to paths for easier display
    for algo_result in results.values():
        algo_result["path_labels"] = [
            G.nodes[n].get("label", n) for n in algo_result["path"]
        ]

    return results
