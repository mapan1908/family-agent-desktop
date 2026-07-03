use std::sync::Mutex;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Runtime,
};
use tauri_plugin_autostart::MacosLauncher;

use std::path::PathBuf;

struct NodeProcess {
    child: Option<u32>, // PID
}

/// 跨平台杀进程（Windows 用 taskkill，Unix 用 kill）
fn kill_pid(pid: u32) {
    #[cfg(windows)]
    { let _ = std::process::Command::new("taskkill").args(["/PID", &pid.to_string(), "/F", "/T"]).status(); }
    #[cfg(unix)]
    { let _ = std::process::Command::new("kill").arg(pid.to_string()).status(); }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn get_backend_port() -> String {
    std::env::var("FAMILY_PORT").unwrap_or_else(|_| "3099".to_string())
}

/// Check if this is the first launch (llmApiKey not configured yet).
/// Calls the Node.js backend's /api/config/status endpoint.
#[tauri::command]
async fn is_first_launch() -> Result<bool, String> {
    let url = "http://localhost:3099/api/config/status";
    match reqwest::get(url).await {
        Ok(resp) => {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                // If llmConfigured is false or missing, it's a first launch
                let configured = json.get("llmConfigured").and_then(|v| v.as_bool()).unwrap_or(false);
                Ok(!configured)
            } else {
                // Can't parse response — backend may not be ready yet, treat as first launch
                Ok(true)
            }
        }
        Err(_) => {
            // Backend not reachable — treat as first launch
            Ok(true)
        }
    }
}

/// Save initial configuration by POSTing to the Node.js backend's /api/config endpoint.
#[tauri::command]
async fn save_initial_config(
    llm_api_key: String,
    llm_base_url: Option<String>,
    llm_model: Option<String>,
) -> Result<bool, String> {
    let url = "http://localhost:3099/api/config";
    let mut body = serde_json::Map::new();
    body.insert("llmApiKey".to_string(), serde_json::Value::String(llm_api_key));
    if let Some(base_url) = llm_base_url {
        body.insert("llmBaseUrl".to_string(), serde_json::Value::String(base_url));
    }
    if let Some(model) = llm_model {
        body.insert("llmModel".to_string(), serde_json::Value::String(model));
    }

    let client = reqwest::Client::new();
    match client.post(url).json(&body).send().await {
        Ok(resp) => {
            if resp.status().is_success() {
                Ok(true)
            } else {
                Err(format!("Backend returned status: {}", resp.status()))
            }
        }
        Err(e) => Err(format!("Failed to save config: {}", e)),
    }
}

/// Start the Node.js backend as a sidecar-like subprocess
fn start_node_backend<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    use std::process::Command;

    let app_dir = app
        .path()
        .resource_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| ".".to_string());

    // In dev mode, point to ~/family-agent-desktop where index.js lives; in production, use resource dir
    let (workdir, node_bin, script) = if cfg!(debug_assertions) {
        // HOME 在 Windows 上不存在，fallback 到 USERPROFILE
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .expect("HOME/USERPROFILE not set");
        let project_root = PathBuf::from(&home).join("family-agent-desktop");
        (
            project_root.to_string_lossy().to_string(),
            "node".to_string(),
            "index.js".to_string(),
        )
    } else {
        let node_bin = PathBuf::from(&app_dir).join("node-backend");
        (
            app_dir.clone(),
            node_bin.to_string_lossy().to_string(),
            "index.js".to_string(),
        )
    };

    log::info!(
        "Starting Node.js backend: {} {} in {}",
        node_bin,
        script,
        workdir
    );

    match Command::new(&node_bin)
        .arg(&script)
        .current_dir(&workdir)
        .env("NODE_ENV", if cfg!(debug_assertions) { "development" } else { "production" })
        .spawn()
    {
        Ok(child) => {
            log::info!("Node.js backend started with PID: {}", child.id());
            if let Some(state) = app.try_state::<Mutex<NodeProcess>>() {
                if let Ok(mut proc) = state.lock() {
                    proc.child = Some(child.id());
                }
            }
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to start Node.js backend: {}", e);
            Err(format!("Failed to start Node.js backend: {}", e))
        }
    }
}

