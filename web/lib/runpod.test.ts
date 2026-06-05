import { describe, it, expect } from "vitest";
import { mapRunpodStatus, isRetryable } from "./runpod";

describe("mapRunpodStatus", () => {
  it("maps each RunPod lifecycle status to our internal job status", () => {
    expect(mapRunpodStatus("IN_QUEUE")).toBe("queued");
    expect(mapRunpodStatus("IN_PROGRESS")).toBe("in_progress");
    expect(mapRunpodStatus("COMPLETED")).toBe("completed");
    expect(mapRunpodStatus("TIMED_OUT")).toBe("timed_out");
    expect(mapRunpodStatus("CANCELLED")).toBe("canceled");
    expect(mapRunpodStatus("FAILED")).toBe("failed");
  });

  it("treats unknown statuses as failed (fail closed)", () => {
    expect(mapRunpodStatus("SOMETHING_NEW")).toBe("failed");
    expect(mapRunpodStatus("")).toBe("failed");
  });
});

describe("isRetryable", () => {
  it("retries transient worker error codes", () => {
    for (const code of [
      "SUBPROCESS_ERROR",
      "NO_OUTPUT",
      "GENERATION_FAILED",
      "TIMEOUT",
    ]) {
      expect(isRetryable(code)).toBe(true);
    }
  });

  it("does not retry fatal, unknown, or missing codes", () => {
    expect(isRetryable("INVALID_INPUT")).toBe(false);
    expect(isRetryable("MODEL_NOT_FOUND")).toBe(false);
    expect(isRetryable("WHATEVER")).toBe(false);
    expect(isRetryable(null)).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });
});
