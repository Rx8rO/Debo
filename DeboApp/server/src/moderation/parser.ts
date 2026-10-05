import { CommandToken, MentionEntity, ParsedCommand } from "./types";

/**
 * Root stores mentions as Markdown links containing stable Root GUIDs, for
 * example: [@Alice](root://user/{id}). Keep each link as one token even when
 * its displayed name contains spaces.
 */
export function tokenizeMessage(content: string): CommandToken[] {
  const tokens: CommandToken[] = [];
  const mentionPattern = /\[([^\]]*)\]\(root:\/\/(user|role|channel)\/([^)]+)\)/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(content)) !== null) {
    appendTextTokens(tokens, content.slice(cursor, match.index));
    tokens.push({
      kind: "mention",
      entity: match[2].toLowerCase() as MentionEntity,
      id: match[3],
      label: match[1],
    });
    cursor = mentionPattern.lastIndex;
  }

  appendTextTokens(tokens, content.slice(cursor));
  return tokens;
}

export function parseCommand(content: string): ParsedCommand | undefined {
  const tokens = tokenizeMessage(content.trim());
  const first = tokens[0];

  if (typeof first !== "string" || !first.startsWith("!") || first.length < 2) {
    return undefined;
  }

  return {
    name: first.slice(1).toLowerCase(),
    args: tokens.slice(1),
  };
}

export function tokenToText(token: CommandToken): string {
  return typeof token === "string" ? token : token.label;
}

export function joinTokenText(tokens: CommandToken[]): string {
  return tokens.map(tokenToText).join(" ").trim();
}

function appendTextTokens(target: CommandToken[], text: string): void {
  for (const value of text.trim().split(/\s+/)) {
    if (value) target.push(value);
  }
}
