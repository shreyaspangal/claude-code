import { opendir } from "node:fs/promises";
import path from "node:path";
import type { SkillFrontmatter } from "../types";

type SkillInvocation = { name: string; args: string; positional: string[] };

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
        return "No skills for you";
    }
}

async function getSkillBody(skillName: string): Promise<string> {
    try {
        const skillPath = path.resolve(".claude/skills", skillName, "SKILL.md");
        const contents = await Bun.file(skillPath).text();
        const body = contents.split("---")[2];
        return body;
    } catch (_e) {
        return `No skill body found for the given skill name: ${skillName}`;
    }
}

export function parseSkillInvocation(prompt: string): SkillInvocation | null {
    if (!prompt.startsWith("/")) return null;
    const [name, ...positional] = prompt.slice(1).trim().split(/\s+/);
    if (!name) return null;
    return { name, args: positional.join(" "), positional };
}

export function substituteArguments(body: string, { args, positional }: SkillInvocation) {
  return body.replace(/\$ARGUMENTS|\$(\d+)/g, (_, i) => i ? positional[+i] ?? "" : args);
}

export { initializeSkills, extractFrontmatter, yamlParser, getSkillBody };
