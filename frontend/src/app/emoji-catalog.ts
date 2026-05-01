import compactEmojiData from "emojibase-data/en/compact.json";

type CompactEmojiEntry = {
  unicode?: string;
  label?: string;
  shortcodes?: string[];
  tags?: string[];
  group?: EmojiGroup;
};

type EmojiGroup = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const emojiCategoryLabels = {
  recent: "Recent",
  smileys: "Smileys",
  people: "People",
  nature: "Nature",
  food: "Food",
  travel: "Travel",
  objects: "Objects",
  symbols: "Symbols",
  flags: "Flags",
} as const;

export type EmojiCategory = keyof typeof emojiCategoryLabels;
export type EmojiRecordCategory = Exclude<EmojiCategory, "recent">;

export type EmojiRecord = {
  emoji: string;
  name: string;
  keywords: string[];
  category: EmojiRecordCategory;
  searchText: string;
};

function uniqueKeywords(values: string[] = []): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function buildSearchText(name: string, keywords: string[], emoji: string): string {
  return [emoji, name, ...keywords].join(" ").toLowerCase();
}

function mapGroupToCategory(group: CompactEmojiEntry["group"]): EmojiRecordCategory | null {
  switch (group) {
    case undefined:
      return null;
    case 0:
      return "smileys";
    case 1:
      return "people";
    case 2:
      return null;
    case 3:
      return "nature";
    case 4:
      return "food";
    case 5:
      return "travel";
    case 6:
      return "objects";
    case 7:
      return "objects";
    case 8:
      return "symbols";
    case 9:
      return "flags";
    default: {
      const unexpectedGroup: never = group;
      throw new Error(`Unexpected emoji group: ${unexpectedGroup}`);
    }
  }
}

function normalizeEmoji(entry: CompactEmojiEntry): EmojiRecord | null {
  const emoji = entry.unicode?.trim() ?? "";
  const name = entry.label?.trim() ?? "";
  const category = mapGroupToCategory(entry.group);

  if (!emoji || !name || !category) {
    return null;
  }

  const keywords = uniqueKeywords([...(entry.shortcodes ?? []), ...(entry.tags ?? [])]);

  return {
    emoji,
    name,
    keywords,
    category,
    searchText: buildSearchText(name, keywords, emoji),
  };
}

export function normalizeEmojiCatalog(entries: CompactEmojiEntry[]): EmojiRecord[] {
  return entries.map(normalizeEmoji).filter((entry): entry is EmojiRecord => entry !== null);
}

export const emojiCatalog = normalizeEmojiCatalog(compactEmojiData as CompactEmojiEntry[]);
