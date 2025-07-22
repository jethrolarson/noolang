use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::*;
use tower_lsp::{Client, LanguageServer};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::parser::{TypeScriptBridge, DiagnosticSeverity, SymbolKind};

pub struct Backend {
    client: Client,
    ts_bridge: TypeScriptBridge,
    // Store file contents for incremental changes
    documents: Arc<Mutex<HashMap<Url, String>>>,
}

impl Backend {
    pub fn new(client: Client) -> Self {
        Self {
            client,
            ts_bridge: TypeScriptBridge::new(),
            documents: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Convert our diagnostic info to LSP diagnostics
    async fn create_diagnostics(&self, file_path: &str) -> Vec<Diagnostic> {
        match self.ts_bridge.get_diagnostics(file_path) {
            Ok(diagnostics) => {
                diagnostics.into_iter().map(|diag| {
                    let severity = match diag.severity {
                        DiagnosticSeverity::Error => Some(tower_lsp::lsp_types::DiagnosticSeverity::ERROR),
                        DiagnosticSeverity::Warning => Some(tower_lsp::lsp_types::DiagnosticSeverity::WARNING),
                        DiagnosticSeverity::Information => Some(tower_lsp::lsp_types::DiagnosticSeverity::INFORMATION),
                        DiagnosticSeverity::Hint => Some(tower_lsp::lsp_types::DiagnosticSeverity::HINT),
                    };

                    Diagnostic {
                        range: Range {
                            start: Position {
                                line: (diag.line.saturating_sub(1)) as u32, // Convert to 0-based
                                character: (diag.column.saturating_sub(1)) as u32, // Convert to 0-based
                            },
                            end: Position {
                                line: (diag.line.saturating_sub(1)) as u32,
                                character: diag.column as u32, // End one character after start
                            },
                        },
                        severity,
                        code: None,
                        code_description: None,
                        source: Some("noolang".to_string()),
                        message: diag.message,
                        related_information: None,
                        tags: None,
                        data: None,
                    }
                }).collect()
            }
            Err(e) => {
                eprintln!("Failed to get diagnostics: {}", e);
                vec![]
            }
        }
    }

    /// Get the file path from a URI
    fn uri_to_file_path(&self, uri: &Url) -> Option<String> {
        uri.to_file_path().ok()?.to_str().map(|s| s.to_string())
    }

    /// Apply an incremental change to document content
    fn apply_incremental_change(&self, content: &mut String, range: &Range, new_text: &str) -> anyhow::Result<()> {
        let lines: Vec<&str> = content.lines().collect();
        
        // Convert LSP positions (0-based) to string indices
        let start_line = range.start.line as usize;
        let start_char = range.start.character as usize;
        let end_line = range.end.line as usize;
        let end_char = range.end.character as usize;

        // Validate range bounds
        if start_line >= lines.len() || end_line >= lines.len() {
            return Err(anyhow::anyhow!("Range out of bounds: document has {} lines, but range refers to lines {}-{}", 
                lines.len(), start_line, end_line));
        }

        // Calculate byte offsets
        let mut start_offset = 0;

        // Add bytes for complete lines before start line
        for i in 0..start_line {
            start_offset += lines[i].len() + 1; // +1 for newline
        }
        
        // Add bytes for characters in start line up to start character
        let start_line_chars: Vec<char> = lines[start_line].chars().collect();
        if start_char > start_line_chars.len() {
            return Err(anyhow::anyhow!("Start character {} out of bounds for line {} (length {})", 
                start_char, start_line, start_line_chars.len()));
        }
        start_offset += start_line_chars[..start_char].iter().map(|c| c.len_utf8()).sum::<usize>();

        // Calculate end offset
        let mut end_offset = start_offset;
        
        if start_line == end_line {
            // Same line - just add character difference
            let end_char_bounded = std::cmp::min(end_char, start_line_chars.len());
            end_offset += start_line_chars[start_char..end_char_bounded].iter().map(|c| c.len_utf8()).sum::<usize>();
        } else {
            // Multi-line change
            // Add remaining characters from start line
            end_offset += start_line_chars[start_char..].iter().map(|c| c.len_utf8()).sum::<usize>();
            end_offset += 1; // newline after start line
            
            // Add complete lines between start and end
            for i in (start_line + 1)..end_line {
                end_offset += lines[i].len() + 1; // +1 for newline
            }
            
            // Add characters from end line up to end character
            let end_line_chars: Vec<char> = lines[end_line].chars().collect();
            let end_char_bounded = std::cmp::min(end_char, end_line_chars.len());
            end_offset += end_line_chars[..end_char_bounded].iter().map(|c| c.len_utf8()).sum::<usize>();
        }

        // Apply the change
        content.replace_range(start_offset..end_offset, new_text);
        
        Ok(())
    }
}

#[tower_lsp::async_trait]
impl LanguageServer for Backend {
    async fn initialize(&self, _: InitializeParams) -> Result<InitializeResult> {
        Ok(InitializeResult {
            capabilities: ServerCapabilities {
                text_document_sync: Some(TextDocumentSyncCapability::Kind(
                    TextDocumentSyncKind::FULL,
                )),
                completion_provider: Some(CompletionOptions {
                    resolve_provider: Some(false),
                    trigger_characters: Some(vec![".".to_string(), "|".to_string(), "@".to_string()]),
                    work_done_progress_options: Default::default(),
                    all_commit_characters: None,
                    completion_item: None,
                }),
                hover_provider: Some(HoverProviderCapability::Simple(true)),
                definition_provider: Some(OneOf::Left(true)),
                references_provider: Some(OneOf::Left(true)),
                document_symbol_provider: Some(OneOf::Left(true)),
                workspace_symbol_provider: Some(OneOf::Left(true)),
                ..ServerCapabilities::default()
            },
            server_info: Some(ServerInfo {
                name: "Noolang Language Server".to_string(),
                version: Some("0.1.0".to_string()),
            }),
        })
    }

    async fn initialized(&self, _: InitializedParams) {
        self.client
            .log_message(MessageType::INFO, "Noolang LSP server initialized!")
            .await;
    }

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        let uri = params.text_document.uri;
        let content = params.text_document.text;
        
        // Store the document content
        let mut documents = self.documents.lock().await;
        documents.insert(uri.clone(), content);
        drop(documents);

        // Send diagnostics for the opened file
        if let Some(file_path) = self.uri_to_file_path(&uri) {
            let diagnostics = self.create_diagnostics(&file_path).await;
            self.client
                .publish_diagnostics(uri, diagnostics, None)
                .await;
        }
    }

    async fn did_change(&self, params: DidChangeTextDocumentParams) {
        let uri = params.text_document.uri;
        
        // Update document content
        let mut documents = self.documents.lock().await;
        if let Some(content) = documents.get_mut(&uri) {
            for change in params.content_changes {
                if let Some(range) = change.range {
                    // Incremental change - apply the change to the specified range
                    if let Err(e) = self.apply_incremental_change(content, &range, &change.text) {
                        eprintln!("Failed to apply incremental change: {}", e);
                        // Fallback: if incremental change fails, log error but continue
                        // In a real implementation, you might want to request full document sync
                    }
                } else {
                    // Full document change
                    *content = change.text;
                }
            }
        }
        drop(documents);

        // Send updated diagnostics
        if let Some(file_path) = self.uri_to_file_path(&uri) {
            let diagnostics = self.create_diagnostics(&file_path).await;
            self.client
                .publish_diagnostics(uri, diagnostics, None)
                .await;
        }
    }

    async fn did_save(&self, params: DidSaveTextDocumentParams) {
        let uri = params.text_document.uri;
        
        // Re-run diagnostics on save for fresh type checking
        if let Some(file_path) = self.uri_to_file_path(&uri) {
            let diagnostics = self.create_diagnostics(&file_path).await;
            self.client
                .publish_diagnostics(uri, diagnostics, None)
                .await;
        }
    }

    async fn completion(&self, params: CompletionParams) -> Result<Option<CompletionResponse>> {
        let uri = &params.text_document_position.text_document.uri;
        let position = &params.text_document_position.position;
        
        if let Some(file_path) = self.uri_to_file_path(uri) {
            let completions = self.ts_bridge.get_completions(
                &file_path,
                position.line as usize + 1, // Convert to 1-based
                position.character as usize + 1, // Convert to 1-based
            );

            let items: Vec<CompletionItem> = completions.into_iter()
                .map(|completion| CompletionItem {
                    label: completion.clone(),
                    kind: Some(if completion.starts_with(char::is_uppercase) {
                        CompletionItemKind::CONSTRUCTOR
                    } else if completion == "fn" || completion == "if" || 
                              completion == "then" || completion == "else" ||
                              completion == "match" || completion == "with" ||
                              completion == "type" || completion == "mut" ||
                              completion == "constraint" || completion == "implement" {
                        CompletionItemKind::KEYWORD
                    } else {
                        CompletionItemKind::FUNCTION
                    }),
                    detail: Some(format!("Noolang {}", 
                        if completion.starts_with(char::is_uppercase) { "constructor" }
                        else if completion == "fn" { "keyword" }
                        else { "function" }
                    )),
                    documentation: None,
                    deprecated: Some(false),
                    preselect: Some(false),
                    sort_text: Some(completion.clone()),
                    filter_text: Some(completion.clone()),
                    insert_text: Some(completion.clone()),
                    insert_text_format: Some(InsertTextFormat::PLAIN_TEXT),
                    insert_text_mode: None,
                    text_edit: None,
                    additional_text_edits: None,
                    command: None,
                    commit_characters: None,
                    data: None,
                    tags: None,
                    label_details: None,
                })
                .collect();

            return Ok(Some(CompletionResponse::Array(items)));
        }

        Ok(None)
    }

    async fn hover(&self, params: HoverParams) -> Result<Option<Hover>> {
        let uri = &params.text_document_position_params.text_document.uri;
        let position = &params.text_document_position_params.position;
        
        if let Some(file_path) = self.uri_to_file_path(uri) {
            // Use position-based type information
            if let Ok(Some(type_info)) = self.ts_bridge.get_position_type(
                &file_path,
                position.line as usize + 1, // Convert to 1-based
                position.character as usize + 1, // Convert to 1-based
            ) {
                let hover_contents = HoverContents::Scalar(
                    MarkedString::LanguageString(LanguageString {
                        language: "noolang".to_string(),
                        value: format!("Type: {}", type_info),
                    })
                );

                return Ok(Some(Hover {
                    contents: hover_contents,
                    range: Some(Range {
                        start: position.clone(),
                        end: Position {
                            line: position.line,
                            character: position.character + 1,
                        },
                    }),
                }));
            }

            // Fallback to general file type info if position-based fails
            if let Ok(types) = self.ts_bridge.get_type_info(&file_path) {
                if let Some(first_type) = types.first() {
                    let hover_contents = HoverContents::Scalar(
                        MarkedString::LanguageString(LanguageString {
                            language: "noolang".to_string(),
                            value: format!("Type: {}", first_type),
                        })
                    );

                    return Ok(Some(Hover {
                        contents: hover_contents,
                        range: Some(Range {
                            start: position.clone(),
                            end: Position {
                                line: position.line,
                                character: position.character + 1,
                            },
                        }),
                    }));
                }
            }
        }

        Ok(None)
    }

    async fn goto_definition(&self, params: GotoDefinitionParams) -> Result<Option<GotoDefinitionResponse>> {
        let uri = &params.text_document_position_params.text_document.uri;
        let position = &params.text_document_position_params.position;
        
        // Convert URI to file path
        let file_path = uri.path();
        
        // Convert LSP position (0-based) to our internal format (1-based)
        let line = (position.line + 1) as usize;
        let column = (position.character + 1) as usize;
        
        match self.ts_bridge.find_definition(file_path, line, column) {
            Ok(Some(definition)) => {
                let location = Location {
                    uri: uri.clone(),
                    range: Range {
                        start: Position {
                            line: (definition.line.saturating_sub(1)) as u32, // Convert to 0-based
                            character: (definition.column.saturating_sub(1)) as u32, // Convert to 0-based
                        },
                        end: Position {
                            line: (definition.end_line.saturating_sub(1)) as u32,
                            character: (definition.end_column.saturating_sub(1)) as u32,
                        },
                    },
                };
                Ok(Some(GotoDefinitionResponse::Scalar(location)))
            }
            Ok(None) => Ok(None),
            Err(err) => {
                eprintln!("Error finding definition: {}", err);
                Ok(None)
            }
        }
    }

    async fn references(&self, params: ReferenceParams) -> Result<Option<Vec<Location>>> {
        let uri = &params.text_document_position.text_document.uri;
        let position = &params.text_document_position.position;
        
        // Convert URI to file path
        let file_path = uri.path();
        
        // Convert LSP position (0-based) to our internal format (1-based)
        let line = (position.line + 1) as usize;
        let column = (position.character + 1) as usize;
        
        match self.ts_bridge.find_references(file_path, line, column) {
            Ok(references) => {
                if references.is_empty() {
                    Ok(None)
                } else {
                    let locations: Vec<Location> = references.into_iter().map(|reference| {
                        Location {
                            uri: uri.clone(),
                            range: Range {
                                start: Position {
                                    line: (reference.line.saturating_sub(1)) as u32, // Convert to 0-based
                                    character: (reference.column.saturating_sub(1)) as u32, // Convert to 0-based
                                },
                                end: Position {
                                    line: (reference.end_line.saturating_sub(1)) as u32,
                                    character: (reference.end_column.saturating_sub(1)) as u32,
                                },
                            },
                        }
                    }).collect();
                    Ok(Some(locations))
                }
            }
            Err(err) => {
                eprintln!("Error finding references: {}", err);
                Ok(None)
            }
        }
    }

    async fn document_symbol(&self, params: DocumentSymbolParams) -> Result<Option<DocumentSymbolResponse>> {
        let uri = &params.text_document.uri;
        
        // Convert URI to file path
        let file_path = uri.path();
        
        match self.ts_bridge.get_document_symbols(file_path) {
            Ok(symbols) => {
                if symbols.is_empty() {
                    Ok(None)
                } else {
                    let symbol_info: Vec<SymbolInformation> = symbols.into_iter().map(|symbol| {
                        let symbol_kind = match symbol.kind {
                            SymbolKind::Function => tower_lsp::lsp_types::SymbolKind::FUNCTION,
                            SymbolKind::Variable => tower_lsp::lsp_types::SymbolKind::VARIABLE,
                            SymbolKind::Type => tower_lsp::lsp_types::SymbolKind::CLASS,
                            SymbolKind::Constructor => tower_lsp::lsp_types::SymbolKind::CONSTRUCTOR,
                        };

                        SymbolInformation {
                            name: symbol.name,
                            kind: symbol_kind,
                            tags: None,
                            deprecated: None,
                            location: Location {
                                uri: uri.clone(),
                                range: Range {
                                    start: Position {
                                        line: (symbol.line.saturating_sub(1)) as u32, // Convert to 0-based
                                        character: (symbol.column.saturating_sub(1)) as u32, // Convert to 0-based
                                    },
                                    end: Position {
                                        line: (symbol.end_line.saturating_sub(1)) as u32,
                                        character: (symbol.end_column.saturating_sub(1)) as u32,
                                    },
                                },
                            },
                            container_name: None,
                        }
                    }).collect();
                    Ok(Some(DocumentSymbolResponse::Flat(symbol_info)))
                }
            }
            Err(err) => {
                eprintln!("Error getting document symbols: {}", err);
                Ok(None)
            }
        }
    }

    async fn symbol(&self, params: WorkspaceSymbolParams) -> Result<Option<Vec<SymbolInformation>>> {
        // TODO: Implement workspace symbol search
        // For now, return None to indicate no symbols found
        let _query = &params.query;
        
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use tower_lsp::lsp_types::{Position, Range};

    // Helper function that implements the same logic as apply_incremental_change for testing
    fn apply_incremental_change_test(content: &mut String, range: &Range, new_text: &str) -> std::result::Result<(), String> {
        let lines: Vec<&str> = content.lines().collect();
        
        // Convert LSP positions (0-based) to string indices
        let start_line = range.start.line as usize;
        let start_char = range.start.character as usize;
        let end_line = range.end.line as usize;
        let end_char = range.end.character as usize;

        // Validate range bounds
        if start_line >= lines.len() || end_line >= lines.len() {
            return Err(format!("Range out of bounds: document has {} lines, but range refers to lines {}-{}", 
                lines.len(), start_line, end_line));
        }

        // Calculate byte offsets
        let mut start_offset = 0;

        // Add bytes for complete lines before start line
        for i in 0..start_line {
            start_offset += lines[i].len() + 1; // +1 for newline
        }
        
        // Add bytes for characters in start line up to start character
        let start_line_chars: Vec<char> = lines[start_line].chars().collect();
        if start_char > start_line_chars.len() {
            return Err(format!("Start character {} out of bounds for line {} (length {})", 
                start_char, start_line, start_line_chars.len()));
        }
        start_offset += start_line_chars[..start_char].iter().map(|c| c.len_utf8()).sum::<usize>();

        // Calculate end offset
        let mut end_offset = start_offset;
        
        if start_line == end_line {
            // Same line - just add character difference
            let end_char_bounded = std::cmp::min(end_char, start_line_chars.len());
            end_offset += start_line_chars[start_char..end_char_bounded].iter().map(|c| c.len_utf8()).sum::<usize>();
        } else {
            // Multi-line change
            // Add remaining characters from start line
            end_offset += start_line_chars[start_char..].iter().map(|c| c.len_utf8()).sum::<usize>();
            end_offset += 1; // newline after start line
            
            // Add complete lines between start and end
            for i in (start_line + 1)..end_line {
                end_offset += lines[i].len() + 1; // +1 for newline
            }
            
            // Add characters from end line up to end character
            let end_line_chars: Vec<char> = lines[end_line].chars().collect();
            let end_char_bounded = std::cmp::min(end_char, end_line_chars.len());
            end_offset += end_line_chars[..end_char_bounded].iter().map(|c| c.len_utf8()).sum::<usize>();
        }

        // Apply the change
        content.replace_range(start_offset..end_offset, new_text);
        
        Ok(())
    }

    #[test]
    fn test_apply_incremental_change() {
        // Helper to test incremental changes
        fn test_incremental_change(initial: &str, range: Range, new_text: &str, expected: &str) {
            let mut content = initial.to_string();
            apply_incremental_change_test(&mut content, &range, new_text).unwrap();
            assert_eq!(content, expected, "Incremental change failed");
        }

        // Test 1: Single line replacement
        test_incremental_change(
            "hello world\nfoo bar\nbaz",
            Range {
                start: Position { line: 0, character: 6 },
                end: Position { line: 0, character: 11 },
            },
            "rust",
            "hello rust\nfoo bar\nbaz"
        );

        // Test 2: Multi-line replacement
        test_incremental_change(
            "line 1\nline 2\nline 3\nline 4",
            Range {
                start: Position { line: 1, character: 0 },
                end: Position { line: 2, character: 6 },
            },
            "replaced",
            "line 1\nreplaced\nline 4"
        );

        // Test 3: Insertion (empty range)
        test_incremental_change(
            "hello world",
            Range {
                start: Position { line: 0, character: 5 },
                end: Position { line: 0, character: 5 },
            },
            " beautiful",
            "hello beautiful world"
        );

        // Test 4: Deletion (empty replacement)
        test_incremental_change(
            "hello beautiful world",
            Range {
                start: Position { line: 0, character: 5 },
                end: Position { line: 0, character: 15 },
            },
            "",
            "hello world"
        );
    }

    #[test]
    fn test_incremental_change_unicode() {
        let mut content = "café ☕ world".to_string();
        
        // Replace the coffee emoji (character 5) with crab emoji, keeping the space (character 6)
        let range = Range {
            start: Position { line: 0, character: 5 },
            end: Position { line: 0, character: 6 },
        };
        
        apply_incremental_change_test(&mut content, &range, "🦀").unwrap();
        assert_eq!(content, "café 🦀 world");
    }

    #[test]
    fn test_incremental_change_bounds_checking() {
        let mut content = "hello".to_string();
        
        // Test out of bounds line
        let range = Range {
            start: Position { line: 1, character: 0 },
            end: Position { line: 1, character: 1 },
        };
        
        let result = apply_incremental_change_test(&mut content, &range, "test");
        assert!(result.is_err(), "Should fail on out of bounds line");
        
        // Test out of bounds character  
        let range = Range {
            start: Position { line: 0, character: 10 },
            end: Position { line: 0, character: 11 },
        };
        
        let result = apply_incremental_change_test(&mut content, &range, "test");
        assert!(result.is_err(), "Should fail on out of bounds character");
    }
} 