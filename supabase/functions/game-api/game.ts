import { QUESTIONS, type AwardCategory, type Pack, type Question } from "./questions.ts";

export type ResultEntry = { playerId: string; name: string; color: string; votes: number; percentage: number };
export type RoundResult = {
  totalVotes: number;
  topVotes: number;
  winners: string[];
  entries: ResultEntry[];
  special: "unanimous" | "tie" | "landslide" | "no_consensus" | "normal";
};

type PlayerLite = { id: string; name: string; color: string };
type RevealedRound = {
  question_text: string;
  award_category: AwardCategory | null;
  result: RoundResult;
};

const categoryTitles: Partial<Record<AwardCategory, string>> = {
  chaos: "MOST CHAOTIC",
  trust: "MOST TRUSTED",
  success: "FUTURE MILLIONAIRE",
  humour: "COMEDY DEPARTMENT",
  loyalty: "THE REAL ONE",
  adventure: "ADVENTURE MAGNET",
  social: "PEOPLE PERSON",
  responsibility: "RESPONSIBLE ADULT",
  romance: "ROM-COM LEAD",
  courage: "BRAVEST",
  intelligence: "BIG BRAIN",
  main_character: "MAIN CHARACTER"
};

export function selectQuestion(args: {
  pack: Pack;
  usedIds: string[];
  recentTopics: string[];
  customQuestions?: Array<{ id: string; text: string; tone: "funny" | "chaos" | "wholesome" | "savage" }>;
}): Question | null {
  const used = new Set(args.usedIds);
  const recent = new Set(args.recentTopics.slice(-3));
  const custom = (args.customQuestions ?? []).map((q) => ({
    id: q.id,
    text: q.text,
    pack: q.tone === "wholesome" ? "wholesome" : q.tone === "savage" ? "savage" : q.tone === "chaos" ? "chaos" : "chill",
    awardCategory: q.tone === "wholesome" ? "loyalty" : q.tone === "chaos" || q.tone === "savage" ? "chaos" : "humour",
    tone: q.tone === "funny" ? "funny" : q.tone,
    minPlayers: 3,
    allowSelf: true,
    weight: 1.25,
    topic: `custom:${q.id}`,
    enabled: true
  } satisfies Question));

  let pool = [...QUESTIONS, ...custom].filter((q) => q.enabled && !used.has(q.id));
  if (args.pack !== "mixed") pool = pool.filter((q) => q.pack === args.pack || q.id.startsWith("custom_"));
  if (!pool.length && args.pack !== "mixed") pool = [...QUESTIONS, ...custom].filter((q) => q.enabled && !used.has(q.id));
  if (!pool.length) return null;

  const preferred = pool.filter((q) => !recent.has(q.topic));
  const candidates = preferred.length >= Math.min(6, pool.length) ? preferred : pool;
  const total = candidates.reduce((sum, q) => sum + q.weight, 0);
  let cursor = Math.random() * total;
  for (const q of candidates) {
    cursor -= q.weight;
    if (cursor <= 0) return q;
  }
  return candidates[candidates.length - 1];
}

export function calculateRoundResult(players: PlayerLite[], votes: Array<{ target_player_id: string }>): RoundResult {
  const counts = new Map(players.map((p) => [p.id, 0]));
  for (const vote of votes) if (counts.has(vote.target_player_id)) counts.set(vote.target_player_id, (counts.get(vote.target_player_id) ?? 0) + 1);
  const totalVotes = votes.length;
  const topVotes = Math.max(0, ...counts.values());
  const winners = topVotes > 0 ? players.filter((p) => counts.get(p.id) === topVotes).map((p) => p.id) : [];
  const entries = players
    .map((p) => ({
      playerId: p.id,
      name: p.name,
      color: p.color,
      votes: counts.get(p.id) ?? 0,
      percentage: totalVotes ? Math.round(((counts.get(p.id) ?? 0) / totalVotes) * 100) : 0
    }))
    .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));

  let special: RoundResult["special"] = "normal";
  if (totalVotes > 0 && topVotes === totalVotes && winners.length === 1) special = "unanimous";
  else if (winners.length > 1 && topVotes > 0) special = "tie";
  else if (totalVotes >= 3 && topVotes / totalVotes >= 0.7) special = "landslide";
  else if (totalVotes >= 4 && topVotes / totalVotes <= 0.4) special = "no_consensus";

  return { totalVotes, topVotes, winners, entries, special };
}

function topPlayer(scores: Map<string, number>, players: Map<string, PlayerLite>) {
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (!sorted.length || sorted[0][1] <= 0) return null;
  if (sorted[1] && sorted[1][1] === sorted[0][1]) return null;
  const player = players.get(sorted[0][0]);
  if (!player) return null;
  return { player, score: sorted[0][1] };
}

