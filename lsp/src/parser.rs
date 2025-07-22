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
pub enum DiagnosticSeverity {
    Error,
    Warning,
    Information,
    Hint,
}

#[derive(Debug, Clone)]
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
pub enum SymbolKind {
    Variable,
    Function,
    Type,
    Constructor,
}

#[derive(Debug, Clone)]
pub struct SymbolReference {
    pub name: String,
    pub line: usize,
    pub column: usize,
    pub end_line: usize,
    pub end_column: usize,
}

impl TypeScriptBridge {
    pub fn new() -> Self {
        // Get the current executable directory and resolve the CLI path
        let exe_path = std::env::current_exe().unwrap_or_else(|_| std::path::PathBuf::from(""));
        let exe_dir = exe_path.parent().unwrap_or_else(|| std::path::Path::new(""));
        
        // Try to find the CLI relative to the LSP binary location
        let cli_path = if exe_dir.join("../dist/cli.js").exists() {
            exe_dir.join("../dist/cli.js")
        } else if exe_dir.join("../../dist/cli.js").exists() {
            exe_dir.join("../../dist/cli.js")
        } else if exe_dir.join("dist/cli.js").exists() {
            exe_dir.join("dist/cli.js")
        } else {
            // Fallback to relative path from current working directory
            std::path::PathBuf::from("dist/cli.js")
        };
        
        // Debug logging for path resolution
        eprintln!("LSP Debug: CLI path resolved to: {}", cli_path.display());
        eprintln!("LSP Debug: CLI exists: {}", cli_path.exists());
        
        Self {
            cli_path: cli_path.to_string_lossy().to_string(),
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
        // First try to get the AST to understand the structure
        if let Ok(content) = std::fs::read_to_string(file_path) {
            let lines: Vec<&str> = content.lines().collect();
            if let Some(target_line) = lines.get(line.saturating_sub(1)) {
                // Try to extract the expression at the given position
                if let Some(expression) = self.extract_expression_at_position(target_line, column) {
                    // Get type information for this expression
                    if let Ok(types) = self.get_expression_types(&expression) {
                        return Ok(types.first().cloned());
                    }
                }
            }
            
            // Fallback: get all types for the file and try to match position
            if let Ok(types) = self.get_type_info(file_path) {
                return Ok(types.first().cloned());
            }
        }
        
        Ok(None)
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
            if line.contains("Error:") || line.contains("TypeError:") {
                // Try to extract line and column information
                // Look for patterns like "at line 1, column 5" or "1:5"
                let mut diag_line = 1;
                let mut diag_column = 1;
                let mut message = line.to_string();
                
                // Try to parse position information
                if let Some(pos_start) = line.find("line ") {
                    if let Some(pos_end) = line[pos_start + 5..].find(',') {
                        if let Ok(line_num) = line[pos_start + 5..pos_start + 5 + pos_end].parse::<usize>() {
                            diag_line = line_num;
                        }
                    }
                }
                
                if let Some(pos_start) = line.find("column ") {
                    if let Some(remaining) = line.get(pos_start + 7..) {
                        let col_str: String = remaining.chars()
                            .take_while(|c| c.is_ascii_digit())
                            .collect();
                        if let Ok(col_num) = col_str.parse::<usize>() {
                            diag_column = col_num;
                        }
                    }
                }
                
                // Clean up the message
                if let Some(error_start) = line.find("Error:") {
                    message = line[error_start..].to_string();
                } else if let Some(error_start) = line.find("TypeError:") {
                    message = line[error_start..].to_string();
                }
                
                diagnostics.push(DiagnosticInfo {
                    line: diag_line,
                    column: diag_column,
                    message,
                    severity: DiagnosticSeverity::Error,
                });
            }
        }
        
        Ok(diagnostics)
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
        // Find JSON in the output
        for line in output.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with('{') {
                return Ok(serde_json::from_str(trimmed)?);
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
    fn position_within_range(&self, target_line: usize, target_col: usize, 
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