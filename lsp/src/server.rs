use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::*;
use tower_lsp::{Client, LanguageServer};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::parser::{TypeScriptBridge, DiagnosticSeverity};

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
                if let Some(_range) = change.range {
                    // Incremental change - would need to implement proper text editing
                    // For now, just replace the whole content if range_length is provided
                    if change.range_length.is_some() {
                        *content = change.text;
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
        // TODO: Implement definition lookup by analyzing the AST
        // For now, return None to indicate no definition found
        let _uri = &params.text_document_position_params.text_document.uri;
        let _position = &params.text_document_position_params.position;
        
        Ok(None)
    }

    async fn references(&self, params: ReferenceParams) -> Result<Option<Vec<Location>>> {
        // TODO: Implement reference finding by analyzing the AST
        // For now, return None to indicate no references found
        let _uri = &params.text_document_position.text_document.uri;
        let _position = &params.text_document_position.position;
        
        Ok(None)
    }

    async fn document_symbol(&self, params: DocumentSymbolParams) -> Result<Option<DocumentSymbolResponse>> {
        // TODO: Implement symbol extraction from AST
        // For now, return None to indicate no symbols found
        let _uri = &params.text_document.uri;
        
        Ok(None)
    }

    async fn symbol(&self, params: WorkspaceSymbolParams) -> Result<Option<Vec<SymbolInformation>>> {
        // TODO: Implement workspace symbol search
        // For now, return None to indicate no symbols found
        let _query = &params.query;
        
        Ok(None)
    }
} 