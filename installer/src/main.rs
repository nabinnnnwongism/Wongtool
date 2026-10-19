#![windows_subsystem = "windows"]

use std::fs;
use std::io::{Cursor, Read};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use winreg::enums::*;
use winreg::RegKey;

// Embed the compressed payload containing WongOS, SteamTools hook, plugin, and daemon
static PAYLOAD_ZIP: &[u8] = include_bytes!("../../payload.zip");

const CREATE_NO_WINDOW: u32 = 0x08000000;
const MB_OK: u32 = 0x00000000;
const MB_YESNO: u32 = 0x00000004;
const MB_ICONERROR: u32 = 0x00000010;
const MB_ICONQUESTION: u32 = 0x00000020;
const MB_ICONINFORMATION: u32 = 0x00000040;
const IDYES: i32 = 6;

#[link(name = "user32")]
unsafe extern "system" {
    fn MessageBoxW(
        hwnd: *mut std::ffi::c_void,
        lp_text: *const u16,
        lp_caption: *const u16,
        u_type: u32,
    ) -> i32;
}

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn show_msg(title: &str, message: &str, flags: u32) -> i32 {
    let wide_title = to_wide(title);
    let wide_msg = to_wide(message);
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            wide_msg.as_ptr(),
            wide_title.as_ptr(),
            flags,
        )
    }
}

fn detect_steam_path() -> Option<PathBuf> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey("Software\\Valve\\Steam") {
        if let Ok(val) = key.get_value::<String, _>("SteamPath") {
            let p = PathBuf::from(val.replace('/', "\\"));
            if p.exists() {
                return Some(p);
            }
        }
    }

    let default_path = PathBuf::from("C:\\Program Files (x86)\\Steam");
    if default_path.exists() {
        return Some(default_path);
    }

    None
}

fn close_steam() {
    let _ = Command::new("taskkill")
        .args(&["/F", "/IM", "steam.exe", "/IM", "steamwebhelper.exe"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    std::thread::sleep(std::time::Duration::from_millis(1500));
}

fn install_payload(steam_path: &Path) -> Result<PathBuf, String> {
    let cursor = Cursor::new(PAYLOAD_ZIP);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("Failed to read payload: {e}"))?;

    let appdata = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\Users\\Default\\AppData\\Local".into());
    let wong_local_dir = PathBuf::from(appdata).join("WongOS");
    fs::create_dir_all(&wong_local_dir).map_err(|e| format!("Failed to create local directory: {e}"))?;
    let daemon_dest = wong_local_dir.join("wong-daemon.exe");

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("Zip entry error: {e}"))?;
        let raw_name = file.name().map_err(|e| format!("Zip name error: {e}"))?;
        let name = raw_name.replace('\\', "/");

        if file.is_dir() {
            if name.starts_with("wongos/") || name.starts_with("opensteamtool/") {
                let out_dir = steam_path.join(&name);
                fs::create_dir_all(&out_dir).map_err(|e| format!("Failed to create directory {}: {e}", out_dir.display()))?;
            } else if name.starts_with("steamtools_assets/") {
                let out_dir = wong_local_dir.join(&name);
                fs::create_dir_all(&out_dir).ok();
            }
            continue;
        }

        let target_path = if name == "wsock32.dll" {
            steam_path.join("wsock32.dll")
        } else if name == "xinput1_4.dll" {
            steam_path.join("xinput1_4.dll")
        } else if name == "dwmapi.dll" {
            steam_path.join("dwmapi.dll")
        } else if name == "OpenSteamTool.dll" {
            steam_path.join("OpenSteamTool.dll")
        } else if name == "cloud_redirect.dll" {
            steam_path.join("cloud_redirect.dll")
        } else if name == "cef_version.dll" {
            let cef64_dir = steam_path.join("bin/cef/cef.win64");
            fs::create_dir_all(&cef64_dir).ok();
            let cef64_dest = cef64_dir.join("version.dll");

            // Also copy to win7x64 if directory exists
            let cef7_dir = steam_path.join("bin/cef/cef.win7x64");
            if cef7_dir.exists() {
                let mut data = Vec::new();
                file.read_to_end(&mut data).ok();
                fs::write(cef7_dir.join("version.dll"), &data).ok();
                fs::write(&cef64_dest, &data).map_err(|e| format!("Failed to write CEF version hook: {e}"))?;
                continue;
            }
            cef64_dest
        } else if name == "wong-daemon.exe" {
            daemon_dest.clone()
        } else if name.starts_with("opensteamtool/") {
            steam_path.join(&name)
        } else if name.starts_with("steamtools_assets/") {
            wong_local_dir.join(&name)
        } else if name.starts_with("wongos/") {
            steam_path.join(&name)
        } else {
            continue;
        };

        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent directory: {e}"))?;
        }

        // Handle possible in-place write locks by writing to a temporary file then renaming
        let mut data = Vec::new();
        file.read_to_end(&mut data).map_err(|e| format!("Failed reading file {}: {e}", name))?;

        if let Err(_) = fs::write(&target_path, &data) {
            let temp_dest = target_path.with_extension(format!("tmp_{}", i));
            if fs::write(&temp_dest, &data).is_ok() {
                let _ = fs::rename(&temp_dest, &target_path);
            }
        }
    }

    // Ensure SteamTools directories exist
    fs::create_dir_all(steam_path.join("config/stplug-in")).ok();
    fs::create_dir_all(steam_path.join("config/lua")).ok();
    fs::create_dir_all(steam_path.join("config/depotcache")).ok();
    fs::create_dir_all(steam_path.join("depotcache")).ok();

    // Clean up obsolete legacy files
    fs::remove_file(steam_path.join("steam.cfg")).ok();
    fs::remove_file(steam_path.join("hid.dll")).ok();

    Ok(daemon_dest)
}

