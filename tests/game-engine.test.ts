import { describe, expect, it } from "vitest";
import { calculateFinalResults, calculateRoundResult, selectQuestion } from "../supabase/functions/game-api/game";
import { questionCount } from "../supabase/functions/game-api/questions";

const players = [
  { id: "a", name: "Rishi", color: "#aaa" },
  { id: "b", name: "Aryan", color: "#bbb" },
  { id: "c", name: "Rahul", color: "#ccc" },
  { id: "d", name: "Karthik", color: "#ddd" }
];

describe("question bank", () => {
  it("ships at least 250 questions", () => expect(questionCount()).toBeGreaterThanOrEqual(250));
  it("does not repeat used ids", () => {
    const first = selectQuestion({ pack: "mixed", usedIds: [], recentTopics: [] })!;
    const second = selectQuestion({ pack: "mixed", usedIds: [first.id], recentTopics: [first.topic] })!;
    expect(second.id).not.toBe(first.id);
  });
});

describe("round results", () => {
  it("detects unanimous results", () => {
    const result = calculateRoundResult(players, [
      { target_player_id: "b" }, { target_player_id: "b" }, { target_player_id: "b" }, { target_player_id: "b" }
    ]);
    expect(result.special).toBe("unanimous");
    expect(result.topVotes).toBe(4);
    expect(result.winners).toEqual(["b"]);
  });

  it("detects ties", () => {
    const result = calculateRoundResult(players, [
      { target_player_id: "a" }, { target_player_id: "a" }, { target_player_id: "b" }, { target_player_id: "b" }
    ]);
    expect(result.special).toBe("tie");
    expect(result.winners.sort()).toEqual(["a", "b"]);
  });
});

describe("final results", () => {
  it("uses real aggregate votes and does not invent awards", () => {
    const resultA = calculateRoundResult(players, [{ target_player_id: "a" }, { target_player_id: "a" }, { target_player_id: "a" }, { target_player_id: "b" }]);
    const resultB = calculateRoundResult(players, [{ target_player_id: "a" }, { target_player_id: "a" }, { target_player_id: "c" }, { target_player_id: "a" }]);
    const final = calculateFinalResults(players, [
      { question_text: "help at 3 AM?", award_category: "loyalty", result: resultA },
      { question_text: "keep a promise?", award_category: "loyalty", result: resultB }
    ]);
    expect(final.questionCount).toBe(2);
    expect(final.totalVotes).toBe(8);
    expect(final.categoryAwards[0]?.playerName).toBe("Rishi");
  });
});
