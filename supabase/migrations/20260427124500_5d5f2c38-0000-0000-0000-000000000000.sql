-- Table pour stocker les poids du modèle supervisé par utilisateur
CREATE TABLE public.model_supervised (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  model_state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.model_supervised ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users select own model" ON public.model_supervised
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users insert own model" ON public.model_supervised
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own model" ON public.model_supervised
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own model" ON public.model_supervised
  FOR DELETE USING (auth.uid() = user_id);
