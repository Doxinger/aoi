from ..config import BLOCKED_FILE


def blocked_keys():
    if not BLOCKED_FILE.exists():
        return []
    lines = BLOCKED_FILE.read_text(encoding="utf-8").splitlines()
    return ["s" + line.strip().lstrip("s") for line in lines if line.strip() and not line.startswith("#")]
