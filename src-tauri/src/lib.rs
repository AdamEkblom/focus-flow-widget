use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

/// Shared state for the native background countdown thread.
/// When `target_end_ms` is `Some`, the background thread updates the tray title
/// every second independently of the WebView (which macOS may suspend).
struct TimerState {
    /// Unix timestamp in milliseconds when the timer should reach zero.
    target_end_ms: Option<i64>,
    /// Display prefix, e.g. "🍅" for work or "☕" for break.
    prefix: String,
}

impl Default for TimerState {
    fn default() -> Self {
        Self {
            target_end_ms: None,
            prefix: "🍅".to_string(),
        }
    }
}

#[tauri::command]
fn update_tray_title(app: tauri::AppHandle, title: String) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(&title));
        #[cfg(target_os = "macos")]
        let _ = tray.set_title(Some(&title));
    }
}

#[tauri::command]
fn hide_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

#[tauri::command]
fn start_tray_countdown(
    state: tauri::State<'_, Arc<Mutex<TimerState>>>,
    target_end_ms: i64,
    prefix: Option<String>,
) {
    let mut s = state.lock().unwrap();
    s.target_end_ms = Some(target_end_ms);
    if let Some(p) = prefix {
        s.prefix = p;
    }
}

#[tauri::command]
fn stop_tray_countdown(state: tauri::State<'_, Arc<Mutex<TimerState>>>) {
    let mut s = state.lock().unwrap();
    s.target_end_ms = None;
}

fn on_second_instance<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Configure the window so it:
/// - Appears in full-screen Spaces (CanJoinAllSpaces + FullScreenAuxiliary)
/// - Floats above full-screen app content as a transient popup (Transient)
/// - Is excluded from the Cmd+Tab cycle (IgnoresCycle)
/// Window level is left at NSFloatingWindowLevel (set by alwaysOnTop in tauri.conf.json).
#[cfg(all(target_os = "macos", not(test)))]
fn configure_macos_window<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};
    if let Ok(ptr) = window.ns_window() {
        unsafe {
            let ns_win = &*(ptr as *const NSWindow);
            let behavior = ns_win.collectionBehavior()
                | NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::FullScreenAuxiliary
                | NSWindowCollectionBehavior::Transient
                | NSWindowCollectionBehavior::IgnoresCycle;
            ns_win.setCollectionBehavior(behavior);
        }
    }

    // Force dark appearance so vibrancy renders dark regardless of system theme.
    if let Ok(ptr) = window.ns_window() {
        unsafe {
            use objc2_app_kit::{
                NSAppearance, NSAppearanceCustomization, NSAppearanceNameVibrantDark,
            };
            let ns_win = &*(ptr as *const NSWindow);
            if let Some(dark) = NSAppearance::appearanceNamed(NSAppearanceNameVibrantDark) {
                ns_win.setAppearance(Some(&dark));
            }
        }
    }

    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
    apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, Some(10.0)).ok();
}