fn register_daemon_startup(daemon_path: &Path) {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(run_key) = hkcu.open_subkey_with_flags(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
        KEY_SET_VALUE,
    ) {
        let cmd = format!("\"{}\"", daemon_path.display());
        let _ = run_key.set_value("WongMicroDaemon", &cmd);
    }
}

fn launch_daemon(daemon_path: &Path) {
    let _ = Command::new(daemon_path)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
}

fn main() {
    let steam_path = match detect_steam_path() {
        Some(p) => p,
        None => {
            show_msg(
                "Wong Setup - Error",
                "Could not detect your Steam installation folder.\nPlease ensure Steam is installed on this PC and try again.",
                MB_OK | MB_ICONERROR,
            );
            return;
        }
    };

    let prompt = format!(
        "Welcome to Wong Setup!\n\nDetected Steam at:\n{}\n\nThis installer will configure WongOS, the SteamTools license hook, the Store Claim & Library Bypass plugin, and the background micro-service.\n\nSteam will be closed during installation.\n\nDo you want to continue?",
        steam_path.display()
    );

    let res = show_msg("Wong Setup", &prompt, MB_YESNO | MB_ICONQUESTION);
    if res != IDYES {
        return;
    }

    // 1. Close Steam if open
    close_steam();

    // 2. Extract and install payload
    let daemon_path = match install_payload(&steam_path) {
        Ok(p) => p,
        Err(err) => {
            show_msg(
                "Wong Setup - Error",
                &format!("Installation failed:\n\n{err}"),
                MB_OK | MB_ICONERROR,
            );
            return;
        }
    };

    // 3. Register startup and launch background micro-daemon
    register_daemon_startup(&daemon_path);
    launch_daemon(&daemon_path);

    // 4. Success message and prompt to launch Steam
    let success_prompt = "Wong has been successfully installed into Steam!\n\nThe WongOS loader, SteamTools license unlocker, and Store Claim & Library Bypass plugins are ready.\n\nNote: When you claim a game on the Store, restart Steam once to see it in your Library.\n\nWould you like to launch Steam now?";
    let launch_res = show_msg("Wong Setup - Complete", success_prompt, MB_YESNO | MB_ICONINFORMATION);

    if launch_res == IDYES {
        let steam_exe = steam_path.join("steam.exe");
        let _ = Command::new(steam_exe).spawn();
    }
}
