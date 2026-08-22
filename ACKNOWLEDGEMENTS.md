# Acknowledgements

This project represents a synthesis of modern agentic workflows, deterministic state machines, and continuous community feedback.

## Special Thanks

A special thanks to the following contributors and users who have driven critical architectural improvements:

* **Larz Thimoty S. Pal-ing / The Open Source Community** - For identifying a critical flaw in prompt serialization and suggesting the "append-only prefix caching" optimization. By identifying that prefix caching efficiency relies on the orchestrator harness placing static context (like repository rules and contracts) strictly before dynamic context (like task checkpoints), our CLI was updated to emulate the blazing fast caching strategies found in advanced systems like DeepSeek Harness (`dsh`). This contribution dropped Time-To-First-Token (TTFT) and significantly reduced API costs across the entire framework.
