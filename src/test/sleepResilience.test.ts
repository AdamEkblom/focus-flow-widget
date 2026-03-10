import { renderHook, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { usePomodoro, PRESETS } from "@/hooks/usePomodoro";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn().mockResolvedValue(true),
  requestPermission: vi.fn().mockResolvedValue("granted"),
  sendNotification: vi.fn(),
}));

describe("usePomodoro — sleep/wake resilience", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("handles large time jump (sleep/wake) correctly — session completes", () => {
    const { result } = renderHook(() => usePomodoro());

    // Use the 25/5 preset (1500s work)
    act(() => { result.current.toggle(); });
    expect(result.current.isRunning).toBe(true);

    // Record real wall-clock base used when the timer started
    const startTime = Date.now();

    // Simulate Mac slept for 30 minutes (1800s > 1500s work session)
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(startTime + 30 * 60 * 1000);

    // One interval tick fires after wake
    act(() => { vi.advanceTimersByTime(250); });

    // Timer should have rolled over to break mode (work session completed)
    expect(result.current.mode).toBe("break");
    expect(result.current.completedSessions).toBe(1);
    expect(result.current.secondsLeft).toBe(PRESETS[0].break * 60); // 300

    nowSpy.mockRestore();
  });

  it("handles partial sleep — timer resumes at correct remaining time", () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => { result.current.toggle(); });

    const startTime = Date.now();

    // Simulate 10 minutes of sleep mid-session (600s elapsed out of 1500s)
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(startTime + 10 * 60 * 1000);

    act(() => { vi.advanceTimersByTime(250); });

    // Should show ~900s remaining (1500 - 600)
    expect(result.current.secondsLeft).toBe(1500 - 600);
    expect(result.current.mode).toBe("work");

    nowSpy.mockRestore();
  });
});
