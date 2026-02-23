import { useState, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";

interface ToxicityResult {
  isToxic: boolean;
  confidence: number;
  reason: string;
  categories: string[];
}

export function useToxicDetection() {
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<ToxicityResult | null>(null);

  const checkToxicity = useCallback(async (text: string): Promise<ToxicityResult | null> => {
    if (!text || text.trim().length < 5) {
      setResult(null);
      return null;
    }

    try {
      setIsChecking(true);
      const res = await apiRequest("POST", "/api/ai/detect-toxic", { text });
      const data = await res.json() as ToxicityResult;
      setResult(data);
      return data;
    } catch (error) {
      console.error("Toxicity check failed:", error);
      setResult(null);
      return null;
    } finally {
      setIsChecking(false);
    }
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
  }, []);

  return { isChecking, result, checkToxicity, clearResult };
}
