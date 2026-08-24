# p-004 Failures Ledger
<!-- Append-only. Every failure: task, classification, evidence, recovery action. -->

## F-001 (2026-08-21)
- task: t-001 游戏设计文档
- classification: AGENT_FAILURE (auto)
- evidence: game-designer-001 (5faa891e) produced zero files in 15+ min for a
  3-doc delegation; interrupted, closing message empty.
- recovery: task decomposition (one doc per delegation) + fresh agent
  game-designer-002 with progressive-write rule (write file early, extend via
  edit). GAME_DESIGN.md delivered (702 lines). VISUAL_STYLE/AUDIO_DESIGN
  escalated to manager.
- lesson: for large doc production, delegate ONE file per agent turn and
  mandate early disk writes; keep the agent's output scope small.

