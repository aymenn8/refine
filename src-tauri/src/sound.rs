use std::process::Command;

#[tauri::command]
pub async fn play_system_sound(name: String, volume: f64) -> Result<(), String> {
    let path = format!("/System/Library/Sounds/{}.aiff", name);

    // Verify the sound file exists
    if !std::path::Path::new(&path).exists() {
        return Err(format!("Sound not found: {}", name));
    }

    // afplay volume: 0 = silent, 1 = normal, >1 = amplified
    Command::new("afplay")
        .arg(&path)
        .arg("-v")
        .arg(volume.to_string())
        .spawn()
        .map_err(|e| format!("Failed to play sound: {}", e))?;

    Ok(())
}
