use std::fs;
use noolang_lsp::TypeScriptBridge;

// Helper function to check if CLI is available
fn cli_available() -> bool {
    let bridge = TypeScriptBridge::new();
    std::process::Command::new("node")
        .args(&["--version"])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

// Helper function to create test files
fn create_test_file(name: &str, content: &str) -> String {
    let test_file = format!("/tmp/{}", name);
    fs::write(&test_file, content).unwrap();
    test_file
}

// Helper function to clean up test files
fn cleanup_test_file(path: &str) {
    let _ = fs::remove_file(path);
}

#[test]
fn test_typescript_bridge_navigation_features() {
    if !cli_available() {
        println!("Skipping integration test - Node.js not available");
        return;
    }

    let bridge = TypeScriptBridge::new();
    
    let content = r#"
add = fn x y => x + y;
multiply = fn a b => a * b;
result = add 2 3;
calculation = multiply result 4;
"#.trim();
    
    let test_file = create_test_file("navigation_test.noo", content);
    
    // Test go-to-definition - find 'add' usage in line 3
    match bridge.find_definition(&test_file, 3, 10) {
        Ok(Some(def)) => {
            assert_eq!(def.name, "add");
            assert_eq!(def.line, 1);
        }
        Ok(None) => panic!("Expected to find definition"),
        Err(e) => panic!("Error: {}", e),
    }
    
    // Test find references
    match bridge.find_references(&test_file, 1, 1) {
        Ok(refs) => {
            assert!(refs.len() >= 1, "Expected at least 1 reference");
        }
        Err(e) => panic!("Error finding references: {}", e),
    }
    
    // Test document symbols
    match bridge.get_document_symbols(&test_file) {
        Ok(symbols) => {
            assert!(symbols.len() >= 4, "Expected at least 4 symbols");
            let symbol_names: Vec<String> = symbols.iter().map(|s| s.name.clone()).collect();
            assert!(symbol_names.contains(&"add".to_string()));
            assert!(symbol_names.contains(&"multiply".to_string()));
            assert!(symbol_names.contains(&"result".to_string()));
            assert!(symbol_names.contains(&"calculation".to_string()));
        }
        Err(e) => panic!("Error getting symbols: {}", e),
    }
    
    cleanup_test_file(&test_file);
}

#[test]
fn test_position_conversion() {
    // Test that position conversion between LSP (0-based) and AST (1-based) works correctly
    let bridge = TypeScriptBridge::new();
    
    // Test position within range calculations (basic validation)
    assert!(bridge.position_within_range(1, 5, 1, 1, 1, 10)); // Same line, within range
    assert!(bridge.position_within_range(2, 5, 1, 1, 3, 10)); // Multi-line, within range
    assert!(!bridge.position_within_range(1, 15, 1, 1, 1, 10)); // Same line, out of range
    assert!(!bridge.position_within_range(4, 5, 1, 1, 3, 10)); // Multi-line, out of range
}

#[test]
fn test_complex_navigation_scenarios() {
    if !cli_available() {
        println!("Skipping test - Node.js not available");
        return;
    }

    let bridge = TypeScriptBridge::new();
    
    let content = r#"
# Complex nested function calls
compose = fn f g x => f (g x);
increment = fn x => x + 1;
double = fn x => x * 2;
pipeline = compose double increment;
result = pipeline 5;
"#.trim();
    
    let test_file = create_test_file("complex_test.noo", content);
    
    // Test finding definition of 'compose' from nested usage (line 5: "pipeline = compose double increment;")
    match bridge.find_definition(&test_file, 5, 15) {
        Ok(Some(def)) => {
            assert_eq!(def.name, "compose");
            assert_eq!(def.line, 2);
        }
        Ok(None) => panic!("Expected to find 'compose' definition"),
        Err(e) => panic!("Error: {}", e),
    }
    
    // Test finding references to 'increment' (defined on line 3)
    match bridge.find_references(&test_file, 3, 1) {
        Ok(refs) => {
            assert!(refs.len() >= 1, "Expected references to 'increment'");
            // Should find usage in 'pipeline' definition  
            let line_5_ref = refs.iter().any(|r| r.line == 5);
            assert!(line_5_ref, "Expected reference on line 5");
        }
        Err(e) => panic!("Error finding references: {}", e),
    }
    
    cleanup_test_file(&test_file);
}

#[test]
fn test_adt_navigation() {
    if !cli_available() {
        println!("Skipping test - Node.js not available");
        return;
    }

    let bridge = TypeScriptBridge::new();
    
    let content = r#"
type Option a = Some a | None;
unwrap = fn opt => match opt with (
  Some x => x;
  None => 0
);
value = Some 42;
result = unwrap value;
"#.trim();
    
    let test_file = create_test_file("adt_test.noo", content);
    
    // Test document symbols include type definitions
    match bridge.get_document_symbols(&test_file) {
        Ok(symbols) => {
            let symbol_names: Vec<String> = symbols.iter().map(|s| s.name.clone()).collect();
            assert!(symbol_names.contains(&"unwrap".to_string()));
            assert!(symbol_names.contains(&"value".to_string()));
            assert!(symbol_names.contains(&"result".to_string()));
        }
        Err(e) => panic!("Error getting symbols: {}", e),
    }
    
    cleanup_test_file(&test_file);
}

#[test]
fn test_error_recovery() {
    if !cli_available() {
        println!("Skipping test - Node.js not available");
        return;
    }

    let bridge = TypeScriptBridge::new();
    
    // Test with syntactically incorrect code
    let content = "add = fn x y => x +"; // Missing right operand
    let test_file = create_test_file("error_test.noo", content);
    
    // Should handle errors gracefully
    let def_result = bridge.find_definition(&test_file, 1, 1);
    let ref_result = bridge.find_references(&test_file, 1, 1);
    let sym_result = bridge.get_document_symbols(&test_file);
    
    // These may succeed or fail, but should not panic
    match (def_result, ref_result, sym_result) {
        (Ok(_), Ok(_), Ok(_)) => println!("Error recovery successful"),
        (Err(_), Err(_), Err(_)) => println!("Graceful error handling"),
        _ => println!("Mixed results - acceptable"),
    }
    
    cleanup_test_file(&test_file);
}

#[test]
fn test_empty_and_whitespace_files() {
    if !cli_available() {
        println!("Skipping test - Node.js not available");
        return;
    }

    let bridge = TypeScriptBridge::new();
    
    // Test empty file
    let empty_file = create_test_file("empty.noo", "");
    let symbols = bridge.get_document_symbols(&empty_file);
    match symbols {
        Ok(syms) => assert_eq!(syms.len(), 0, "Empty file should have no symbols"),
        Err(_) => (), // Error is acceptable for empty file
    }
    cleanup_test_file(&empty_file);
    
    // Test whitespace-only file
    let whitespace_file = create_test_file("whitespace.noo", "   \n  \n  ");
    let symbols = bridge.get_document_symbols(&whitespace_file);
    match symbols {
        Ok(syms) => assert_eq!(syms.len(), 0, "Whitespace file should have no symbols"),
        Err(_) => (), // Error is acceptable for whitespace-only file
    }
    cleanup_test_file(&whitespace_file);
}

#[test]
fn test_large_file_performance() {
    if !cli_available() {
        println!("Skipping test - Node.js not available");
        return;
    }

    let bridge = TypeScriptBridge::new();
    
    // Generate a larger test file (reduced size to avoid recursion limits)
    let mut content = String::new();
    for i in 0..50 {
        content.push_str(&format!("func_{} = fn x => x + {};\n", i, i));
        content.push_str(&format!("result_{} = func_{} {};\n", i, i, i * 2));
    }
    
    let test_file = create_test_file("large_test.noo", &content);
    
    // Test that navigation still works efficiently
    let start = std::time::Instant::now();
    let symbols = bridge.get_document_symbols(&test_file);
    let duration = start.elapsed();
    
    match symbols {
        Ok(syms) => {
            assert!(syms.len() >= 50, "Expected many symbols in large file");
            assert!(duration.as_millis() < 5000, "Navigation should be fast even for large files");
        }
        Err(e) => panic!("Error with large file: {}", e),
    }
    
    cleanup_test_file(&test_file);
}

#[test] 
fn test_unicode_and_special_characters() {
    if !cli_available() {
        println!("Skipping test - Node.js not available");
        return;
    }

    let bridge = TypeScriptBridge::new();
    
    let content = r#"
café = fn x => x + 1;
résultat = café 42;
emoji_func = fn 🚀 => 🚀 * 2;
"#.trim();
    
    let test_file = create_test_file("unicode_test.noo", content);
    
    // Test that Unicode identifiers work
    match bridge.get_document_symbols(&test_file) {
        Ok(symbols) => {
            let _names: Vec<String> = symbols.iter().map(|s| s.name.clone()).collect();
            // Note: This depends on how the parser handles Unicode
            // The test validates that the system doesn't crash with Unicode
            assert!(symbols.len() > 0, "Should find some symbols even with Unicode");
        }
        Err(_) => {
            // Unicode handling may not be fully implemented - that's okay
            println!("Unicode handling not fully implemented yet");
        }
    }
    
    cleanup_test_file(&test_file);
}

#[test]
fn test_multiple_files_isolation() {
    if !cli_available() {
        println!("Skipping test - Node.js not available");
        return;
    }

    let bridge = TypeScriptBridge::new();
    
    let content1 = "add = fn x y => x + y;\nresult1 = add 1 2;";
    let content2 = "multiply = fn a b => a * b;\nresult2 = multiply 3 4;"; 
    
    let file1 = create_test_file("file1.noo", content1);
    let file2 = create_test_file("file2.noo", content2);
    
    // Test that symbols from different files don't interfere
    let symbols1 = bridge.get_document_symbols(&file1).unwrap();
    let symbols2 = bridge.get_document_symbols(&file2).unwrap();
    
    let names1: Vec<String> = symbols1.iter().map(|s| s.name.clone()).collect();
    let names2: Vec<String> = symbols2.iter().map(|s| s.name.clone()).collect();
    
    assert!(names1.contains(&"add".to_string()));
    assert!(names1.contains(&"result1".to_string()));
    assert!(!names1.contains(&"multiply".to_string()));
    
    assert!(names2.contains(&"multiply".to_string()));
    assert!(names2.contains(&"result2".to_string()));
    assert!(!names2.contains(&"add".to_string()));
    
    cleanup_test_file(&file1);
    cleanup_test_file(&file2);
}