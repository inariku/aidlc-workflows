#!/usr/bin/env node

import { intro, outro, multiselect, select, confirm, note, isCancel } from "@clack/prompts";
import {
  cpSync, mkdirSync, existsSync, readFileSync, writeFileSync,
  rmSync, symlinkSync, copyFileSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { parseArgs } from "node:util";

// --- Paths ---

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRules = resolve(__dirname, "..", "aidlc-rules");
const devRules = resolve(__dirname, "..", "..", "aidlc-rules");
const rulesSource = existsSync(pkgRules) ? pkgRules : devRules;
const coreWorkflow = join(rulesSource, "aws-aidlc-rules", "core-workflow.md");
const rulesDir = join(rulesSource, "aws-aidlc-rules");
const detailsDir = join(rulesSource, "aws-aidlc-rule-details");
const configDir = join(homedir(), ".aidlc");
const configPath = join(configDir, "config.json");
const lockPath = join(configDir, "lock.json");

// --- Agent definitions (matching upstream README exactly) ---

const CURSOR_FRONTMATTER = `---
description: "AI-DLC (AI-Driven Development Life Cycle) adaptive workflow for software development"
alwaysApply: true
---

`;

const AGENTS = [
  {
    value: "kiro",
    label: "Kiro",
    hint: ".kiro/steering/",
    detect: [".kiro"],
    // cp -R aws-aidlc-rules .kiro/steering/  +  cp -R aws-aidlc-rule-details .kiro/
    install(cwd, mode) {
      const r = join(cwd, ".kiro", "steering", "aws-aidlc-rules");
      const d = join(cwd, ".kiro", "aws-aidlc-rule-details");
      return [
        { src: rulesDir, dest: r, type: "dir" },
        { src: detailsDir, dest: d, type: "dir" },
      ];
    },
    paths: [".kiro/steering/aws-aidlc-rules", ".kiro/aws-aidlc-rule-details"],
  },
  {
    value: "amazonq",
    label: "Amazon Q Developer",
    hint: ".amazonq/rules/",
    detect: [".amazonq"],
    // cp -R aws-aidlc-rules .amazonq/rules/  +  cp -R aws-aidlc-rule-details .amazonq/
    install(cwd) {
      const r = join(cwd, ".amazonq", "rules", "aws-aidlc-rules");
      const d = join(cwd, ".amazonq", "aws-aidlc-rule-details");
      return [
        { src: rulesDir, dest: r, type: "dir" },
        { src: detailsDir, dest: d, type: "dir" },
      ];
    },
    paths: [".amazonq/rules/aws-aidlc-rules", ".amazonq/aws-aidlc-rule-details"],
  },
  {
    value: "cursor",
    label: "Cursor IDE",
    hint: ".cursor/rules/ai-dlc-workflow.mdc",
    detect: [".cursor", ".cursorrules"],
    // Generate .mdc with frontmatter + core-workflow.md content
    // cp -R aws-aidlc-rule-details/* .aidlc-rule-details/
    install(cwd) {
      const mdc = join(cwd, ".cursor", "rules", "ai-dlc-workflow.mdc");
      const d = join(cwd, ".aidlc-rule-details");
      return [
        { dest: mdc, type: "generate-mdc" },
        { src: detailsDir, dest: d, type: "dir-contents" },
      ];
    },
    paths: [".cursor/rules/ai-dlc-workflow.mdc", ".aidlc-rule-details/"],
  },
  {
    value: "cline",
    label: "Cline",
    hint: ".clinerules/",
    detect: [".clinerules"],
    // cp core-workflow.md .clinerules/  +  cp -R aws-aidlc-rule-details/* .aidlc-rule-details/
    install(cwd) {
      const r = join(cwd, ".clinerules", "core-workflow.md");
      const d = join(cwd, ".aidlc-rule-details");
      return [
        { src: coreWorkflow, dest: r, type: "file" },
        { src: detailsDir, dest: d, type: "dir-contents" },
      ];
    },
    paths: [".clinerules/core-workflow.md", ".aidlc-rule-details/"],
  },
  {
    value: "claude",
    label: "Claude Code",
    hint: "CLAUDE.md",
    detect: [".claude", "CLAUDE.md"],
    // cp core-workflow.md ./CLAUDE.md  +  cp -R aws-aidlc-rule-details/* .aidlc-rule-details/
    install(cwd) {
      const r = join(cwd, "CLAUDE.md");
      const d = join(cwd, ".aidlc-rule-details");
      return [
        { src: coreWorkflow, dest: r, type: "file" },
        { src: detailsDir, dest: d, type: "dir-contents" },
      ];
    },
    paths: ["CLAUDE.md", ".aidlc-rule-details/"],
  },
  {
    value: "copilot",
    label: "GitHub Copilot",
    hint: ".github/copilot-instructions.md",
    detect: [".github/copilot-instructions.md"],
    // cp core-workflow.md .github/copilot-instructions.md  +  cp -R aws-aidlc-rule-details/* .aidlc-rule-details/
    install(cwd) {
      const r = join(cwd, ".github", "copilot-instructions.md");
      const d = join(cwd, ".aidlc-rule-details");
      return [
        { src: coreWorkflow, dest: r, type: "file" },
        { src: detailsDir, dest: d, type: "dir-contents" },
      ];
    },
    paths: [".github/copilot-instructions.md", ".aidlc-rule-details/"],
  },
];

// --- CLI args ---

const { values: flags, positionals } = parseArgs({
  options: {
    yes:     { type: "boolean", short: "y", default: false },
    agent:   { type: "string",  short: "a", multiple: true, default: [] },
    copy:    { type: "boolean", default: false },
    help:    { type: "boolean", short: "h", default: false },
    version: { type: "boolean", short: "v", default: false },
  },
  allowPositionals: true,
  strict: false,
});

const command = positionals[0] ?? "add";

// --- Helpers ---

function cancel() {
  outro("Cancelled.");
  process.exit(0);
}

function copyDir(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}

function copyDirContents(src, dest) {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
}

function trySymlink(src, dest) {
  try {
    mkdirSync(dirname(dest), { recursive: true });
    if (existsSync(dest)) rmSync(dest, { recursive: true });
    symlinkSync(src, dest, "dir");
    return true;
  } catch {
    return false;
  }
}

function executeOp(op, mode) {
  if (op.type === "dir") {
    if (mode === "symlink" && trySymlink(op.src, op.dest)) return "symlink";
    copyDir(op.src, op.dest);
    return "copy";
  }
  if (op.type === "dir-contents") {
    if (mode === "symlink" && trySymlink(op.src, op.dest)) return "symlink";
    copyDirContents(op.src, op.dest);
    return "copy";
  }
  if (op.type === "file") {
    mkdirSync(dirname(op.dest), { recursive: true });
    copyFileSync(op.src, op.dest);
    return "copy";
  }
  if (op.type === "generate-mdc") {
    mkdirSync(dirname(op.dest), { recursive: true });
    const content = CURSOR_FRONTMATTER + readFileSync(coreWorkflow, "utf-8");
    writeFileSync(op.dest, content);
    return "generated";
  }
}

function detectAgents(cwd) {
  return AGENTS.filter((a) =>
    a.detect.some((p) => existsSync(join(cwd, p)))
  ).map((a) => a.value);
}

// --- Config ---

function loadConfig() {
  try { return JSON.parse(readFileSync(configPath, "utf-8")); }
  catch { return {}; }
}

function saveConfig(data) {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify({ ...loadConfig(), ...data }, null, 2));
}

