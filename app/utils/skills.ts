import { opendir } from "node:fs/promises";
import path from "node:path";
import type { SkillFrontmatter } from "../types";

type SkillStack = { bodies: string[]; args: string; positional: string[] };

const SKILLS_DIR = ".claude/skills";
const MAX_STACKED_SKILLS = 6;

// The one place that knows the SKILL.md format: "---\n<yaml>\n---\n<body>".
// Returns null if the skill doesn't exist or has no frontmatter.
async function readSkill(name: string) {
    const file = Bun.file(path.resolve(SKILLS_DIR, name, "SKILL.md"));
    if (!(await file.exists())) return null;
    const [, frontmatter, ...rest] = (await file.text()).split("---");
    if (frontmatter === undefined || rest.length === 0) return null;
    const meta = (await yamlParser(frontmatter)) as SkillFrontmatter;
    return { meta, body: rest.join("---") }; // rejoin so a "---" inside the body survives
}

async function yamlParser(text: string) {
    return await Bun.YAML.parse(text);
}

async function initializeSkills(): Promise<string> {
    try {
        const dir = await opendir(SKILLS_DIR);
        const lines = ["You have access to the following skills:\n"];
        for await (const d of dir) {
            const skill = await readSkill(d.name);
            if (skill) lines.push(`- ${skill.meta.name}: ${skill.meta.description}`);
        }
        return lines.join("\n");
    } catch (_e) {
        return `No skills found!\n\nError: ${(_e as Error).message}`;
    }
}

// "/apple /grape mango pear" -> bodies of apple and grape, args "mango pear".
// Stops at the first token that isn't a skill; it and everything after are the args.
async function parseSkillStack(prompt: string): Promise<SkillStack> {
    const bodies: string[] = [];
    let rest = prompt.trim();

    while (bodies.length < MAX_STACKED_SKILLS) {
        const token = rest.match(/^\/(\S+)(\s+|$)/);
        if (!token) break;
        const skill = await readSkill(token[1]);
        if (!skill) break;
        bodies.push(skill.body);
        rest = rest.slice(token[0].length);
    }

    return { bodies, args: rest, positional: rest.split(/\s+/).filter(Boolean) };
}

function substituteArguments(body: string, { args, positional }: SkillStack) {
    return body.replace(/\$ARGUMENTS|\$(\d+)/g, (_, i) => i ? positional[+i] ?? "" : args);
}

// A prompt becomes one user message per stacked skill, or itself if it has no skills.
export async function expandPrompt(prompt: string): Promise<string[]> {
    const stack = await parseSkillStack(prompt);
    if (stack.bodies.length === 0) return [prompt];
    return stack.bodies.map((body) => substituteArguments(body, stack));
}

export { initializeSkills, yamlParser };
