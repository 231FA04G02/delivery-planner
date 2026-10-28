"""
planner.py  –  Delivery route planning agent.

Stage 1 : Nearest-neighbour heuristic builds an initial visit order that
          respects vehicle capacity and (soft) time windows.

Stage 2 : 2-opt local search iteratively reverses sub-sequences of the route
          to reduce total road distance.

Constraints modelled
---------------------
  - Vehicle capacity  : cumulative package weight <= capacity
  - Time windows      : [earliest, latest] arrival at each stop (soft – a
                        'penalty' is tracked but the planner still delivers)
  - Priority          : high-priority stops are attempted before low-priority
                        ones when distances are similar (priority tie-breaking)

Output
------
A plan dict containing:
  route          : ordered list of node IDs (depot -> stops -> depot)
  stops          : list of stop detail dicts
  total_distance : float
  tw_violations  : int   (number of time-window breaches)
  improvement_pct: float (distance saved vs. unoptimised order)
  unoptimised_distance: float
"""

import math
import time
from dataclasses import dataclass, field
from typing import List, Optional

import networkx as nx
from .search import astar


# ---------------------------------------------------------------------------
# Data model for a delivery task
# ---------------------------------------------------------------------------

@dataclass
class DeliveryTask:
    node_id:   str
    label:     str
    earliest:  float          # minutes from 08:00
    latest:    float          # minutes from 08:00
    priority:  int            # 1 = high, 2 = medium, 3 = low
    weight:    float          # kg

    @property
    def priority_label(self):
        return {1: "High", 2: "Medium", 3: "Low"}.get(self.priority, "Normal")


# ---------------------------------------------------------------------------
# Helper: road distance between two nodes via A*
# ---------------------------------------------------------------------------

def _road_dist(G: nx.Graph, u: str, v: str) -> float:
    result = astar(G, u, v)
    return result["distance"] if result["path"] else float("inf")


def _road_path(G: nx.Graph, u: str, v: str) -> list:
    result = astar(G, u, v)
    return result["path"]


# ---------------------------------------------------------------------------
# Nearest-neighbour greedy construction
# ---------------------------------------------------------------------------

def nearest_neighbour(G: nx.Graph, tasks: List[DeliveryTask],
                      capacity: float, depot: str = "depot") -> dict:
    """
    Build initial delivery order greedily.
    Returns visit_order (list of DeliveryTask, sorted by visit sequence).
    """
    unvisited = sorted(tasks, key=lambda t: (t.priority, 0))  # priority-first
    visited   = []
    current   = depot
    load      = 0.0
    clock     = 0.0   # minutes since 08:00

    while unvisited:
        # Filter tasks that fit in remaining capacity
        feasible = [t for t in unvisited if load + t.weight <= capacity]
        if not feasible:
            break  # capacity exceeded – remaining tasks can't be loaded

        # Pick nearest feasible task; break ties by priority then earliest TW
        def score(t):
            d = _road_dist(G, current, t.node_id)
            return (d, t.priority, t.earliest)

        chosen = min(feasible, key=score)
        visited.append(chosen)
        unvisited.remove(chosen)

        travel  = _road_dist(G, current, chosen.node_id)
        clock  += travel * 6   # assume avg 10 km/h -> 1 km = 6 min
        clock   = max(clock, chosen.earliest)   # wait if arrived too early
        load   += chosen.weight
        current = chosen.node_id

    return visited


# ---------------------------------------------------------------------------
# Compute total route distance  (depot -> s0 -> s1 -> ... -> depot)
# ---------------------------------------------------------------------------

def _route_distance(G: nx.Graph, order: list, depot: str = "depot") -> float:
    if not order:
        return 0.0
    nodes = [depot] + [t.node_id for t in order] + [depot]
    total = 0.0
    for i in range(len(nodes) - 1):
        total += _road_dist(G, nodes[i], nodes[i + 1])
    return total


# ---------------------------------------------------------------------------
# 2-opt local search
# ---------------------------------------------------------------------------

