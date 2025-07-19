use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::*;
use tower_lsp::{Client, LanguageServer};
use anyhow::Result as AnyhowResult;

#[derive(Debug)]
struct TypeScriptBridge {
    interpreter_path: String,
}

impl TypeScriptBridge {
    fn new() -> Self {
        Self {
            interpreter_path: "../dist/cli.js".to_string(),
        }
    }

    fn get_completions(&self, _file_path: &str) -> AnyhowResult<Vec<String>> {
        // TODO: Implement completion logic using TypeScript interpreter
        Ok(vec![
            "fn".to_string(),
            "if".to_string(), 
            "match".to_string(),
            "type".to_string(),
        ])
    }
}

pub struct Backend {
    client: Client,
    ts_bridge: TypeScriptBridge,
}

impl Backend {
    pub fn new(client: Client) -> Self {
        Self {
            client,
            ts_bridge: TypeScriptBridge::new(),
        }
    }
}

#[tower_lsp::async_trait]
impl LanguageServer for Backend {
    async fn initialize(&self, _: InitializeParams) -> Result<InitializeResult> {
        Ok(InitializeResult {
            server_info: Some(ServerInfo {
                name: "noolang-lsp".to_string(),
                version: Some("0.1.0".to_string()),
            }),
            capabilities: ServerCapabilities {
                text_document_sync: Some(TextDocumentSyncCapability::Kind(
                    TextDocumentSyncKind::INCREMENTAL,
                )),
                completion_provider: Some(CompletionOptions {
                    resolve_provider: Some(false),
                    trigger_characters: Some(vec![
                        ".".to_string(),
                        ":".to_string(),
                        "@".to_string(),
                    ]),
                    ..Default::default()
                }),
                hover_provider: Some(HoverProviderCapability::Simple(true)),
                definition_provider: Some(OneOf::Left(true)),
                ..Default::default()
            },
            ..Default::default()
        })
    }

    async fn initialized(&self, _: InitializedParams) {
        self.client
            .log_message(MessageType::INFO, "Noolang LSP initialized!")
            .await;
    }

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    async fn completion(&self, params: CompletionParams) -> Result<Option<CompletionResponse>> {
        // TODO: Use TypeScript bridge for real completions
        let file_path = params.text_document_position.text_document.uri.path();
        let completions = match self.ts_bridge.get_completions(file_path) {
            Ok(items) => items,
            Err(_) => vec!["fn".to_string(), "if".to_string(), "match".to_string(), "type".to_string()],
        };
        
        let items = completions.into_iter()
            .map(|item| CompletionItem::new_simple(item, "Noolang keyword".to_string()))
            .collect();
            
        Ok(Some(CompletionResponse::Array(items)))
    }

    async fn hover(&self, _: HoverParams) -> Result<Option<Hover>> {
        // TODO: Implement hover logic
        Ok(Some(Hover {
            contents: HoverContents::Scalar(MarkedString::String(
                "Noolang expression".to_string(),
            )),
            range: None,
        }))
    }

    async fn goto_definition(&self, _: GotoDefinitionParams) -> Result<Option<GotoDefinitionResponse>> {
        // TODO: Implement go-to-definition logic
        Ok(None)
    }
} 