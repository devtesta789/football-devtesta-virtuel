-- Auth config: allow anonymous sign-in for the prediction app
-- Note: anonymous sign-ins must also be enabled in Auth settings UI

-- Model weights table (one row per user)
CREATE TABLE public.model_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  odds_weight DOUBLE PRECISION NOT NULL DEFAULT 0.6,
  form_weight DOUBLE PRECISION NOT NULL DEFAULT 0.2,
  history_weight DOUBLE PRECISION NOT NULL DEFAULT 0.2,
  draw_bias DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  home_advantage DOUBLE PRECISION NOT NULL DEFAULT 1.06,
  anti_trap_strength DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  lambda_boost DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  ext_boost DOUBLE PRECISION NOT NULL DEFAULT 1.04,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.model_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users select own weights" ON public.model_weights FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own weights" ON public.model_weights FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own weights" ON public.model_weights FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own weights" ON public.model_weights FOR DELETE USING (auth.uid() = user_id);

-- Team memory
CREATE TABLE public.team_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  trap_count INT NOT NULL DEFAULT 0,
  overperform_count INT NOT NULL DEFAULT 0,
  underperform_count INT NOT NULL DEFAULT 0,
  total_matches INT NOT NULL DEFAULT 0,
  avg_goals_diff DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, team_name)
);
ALTER TABLE public.team_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users select own team memory" ON public.team_memory FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own team memory" ON public.team_memory FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own team memory" ON public.team_memory FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own team memory" ON public.team_memory FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_team_memory_user ON public.team_memory(user_id);

-- Prediction history
CREATE TABLE public.prediction_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  odds_home DOUBLE PRECISION NOT NULL,
  odds_draw DOUBLE PRECISION NOT NULL,
  odds_away DOUBLE PRECISION NOT NULL,
  winner TEXT NOT NULL,
  winner_label TEXT NOT NULL,
  score_home INT NOT NULL,
  score_away INT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  win_prob DOUBLE PRECISION NOT NULL,
  value_bet TEXT,
  value_bet_odds DOUBLE PRECISION,
  value_bet_proba DOUBLE PRECISION,
  is_validated BOOLEAN NOT NULL DEFAULT false,
  real_score_home INT,
  real_score_away INT,
  round_number INT,
  match_time TIMESTAMPTZ,
  prediction_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.prediction_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users select own predictions" ON public.prediction_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users insert own predictions" ON public.prediction_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own predictions" ON public.prediction_history FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own predictions" ON public.prediction_history FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_prediction_history_user_created ON public.prediction_history(user_id, created_at DESC);
CREATE INDEX idx_prediction_history_round ON public.prediction_history(user_id, round_number);