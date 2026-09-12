import type { AwardCategory, Pack, Question, RawQuestionRow } from "./question-types.ts";
import { rows as chillRows } from "./questions-chill.ts";
import { rows as chaosRows } from "./questions-chaos.ts";
import { rows as savageRows } from "./questions-savage.ts";
import { rows as wholesomeRows } from "./questions-wholesome.ts";
import { rows as ambitionRows } from "./questions-ambition.ts";

export type { AwardCategory, Pack, Question } from "./question-types.ts";

function build(prefix: string, pack: Question["pack"], tone: Question["tone"], rows: RawQuestionRow[]): Question[] {
  return rows.map(([text, awardCategory, topic], i) => ({
    id: `${prefix}_${String(i + 1).padStart(3, "0")}`,
    text, pack, awardCategory, tone, minPlayers: 3, allowSelf: true, weight: 1, topic, enabled: true
  }));
}

const chill = build("chill", "chill", "funny", chillRows);
const chaos = build("chaos", "chaos", "chaos", chaosRows);
const savage = build("savage", "savage", "savage", savageRows);
const wholesome = build("wholesome", "wholesome", "wholesome", wholesomeRows);
const ambition = build("ambition", "chill", "ambition", ambitionRows);

export const QUESTIONS: Question[] = [...chill, ...chaos, ...savage, ...wholesome, ...ambition];
export function questionCount() { return QUESTIONS.length; }