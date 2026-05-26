"""Local smoke test for the audio handler — validation only, no GPU."""

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
    r = handler({"id": "h", "input": {"healthcheck": True}})
    print("healthcheck:", json.dumps(r, indent=2))
    assert r["status"] == "ok"
    assert "music" in r["tasks"]


def test_bad_task():
    r = handler({"id": "t", "input": {"task": "nope"}})
    assert r["error_code"] == "INVALID_INPUT"


def test_music_requires_prompt():
    r = handler({"id": "m", "input": {"task": "music"}})
    assert r["error_code"] == "INVALID_INPUT"


def test_tts_requires_text():
    r = handler({"id": "v", "input": {"task": "tts"}})
    assert r["error_code"] == "INVALID_INPUT"


def test_duration_clamp():
    p = _validate_input({"task": "music", "prompt": "lofi beats", "duration": 999})
    print("normalized:", json.dumps(p, indent=2))
    assert p["duration"] == 60


if __name__ == "__main__":
    test_healthcheck()
    test_bad_task()
    test_music_requires_prompt()
    test_tts_requires_text()
    test_duration_clamp()
    print("\n✓ All local tests passed")
