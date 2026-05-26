"""
Local smoke test for the image handler — validation only, no GPU.

Usage:
  python test_local.py
"""

import json
import sys


class _StubServerless:
    @staticmethod
    def start(config):
        print("(stub) runpod.serverless.start called")


class _StubRunpod:
    serverless = _StubServerless()


sys.modules["runpod"] = _StubRunpod()  # type: ignore

from rp_handler import handler, _validate_input


def test_healthcheck():
    result = handler({"id": "h", "input": {"healthcheck": True}})
    print("healthcheck:", json.dumps(result, indent=2))
    assert result["status"] == "ok"
    assert "txt2img" in result["tasks"]


def test_missing_prompt():
    result = handler({"id": "p", "input": {"task": "txt2img"}})
    print("missing prompt:", result)
    assert result["error_code"] == "INVALID_INPUT"


def test_bad_task():
    result = handler({"id": "t", "input": {"task": "nope", "prompt": "x"}})
    assert result["error_code"] == "INVALID_INPUT"


def test_img2img_requires_image():
    result = handler({"id": "i", "input": {"task": "img2img", "prompt": "x"}})
    assert result["error_code"] == "INVALID_INPUT"


def test_faceswap_requires_images():
    result = handler({"id": "f", "input": {"task": "faceswap"}})
    assert result["error_code"] == "INVALID_INPUT"


def test_dimension_rounding():
    p = _validate_input({"task": "txt2img", "prompt": "a", "width": 1023, "height": 100})
    print("normalized:", json.dumps(p, indent=2))
    assert p["width"] % 8 == 0
    assert p["height"] >= 256  # clamped to MIN_DIM


def test_valid_txt2img():
    p = _validate_input(
        {"task": "txt2img", "prompt": "a cat", "seed": 7, "num_images": 2}
    )
    assert p["seed"] == 7
    assert p["num_images"] == 2


if __name__ == "__main__":
    test_healthcheck()
    test_missing_prompt()
    test_bad_task()
    test_img2img_requires_image()
    test_faceswap_requires_images()
    test_dimension_rounding()
    test_valid_txt2img()
    print("\n✓ All local tests passed")
