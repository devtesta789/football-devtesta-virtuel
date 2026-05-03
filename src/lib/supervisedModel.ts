import { supabase } from "@/integrations/supabase/client";

const MODEL_TABLE = "model_supervised" as const;

export interface TrainingExample {
  features: number[]; // [oddsHome, oddsDraw, oddsAway]
  winnerLabel: string; // "1", "X", "2"
}

interface SerializedModelState {
  weights1: number[];
  weightsX: number[];
  weights2: number[];
  bias1: number;
  biasX: number;
  bias2: number;
}

class LogisticModel {
  private weights1: number[] = [];
  private weightsX: number[] = [];
  private weights2: number[] = [];
  private bias1 = 0;
  private biasX = 0;
  private bias2 = 0;
  private classLabels: string[] = ["1", "X", "2"];
  private trained = false;

  train(examples: TrainingExample[], epochs = 500, learningRate = 0.1) {
    const numFeatures = 3;
    this.weights1 = Array(numFeatures).fill(0);
    this.weightsX = Array(numFeatures).fill(0);
    this.weights2 = Array(numFeatures).fill(0);
    this.bias1 = 0;
    this.biasX = 0;
    this.bias2 = 0;

    for (let epoch = 0; epoch < epochs; epoch++) {
      for (const { features, winnerLabel } of examples) {
        const z1 = this.bias1 + features.reduce((s, f, i) => s + f * this.weights1[i], 0);
        const zX = this.biasX + features.reduce((s, f, i) => s + f * this.weightsX[i], 0);
        const z2 = this.bias2 + features.reduce((s, f, i) => s + f * this.weights2[i], 0);
        const exp = [Math.exp(z1), Math.exp(zX), Math.exp(z2)];
        const sum = exp.reduce((a, b) => a + b, 0);
        const probs = exp.map((e) => e / sum);
        const y = [0, 0, 0];
        const targetIndex = this.classLabels.indexOf(winnerLabel);
        if (targetIndex >= 0) y[targetIndex] = 1;

        for (let i = 0; i < numFeatures; i++) {
          this.weights1[i] -= learningRate * (probs[0] - y[0]) * features[i];
          this.weightsX[i] -= learningRate * (probs[1] - y[1]) * features[i];
          this.weights2[i] -= learningRate * (probs[2] - y[2]) * features[i];
        }
        this.bias1 -= learningRate * (probs[0] - y[0]);
        this.biasX -= learningRate * (probs[1] - y[1]);
        this.bias2 -= learningRate * (probs[2] - y[2]);
      }
    }
    this.trained = true;
  }

  predict(features: number[]): { label: string; probs: Record<string, number> } {
    if (!this.trained) throw new Error("Model not trained");
    const z1 = this.bias1 + features.reduce((s, f, i) => s + f * this.weights1[i], 0);
    const zX = this.biasX + features.reduce((s, f, i) => s + f * this.weightsX[i], 0);
    const z2 = this.bias2 + features.reduce((s, f, i) => s + f * this.weights2[i], 0);
    const exp = [Math.exp(z1), Math.exp(zX), Math.exp(z2)];
    const sum = exp.reduce((a, b) => a + b, 0);
    const probs = [exp[0] / sum, exp[1] / sum, exp[2] / sum];
    return {
      label: this.classLabels[probs.indexOf(Math.max(...probs))],
      probs: {
        "1": probs[0],
        X: probs[1],
        "2": probs[2],
      },
    };
  }

  isTrained() {
    return this.trained;
  }

  serialize(): SerializedModelState {
    return {
      weights1: this.weights1,
      weightsX: this.weightsX,
      weights2: this.weights2,
      bias1: this.bias1,
      biasX: this.biasX,
      bias2: this.bias2,
    };
  }

  static deserialize(state: SerializedModelState): LogisticModel {
    const model = new LogisticModel();
    model.weights1 = state.weights1;
    model.weightsX = state.weightsX;
    model.weights2 = state.weights2;
    model.bias1 = state.bias1;
    model.biasX = state.biasX;
    model.bias2 = state.bias2;
    model.trained = true;
    return model;
  }
}

let currentModel: LogisticModel | null = null;

async function getUserId(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

export async function fetchTrainingData(): Promise<TrainingExample[]> {
  const userId = await getUserId();
  if (!userId) return [];

  const { data } = await supabase
    .from("prediction_history")
    .select("odds_home, odds_draw, odds_away, real_score_home, real_score_away, is_validated")
    .eq("user_id", userId)
    .eq("is_validated", true);

  if (!data) return [];

  return data
    .filter((d) => d.real_score_home !== null && d.real_score_away !== null)
    .map((d) => ({
      features: [d.odds_home, d.odds_draw, d.odds_away],
      winnerLabel:
        (d.real_score_home ?? 0) > (d.real_score_away ?? 0)
          ? "1"
          : (d.real_score_away ?? 0) > (d.real_score_home ?? 0)
            ? "2"
            : "X",
    }));
}

export async function saveModel(model: LogisticModel): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  const serialized = model.serialize();
  await supabase.from(MODEL_TABLE as any).upsert(
    {
      user_id: userId,
      model_state: serialized,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

export async function loadModel(): Promise<LogisticModel | null> {
  if (currentModel?.isTrained()) return currentModel;
  const userId = await getUserId();
  if (!userId) return null;

  const result = await supabase
    .from(MODEL_TABLE as any)
    .select("model_state")
    .eq("user_id", userId)
    .maybeSingle();

  const row = result.data as any;
  if (!row?.model_state) return null;
  const model = LogisticModel.deserialize(row.model_state as SerializedModelState);
  currentModel = model;
  return model;
}

export async function getOrTrainModel(forceRetrain = false): Promise<LogisticModel> {
  if (!forceRetrain) {
    const loaded = await loadModel();
    if (loaded) return loaded;
  }

  const examples = await fetchTrainingData();
  if (examples.length < 10) {
    console.warn("Pas assez de données d'entraînement, utilisation du modèle heuristique");
    throw new Error("Not enough data");
  }

  const model = new LogisticModel();
  model.train(examples);
  await saveModel(model);
  currentModel = model;
  return model;
}

export async function getModelStatus(): Promise<{ trained: boolean; examples: number }> {
  if (currentModel?.isTrained()) {
    return { trained: true, examples: 0 };
  }
  const loaded = await loadModel();
  if (loaded) {
    return { trained: true, examples: 0 };
  }
  const examples = await fetchTrainingData();
  return { trained: false, examples: examples.length };
}

export function getCurrentModel(): LogisticModel | null {
  return currentModel;
}

export function resetModel() {
  currentModel = null;
}
