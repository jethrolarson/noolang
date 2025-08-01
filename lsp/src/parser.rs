// TypeScript integration for LSP features
// This module handles communication with the TypeScript interpreter

use std::process::Command;
use anyhow::Result;
use serde_json::Value;

#[derive(Debug)]
pub struct TypeScriptBridge {
    cli_path: String,
}

#[derive(Debug, Clone)]
pub struct DiagnosticInfo {
    pub line: usize,
    pub column: usize,
    pub message: String,
    pub severity: DiagnosticSeverity,
}

#[derive(Debug, Clone)]
#[allow(dead_code)] // Some variants may not be used yet
pub enum DiagnosticSeverity {
    Error,
    Warning,
    Information,
    Hint,
}

#[derive(Debug, Clone)]
#[allow(dead_code)] // May be used in future features
pub struct TypeInfo {
    pub line: usize,
    pub column: usize,
    pub type_string: String,
    pub expression: String,
}

// New structures for navigation features
#[derive(Debug, Clone)]
pub struct SymbolDefinition {
    pub name: String,
    pub kind: SymbolKind,
    pub line: usize,
    pub column: usize,
    pub end_line: usize,
    pub end_column: usize,
}

#[derive(Debug, Clone)]
#[allow(dead_code)] // Some variants may not be used yet
pub enum SymbolKind {
    Variable,
    Function,
    Type,
    Constructor,
}

#[derive(Debug, Clone)]
#[allow(dead_code)] // Used in navigation features
pub struct SymbolReference {
    pub name: String,
    pub line: usize,
    pub column: usize,
    pub end_line: usize,
    pub end_column: usize,
}

impl TypeScriptBridge {
    pub fn new() -> Self {
        // Try multiple possible paths for the CLI
        let possible_paths = vec![
            "../dist/cli.js",           // From lsp/ directory to workspace root
            "dist/cli.js",              // From workspace root
            "../../dist/cli.js",        // From nested directories
            "./dist/cli.js",            // Explicit relative path
        ];
        
        let mut cli_path = "../dist/cli.js".to_string(); // Better default for lsp directory
        
        for path in &possible_paths {
            if std::path::Path::new(path).exists() {
                cli_path = path.to_string();
                break;
            }
        }
        
        Self {
            cli_path,
        }
    }

    /// Call TypeScript interpreter for type checking and get type information
    pub fn get_type_info(&self, file_path: &str) -> Result<Vec<String>> {
        let output = Command::new("node")
            .args(&[&self.cli_path, "--types-file", file_path])
            .output()?;
        
        if output.status.success() {
            let stdout = String::from_utf8(output.stdout)?;
            let types = self.parse_types_output(&stdout);
            Ok(types)
        } else {
            let stderr = String::from_utf8(output.stderr)?;
            Err(anyhow::anyhow!("Type checking failed: {}", stderr))
        }
    }

    /// Get type information for a string expression
    pub fn get_expression_types(&self, expression: &str) -> Result<Vec<String>> {
        let output = Command::new("node")
            .args(&[&self.cli_path, "--types", expression])
            .output()?;
        
        if output.status.success() {
            let stdout = String::from_utf8(output.stdout)?;
            let types = self.parse_types_output(&stdout);
            Ok(types)
        } else {
            let stderr = String::from_utf8(output.stderr)?;
            Err(anyhow::anyhow!("Type checking failed: {}", stderr))
        }
    }

    /// Get AST information for position-based queries
    #[allow(dead_code)] // Used in tests and future features
    pub fn get_ast(&self, expression: &str) -> Result<Value> {
        let output = Command::new("node")
            .args(&[&self.cli_path, "--ast", expression])
            .output()?;
        
        if output.status.success() {
            let stdout = String::from_utf8(output.stdout)?;
            self.parse_ast_output(&stdout)
        } else {
            let stderr = String::from_utf8(output.stderr)?;
            Err(anyhow::anyhow!("AST parsing failed: {}", stderr))
        }
    }

