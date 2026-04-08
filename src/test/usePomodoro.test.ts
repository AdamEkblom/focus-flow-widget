import { renderHook, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { usePomodoro, PRESETS } from "@/hooks/usePomodoro";
import { invoke } from "@tauri-apps/api/core";
import { sendNotification } from "@tauri-apps/plugin-notification";

// Mock Tauri APIs — tests run in jsdom, no native app is launched
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn().mockResolvedValue(true),
  requestPermission: vi.fn().mockResolvedValue("granted"),
  sendNotification: vi.fn(),
}));

describe("usePomodoro — button & timer behaviour", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── 1. Open widget ──────────────────────────────────────────────────────────
  it("starts with correct initial state (widget open)", () => {
    const { result } = renderHook(() => usePomodoro());
    expect(result.current.mode).toBe("work");
    expect(result.current.secondsLeft).toBe(PRESETS[0].work * 60); // 1500
    expect(result.current.isRunning).toBe(false);
    expect(result.current.completedSessions).toBe(0);
  });

  // ── 2. Start button — timer counts down ────────────────────────────────────
  it("counts down after pressing start", () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => { result.current.toggle(); });
    expect(result.current.isRunning).toBe(true);

    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.secondsLeft).toBe(1500 - 3);
  });

  // ── 3. Cancel (reset) after 3-second window ─────────────────────────────────
  it("reset stops timer and restores full work time", () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => { result.current.toggle(); });
    act(() => { vi.advanceTimersByTime(3000); });
    act(() => { result.current.reset(); });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.secondsLeft).toBe(1500);
  });

  // ── 4a. Skip button ─────────────────────────────────────────────────────────
  it("skip changes mode from work → break with correct duration", () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => { result.current.skip(); });

    expect(result.current.mode).toBe("break");
    expect(result.current.secondsLeft).toBe(PRESETS[0].break * 60); // 300
    expect(result.current.isRunning).toBe(false);
  });

  it("skip from break returns to work mode", () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => { result.current.skip(); }); // work → break
    act(() => { result.current.skip(); }); // break → work

    expect(result.current.mode).toBe("work");
    expect(result.current.secondsLeft).toBe(PRESETS[0].work * 60);
  });

  // ── 4b. Preset buttons ──────────────────────────────────────────────────────
  it("50/10 preset sets correct work and break times", () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => { result.current.selectPreset(PRESETS[1]); });

    expect(result.current.preset.work).toBe(50);
    expect(result.current.preset.break).toBe(10);
    expect(result.current.secondsLeft).toBe(50 * 60);
    expect(result.current.isRunning).toBe(false);
  });

  it("75/15 preset sets correct work and break times", () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => { result.current.selectPreset(PRESETS[2]); });

    expect(result.current.preset.work).toBe(75);
    expect(result.current.preset.break).toBe(15);
    expect(result.current.secondsLeft).toBe(75 * 60);
  });

  // ── 4c. Custom timer ────────────────────────────────────────────────────────
  it("custom time of 30 min sets 1800s and auto-calculates 6min break", () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => { result.current.setCustomTime(30); });

    expect(result.current.secondsLeft).toBe(30 * 60);
    expect(result.current.preset.break).toBe(6); // 30 / 5 = 6
    expect(result.current.isRunning).toBe(false);
  });

  // ── 5. Close widget (pause) ─────────────────────────────────────────────────
  it("pause button stops countdown and freezes the time", () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => { result.current.toggle(); });          // start
    act(() => { vi.advanceTimersByTime(2000); });     // run 2 s
    act(() => { result.current.toggle(); });          // pause

    const frozenTime = result.current.secondsLeft;
    expect(result.current.isRunning).toBe(false);

    act(() => { vi.advanceTimersByTime(5000); });     // more time passes
    expect(result.current.secondsLeft).toBe(frozenTime); // unchanged
  });

  // ── 6. Timer resilient to interval throttling (hidden window) ──────────────
  it("timer uses wall-clock time, resilient to interval throttling", () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => { result.current.toggle(); });

    const startTime = Date.now();

    // Simulate throttling: wall-clock jumps 10s but only one tick fires
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(startTime + 10_000);

    act(() => { vi.advanceTimersByTime(250); });

    expect(result.current.secondsLeft).toBe(1500 - 10);

    nowSpy.mockRestore();
  });

  // ── Bonus: session counter increments when work session completes ───────────
  it("increments completedSessions when a work session finishes", () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => { result.current.selectPreset({ label: "test", work: 1 / 60, break: 1 / 60 }); });
    act(() => { result.current.toggle(); });
    act(() => { vi.advanceTimersByTime(1100); }); // just over 1 second

    expect(result.current.completedSessions).toBe(1);
    expect(result.current.mode).toBe("break");
  });

  // ── 7. Native tray countdown commands ──────────────────────────────────────
  it("calls start_tray_countdown when timer starts", () => {
    const { result } = renderHook(() => usePomodoro());
    (invoke as ReturnType<typeof vi.fn>).mockClear();

    act(() => { result.current.toggle(); });

    expect(invoke).toHaveBeenCalledWith("start_tray_countdown", expect.objectContaining({
      targetEndMs: expect.any(Number),
      prefix: "🍅",
    }));
  });

  it("calls stop_tray_countdown when timer pauses", () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => { result.current.toggle(); }); // start
    (invoke as ReturnType<typeof vi.fn>).mockClear();
    act(() => { result.current.toggle(); }); // pause

    expect(invoke).toHaveBeenCalledWith("stop_tray_countdown");
  });

  it("calls stop_tray_countdown when timer resets", () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => { result.current.toggle(); }); // start
    (invoke as ReturnType<typeof vi.fn>).mockClear();
    act(() => { result.current.reset(); });

    expect(invoke).toHaveBeenCalledWith("stop_tray_countdown");
  });

  // ── 8. Timer transition: countdown stops ────────────────────────────────────
  it("timer keeps running after work session expires (isRunning stays true)", () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => { result.current.selectPreset({ label: "test", work: 1 / 60, break: 1 / 60 }); });
    act(() => { result.current.toggle(); });
    act(() => { vi.advanceTimersByTime(1100); });

    expect(result.current.isRunning).toBe(true);
  });

  it("secondsLeft resets to break duration after work session expires", () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => { result.current.selectPreset({ label: "test", work: 1 / 60, break: 1 / 60 }); });
    act(() => { result.current.toggle(); });
    act(() => { vi.advanceTimersByTime(1100); });

    expect(result.current.secondsLeft).toBe(1); // break: 1/60 min = 1 second
    expect(result.current.mode).toBe("break");
  });

  it("break timer counts down after work session expires", () => {
    const { result } = renderHook(() => usePomodoro());

    // 1s work, 5s break
    act(() => { result.current.selectPreset({ label: "test", work: 1 / 60, break: 5 / 60 }); });
    act(() => { result.current.toggle(); });
    act(() => { vi.advanceTimersByTime(1100); }); // complete work session
    act(() => { vi.advanceTimersByTime(2000); }); // 2s into the break

    expect(result.current.mode).toBe("break");
    expect(result.current.secondsLeft).toBeGreaterThanOrEqual(2);
    expect(result.current.secondsLeft).toBeLessThanOrEqual(4);
  });

  it("timer keeps running after break session expires (break → work transition)", () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => { result.current.selectPreset({ label: "test", work: 1 / 60, break: 1 / 60 }); });
    act(() => { result.current.toggle(); });
    act(() => { vi.advanceTimersByTime(1100); }); // complete work → break
    act(() => { vi.advanceTimersByTime(1100); }); // complete break → work

    expect(result.current.isRunning).toBe(true);
    expect(result.current.mode).toBe("work");
  });

  // ── 9. Notifications ────────────────────────────────────────────────────────
  it("sends notification when work session expires", async () => {
    const { result } = renderHook(() => usePomodoro());
    (sendNotification as ReturnType<typeof vi.fn>).mockClear();

    act(() => { result.current.selectPreset({ label: "test", work: 1 / 60, break: 1 / 60 }); });
    act(() => { result.current.toggle(); });

    await act(async () => {
      vi.advanceTimersByTime(1100);
      // Flush the async notify() microtasks (isPermissionGranted → sendNotification)
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Break time! ☕" })
    );
  });

  it("sends notification when break session expires", async () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => { result.current.selectPreset({ label: "test", work: 1 / 60, break: 1 / 60 }); });
    act(() => { result.current.toggle(); });

    // Complete work → break
    await act(async () => {
      vi.advanceTimersByTime(1100);
      await Promise.resolve();
      await Promise.resolve();
    });

    (sendNotification as ReturnType<typeof vi.fn>).mockClear();

    // Complete break → work
    await act(async () => {
      vi.advanceTimersByTime(1100);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Back to work! 🔥" })
    );
  });
});
