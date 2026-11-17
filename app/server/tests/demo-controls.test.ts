import { describe, expect, it } from "vitest";
import {
  SIMULATED_FAILURE_MESSAGE,
  demoControlsOn,
  demoRefusal,
  parseStartOptions,
} from "../../lib/demo-controls";
import { simulateControl, type ProcessAction } from "../../lib/run-ui";

describe("demo controls (L3 #80)", () => {
  it("are on only for the exact value 'on'", () => {
    expect(demoControlsOn({ DEMO_CONTROLS: "on" })).toBe(true);
    for (const value of ["off", "ON", "1", "true", undefined, ""])
      expect(demoControlsOn({ DEMO_CONTROLS: value })).toBe(false);
    expect(demoControlsOn(undefined)).toBe(false);
  });

  it("read only { simulateFailure: true } from the untrusted argument", () => {
    expect(parseStartOptions({ simulateFailure: true })).toEqual({
      simulateFailure: true,
    });
    for (const raw of [
      undefined,
      null,
      "simulateFailure",
      { simulateFailure: "true" },
      { simulateFailure: 1 },
      [true],
    ])
      expect(parseStartOptions(raw).simulateFailure).toBe(false);
  });

  it("refuse a simulated failure when the switch is off, allow it when on", () => {
    const ask = { simulateFailure: true };
    expect(demoRefusal(ask, { DEMO_CONTROLS: "off" })).toMatch(/off/);
    expect(demoRefusal(ask, {})).toMatch(/off/);
    expect(demoRefusal(ask, { DEMO_CONTROLS: "on" })).toBeNull();
    // An ordinary start is never refused by the demo check.
    expect(demoRefusal({ simulateFailure: false }, {})).toBeNull();
  });

  it("show the button only with the switch on and a run that may start", () => {
    const start: ProcessAction = {
      kind: "start",
      label: "Start run",
      enabled: true,
    };
    const retry: ProcessAction = {
      kind: "start",
      label: "Retry",
      enabled: true,
    };
    const offline: ProcessAction = {
      kind: "start",
      label: "Start run",
      enabled: false,
    };
    const fix: ProcessAction = {
      kind: "fix",
      label: "Go to Clarify",
      href: "/x",
    };
    expect(simulateControl({ demoControls: true, action: start })).toEqual({
      show: true,
      enabled: true,
    });
    expect(simulateControl({ demoControls: true, action: retry }).show).toBe(
      true,
    );
    expect(simulateControl({ demoControls: true, action: offline })).toEqual({
      show: true,
      enabled: false,
    });
    expect(simulateControl({ demoControls: true, action: fix }).show).toBe(
      false,
    );
    expect(simulateControl({ demoControls: false, action: start }).show).toBe(
      false,
    );
  });

  it("labels the failure as simulated", () => {
    expect(SIMULATED_FAILURE_MESSAGE).toMatch(/^Simulated failure/);
  });
});
