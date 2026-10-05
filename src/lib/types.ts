export type Subject = "physics" | "chemistry" | "maths";
export type SubjectCounts = Record<Subject, number>;

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface ProfileStats {
  total_questions: number;
  current_streak: number;
  active_days: number;
  physics_total: number;
  chemistry_total: number;
  maths_total: number;
}

export interface DailyProgress extends SubjectCounts {
  progress_date: string;
}

export interface LeaderboardEntry extends SubjectCounts {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  total: number;
  rank: number;
}
