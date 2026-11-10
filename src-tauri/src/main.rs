#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `kadr --mcp`: stdio MCP server for Claude Code, forwarding to the open editor
    if std::env::args().any(|a| a == "--mcp") { return kadr_lib::mcp_stdio(); }
    kadr_lib::run()
}
