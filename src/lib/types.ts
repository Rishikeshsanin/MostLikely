export type Pack = "chill" | "chaos" | "savage" | "wholesome" | "mixed";
export type GamePhase = "lobby" | "voting" | "results" | "final_results";
export type AwardCategory =
  | "chaos"
  | "trust"
  | "success"
  | "humour"
  | "loyalty"
  | "adventure"
  | "social"
  | "responsibility"
  | "romance"
  | "courage"
  | "intelligence"
  | "main_character";

export type Player = {
  id: string;
  name: string;
  color: string;
  initial: string;
  isHost: boolean;
  connected: boolean;
  joinOrder: number;
};

export type RoundResultEntry = {
  playerId: string;
  name: string;
  color: string;
  votes: number;
  percentage: number;
};

export type RoundResult = {
  totalVotes: number;
  topVotes: number;
  winners: string[];
  entries: RoundResultEntry[];
  special: "unanimous" | "tie" | "landslide" | "no_consensus" | "normal";
};

export type CurrentRound = {
  id: string;
  roundNumber: number;
  questionId: string;
  questionText: string;
  awardCategory: AwardCategory | null;
  tone: string;
  allowSelf: boolean;
  phase: "voting" | "results";
  eligiblePlayerIds: string[];
  result: RoundResult | null;
  revealedAt: string | null;
};

export type FinalAward = {
  key: string;
  title: string;
  playerId: string;
  playerName: string;
  score: number;
  subtitle?: string;
};

export type FinalResults = {
  questionCount: number;
  totalVotes: number;
  categoryAwards: FinalAward[];
  sessionAwards: FinalAward[];
  receipts: string[];
  topMoments: Array<{ label: string; question: string; detail: string }>;
  mostVoted: Array<{ playerId: string; playerName: string; votes: number }>;
};

export type RoomState = {
  room: {
    code: string;
    status: "lobby" | "active" | "finished";
    phase: GamePhase;
    pack: Pack;
    roundNumber: number;
    customQuestions: Array<{ id: string; text: string; tone: "funny" | "chaos" | "wholesome" | "savage" }>;
    createdAt: string;
  };
  me: Player;
  players: Player[];
  round: CurrentRound | null;
  voting: {
    voted: number;
    eligible: number;
    hasVoted: boolean;
    pendingNames?: string[];
  } | null;
  final: FinalResults | null;
  serverTime: string;
};
