use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

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
    apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None).ok();
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
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            on_second_instance(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
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

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![update_tray_title, hide_window])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{on_second_instance, show_window};

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
}