export function calculateFinalResults(playersInput: PlayerLite[], rounds: RevealedRound[]) {
  const players = new Map(playersInput.map((p) => [p.id, p]));
  const categoryScores = new Map<AwardCategory, Map<string, number>>();
  const categoryQuestionCounts = new Map<AwardCategory, number>();
  const totalVotes = new Map(playersInput.map((p) => [p.id, 0]));
  const landslideWins = new Map(playersInput.map((p) => [p.id, 0]));

  for (const round of rounds) {
    if (round.award_category) {
      categoryQuestionCounts.set(round.award_category, (categoryQuestionCounts.get(round.award_category) ?? 0) + 1);
      if (!categoryScores.has(round.award_category)) categoryScores.set(round.award_category, new Map(playersInput.map((p) => [p.id, 0])));
    }
    for (const entry of round.result.entries) {
      totalVotes.set(entry.playerId, (totalVotes.get(entry.playerId) ?? 0) + entry.votes);
      if (round.award_category) {
        const scores = categoryScores.get(round.award_category)!;
        scores.set(entry.playerId, (scores.get(entry.playerId) ?? 0) + entry.votes);
      }
    }
    if (round.result.special === "landslide" || round.result.special === "unanimous") {
      if (round.result.winners.length === 1) landslideWins.set(round.result.winners[0], (landslideWins.get(round.result.winners[0]) ?? 0) + 1);
    }
  }

  const categoryAwards = [...categoryScores.entries()]
    .filter(([category]) => (categoryQuestionCounts.get(category) ?? 0) >= 2)
    .map(([category, scores]) => {
      const winner = topPlayer(scores, players);
      if (!winner) return null;
      return {
        key: `category:${category}`,
        title: categoryTitles[category] ?? category.toUpperCase().replaceAll("_", " "),
        playerId: winner.player.id,
        playerName: winner.player.name,
        score: winner.score,
        subtitle: `${winner.score} votes across ${categoryQuestionCounts.get(category)} related questions`
      };
    })
    .filter(Boolean)
    .slice(0, 8);

  const sessionAwards: Array<{ key: string; title: string; playerId: string; playerName: string; score: number; subtitle?: string }> = [];
  const biggest = topPlayer(totalVotes, players);
  if (biggest) sessionAwards.push({ key: "biggest_target", title: "BIGGEST TARGET", playerId: biggest.player.id, playerName: biggest.player.name, score: biggest.score, subtitle: `${biggest.score} total votes tonight` });
  const landslide = topPlayer(landslideWins, players);
  if (landslide && landslide.score >= 2) sessionAwards.push({ key: "landslide", title: "LANDSLIDE LEGEND", playerId: landslide.player.id, playerName: landslide.player.name, score: landslide.score, subtitle: `${landslide.score} dominant round wins` });

  const moments = rounds.map((r) => ({
    round: r,
    agreement: r.result.totalVotes ? r.result.topVotes / r.result.totalVotes : 0,
    spread: r.result.entries.filter((e) => e.votes > 0).length
  }));
  const unanimous = [...moments].sort((a, b) => b.agreement - a.agreement)[0];
  const divisive = [...moments].sort((a, b) => b.spread - a.spread || a.agreement - b.agreement)[0];
  const topMoments: Array<{ label: string; question: string; detail: string }> = [];
  if (unanimous?.round.result.totalVotes) {
    topMoments.push({
      label: "MOST UNANIMOUS MOMENT",
      question: unanimous.round.question_text,
      detail: `${unanimous.round.result.topVotes}/${unanimous.round.result.totalVotes} votes went to ${unanimous.round.result.entries[0]?.name ?? "one person"}`
    });
  }
  if (divisive?.round.result.totalVotes && divisive.round !== unanimous?.round) {
    topMoments.push({
      label: "MOST DIVISIVE QUESTION",
      question: divisive.round.question_text,
      detail: `${divisive.spread} different people received votes`
    });
  }

  const receipts: string[] = [];
  if (biggest) receipts.push(`${biggest.player.name} received ${biggest.score} votes tonight.`);
  if (unanimous?.round.result.totalVotes && unanimous.agreement === 1) {
    receipts.push(`The room unanimously picked ${unanimous.round.result.entries[0].name} for “${unanimous.round.question_text}”`);
  } else if (unanimous?.round.result.totalVotes) {
    receipts.push(`${Math.round(unanimous.agreement * 100)}% of the room agreed on ${unanimous.round.result.entries[0].name} for “${unanimous.round.question_text}”`);
  }
  const positiveWins = new Map<string, number>();
  for (const award of categoryAwards) {
    if (["MOST TRUSTED", "FUTURE MILLIONAIRE", "THE REAL ONE", "BRAVEST", "BIG BRAIN", "RESPONSIBLE ADULT"].includes(award!.title)) {
      positiveWins.set(award!.playerId, (positiveWins.get(award!.playerId) ?? 0) + 1);
    }
  }
  const positive = topPlayer(positiveWins, players);
  if (positive && positive.score >= 2) receipts.push(`${positive.player.name} took ${positive.score} of the room's positive category awards.`);
  if (rounds.length >= 10) receipts.push(`${rounds.length} questions later, the group has officially left a paper trail.`);

  const mostVoted = [...totalVotes.entries()]
    .map(([playerId, votes]) => ({ playerId, playerName: players.get(playerId)?.name ?? "Player", votes }))
    .sort((a, b) => b.votes - a.votes)
    .slice(0, 5);

  return {
    questionCount: rounds.length,
    totalVotes: rounds.reduce((sum, r) => sum + r.result.totalVotes, 0),
    categoryAwards,
    sessionAwards,
    receipts,
    topMoments,
    mostVoted
  };
}