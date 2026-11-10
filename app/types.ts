import type OpenAI from "openai";

export interface ReadToolInput {
    file_path: string;
}
export interface WriteToolInput {
    file_path: string;
    content: string;
}
export interface BashToolInput {
    command: string;
}
export interface SkillFrontmatter {
    name: string;
    description: string;
}
export interface ClientLoopParams {
    client: OpenAI;
    prompt: string;
}