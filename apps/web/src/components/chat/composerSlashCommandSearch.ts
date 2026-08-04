import {
  insertRankedSearchResult,
  normalizeSearchQuery,
  scoreQueryMatch,
} from "@t3tools/shared/searchRanking";

import type { ComposerCommandItem } from "./ComposerCommandMenu";

function scoreSlashCommandItem(
  item: Extract<
    ComposerCommandItem,
    { type: "slash-command" | "provider-slash-command" | "composer-action" }
  >,
  query: string,
): number | null {
  const primaryValue =
    item.type === "slash-command"
      ? item.command.toLowerCase()
      : item.type === "composer-action"
        ? item.action.toLowerCase()
        : item.command.name.toLowerCase();
  const description = item.description.toLowerCase();

  const scores = [
    scoreQueryMatch({
      value: primaryValue,
      query,
      exactBase: 0,
      prefixBase: 2,
      boundaryBase: 4,
      includesBase: 6,
      fuzzyBase: 100,
      boundaryMarkers: ["-", "_", "/"],
    }),
    scoreQueryMatch({
      value: description,
      query,
      exactBase: 20,
      prefixBase: 22,
      boundaryBase: 24,
      includesBase: 26,
    }),
  ].filter((score): score is number => score !== null);

  if (scores.length === 0) {
    return null;
  }

  return Math.min(...scores);
}

export function searchSlashCommandItems(
  items: ReadonlyArray<
    Extract<
      ComposerCommandItem,
      { type: "slash-command" | "provider-slash-command" | "composer-action" }
    >
  >,
  query: string,
): Array<
  Extract<
    ComposerCommandItem,
    { type: "slash-command" | "provider-slash-command" | "composer-action" }
  >
> {
  const normalizedQuery = normalizeSearchQuery(query, { trimLeadingPattern: /^\/+/ });
  if (!normalizedQuery) {
    return [...items];
  }

  const ranked: Array<{
    item: Extract<
      ComposerCommandItem,
      { type: "slash-command" | "provider-slash-command" | "composer-action" }
    >;
    score: number;
    tieBreaker: string;
  }> = [];

  for (const item of items) {
    const score = scoreSlashCommandItem(item, normalizedQuery);
    if (score === null) {
      continue;
    }

    insertRankedSearchResult(
      ranked,
      {
        item,
        score,
        // Built-ins and composer actions sort together above provider
        // commands, each stable within its group.
        tieBreaker:
          item.type === "slash-command"
            ? `0\u0000${item.command}`
            : item.type === "composer-action"
              ? `0\u0000${item.action}`
              : `1\u0000${item.command.name}\u0000${item.provider}`,
      },
      Number.POSITIVE_INFINITY,
    );
  }

  return ranked.map((entry) => entry.item);
}
