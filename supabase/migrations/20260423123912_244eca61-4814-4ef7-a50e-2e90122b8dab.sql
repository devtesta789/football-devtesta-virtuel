-- Table de configuration utilisateur
CREATE TABLE public.user_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  event_category_id TEXT,
  league_id TEXT NOT NULL DEFAULT '8035',
  default_season TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users select own config" ON public.user_config
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users insert own config" ON public.user_config
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own config" ON public.user_config
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own config" ON public.user_config
  FOR DELETE USING (auth.uid() = user_id);

-- Ajout de la colonne event_category_id dans l'historique des prédictions
ALTER TABLE public.prediction_history ADD COLUMN IF NOT EXISTS event_category_id TEXT;
CREATE INDEX IF NOT EXISTS idx_prediction_history_event_category ON public.prediction_history(event_category_id);