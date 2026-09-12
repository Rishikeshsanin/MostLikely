export type Pack = "chill" | "chaos" | "savage" | "wholesome" | "mixed";
export type AwardCategory = "chaos" | "trust" | "success" | "humour" | "loyalty" | "adventure" | "social" | "responsibility" | "romance" | "courage" | "intelligence" | "main_character";

export type Question = {
  id: string;
  text: string;
  pack: Exclude<Pack, "mixed">;
  awardCategory: AwardCategory | null;
  tone: "funny" | "chaos" | "savage" | "wholesome" | "ambition";
  minPlayers: number;
  allowSelf: boolean;
  weight: number;
  topic: string;
  enabled: boolean;
};

export type RawQuestionRow = [string, AwardCategory | null, string];
