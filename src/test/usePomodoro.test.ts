import { renderHook, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { usePomodoro, PRESETS } from "@/hooks/usePomodoro";

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

  // ── Bonus: session counter increments when work session completes ───────────
  it("increments completedSessions when a work session finishes", () => {
    const { result } = renderHook(() => usePomodoro());

    act(() => { result.current.selectPreset({ label: "test", work: 1 / 60, break: 1 / 60 }); });
    act(() => { result.current.toggle(); });
    act(() => { vi.advanceTimersByTime(1100); }); // just over 1 second

    expect(result.current.completedSessions).toBe(1);
    expect(result.current.mode).toBe("break");
  });
});
