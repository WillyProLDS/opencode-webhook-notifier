## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Debugging logs

When debugging plugin behavior:

- First ask whether OpenCode was started with debug file logging enabled, either through the documented `oc`, `occ`, or `ocsp` zsh wrapper or with both `OPENCODE_WEBHOOK_NOTIFIER_LOG=debug` and `OPENCODE_WEBHOOK_NOTIFIER_LOG_FILE`.
- Do not assume logs exist. These environment variables are captured when OpenCode starts, so logging must be enabled before reproducing the issue.
- For the affected project, look under `/tmp/opencode-webhook-notifier<absolute-project-path>/`. For example, `/Users/example/my-project` maps to `/tmp/opencode-webhook-notifier/Users/example/my-project/`.
- Inspect the newest `.log` file that corresponds to the affected OpenCode launch before requesting another reproduction.
- If the directory does not exist, ask the user to enable file logging, restart OpenCode, and reproduce the issue.
- Prefer plugin file logs over redirecting OpenCode stdout or stderr because redirection can interfere with the TUI.
