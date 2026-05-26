"""
Local smoke test for the handler — runs validation logic without GPU.

Usage:
  python test_local.py
"""

import json
import sys

# Stub runpod so we don't need GPU runtime
class _StubServerless:
    @staticmethod
    def start(config):
        print("(stub) runpod.serverless.start called")

class _StubRunpod:
    serverless = _StubServerless()

sys.modules["runpod"] = _StubRunpod()  # type: ignore

from rp_handler import handler, _validate_input


def test_healthcheck():
    result = handler({"id": "test-1", "input": {"healthcheck": True}})
    print("healthcheck:", json.dumps(result, indent=2))
    assert result["status"] == "ok"


def test_missing_prompt():
    result = handler({"id": "test-2", "input": {}})
    print("missing prompt:", json.dumps(result, indent=2))
    assert result["status"] == "failed"
    assert result["error_code"] == "INVALID_INPUT"


def test_bad_size():
    result = handler({"id": "test-3", "input": {"prompt": "test", "size": "9999*9999"}})
    print("bad size:", json.dumps(result, indent=2))
    assert result["error_code"] == "INVALID_INPUT"


def test_valid_input_normalization():
    params = _validate_input({
        "prompt": "A cinematic shot",
        "negative_prompt": "blurry",
        "size": "1280*704",
        "sample_steps": 30,
        "seed": 42,
        "project_id": "proj_abc",
        "scene_id": "scene_001",
    })
    print("normalized:", json.dumps(params, indent=2))
    assert params["seed"] == 42
    assert params["project_id"] == "proj_abc"


if __name__ == "__main__":
    test_healthcheck()
    test_missing_prompt()
    test_bad_size()
    test_valid_input_normalization()
    print("\n✓ All local tests passed")