/// Position and show a window, ensuring it appears in full-screen Spaces on macOS.
fn show_window<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>, x: i32, y: i32) {
    let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    #[cfg(all(target_os = "macos", not(test)))]
    configure_macos_window(window);
    let _ = window.show();
    let _ = window.set_focus();
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            on_second_instance(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .manage(Arc::new(Mutex::new(TimerState::default())))
        .setup(|app| {
            // Enable auto-start on first launch (silently opt-in).
            let autostart = app.autolaunch();
            if !autostart.is_enabled().unwrap_or(false) {
                let _ = autostart.enable();
            }
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Apply full-screen Space collection behavior at startup.
            #[cfg(all(target_os = "macos", not(test)))]
            if let Some(window) = app.get_webview_window("main") {
                configure_macos_window(&window);
            }

            // Hide the widget when it loses focus (user clicks outside).
            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
                        let _ = w.hide();
                    }
                });
            }

            let _tray = TrayIconBuilder::with_id("main")
                .tooltip("Focus Flow")
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        position,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_focused().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let win_width = 300_f64;
                                let x = (position.x - win_width / 2.0).max(0.0) as i32;
                                let y = (position.y + 8.0) as i32;
                                show_window(&window, x, y);
                            }
                        }
                    }
                })
                .build(app)?;

            // Spawn a native background thread that updates the tray title every
            // second. Unlike the WebView's setInterval, this thread is NOT
            // suspended by macOS when the window is hidden or the system sleeps.
            let timer_state = app.state::<Arc<Mutex<TimerState>>>().inner().clone();
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(1));

                    let state = timer_state.lock().unwrap();
                    if let Some(target_ms) = state.target_end_ms {
                        let now_ms = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap()
                            .as_millis() as i64;
                        let remaining_secs =
                            ((target_ms - now_ms) as f64 / 1000.0).ceil().max(0.0) as i64;
                        let mins = remaining_secs / 60;
                        let secs = remaining_secs % 60;
                        let title = format!("{} {:02}:{:02}", state.prefix, mins, secs);
                        drop(state); // release lock before tray API call

                        if let Some(tray) = app_handle.tray_by_id("main") {
                            let _ = tray.set_tooltip(Some(&title));
                            #[cfg(target_os = "macos")]
                            let _ = tray.set_title(Some(&title));
                        }
                    }
                    // When target_end_ms is None, the lock is dropped automatically
                    // and the thread just sleeps — no CPU cost.
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![update_tray_title, hide_window, start_tray_countdown, stop_tray_countdown])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{on_second_instance, show_window, TimerState};
    use std::sync::{Arc, Mutex};
    use tauri_plugin_autostart::ManagerExt;

    #[test]
    fn second_instance_does_not_panic_when_no_window() {
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("failed to build mock app");
        on_second_instance(app.handle());
    }

    #[test]
    fn show_window_does_not_panic_in_mock_context() {
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("failed to build mock app");
        let window =
            tauri::WebviewWindowBuilder::new(&app, "test", tauri::WebviewUrl::App("/".into()))
                .build()
                .expect("failed to create test window");
        show_window(&window, 100, 100);
    }

    #[test]
    fn tray_click_shows_window_when_not_focused() {
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("failed to build mock app");
        let window =
            tauri::WebviewWindowBuilder::new(&app, "main", tauri::WebviewUrl::App("/".into()))
                .build()
                .expect("failed to create window");
        if window.is_focused().unwrap_or(false) {
            let _ = window.hide();
        } else {
            show_window(&window, 0, 0);
        }
        assert!(window.is_visible().unwrap_or(false));
    }

    #[test]
    fn autostart_plugin_initializes_without_panic() {
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                None,
            ))
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("failed to build mock app with autostart plugin");
        let _manager = app.handle().autolaunch();
    }

    #[test]
    fn autostart_is_disabled_by_default_in_mock() {
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                None,
            ))
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("failed to build mock app");
        let autostart = app.handle().autolaunch();
        // In mock context (no real bundle ID / plist), is_enabled returns false
        let enabled = autostart.is_enabled().unwrap_or(false);
        assert!(!enabled, "autostart should not be enabled in mock context");
    }

    #[test]
    fn window_hides_on_focus_lost() {
        // Verify the hide() call (triggered by Focused(false) in the event handler)
        // completes without error. The mock runtime has no real window system so
        // is_visible() does not reflect hide() calls, but the call itself must succeed.
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("failed to build mock app");
        let window =
            tauri::WebviewWindowBuilder::new(&app, "main", tauri::WebviewUrl::App("/".into()))
                .visible(true)
                .build()
                .expect("failed to create window");

        assert!(window.is_visible().unwrap_or(false), "window should start visible");
        assert!(window.hide().is_ok(), "hide() must not return an error on focus loss");
    }

    #[test]
    fn timer_state_start_and_stop() {
        let state = Arc::new(Mutex::new(TimerState::default()));

        // Initially no active countdown
        assert!(state.lock().unwrap().target_end_ms.is_none());

        // Start countdown
        {
            let mut s = state.lock().unwrap();
            s.target_end_ms = Some(1_700_000_000_000);
            s.prefix = "🍅".to_string();
        }
        assert_eq!(state.lock().unwrap().target_end_ms, Some(1_700_000_000_000));
        assert_eq!(state.lock().unwrap().prefix, "🍅");

        // Stop countdown
        {
            let mut s = state.lock().unwrap();
            s.target_end_ms = None;
        }
        assert!(state.lock().unwrap().target_end_ms.is_none());
    }

}
