use std::process::{Command, Stdio};
use std::io::{Write, BufRead, BufReader};
use serde_json::json;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Start the LSP server
    let mut child = Command::new("cargo")
        .args(&["run"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    let stdin = child.stdin.as_mut().unwrap();
    let stdout = child.stdout.take().unwrap();
    let reader = BufReader::new(stdout);

    // Send initialization request
    let init_request = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "processId": std::process::id(),
            "rootUri": "file:///tmp",
            "capabilities": {}
        }
    });

    let init_message = format!("Content-Length: {}\r\n\r\n{}", 
        serde_json::to_string(&init_request)?.len(),
        serde_json::to_string(&init_request)?
    );

    stdin.write_all(init_message.as_bytes())?;
    stdin.flush()?;

    // Read response
    let mut response = String::new();
    reader.read_line(&mut response)?;
    println!("Init response: {}", response);

    // Send completion request
    let completion_request = json!({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "textDocument/completion",
        "params": {
            "textDocument": {
                "uri": "file:///tmp/test.noo"
            },
            "position": {
                "line": 0,
                "character": 0
            }
        }
    });

    let completion_message = format!("Content-Length: {}\r\n\r\n{}", 
        serde_json::to_string(&completion_request)?.len(),
        serde_json::to_string(&completion_request)?
    );

    stdin.write_all(completion_message.as_bytes())?;
    stdin.flush()?;

    // Read completion response
    let mut completion_response = String::new();
    reader.read_line(&mut completion_response)?;
    println!("Completion response: {}", completion_response);

    // Send shutdown
    let shutdown_request = json!({
        "jsonrpc": "2.0",
        "id": 3,
        "method": "shutdown"
    });

    let shutdown_message = format!("Content-Length: {}\r\n\r\n{}", 
        serde_json::to_string(&shutdown_request)?.len(),
        serde_json::to_string(&shutdown_request)?
    );

    stdin.write_all(shutdown_message.as_bytes())?;
    stdin.flush()?;

    child.wait()?;
    println!("LSP test completed!");
    Ok(())
} 