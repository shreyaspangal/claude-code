# Workflow

How the program runs right now. Update this file in the same change as any code that alters the flow.

_Last updated: 2026-11-11 (Skill tool: the model can load a skill it picked from the list)_

## Runtime sequence

```mermaid
sequenceDiagram
    actor User
    participant Main as app/main.ts
    participant Skills as app/utils/skills.ts
    participant Model as Model (OpenRouter)
    participant Tools as app/tools/

    User->>Main: ./your_program.sh -p "/apple /grape mango pear"
    Main->>Main: createClient() (needs OPENROUTER_API_KEY, -p)
    Main->>Skills: expandPrompt(prompt)
    Note over Skills: parseSkillStack → skills [{name, dir, body}] for apple, grape, args "mango pear"<br/>per skill: renderSkill = skillHeader + "\n\n" + substituteArguments(body, stack)
    Skills-->>Main: ["apple header + body", "grape header + body"] (no skills → [prompt])
    Main->>Skills: initializeSkills()
    Skills-->>Main: system prompt listing every skill's name and description,<br/>plus "call the Skill tool if a skill matches"
    Note over Main: messages = [system, user: apple header + body, user: grape header + body]<br/>(no skills → [system, user: raw prompt])
    loop until the reply has no tool calls
        Main->>Model: chat.completions(MODEL_ID, messages, tools)
        Model-->>Main: assistant message (+ tool_calls?)
        opt tool_calls
            Main->>Tools: executeTool: read / write / bash
            Main->>Skills: executeTool: Skill {name, args?} → loadSkill (same renderSkill text as /name)
            Note over Main: result (or "Error: <message>" if it threw), pushed as a "tool" message
        end
    end
    Main-->>User: print final message.content
```

## Skill stacking (`parseSkillStack`)

```mermaid
flowchart TD
    A[rest = prompt.trim] --> B{rest starts with /word<br/>and fewer than 6 skills?}
    B -- no --> E[args = rest, as typed]
    B -- yes --> C{readSkill word<br/>is not null?}
    C -- no --> E
    C -- yes --> D[push name, dir, body; cut /word off rest] --> B
    E --> F[each skill: header + body with the same args → its own user message]
```

## Rules

- A skill is `.claude/skills/<name>/SKILL.md`: frontmatter (`name`, `description`) between `---` lines, then the body. `readSkill` is the only code that reads this format. Both the skill list (`initializeSkills`) and stacking use it.
- A skill folder can bundle files next to `SKILL.md` (e.g. `scripts/checksum.sh`). The body names them relative to the skill's folder. Each skill message starts with `Skill: <name> (located at .claude/skills/<name>)` and `Paths in the instructions below are relative to that folder.`, then a blank line and the body. The folder is project-relative, because the `bash` tool runs from the project root. The model joins folder and path and runs the script with `bash`; there is no special script-running code.
- `$ARGUMENTS` becomes the full argument string. `$0`, `$1`, … become the arguments split on whitespace, counting from 0. Substitution happens in one pass, so inserted values are never expanded again.
- Examples: `/apple /grape mango pear` gives 2 skills with args `mango pear`. `/apple /nope 1` gives 1 skill with args `/nope 1`. `hello /apple` gives no skills, so the raw prompt is sent.
- A skill reaches the model in two ways, with the same text (`renderSkill`: header + body with args filled in):
  - The user names it: `/name` at the start of the prompt, expanded before the first request (`expandPrompt`).
  - The model picks it: the system prompt lists every skill and says to call the `Skill` tool when one matches. `Skill {name, args?}` returns the skill via `loadSkill`. An unknown name is an error the model sees. Only the chosen skill's body is loaded, never the others.
- A tool that throws (e.g. `read` on a directory) never crashes the program. `clientLoop` catches it and sends `Error: <message>` back as the tool result, so the model can recover.
- Real Claude Code stacks skills only at the interactive prompt. In `-p` mode it expands just the first. We stack in `-p` on purpose.

## Known gaps / next up

Compared with the [Claude Code skills docs](https://code.claude.com/docs/en/skills#pass-arguments-to-skills):

- [ ] Add `ARGUMENTS: <args>` to the end when no placeholder takes the arguments.
- [ ] A missing index (`$2` with only 2 arguments) should stay as literal `$2`. Right now it becomes `""`.
- [ ] `$ARGUMENTS[N]` as another way to write `$N`.
- [ ] Shell-style quoting: `"hello world"` as one argument.
- [ ] Named arguments from an `arguments:` frontmatter list.
- [ ] `\$1` escape.
- [x] ~~Skill files are split on `---`, so a body containing `---` gets cut off.~~ Fixed in `readSkill`.
- [x] ~~Bundled `scripts/`: the model doesn't know the skill's folder.~~ Fixed with the header in `expandPrompt`.
- [ ] `${CLAUDE_SKILL_DIR}` substitution in the body, like Claude Code.
- [ ] `references/` and `assets/` (named the same way as `scripts/`, but not tested in this stage).
- [x] ~~The model can't load a skill it picks from the list.~~ Fixed with the `Skill` tool.
- [ ] The model may call `Skill` for a skill already expanded from `/name` (seen in #SK5). Harmless, costs one extra round trip.
- [ ] Tool registry: keep each tool's schema and handler together, so a new tool (e.g. a sub-agent `Task`) is one file instead of edits in `tools/index.ts`, `main.ts` and `types.ts`.

Refactor queue (simplify without adding new ideas):

- [x] 1. `expandPrompt` in `skills.ts`; `main.ts` only maps strings to user messages.
- [x] 2. One `readSkill` helper plus a `SKILLS_DIR` constant, shared by `initializeSkills` and `parseSkillStack`. Fixes the `---` gap.
- [x] 3. Tidy `skills.ts`: drop `yamlParser`, use one export style, remove unused exports and the unused `Skill` type and `arguments` field.
- [x] 4. `executeTool`: parse tool arguments once before the `switch`.
