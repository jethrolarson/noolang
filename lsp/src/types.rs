use serde::{Deserialize, Serialize};
use thiserror::Error;
use tower_lsp::lsp_types::Location;

#[derive(Error, Debug)]
pub enum LspError {
    #[error("Parse error: {0}")]
    ParseError(String),
    #[error("Type error: {0}")]
    TypeError(String),
    #[error("Internal error: {0}")]
    InternalError(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoolangSymbol {
    pub name: String,
    pub kind: SymbolKind,
    pub location: Location,
    pub documentation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SymbolKind {
    Function,
    Variable,
    Type,
    Constructor,
    Module,
} 