// --- Lock file ---

function loadLock() {
  try { return JSON.parse(readFileSync(lockPath, "utf-8")); }
  catch { return { installations: [] }; }
}

function saveLock(lock) {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(lockPath, JSON.stringify(lock, null, 2));
}

function addToLock(entries) {
  const lock = loadLock();
  for (const entry of entries) {
    lock.installations = lock.installations.filter(
      (e) => !(e.agent === entry.agent && e.cwd === entry.cwd)
    );
    lock.installations.push(entry);
  }
  saveLock(lock);
}

function removeFromLock(agent, cwd) {
  const lock = loadLock();
  lock.installations = lock.installations.filter(
    (e) => !(e.agent === agent && e.cwd === cwd)
  );
  saveLock(lock);
}

// --- Commands ---

async function runAdd() {
  intro("AI-DLC Rules Installer");

  if (!existsSync(coreWorkflow)) {
    outro("Error: aidlc-rules not found.");
    process.exit(1);
  }

  const cwd = process.cwd();
  const nonInteractive = flags.yes;

  // Step 1: Agent selection
  let selected;
  if (flags.agent.length > 0) {
    const valid = flags.agent.filter((a) => AGENTS.some((ag) => ag.value === a));
    const invalid = flags.agent.filter((a) => !AGENTS.some((ag) => ag.value === a));
    if (invalid.length > 0) {
      outro(`Unknown agents: ${invalid.join(", ")}. Available: ${AGENTS.map((a) => a.value).join(", ")}`);
      process.exit(1);
    }
    selected = valid;
  } else {
    const detected = detectAgents(cwd);
    const lastSelected = loadConfig().lastSelected;
    const initialSelected = lastSelected ?? (detected.length > 0 ? detected : []);

    if (detected.length > 0) {
      note(
        `Detected: ${detected.map((v) => AGENTS.find((a) => a.value === v).label).join(", ")}`,
        "Agent Detection"
      );
    }

    if (nonInteractive) {
      selected = initialSelected.length > 0 ? initialSelected : AGENTS.map((a) => a.value);
    } else {
      const choice = await multiselect({
        message: "Select agents to install rules for:",
        options: AGENTS.map((a) => ({
          value: a.value,
          label: a.label,
          hint: detected.includes(a.value) ? `${a.hint} (detected)` : a.hint,
        })),
        initialValues: initialSelected,
        required: true,
      });
      if (isCancel(choice)) cancel();
      selected = choice;
    }
  }

  // Step 2: Mode selection (symlink vs copy)
  let mode;
  if (flags.copy) {
    mode = "copy";
  } else if (nonInteractive) {
    mode = "symlink";
  } else {
    const modeChoice = await select({
      message: "Installation mode:",
      options: [
        { value: "symlink", label: "Symlink", hint: "Links to source, auto-updates (recommended)" },
        { value: "copy", label: "Copy", hint: "Independent copy of rule files" },
      ],
    });
    if (isCancel(modeChoice)) cancel();
    mode = modeChoice;
  }

  const agents = AGENTS.filter((a) => selected.includes(a.value));

  // Step 3: Build installation plan
  const plan = agents.map((a) => {
    const ops = a.install(cwd);
    const hasExisting = ops.some((op) => existsSync(op.dest));
    return { agent: a, ops, hasExisting };
  });

  // Step 4: Summary
  const summaryLines = plan.map((p) => {
    const flag = p.hasExisting ? " (overwrite)" : "";
    return `  ${p.agent.label} → ${p.agent.paths.join(", ")}${flag}`;
  });
  note(summaryLines.join("\n"), "Installation Summary");

  // Step 5: Confirm
  if (!nonInteractive) {
    const hasOverwrite = plan.some((p) => p.hasExisting);
    const ok = await confirm({
      message: hasOverwrite
        ? "Some rules already exist and will be overwritten. Proceed?"
        : "Install rules for the selected agents?",
    });
    if (isCancel(ok) || !ok) cancel();
  }

  // Step 6: Install
  const lockEntries = [];
  for (const { agent, ops } of plan) {
    const modes = ops.map((op) => executeOp(op, mode));
    const modeLabel = [...new Set(modes)].join("+");
    console.log(`  ✓ ${agent.label} (${modeLabel})`);

    lockEntries.push({
      agent: agent.value,
      cwd,
      paths: ops.map((op) => op.dest),
      mode: modeLabel,
      installedAt: new Date().toISOString(),
    });
  }

  // Step 7: Update lock + config
  addToLock(lockEntries);
  saveConfig({ lastSelected: selected });

  // Step 8: Results
  note(
    plan.map((p) => `  ✓ ${p.agent.label} → ${p.agent.paths[0]}`).join("\n"),
    "Installed"
  );

  outro("Done! Restart your agent to load the new rules.");
}