    /// Get AST for a file to support navigation features
    pub fn get_ast_file(&self, file_path: &str) -> Result<Value> {
        let output = Command::new("node")
            .args(&[&self.cli_path, "--ast-file", file_path])
            .output()?;
        
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            self.parse_ast_output(&stdout)
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(anyhow::anyhow!("AST command failed: {}", stderr))
        }
    }

    /// Get position-based type information for hover support
    pub fn get_position_type(&self, file_path: &str, line: usize, column: usize) -> Result<Option<String>> {
        // Try to get AST to find the specific symbol at position
        if let Ok(ast) = self.get_ast_file(file_path) {
            if let Ok(Some(symbol_name)) = self.extract_symbol_at_position(&ast, line, column) {
                // Get the type of the specific symbol
                if let Ok(type_info) = self.get_symbol_type(file_path, &symbol_name) {
                    return Ok(Some(type_info));
                }
            }
        }
        
        // Fallback to expression-based extraction
        if let Ok(content) = std::fs::read_to_string(file_path) {
            let lines: Vec<&str> = content.lines().collect();
            if let Some(target_line) = lines.get(line.saturating_sub(1)) {
                // Try to extract the expression at the given position
                if let Some(expression) = self.extract_expression_at_position(target_line, column) {
                    // Get type information for this specific expression
                    if let Ok(types) = self.get_expression_types(&expression) {
                        if let Some(expr_type) = types.first() {
                            // Clean up the type string to be more readable
                            return Ok(Some(self.simplify_type_string(expr_type)));
                        }
                    }
                }
                
                // Try to extract a simple identifier for variable lookups
                if let Some(identifier) = self.extract_identifier_at_position(target_line, column) {
                    if let Ok(id_type) = self.get_symbol_type(file_path, &identifier) {
                        return Ok(Some(id_type));
                    }
                }
            }
        }
        
        Ok(None)
    }

    /// Get the type of a specific symbol from the program
    fn get_symbol_type(&self, file_path: &str, symbol_name: &str) -> Result<String> {
        // Use the new --symbol-type CLI command
        let output = Command::new("node")
            .args(&[&self.cli_path, "--symbol-type", file_path, symbol_name])
            .output()?;
        
        if output.status.success() {
            let stdout = String::from_utf8(output.stdout)?;
            // Parse the output to extract just the type
            if let Some(type_start) = stdout.find("has type: ") {
                let type_str = stdout[type_start + 10..].trim();
                return Ok(self.simplify_type_string(type_str));
            }
        }
        
        // Fallback: try AST-based approach
        if let Ok(ast) = self.get_ast_file(file_path) {
            if let Some(symbol_type) = self.extract_symbol_type_from_ast(&ast, symbol_name) {
                return Ok(self.simplify_type_string(&symbol_type));
            }
        }
        
        Err(anyhow::anyhow!("Could not determine type for symbol: {}", symbol_name))
    }

    /// Extract symbol type information from AST
    fn extract_symbol_type_from_ast(&self, _ast: &Value, _symbol_name: &str) -> Option<String> {
        // TODO: Implement AST traversal to find symbol type
        // For now, return None to fall back to other methods
        None
    }

    /// Simplify type strings for better hover display
    fn simplify_type_string(&self, type_str: &str) -> String {
        // If it's a complex record type, try to extract just the relevant part
        if type_str.starts_with("{ ") && type_str.contains(": ") {
            // For record types, show a simplified version
            if type_str.len() > 50 {
                return "Record".to_string();
            }
        }
        
        // Clean up function type display
        if type_str.contains(" -> ") {
            return type_str.replace(" -> ", " → ").to_string();
        }
        
        type_str.to_string()
    }

    /// Extract a simple identifier at the given position
    fn extract_identifier_at_position(&self, line: &str, column: usize) -> Option<String> {
        let chars: Vec<char> = line.chars().collect();
        if column >= chars.len() {
            return None;
        }

        // Find identifier boundaries (letters, numbers, underscore)
        let mut start = column;
        let mut end = column;

        // Expand backwards to find start
        while start > 0 {
            let ch = chars[start - 1];
            if ch.is_alphabetic() || ch.is_numeric() || ch == '_' {
                start -= 1;
            } else {
                break;
            }
        }

        // Expand forwards to find end
        while end < chars.len() {
            let ch = chars[end];
            if ch.is_alphabetic() || ch.is_numeric() || ch == '_' {
                end += 1;
            } else {
                break;
            }
        }

        if start < end {
            let identifier: String = chars[start..end].iter().collect();
            // Only return if it looks like a valid identifier (starts with letter)
            if identifier.chars().next().map_or(false, |c| c.is_alphabetic()) {
                return Some(identifier);
            }
        }
        
        None
    }

    /// Extract expression at a given position in a line
    fn extract_expression_at_position(&self, line: &str, column: usize) -> Option<String> {
        let chars: Vec<char> = line.chars().collect();
        if column >= chars.len() {
            return None;
        }

        // Find word boundaries around the cursor position
        let mut start = column;
        let mut end = column;

        // Expand backwards to find start
        while start > 0 {
            let ch = chars[start - 1];
            if ch.is_alphanumeric() || ch == '_' {
                start -= 1;
            } else {
                break;
            }
        }

        // Expand forwards to find end
        while end < chars.len() {
            let ch = chars[end];
            if ch.is_alphanumeric() || ch == '_' {
                end += 1;
            } else {
                break;
            }
        }

        if start < end {
            Some(chars[start..end].iter().collect())
        } else {
            None
        }
    }

    /// Get diagnostics from TypeScript type checker
    pub fn get_diagnostics(&self, file_path: &str) -> Result<Vec<DiagnosticInfo>> {
        let output = Command::new("node")
            .args(&[&self.cli_path, "--types-file", file_path])
            .output()?;
        
        let stderr = String::from_utf8(output.stderr)?;
        let stdout = String::from_utf8(output.stdout)?;
        
        let mut diagnostics = Vec::new();
        
        // Parse errors from stderr
        if !stderr.is_empty() {
            diagnostics.extend(self.parse_error_output(&stderr)?);
        }
        
        // Also check for type errors in stdout
        if !output.status.success() && stdout.contains("Error") {
            diagnostics.extend(self.parse_error_output(&stdout)?);
        }
        
        Ok(diagnostics)
    }

    /// Parse error output to extract diagnostic information
    fn parse_error_output(&self, error_output: &str) -> Result<Vec<DiagnosticInfo>> {
        let mut diagnostics = Vec::new();
        
        for line in error_output.lines() {
            if line.contains("Error") || line.contains("TypeError") || line.contains("Parse error") {
                let mut diag_line = 1;
                let mut diag_column = 1;
                let mut message = line.to_string();
                let mut severity = DiagnosticSeverity::Error;
                
                // Extract line and column information from various patterns
                // Pattern 1: "at line X, column Y"
                if let Some(captures) = self.extract_line_column_pattern1(line) {
                    diag_line = captures.0;
                    diag_column = captures.1;
                }
                // Pattern 2: "line X:Y" or "X:Y" 
                else if let Some(captures) = self.extract_line_column_pattern2(line) {
                    diag_line = captures.0;
                    diag_column = captures.1;
                }
                // Pattern 3: Parse errors with "at line X"
                else if let Some(line_num) = self.extract_parse_error_line(line) {
                    diag_line = line_num;
                    diag_column = 1; // Default to start of line for parse errors
                }
                
                // Clean up the message to remove location info and make it clearer
                message = self.clean_error_message(line);
                
                // Determine severity
                if line.contains("warning") || line.contains("Warning") {
                    severity = DiagnosticSeverity::Warning;
                } else if line.contains("info") || line.contains("Info") {
                    severity = DiagnosticSeverity::Information;
                }
                
                diagnostics.push(DiagnosticInfo {
                    line: diag_line,
                    column: diag_column,
                    message,
                    severity,
                });
            }
        }
        
        // If no specific errors found but there's output, create a generic error
        if diagnostics.is_empty() && !error_output.trim().is_empty() {
            diagnostics.push(DiagnosticInfo {
                line: 1,
                column: 1,
                message: format!("Error: {}", error_output.trim()),
                severity: DiagnosticSeverity::Error,
            });
        }
        
        Ok(diagnostics)
    }

    /// Extract line and column from "at line X, column Y" pattern
    fn extract_line_column_pattern1(&self, line: &str) -> Option<(usize, usize)> {
        if let Some(line_start) = line.find("line ") {
            if let Some(line_end) = line[line_start + 5..].find(',') {
                if let Ok(line_num) = line[line_start + 5..line_start + 5 + line_end].parse::<usize>() {
                    if let Some(col_start) = line.find("column ") {
                        let remaining = &line[col_start + 7..];
                        let col_str: String = remaining.chars()
                            .take_while(|c| c.is_ascii_digit())
                            .collect();
                        if let Ok(col_num) = col_str.parse::<usize>() {
                            return Some((line_num, col_num));
                        }
                    }
                }
            }
        }
        None
    }

    /// Extract line and column from "X:Y" pattern
    fn extract_line_column_pattern2(&self, line: &str) -> Option<(usize, usize)> {
        // Look for patterns like "1:5" or "line 1:5"
        for part in line.split_whitespace() {
            if let Some(colon_pos) = part.find(':') {
                let line_part = &part[..colon_pos];
                let col_part = &part[colon_pos + 1..];
                
                // Remove non-digit prefix if present (like in "line1:5")
                let line_digits: String = line_part.chars()
                    .skip_while(|c| !c.is_ascii_digit())
                    .take_while(|c| c.is_ascii_digit())
                    .collect();
                
                let col_digits: String = col_part.chars()
                    .take_while(|c| c.is_ascii_digit())
                    .collect();
                
                if let (Ok(line_num), Ok(col_num)) = (line_digits.parse::<usize>(), col_digits.parse::<usize>()) {
                    return Some((line_num, col_num));
                }
            }
        }
        None
    }

    /// Extract line number from parse errors
    fn extract_parse_error_line(&self, line: &str) -> Option<usize> {
        if line.contains("Parse error") {
            // Look for "at line X"
            if let Some(at_pos) = line.find("at line ") {
                let remaining = &line[at_pos + 8..];
                let line_str: String = remaining.chars()
                    .take_while(|c| c.is_ascii_digit())
                    .collect();
                if let Ok(line_num) = line_str.parse::<usize>() {
                    return Some(line_num);
                }
            }
            
            // Alternative: look for any number after "line"
            if let Some(line_pos) = line.find("line ") {
                let remaining = &line[line_pos + 5..];
                let line_str: String = remaining.chars()
                    .take_while(|c| c.is_ascii_digit())
                    .collect();
                if let Ok(line_num) = line_str.parse::<usize>() {
                    return Some(line_num);
                }
            }
        }
        None
    }

    /// Clean up error messages for better display
    fn clean_error_message(&self, line: &str) -> String {
        let mut message = line.to_string();
        
        // Remove common prefixes and location info
        if let Some(error_start) = message.find("Error:") {
            message = message[error_start..].to_string();
        } else if let Some(error_start) = message.find("TypeError:") {
            message = message[error_start..].to_string();
        } else if let Some(error_start) = message.find("Parse error:") {
            message = message[error_start..].to_string();
        }
        
        // Remove location patterns that are now redundant
        message = regex::Regex::new(r"\s+at line \d+(?:, column \d+)?")
            .unwrap_or_else(|_| regex::Regex::new(r"").unwrap())
            .replace_all(&message, "")
            .to_string();
        
        message.trim().to_string()
    }

    /// Parse types output from TypeScript
    fn parse_types_output(&self, output: &str) -> Vec<String> {
        let mut types = Vec::new();
        let mut current_types_section = false;
        
        for line in output.lines() {
            let trimmed = line.trim();
            if trimmed == "Types:" {
                current_types_section = true;
                continue;
            }
            
            if current_types_section {
                if trimmed.is_empty() {
                    current_types_section = false;
                } else if let Some(colon_pos) = trimmed.find(':') {
                    if colon_pos + 1 < trimmed.len() {
                        let type_info = trimmed[colon_pos + 1..].trim();
                        if !type_info.is_empty() {
                            types.push(type_info.to_string());
                        }
                    }
                }
            }
        }
        
        types
    }

    /// Parse AST output from TypeScript
    fn parse_ast_output(&self, output: &str) -> Result<Value> {
        // Find the start of JSON and extract everything from there
        let lines: Vec<&str> = output.lines().collect();
        for (i, line) in lines.iter().enumerate() {
            let trimmed = line.trim();
            if trimmed.starts_with('{') {
                // Collect all lines from the JSON start to the end
                let json_lines: Vec<&str> = lines[i..].to_vec();
                let json_str = json_lines.join("\n");
                return Ok(serde_json::from_str(&json_str)?);
            }
        }
        Err(anyhow::anyhow!("No JSON found in AST output"))
    }

    /// Find definition of symbol at given position
    pub fn find_definition(&self, file_path: &str, line: usize, column: usize) -> Result<Option<SymbolDefinition>> {
        let ast = self.get_ast_file(file_path)?;
        let symbol_name = self.extract_symbol_at_position(&ast, line, column)?;
        
        if let Some(name) = symbol_name {
            // Find the definition of this symbol in the AST
            if let Some(definition) = self.find_symbol_definition(&ast, &name) {
                return Ok(Some(definition));
            }
        }
        
        Ok(None)
    }

    /// Find all references to a symbol at the given position
    pub fn find_references(&self, file_path: &str, line: usize, column: usize) -> Result<Vec<SymbolReference>> {
        let ast = self.get_ast_file(file_path)?;
        let symbol_name = self.extract_symbol_at_position(&ast, line, column)?;
        
        if let Some(name) = symbol_name {
            return Ok(self.find_symbol_references(&ast, &name));
        }
        
        Ok(Vec::new())
    }

    /// Extract all symbols from a file for document symbol outline
    pub fn get_document_symbols(&self, file_path: &str) -> Result<Vec<SymbolDefinition>> {
        let ast = self.get_ast_file(file_path)?;
        Ok(self.extract_all_symbols(&ast))
    }

    /// Extract symbol name at the given position
    fn extract_symbol_at_position(&self, ast: &Value, line: usize, column: usize) -> Result<Option<String>> {
        self.find_symbol_at_position_recursive(ast, line, column)
    }

    /// Recursively search AST for symbol at position
    fn find_symbol_at_position_recursive(&self, node: &Value, target_line: usize, target_column: usize) -> Result<Option<String>> {
        // Check if this node has location info
        if let Some(location) = node.get("location") {
            if let (Some(start), Some(end)) = (location.get("start"), location.get("end")) {
                if let (Some(start_line), Some(start_col), Some(end_line), Some(end_col)) = (
                    start.get("line").and_then(|v| v.as_u64()),
                    start.get("column").and_then(|v| v.as_u64()),
                    end.get("line").and_then(|v| v.as_u64()),
                    end.get("column").and_then(|v| v.as_u64()),
                ) {
                    let start_line = start_line as usize;
                    let start_col = start_col as usize;
                    let end_line = end_line as usize;
                    let end_col = end_col as usize;

                    // Check if target position is within this node
                    if self.position_within_range(target_line, target_column, start_line, start_col, end_line, end_col) {
                        // If this is a variable or identifier node, return its name
                        if let Some(kind) = node.get("kind").and_then(|v| v.as_str()) {
                            match kind {
                                "variable" => {
                                    if let Some(name) = node.get("name").and_then(|v| v.as_str()) {
                                        return Ok(Some(name.to_string()));
                                    }
                                }
                                "definition" => {
                                    if let Some(name) = node.get("name").and_then(|v| v.as_str()) {
                                        return Ok(Some(name.to_string()));
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
        }

        // Recursively search child nodes
        if let Some(obj) = node.as_object() {
            for value in obj.values() {
                if let Ok(Some(result)) = self.find_symbol_at_position_recursive(value, target_line, target_column) {
                    return Ok(Some(result));
                }
            }
        }

        if let Some(arr) = node.as_array() {
            for item in arr {
                if let Ok(Some(result)) = self.find_symbol_at_position_recursive(item, target_line, target_column) {
                    return Ok(Some(result));
                }
            }
        }

        Ok(None)
    }

    /// Find the definition of a symbol in the AST
    fn find_symbol_definition(&self, ast: &Value, symbol_name: &str) -> Option<SymbolDefinition> {
        self.find_definition_recursive(ast, symbol_name)
    }

    /// Recursively search for symbol definition
    fn find_definition_recursive(&self, node: &Value, symbol_name: &str) -> Option<SymbolDefinition> {
        // Check if this is a definition node
        if let Some(kind) = node.get("kind").and_then(|v| v.as_str()) {
            if kind == "definition" {
                if let Some(name) = node.get("name").and_then(|v| v.as_str()) {
                    if name == symbol_name {
                        // Extract location information
                        if let Some(location) = node.get("location") {
                            if let (Some(start), Some(end)) = (location.get("start"), location.get("end")) {
                                if let (Some(start_line), Some(start_col), Some(end_line), Some(end_col)) = (
                                    start.get("line").and_then(|v| v.as_u64()),
                                    start.get("column").and_then(|v| v.as_u64()),
                                    end.get("line").and_then(|v| v.as_u64()),
                                    end.get("column").and_then(|v| v.as_u64()),
                                ) {
                                    // Determine symbol kind based on the value
                                    let symbol_kind = if let Some(value) = node.get("value") {
                                        if let Some(value_kind) = value.get("kind").and_then(|v| v.as_str()) {
                                            match value_kind {
                                                "function" => SymbolKind::Function,
                                                _ => SymbolKind::Variable,
                                            }
                                        } else {
                                            SymbolKind::Variable
                                        }
                                    } else {
                                        SymbolKind::Variable
                                    };

                                    return Some(SymbolDefinition {
                                        name: name.to_string(),
                                        kind: symbol_kind,
                                        line: start_line as usize,
                                        column: start_col as usize,
                                        end_line: end_line as usize,
                                        end_column: end_col as usize,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        // Recursively search child nodes
        if let Some(obj) = node.as_object() {
            for value in obj.values() {
                if let Some(result) = self.find_definition_recursive(value, symbol_name) {
                    return Some(result);
                }
            }
        }

        if let Some(arr) = node.as_array() {
            for item in arr {
                if let Some(result) = self.find_definition_recursive(item, symbol_name) {
                    return Some(result);
                }
            }
        }

        None
    }

    /// Find all references to a symbol in the AST
    fn find_symbol_references(&self, ast: &Value, symbol_name: &str) -> Vec<SymbolReference> {
        let mut references = Vec::new();
        self.find_references_recursive(ast, symbol_name, &mut references);
        references
    }

    /// Recursively search for symbol references
    fn find_references_recursive(&self, node: &Value, symbol_name: &str, references: &mut Vec<SymbolReference>) {
        // Check if this is a variable reference
        if let Some(kind) = node.get("kind").and_then(|v| v.as_str()) {
            if kind == "variable" {
                if let Some(name) = node.get("name").and_then(|v| v.as_str()) {
                    if name == symbol_name {
                        // Extract location information
                        if let Some(location) = node.get("location") {
                            if let (Some(start), Some(end)) = (location.get("start"), location.get("end")) {
                                if let (Some(start_line), Some(start_col), Some(end_line), Some(end_col)) = (
                                    start.get("line").and_then(|v| v.as_u64()),
                                    start.get("column").and_then(|v| v.as_u64()),
                                    end.get("line").and_then(|v| v.as_u64()),
                                    end.get("column").and_then(|v| v.as_u64()),
                                ) {
                                    references.push(SymbolReference {
                                        name: name.to_string(),
                                        line: start_line as usize,
                                        column: start_col as usize,
                                        end_line: end_line as usize,
                                        end_column: end_col as usize,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        // Recursively search child nodes
        if let Some(obj) = node.as_object() {
            for value in obj.values() {
                self.find_references_recursive(value, symbol_name, references);
            }
        }

        if let Some(arr) = node.as_array() {
            for item in arr {
                self.find_references_recursive(item, symbol_name, references);
            }
        }
    }

    /// Extract all symbol definitions for document outline
    fn extract_all_symbols(&self, ast: &Value) -> Vec<SymbolDefinition> {
        let mut symbols = Vec::new();
        self.extract_symbols_recursive(ast, &mut symbols);
        symbols
    }

    /// Recursively extract all symbol definitions
    fn extract_symbols_recursive(&self, node: &Value, symbols: &mut Vec<SymbolDefinition>) {
        // Check if this is a definition node
        if let Some(kind) = node.get("kind").and_then(|v| v.as_str()) {
            if kind == "definition" {
                if let Some(name) = node.get("name").and_then(|v| v.as_str()) {
                    // Extract location information
                    if let Some(location) = node.get("location") {
                        if let (Some(start), Some(end)) = (location.get("start"), location.get("end")) {
                            if let (Some(start_line), Some(start_col), Some(end_line), Some(end_col)) = (
                                start.get("line").and_then(|v| v.as_u64()),
                                start.get("column").and_then(|v| v.as_u64()),
                                end.get("line").and_then(|v| v.as_u64()),
                                end.get("column").and_then(|v| v.as_u64()),
                            ) {
                                // Determine symbol kind based on the value
                                let symbol_kind = if let Some(value) = node.get("value") {
                                    if let Some(value_kind) = value.get("kind").and_then(|v| v.as_str()) {
                                        match value_kind {
                                            "function" => SymbolKind::Function,
                                            _ => SymbolKind::Variable,
                                        }
                                    } else {
                                        SymbolKind::Variable
                                    }
                                } else {
                                    SymbolKind::Variable
                                };

                                symbols.push(SymbolDefinition {
                                    name: name.to_string(),
                                    kind: symbol_kind,
                                    line: start_line as usize,
                                    column: start_col as usize,
                                    end_line: end_line as usize,
                                    end_column: end_col as usize,
                                });
                            }
                        }
                    }
                }
            }
        }

        // Recursively search child nodes
        if let Some(obj) = node.as_object() {
            for value in obj.values() {
                self.extract_symbols_recursive(value, symbols);
            }
        }

        if let Some(arr) = node.as_array() {
            for item in arr {
                self.extract_symbols_recursive(item, symbols);
            }
        }
    }

    /// Check if position is within the given range
    pub fn position_within_range(&self, target_line: usize, target_col: usize, 
                                start_line: usize, start_col: usize, 
                                end_line: usize, end_col: usize) -> bool {
        if target_line < start_line || target_line > end_line {
            return false;
        }
        
        if target_line == start_line && target_col < start_col {
            return false;
        }
        
        if target_line == end_line && target_col > end_col {
            return false;
        }
        
        true
    }

    /// Get completion suggestions based on context
    pub fn get_completions(&self, file_path: &str, _line: usize, _column: usize) -> Vec<String> {
        // Static completions for now - can be enhanced with context analysis
        let completions = vec![
            // Keywords
            "fn".to_string(),
            "if".to_string(),
            "then".to_string(),
            "else".to_string(),
            "match".to_string(),
            "with".to_string(),
            "type".to_string(),
            "mut".to_string(),
            "constraint".to_string(),
            "implement".to_string(),
            
            // ADT Constructors
            "True".to_string(),
            "False".to_string(),
            "Some".to_string(),
            "None".to_string(),
            "Ok".to_string(),
            "Err".to_string(),
            
            // Built-in Functions
            "head".to_string(),
            "tail".to_string(),
            "map".to_string(),
            "filter".to_string(),
            "reduce".to_string(),
            "length".to_string(),
            "print".to_string(),
            "toString".to_string(),
            "read".to_string(),
            "write".to_string(),
            "log".to_string(),
            "random".to_string(),
        ];

        // Try to get more completions from analyzing the file
        if let Ok(_types) = self.get_type_info(file_path) {
            // Could extract variable names from type info in the future
            // For now, just add the static completions
        }

        completions
    }
} 

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    // Helper function to create a test file with unique name
    fn create_test_file(content: &str) -> Result<String> {
        use std::time::{SystemTime, UNIX_EPOCH};
        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let test_file = format!("/tmp/test_navigation_{}.noo", timestamp);
        fs::write(&test_file, content)?;
        Ok(test_file)
    }

    // Helper function to create TypeScript bridge
    fn create_bridge() -> TypeScriptBridge {
        TypeScriptBridge::new()
    }

    // Helper function to check if CLI is available
    fn cli_available() -> bool {
        let bridge = TypeScriptBridge::new();
        
        // Check if CLI file exists and Node.js can execute it
        std::path::Path::new(&bridge.cli_path).exists() &&
        std::process::Command::new("node")
            .args(&["--version"])
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    }

    #[test]
    fn test_find_definition_basic() {
        if !cli_available() {
            println!("Skipping test - TypeScript CLI not available");
            return;
        }

        let content = "add = fn x y => x + y;\nresult = add 2 3;";
        let test_file = create_test_file(content).unwrap();
        let bridge = create_bridge();

        // Test finding definition of 'add' at usage site (line 2, column 10)
        let definition = bridge.find_definition(&test_file, 2, 10);
        
        match definition {
            Ok(Some(def)) => {
                assert_eq!(def.name, "add");
                assert_eq!(def.line, 1); // Definition is on line 1
                assert_eq!(def.column, 1); // Starts at column 1
                match def.kind {
                    SymbolKind::Function => (), // Expected
                    _ => panic!("Expected Function kind"),
                }
            }
            Ok(None) => panic!("Expected to find definition"),
            Err(e) => panic!("Error finding definition: {}", e),
        }

        // Clean up
        let _ = fs::remove_file(test_file);
    }

    #[test]
    fn test_find_definition_variable() {
        if !cli_available() {
            println!("Skipping test - TypeScript CLI not available");
            return;
        }

        let content = "value = 42;\nresult = value + 1;";
        let test_file = create_test_file(content).unwrap();
        let bridge = create_bridge();

        // Test finding definition of 'value' at usage site
        let definition = bridge.find_definition(&test_file, 2, 10);
        
        match definition {
            Ok(Some(def)) => {
                assert_eq!(def.name, "value");
                assert_eq!(def.line, 1);
                match def.kind {
                    SymbolKind::Variable => (), // Expected
                    _ => panic!("Expected Variable kind"),
                }
            }
            Ok(None) => panic!("Expected to find definition"),
            Err(e) => panic!("Error finding definition: {}", e),
        }

        // Clean up
        let _ = fs::remove_file(test_file);
    }

    #[test]
    fn test_find_definition_not_found() {
        let content = "add = fn x y => x + y;";
        let test_file = create_test_file(content).unwrap();
        let bridge = create_bridge();

        // Test trying to find definition at empty space
        let definition = bridge.find_definition(&test_file, 1, 25);
        
        match definition {
            Ok(None) => (), // Expected - no symbol at that position
            Ok(Some(_)) => panic!("Should not find definition at empty position"),
            Err(e) => panic!("Error: {}", e),
        }

        // Clean up
        let _ = fs::remove_file(test_file);
    }

    #[test]
    fn test_find_references_basic() {
        let content = "add = fn x y => x + y;\nresult = add 2 3;\ncalc = add 1 4;";
        let test_file = create_test_file(content).unwrap();
        let bridge = create_bridge();

        // Test finding references to 'add' from definition site
        let references = bridge.find_references(&test_file, 1, 1);
        
        match references {
            Ok(refs) => {
                // Should find references at lines 2 and 3
                assert!(refs.len() >= 2, "Expected at least 2 references, got {}", refs.len());
                
                // Check that we have references on lines 2 and 3
                let line_2_ref = refs.iter().any(|r| r.line == 2);
                let line_3_ref = refs.iter().any(|r| r.line == 3);
                assert!(line_2_ref, "Expected reference on line 2");
                assert!(line_3_ref, "Expected reference on line 3");
            }
            Err(e) => panic!("Error finding references: {}", e),
        }

        // Clean up
        let _ = fs::remove_file(test_file);
    }

    #[test]
    fn test_find_references_from_usage() {
        let content = "multiply = fn a b => a * b;\nresult = multiply 3 4;";
        let test_file = create_test_file(content).unwrap();
        let bridge = create_bridge();

        // Test finding references from usage site (line 2)
        let references = bridge.find_references(&test_file, 2, 10);
        
        match references {
            Ok(refs) => {
                assert!(refs.len() >= 1, "Expected at least 1 reference");
                // Should find the usage on line 2
                let line_2_ref = refs.iter().any(|r| r.line == 2);
                assert!(line_2_ref, "Expected reference on line 2");
            }
            Err(e) => panic!("Error finding references: {}", e),
        }

        // Clean up
        let _ = fs::remove_file(test_file);
    }

    #[test]
    fn test_get_document_symbols() {
        let content = "add = fn x y => x + y;\nmultiply = fn a b => a * b;\nresult = 42;";
        let test_file = create_test_file(content).unwrap();
        let bridge = create_bridge();

        let symbols = bridge.get_document_symbols(&test_file);
        
        match symbols {
            Ok(syms) => {
                assert!(syms.len() >= 3, "Expected at least 3 symbols, got {}", syms.len());
                
                // Check for expected symbols
                let add_symbol = syms.iter().find(|s| s.name == "add");
                let multiply_symbol = syms.iter().find(|s| s.name == "multiply");
                let result_symbol = syms.iter().find(|s| s.name == "result");
                
                assert!(add_symbol.is_some(), "Expected 'add' symbol");
                assert!(multiply_symbol.is_some(), "Expected 'multiply' symbol");
                assert!(result_symbol.is_some(), "Expected 'result' symbol");
                
                // Check symbol kinds
                if let Some(add) = add_symbol {
                    match add.kind {
                        SymbolKind::Function => (),
                        _ => panic!("Expected 'add' to be a function"),
                    }
                }
                
                if let Some(result) = result_symbol {
                    match result.kind {
                        SymbolKind::Variable => (),
                        _ => panic!("Expected 'result' to be a variable"),
                    }
                }
            }
            Err(e) => panic!("Error getting document symbols: {}", e),
        }

        // Clean up
        let _ = fs::remove_file(test_file);
    }

    #[test]
    fn test_complex_nested_expressions() {
        let content = "add = fn x y => x + y;\ncalculation = add (add 1 2) (add 3 4);";
        let test_file = create_test_file(content).unwrap();
        let bridge = create_bridge();

        // Test finding references in nested expressions
        let references = bridge.find_references(&test_file, 1, 1);
        
        match references {
            Ok(refs) => {
                // Should find multiple references to 'add' in the nested expression
                assert!(refs.len() >= 3, "Expected at least 3 references in nested expression, got {}", refs.len());
                
                // All references should be on line 2
                let line_2_refs = refs.iter().filter(|r| r.line == 2).count();
                assert!(line_2_refs >= 3, "Expected at least 3 references on line 2");
            }
            Err(e) => panic!("Error finding references in nested expression: {}", e),
        }

        // Clean up
        let _ = fs::remove_file(test_file);
    }

    #[test]
    fn test_position_within_range() {
        let bridge = create_bridge();
        
        // Test position checking - this doesn't require CLI
        assert!(bridge.position_within_range(5, 10, 5, 5, 5, 15)); // Within single line
        assert!(bridge.position_within_range(5, 10, 4, 0, 6, 0));  // Within multi-line
        assert!(bridge.position_within_range(5, 5, 5, 5, 5, 5));   // Exact match
        
        assert!(!bridge.position_within_range(5, 10, 6, 0, 7, 0)); // Before range
        assert!(!bridge.position_within_range(5, 10, 3, 0, 4, 0)); // After range
        assert!(!bridge.position_within_range(5, 3, 5, 5, 5, 15)); // Before start column
        assert!(!bridge.position_within_range(5, 20, 5, 5, 5, 15)); // After end column
    }

    #[test]
    fn test_bridge_creation() {
        // Test that we can create a bridge without panicking
        let bridge = create_bridge();
        assert!(bridge.cli_path.contains("cli.js"));
    }

    #[test]
    fn test_symbol_kinds() {
        // Test that symbol kinds work as expected
        let func_kind = SymbolKind::Function;
        let var_kind = SymbolKind::Variable;
        
        // This is mainly a compile-time test to ensure the enums work
        match func_kind {
            SymbolKind::Function => assert!(true),
            _ => assert!(false, "Expected Function kind"),
        }
        
        match var_kind {
            SymbolKind::Variable => assert!(true),
            _ => assert!(false, "Expected Variable kind"),
        }
    }

    #[test]
    fn test_error_handling_invalid_file() {
        let bridge = create_bridge();
        
        // Test with non-existent file
        let result = bridge.find_definition("/tmp/nonexistent.noo", 1, 1);
        assert!(result.is_err(), "Expected error for non-existent file");
        
        let result = bridge.find_references("/tmp/nonexistent.noo", 1, 1);
        assert!(result.is_err(), "Expected error for non-existent file");
        
        let result = bridge.get_document_symbols("/tmp/nonexistent.noo");
        assert!(result.is_err(), "Expected error for non-existent file");
    }

    #[test]
    fn test_error_handling_malformed_code() {
        let content = "add = fn x y => x +"; // Incomplete expression
        let test_file = create_test_file(content).unwrap();
        let bridge = create_bridge();

        // The AST generation should fail gracefully
        let result = bridge.find_definition(&test_file, 1, 1);
        // Should either succeed with None or fail gracefully
        match result {
            Ok(_) => (), // Acceptable
            Err(_) => (), // Also acceptable for malformed code
        }

        // Clean up
        let _ = fs::remove_file(test_file);
    }

    #[test]
    fn test_ast_file_method() {
        let content = "test = fn x => x;";
        let test_file = create_test_file(content).unwrap();
        let bridge = create_bridge();

        let ast_result = bridge.get_ast_file(&test_file);
        match ast_result {
            Ok(ast) => {
                // Should be valid JSON
                assert!(ast.is_object(), "Expected AST to be a JSON object");
            }
            Err(e) => panic!("Error getting AST: {}", e),
        }

        // Clean up
        let _ = fs::remove_file(test_file);
    }
} 