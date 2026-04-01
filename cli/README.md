# aidlc-install

Interactive CLI installer for [AI-DLC](https://github.com/awslabs/aidlc-workflows) rules across coding agents.

## Usage

```bash
npx aidlc-install
```

Interactively select which agents to install AI-DLC rules for:

```
┌  AI-DLC Rules Installer
│
◇  Agent Detection
│  Detected: Kiro, Claude Code
│
◆  Select agents to install rules for:
│  ● Kiro              .kiro/steering/ (detected)
│  ○ Amazon Q Developer .amazonq/rules/
│  ○ Cursor IDE        .cursor/rules/ai-dlc-workflow.mdc
│  ○ Cline             .clinerules/
│  ● Claude Code       CLAUDE.md (detected)
│  ○ GitHub Copilot    .github/copilot-instructions.md
│
◆  Installation mode:
│  ● Symlink (recommended)
│  ○ Copy
│
└  Done! Restart your agent to load the new rules.
```

## Supported Agents

| Agent | Install Path |
|-------|-------------|
| Kiro | `.kiro/steering/aws-aidlc-rules` |
| Amazon Q Developer | `.amazonq/rules/aws-aidlc-rules` |
| Cursor IDE | `.cursor/rules/ai-dlc-workflow.mdc` |
| Cline | `.clinerules/core-workflow.md` |
| Claude Code | `CLAUDE.md` |
| GitHub Copilot | `.github/copilot-instructions.md` |

## Commands

```bash
npx aidlc-install              # Install rules (interactive)
npx aidlc-install remove       # Uninstall rules
npx aidlc-install list         # Show installed rules
```

## CI / Non-Interactive

```bash
npx aidlc-install --agent kiro --agent claude --copy -y
```

| Flag | Description |
|------|-------------|
| `-a, --agent <name>` | Target specific agents (repeatable) |
| `-y, --yes` | Skip prompts |
| `--copy` | Copy files instead of symlink |

## License

MIT-0
