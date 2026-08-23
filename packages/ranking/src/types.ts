import type { ScoreComponents, Adjustments, EvidenceTier } from "@inspyr/shared";

export interface WorkspaceProfile {
  id: string;
  name: string;
  objective: string;
  audience: string;
  voice: string;
  pillars: string[];
  avoid: string[];
  /** Topics the user has explicitly prioritised this cycle. */
  strategicPriorities: string[];
}

export interface RankableCandidate {
  clusterKey: string;
  title: string;
  summary: string;
  topics: string[];
  entities: string[];
  contentType: string;
  sourceConfidence: number;
  sourceItemCount: number;
  /** Newest observation in the cluster. */
  newestAt: Date;
  /** Earliest publish date across the cluster, if any source dated it. */
  publishedAt: Date | null;
}

export interface PriorContent {
  title: string;
  topics: string[];
  publishedAt: Date;
}

export interface OperatorSignal {
  dimension: string;
  key: string;
  effect: number;      // -1..1
  confidence: number;  // 0..1
  sampleSize: number;
}

export interface FatigueEntry {
  dimension: string;
  key: string;
  score: number;
  recentCount: number;
}

export interface RankingInput {
  candidate: RankableCandidate;
  workspace: WorkspaceProfile;
  priorContent: PriorContent[];
  operatorSignals: OperatorSignal[];
  fatigue: FatigueEntry[];
  now: Date;
}

export interface RankingReason {
  component: string;
  value: number;
  explanation: string;
}

export interface RankingResult {
  score: number;
  components: ScoreComponents;
  adjustments: Adjustments;
  reasons: RankingReason[];
  fatigueNotes: string[];
  evidenceTier: EvidenceTier;
  evidenceSampleSize: number;
  /** False when nothing about this matched the workspace — kept, not proposed. */
  qualifies: boolean;
}
