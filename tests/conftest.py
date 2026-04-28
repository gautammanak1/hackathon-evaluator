import sys
from pathlib import Path

_root = Path(__file__).resolve().parents[1]
_backend = _root / "backend"
if str(_backend) not in sys.path:
    sys.path.insert(0, str(_backend))
