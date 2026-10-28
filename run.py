"""
run.py  –  Start the Delivery Route Planner server.

Usage:
    python run.py

Then open:  http://localhost:5000
"""

import sys, os

# Make sure the project root is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.app import app

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    print("\n" + "="*55)
    print("  🚀  DeliveryAI – Delivery Route Planner")
    print(f"  🌐  Open: http://localhost:{port}")
    print("="*55 + "\n")
    app.run(host="0.0.0.0", port=port, debug=True, use_reloader=False)