async function runRemove() {
  intro("AI-DLC Rules Uninstaller");

  const cwd = process.cwd();
  const lock = loadLock();
  const relevant = lock.installations.filter((e) => e.cwd === cwd);

  if (relevant.length === 0) {
    outro("No AI-DLC rules found in this project.");
    process.exit(0);
  }

  let toRemove;
  if (flags.yes) {
    toRemove = relevant;
  } else if (flags.agent.length > 0) {
    toRemove = relevant.filter((e) => flags.agent.includes(e.agent));
  } else {
    const choice = await multiselect({
      message: "Select agents to remove rules from:",
      options: relevant.map((e) => ({
        value: e.agent,
        label: AGENTS.find((a) => a.value === e.agent)?.label ?? e.agent,
        hint: e.paths[0],
      })),
      required: true,
    });
    if (isCancel(choice)) cancel();
    toRemove = relevant.filter((e) => choice.includes(e.agent));
  }

  if (!flags.yes) {
    const ok = await confirm({
      message: `Remove rules for ${toRemove.map((e) => AGENTS.find((a) => a.value === e.agent)?.label ?? e.agent).join(", ")}?`,
    });
    if (isCancel(ok) || !ok) cancel();
  }

  for (const entry of toRemove) {
    for (const p of entry.paths) {
      if (existsSync(p)) rmSync(p, { recursive: true });
    }
    removeFromLock(entry.agent, entry.cwd);
    console.log(`  ✓ Removed ${AGENTS.find((a) => a.value === entry.agent)?.label ?? entry.agent}`);
  }

  outro("Done!");
}

