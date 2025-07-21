use tower_lsp::{LspService, Server};

mod server;
mod parser;

#[tokio::main]
async fn main() {
    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();

    let (service, socket) = LspService::new(|client| server::Backend::new(client));
    Server::new(stdin, stdout, socket).serve(service).await;
} 