def two_opt(G: nx.Graph, order: list, depot: str = "depot",
            max_iter: int = 500) -> list:
    """
    Repeatedly reverse sub-sequences of the delivery order when it reduces
    total distance.  Returns improved order.
    """
    best   = list(order)
    best_d = _route_distance(G, best, depot)
    improved = True
    iterations = 0

    while improved and iterations < max_iter:
        improved = False
        iterations += 1
        for i in range(len(best) - 1):
            for j in range(i + 2, len(best)):
                new_order = best[:i] + list(reversed(best[i:j])) + best[j:]
                new_d     = _route_distance(G, new_order, depot)
                if new_d < best_d - 1e-6:
                    best   = new_order
                    best_d = new_d
                    improved = True

    return best


# ---------------------------------------------------------------------------
# Build the final plan with arrival times and TW violations
# ---------------------------------------------------------------------------

def build_plan(G: nx.Graph, order: list, depot: str = "depot") -> dict:
    """
    Walk the optimised route, compute arrival times and flag TW violations.
    Returns full plan dict.
    """
    stops    = []
    clock    = 0.0   # minutes from 08:00
    current  = depot
    total_d  = 0.0
    tw_viol  = 0

    for task in order:
        d      = _road_dist(G, current, task.node_id)
        path   = _road_path(G, current, task.node_id)
        travel = d * 6            # 10 km/h -> 6 min/km
        clock += travel
        total_d += d

        arrival_min = clock
        arrival_hr  = 8 + arrival_min / 60
        h = int(arrival_hr)
        m = int((arrival_hr - h) * 60)
        arrival_str = f"{h:02d}:{m:02d}"

        on_time = task.earliest <= arrival_min <= task.latest
        if not on_time:
            tw_viol += 1

        # Service time – wait if early, don't time-travel if late
        clock = max(clock, task.earliest) + 5   # 5-min service

        stops.append({
            "node_id":       task.node_id,
            "label":         task.label,
            "arrival":       arrival_str,
            "arrival_min":   round(arrival_min, 1),
            "earliest":      task.earliest,
            "latest":        task.latest,
            "on_time":       on_time,
            "priority":      task.priority_label,
            "weight_kg":     task.weight,
            "segment_dist":  round(d, 2),
            "segment_path":  path,
        })
        current = task.node_id

    # Return to depot
    d_ret    = _road_dist(G, current, depot)
    total_d += d_ret

    return {
        "stops":          stops,
        "total_distance": round(total_d, 2),
        "tw_violations":  tw_viol,
        "return_dist":    round(d_ret, 2),
    }


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def plan_route(G: nx.Graph, tasks_raw: list, capacity: float,
               depot: str = "depot") -> dict:
    """
    Full pipeline: parse tasks -> NN construction -> 2-opt -> build plan.

    tasks_raw : list of dicts with keys:
        node_id, label, earliest, latest, priority, weight
    capacity  : max vehicle load (kg)
    """
    t0 = time.perf_counter()

    tasks = [DeliveryTask(**t) for t in tasks_raw]

    # Unoptimised baseline (input order, no 2-opt)
    baseline_d = _route_distance(G, tasks, depot)

    # Stage 1: greedy nearest-neighbour
    nn_order = nearest_neighbour(G, tasks, capacity, depot)

    # Stage 2: 2-opt improvement
    opt_order = two_opt(G, nn_order, depot)

    # Build detailed plan
    plan  = build_plan(G, opt_order, depot)
    exec_time = (time.perf_counter() - t0) * 1000

    improvement = 0.0
    if baseline_d > 0:
        improvement = round((1 - plan["total_distance"] / baseline_d) * 100, 1)

    plan["unoptimised_distance"] = round(baseline_d, 2)
    plan["improvement_pct"]      = improvement
    plan["exec_time_ms"]         = round(exec_time, 2)
    plan["capacity"]             = capacity
    plan["tasks_scheduled"]      = len(plan["stops"])
    plan["tasks_total"]          = len(tasks)

    # Full route node list for map drawing
    route_nodes = ["depot"]
    for s in plan["stops"]:
        route_nodes.append(s["node_id"])
    route_nodes.append("depot")
    plan["route_nodes"] = route_nodes

    return plan