function runList() {
  const lock = loadLock();
  if (lock.installations.length === 0) {
    console.log("No AI-DLC rules installed.");
    return;
  }
  console.log("\nInstalled AI-DLC rules:\n");
  for (const entry of lock.installations) {
    const label = AGENTS.find((a) => a.value === entry.agent)?.label ?? entry.agent;
    const date = entry.installedAt ? ` (${entry.installedAt.split("T")[0]})` : "";
    console.log(`  ${label} [${entry.mode}]${date}`);
    console.log(`    → ${entry.paths[0]}`);
  }
  console.log();
}

function showHelp() {
  console.log(`
AI-DLC Rules Installer

Usage:
  npx @inariku/aidlc-install [command] [options]

Commands:
  add      Install rules (default)
  remove   Uninstall rules
  list     Show installed rules

Options:
  -a, --agent <name>   Target specific agents (repeatable)
  -y, --yes            Skip prompts (CI-friendly)
      --copy           Copy files instead of symlink
  -v, --version        Show version
  -h, --help           Show this help

Agents: ${AGENTS.map((a) => a.value).join(", ")}

Examples:
  npx @inariku/aidlc-install
  npx @inariku/aidlc-install add --agent kiro --agent claude -y
  npx @inariku/aidlc-install remove --agent cursor
  npx @inariku/aidlc-install list
`);
}

// --- Entry point ---

if (flags.help) {
  showHelp();
} else if (flags.version) {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, "..", "package.json"), "utf-8"));
  console.log(pkg.version);
} else if (command === "remove") {
  runRemove();
} else if (command === "list") {
  runList();
} else {
  runAdd();
}
