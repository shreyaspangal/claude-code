import { opendir } from "node:fs/promises";
import path from "node:path";
import type { SkillFrontmatter } from "../types";

type StackedSkill = { name: string; dir: string; body: string };
type SkillStack = { skills: StackedSkill[]; args: string; positional: string[] };

const SKILLS_DIR = path.resolve('.claude', 'skills');
const MAX_STACKED_SKILLS = 6;

// The one place that knows the SKILL.md format: "---\n<yaml>\n---\n<body>".
// Returns null if the skill doesn't exist or has no frontmatter.
async function readSkill(name: string) {
    const dir = path.resolve(SKILLS_DIR, name);
    const file = Bun.file(path.join(dir, "SKILL.md"));
    if (!(await file.exists())) return null;
    const [, frontmatter, ...rest] = (await file.text()).split("---");
    if (frontmatter === undefined || rest.length === 0) return null;
    const meta = Bun.YAML.parse(frontmatter) as SkillFrontmatter;
    // dir is relative to cwd (e.g. ".claude/skills/apple"), for showing to the model.
    return { meta, dir: path.relative(process.cwd(), dir), body: rest.join("---") }; // rejoin so a "---" inside the body survives
}

export async function initializeSkills(): Promise<string> {
    try {
        const dir = await opendir(SKILLS_DIR);
        const lines = ["You have access to the following skills:\n"];
        for await (const d of dir) {
            const skill = await readSkill(d.name);
            if (skill) lines.push(`- ${skill.meta.name}: ${skill.meta.description}`);
        }
        lines.push(`\nIf a skill matches the user's request, call the Skill tool with its name and follow the instructions it returns.`);
        return lines.join("\n");
    } catch (_e) {
        return `No skills found!\n\nError: ${(_e as Error).message}`;
    }
}

// "/apple /grape mango pear" -> skills apple and grape, args "mango pear".
// Stops at the first token that isn't a skill; it and everything after are the args.
async function parseSkillStack(prompt: string): Promise<SkillStack> {
    const skills: StackedSkill[] = [];
    let rest = prompt.trim();

    while (skills.length < MAX_STACKED_SKILLS) {
        const token = rest.match(/^\/(\S+)(\s+|$)/);
        if (!token) break;
        const skill = await readSkill(token[1]);
        if (!skill || skill.meta.context === "fork") break; // a forked skill ends the run and stays in the args
        skills.push({ name: token[1], dir: skill.dir, body: skill.body });
        rest = rest.slice(token[0].length);
    }

    return { skills, args: rest, positional: rest.split(/\s+/).filter(Boolean) };
}

function substituteArguments(body: string, { args, positional }: SkillStack) {
    return body.replace(/\$ARGUMENTS|\$(\d+)/g, (_, i) => i ? positional[+i] ?? "" : args);
}

// Tells the model where the skill lives, so relative paths like scripts/x.sh resolve.
function skillHeader({ name, dir }: StackedSkill) {
    return `Skill: ${name} (located at ${dir})\nPaths in the instructions below are relative to that folder.`;
}

// Header + body with arguments filled in. Same text whether the user or the model invokes the skill.
function renderSkill(skill: StackedSkill, stack: SkillStack) {
    return `${skillHeader(skill)}\n\n${substituteArguments(skill.body, stack).trim()}`;
}

// A prompt becomes one user message per stacked skill, or itself if it has no skills.
export async function expandPrompt(prompt: string): Promise<string[]> {
    const stack = await parseSkillStack(prompt);
    if (stack.skills.length === 0) return [prompt];
    return stack.skills.map((skill) => renderSkill(skill, stack));
}

// The Skill tool: the model picked a skill by name. Returns null if there is no such skill.
// fork is true when the skill asks to run in a subagent (context: fork).
export async function loadSkill(name: string, args = ""): Promise<{ text: string; fork: boolean } | null> {
    const skill = await readSkill(name);
    if (!skill) return null;
    const stacked = { name, dir: skill.dir, body: skill.body };
    const text = renderSkill(stacked, { skills: [stacked], args, positional: args.split(/\s+/).filter(Boolean) });
    return { text, fork: skill.meta.context === "fork" };
}
