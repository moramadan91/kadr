#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    maqto_lib::migrate_old_id();
    // `maqto --mcp`: stdio MCP server for Claude Code, forwarding to the open editor
    if std::env::args().any(|a| a == "--mcp") { return maqto_lib::mcp_stdio(); }
    maqto_lib::run()
}