#[tauri::command]
fn restart_node_backend<R: Runtime>(app: tauri::AppHandle<R>) -> Result<String, String> {
    // Kill existing process if any
    if let Some(state) = app.try_state::<Mutex<NodeProcess>>() {
        if let Ok(mut proc) = state.lock() {
            if let Some(pid) = proc.child.take() {
                kill_pid(pid);
                log::info!("Killed old Node.js process PID: {}", pid);
            }
        }
    }

    start_node_backend(&app)?;
    Ok("Node.js backend restarted".to_string())
}

/// Test AI connection by sending a minimal request to the configured API.
#[tauri::command]
async fn test_ai_connection() -> Result<String, String> {
    let client = reqwest::Client::new();
    // First read config
    let cfg: serde_json::Value = client
        .get("http://localhost:3099/api/config")
        .send().await
        .map_err(|e| format!("无法连接后端: {}", e))?
        .json().await
        .map_err(|e| format!("解析配置失败: {}", e))?;

    let api_key = cfg["llmApiKey"].as_str().unwrap_or("");
    let base_url = cfg["llmBaseUrl"].as_str().unwrap_or("https://api.deepseek.com");
    let model = cfg["llmModel"].as_str().unwrap_or("deepseek-chat");

    if api_key.is_empty() {
        return Err("API Key 未配置".into());
    }

    let url = format!("{}/v1/chat/completions", base_url);
    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 5
    });

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send().await
        .map_err(|e| format!("请求失败: {}", e))?;

    let status = resp.status();
    if status.is_success() {
        Ok(format!("✓ 连接成功，模型 {} 可用", model))
    } else {
        let text = resp.text().await.unwrap_or_default();
        Err(format!("API 返回 {}: {}", status, &text[..text.len().min(200)]))
    }
}

/// Trigger a file scan via the Node.js backend.
#[tauri::command]
async fn trigger_scan() -> Result<String, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post("http://localhost:3099/api/scan")
        .send().await
        .map_err(|e| format!("请求失败: {}", e))?;
    if resp.status().is_success() {
        Ok("扫描已启动".into())
    } else {
        Err(format!("扫描失败: {}", resp.status()))
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .manage(Mutex::new(NodeProcess { child: None }))
        .setup(|app| {
            // ── System Tray ──
            let show_item = MenuItemBuilder::with_id("show", "显示窗口").build(app)?;
            let restart_item =
                MenuItemBuilder::with_id("restart", "重启后端").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&restart_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("家庭 Agent")
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "restart" => {
                        let handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            match restart_node_backend(handle) {
                                Ok(msg) => log::info!("{}", msg),
                                Err(e) => log::error!("{}", e),
                            }
                        });
                    }
                    "quit" => {
                        // Stop Node.js backend before exit
                        if let Some(state) = app.try_state::<std::sync::Mutex<NodeProcess>>() {
                            if let Ok(mut proc) = state.lock() {
                                if let Some(pid) = proc.child.take() {
                                    kill_pid(pid);
                                    log::info!("Stopped Node.js process PID: {}", pid);
                                }
                            }
                        }
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // ── Silent run: intercept window close → hide instead of exit ──
            let window = app.get_webview_window("main").unwrap();
            let win = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = win.hide();
                }
            });

            // ── Start Node.js backend ──
            let app_handle = app.handle().clone();
            start_node_backend(&app_handle).unwrap_or_else(|e| {
                log::warn!("Node backend not started (ok in dev if running separately): {}", e);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_app_version,
            get_backend_port,
            restart_node_backend,
            is_first_launch,
            save_initial_config,
            test_ai_connection,
            trigger_scan
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
