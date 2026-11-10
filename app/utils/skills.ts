import { opendir } from "node:fs/promises";
import path from "node:path";
import type { SkillFrontmatter } from "../types";

type SkillStack = { bodies: string[]; args: string; positional: string[] };

async function extractFrontmatter(filePath: string) {
    const contents = await Bun.file(filePath).text();
    const frontmatter = contents.split("---")[1];
    const { name, description } = (await yamlParser(frontmatter) as SkillFrontmatter);
    return `- ${name}: ${description}`;
}

async function yamlParser(text: string) {
    return await Bun.YAML.parse(text);
}

async function initializeSkills(): Promise<string> {
    try {
        const dir = await opendir("./.claude/skills");
        const frontmatters = ["You have access to the following skills:\n"];
        for await (const d of dir) {
            frontmatters.push(
                await extractFrontmatter(
                    path.resolve(".claude/skills", d.name, "SKILL.md"),
                ),
            );
        }
        return frontmatters.join("\n");
    } catch (_e) {
        return `No skills found!\n\nError: ${(_e as Error).message}`;
    }
}

async function getSkillBody(skillName: string): Promise<string | null> {
    const file = Bun.file(path.resolve(".claude/skills", skillName, "SKILL.md"));
    if (!(await file.exists())) return null;
    const contents = await file.text();
    return contents.split("---")[2] ?? null;
}

// The first skill plus up to five more stacked after it.
const MAX_STACKED_SKILLS = 6;

// "/apple /grape mango pear" -> bodies of apple and grape, args "mango pear".
// Stops at the first token that isn't a skill; it and everything after are the args.
async function parseSkillStack(prompt: string): Promise<SkillStack> {
    const bodies: string[] = [];
    let rest = prompt.trim();

    while (bodies.length < MAX_STACKED_SKILLS) {
        const token = rest.match(/^\/(\S+)(\s+|$)/);
        if (!token) break;
        const body = await getSkillBody(token[1]);
        if (body === null) break;
        bodies.push(body);
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

export { initializeSkills, extractFrontmatter, yamlParser, getSkillBody };
