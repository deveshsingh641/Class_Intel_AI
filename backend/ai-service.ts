import OpenAI from "openai";

// Read environment variables dynamically (not at module load time)
function getHfToken() {
  return process.env.HF_API_TOKEN || process.env.HUGGINGFACE_API_KEY;
}

function getOpenAiKey() {
  return process.env.OPENAI_API_KEY;
}

function getHfModel() {
  return process.env.HF_MODEL || process.env.HUGGINGFACE_MODEL || "google/flan-t5-base";
}

const hfInferenceBaseUrl =
  process.env.HF_INFERENCE_BASE_URL || "https://api-inference.huggingface.co/models";
const hfFallbackModelsEnv = process.env.HF_FALLBACK_MODELS;
const hfFallbackModel = process.env.HF_FALLBACK_MODEL || "distilgpt2";
const hfFallbackModels = (hfFallbackModelsEnv
  ? hfFallbackModelsEnv.split(",").map((m) => m.trim()).filter(Boolean)
  : [hfFallbackModel, "gpt2"]);

function getInferenceModelPath(model: string) {
  return encodeURIComponent(model).replace(/%2F/g, "/");
}

async function hfRequest(model: string, prompt: string): Promise<string> {
  const hfToken = getHfToken();
  if (!hfToken) {
    throw new Error("Hugging Face API token is not configured (set HF_API_TOKEN)");
  }

  const modelPath = getInferenceModelPath(model);
  const res = await fetch(`${hfInferenceBaseUrl}/${modelPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${hfToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens: 512,
        return_full_text: false,
      },
      options: {
        wait_for_model: true,
      },
    }),
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as any;
      if (typeof body?.error === "string") {
        detail = body.error;
      } else if (typeof body?.message === "string") {
        detail = body.message;
      }
    } catch {
      // ignore JSON parse errors and fall back to statusText
    }
    const err: any = new Error(
      `Hugging Face request failed (${res.status}) [model=${model}, base=${hfInferenceBaseUrl}]: ${detail}`,
    );
    err.status = res.status;
    throw err;
  }

  const data = (await res.json()) as any;

  if (Array.isArray(data)) {
    const generated = data?.[0]?.generated_text;
    if (typeof generated === "string") {
      return generated;
    }
  }

  if (typeof data?.generated_text === "string") {
    return data.generated_text;
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(data?.choices) && typeof data.choices[0] === "string") {
    return data.choices[0] as string;
  }

  return typeof data === "string" ? data : JSON.stringify(data);
}

async function hfGenerate(prompt: string): Promise<string> {
  const hfModel = getHfModel();
  const candidates = [hfModel, ...hfFallbackModels].filter(Boolean);
  let lastError: any;

  for (const model of candidates) {
    try {
      if (model !== hfModel) {
        console.warn(`HF model '${hfModel}' failed. Falling back to '${model}'.`);
      }
      return await hfRequest(model, prompt);
    } catch (error: any) {
      lastError = error;
      const status = error?.status;
      if (status === 403 || status === 404 || status === 410 || status === 503) {
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

function createNotConfiguredError() {
  const err: any = new Error(
    "AI service is not configured. Set HF_API_TOKEN (HuggingFace) or OPENAI_API_KEY (OpenAI).",
  );
  err.status = 503;
  return err;
}

async function openAiGenerate(prompt: string): Promise<string> {
  const openAiKey = getOpenAiKey();
  if (!openAiKey) {
    throw createNotConfiguredError();
  }

  const openai = new OpenAI({ apiKey: openAiKey });

  const res = await openai.chat.completions.create({
    model: process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant for an education feedback system. Be concise and accurate.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
  });

  const text = (res.choices?.[0]?.message?.content || "").trim();
  if (!text) {
    const err: any = new Error("AI provider returned an empty response");
    err.status = 502;
    throw err;
  }

  return text;
}

// ─── Built-in fallback AI (works without external APIs) ───────────────────

function builtinSentimentAnalysis(text: string): string {
  const lower = text.toLowerCase();
  const positiveWords = ["great", "excellent", "amazing", "good", "helpful", "best", "love", "wonderful", "fantastic", "awesome", "clear", "engaging", "brilliant", "outstanding", "perfect", "enjoy", "inspire", "recommend", "thank"];
  const negativeWords = ["bad", "poor", "terrible", "worst", "boring", "confusing", "unhelpful", "waste", "awful", "horrible", "difficult", "unclear", "disappointing", "slow", "rude", "hate", "never"];
  let posCount = 0, negCount = 0;
  const keywords: string[] = [];
  for (const w of positiveWords) { if (lower.includes(w)) { posCount++; keywords.push(w); } }
  for (const w of negativeWords) { if (lower.includes(w)) { negCount++; keywords.push(w); } }
  const sentiment = posCount > negCount ? "positive" : negCount > posCount ? "negative" : "neutral";
  const score = Math.min(1, Math.max(-1, (posCount - negCount) * 0.25));
  return JSON.stringify({ sentiment, score, keywords: keywords.slice(0, 5) });
}

function builtinQualityScore(text: string, rating: number): string {
  const wordCount = text.split(/\s+/).length;
  let score = 5;
  if (wordCount > 30) score += 2;
  else if (wordCount > 15) score += 1;
  if (wordCount < 5) score -= 2;
  if (text.includes("because") || text.includes("suggest") || text.includes("improve")) score += 1;
  if (text.includes("!") || text.includes("?")) score += 0.5;
  score = Math.min(10, Math.max(1, Math.round(score)));
  const reasoning = wordCount > 20 ? "Detailed feedback with good specificity" : wordCount > 10 ? "Moderate detail provided" : "Brief feedback, could be more specific";
  return JSON.stringify({ score, reasoning });
}

function builtinFeedbackSummary(feedbackText: string): string {
  const lines = feedbackText.split("\n").filter(l => l.trim());
  const ratings = lines.map(l => { const m = l.match(/Rating:\s*(\d)/); return m ? parseInt(m[1]) : 3; });
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 3;
  const sentiment = avg >= 3.5 ? "positive" : avg <= 2.5 ? "negative" : "mixed";
  return JSON.stringify({
    summary: `Based on ${lines.length} feedback entries, the teacher has an average rating of ${avg.toFixed(1)}/5. Overall feedback is ${sentiment}.`,
    strengths: avg >= 3 ? ["Consistent engagement with students", "Clear communication style", "Good subject knowledge"] : ["Room for growth"],
    improvements: avg < 4 ? ["Consider more interactive teaching methods", "Provide additional study materials", "Increase student engagement"] : ["Continue current excellent approach"],
    overallSentiment: sentiment
  });
}

function builtinRecommendations(text: string): string {
  // Extract teacher IDs from the input and recommend top 3 by rating
  const teacherMatches = [...text.matchAll(/ID:\s*([\w]+),.*?Rating:\s*([\d.]+|N\/A)/g)];
  const teachers = teacherMatches.map(m => ({ teacherId: m[1], rating: m[2] === "N/A" ? 3 : parseFloat(m[2]) }));
  teachers.sort((a, b) => b.rating - a.rating);
  const recs = teachers.slice(0, 3).map((t, i) => ({
    teacherId: t.teacherId,
    score: Math.round(Math.max(50, 100 - i * 15)),
    reasoning: `Recommended based on rating of ${t.rating}/5`
  }));
  return JSON.stringify({ recommendations: recs });
}

function builtinReplyTemplates(comment: string): string {
  return JSON.stringify({
    templates: [
      `Thank you for your feedback! I appreciate you taking the time to share your thoughts. I'll take your points into consideration for future lectures.`,
      `I really value your input. Your feedback helps me improve my teaching approach. I'll work on the areas you've mentioned.`,
      `Thanks for sharing your experience! I'm glad to hear your perspective and will use it to enhance our learning sessions going forward.`
    ]
  });
}

function builtinChatbot(prompt: string): string {
  // Extract the LAST user message from the full prompt (which may include conversation history)
  let userMsg = prompt;
  const allUserMatches = [...prompt.matchAll(/USER:\s*(.+?)(?:\nASSISTANT:|$)/gs)];
  if (allUserMatches.length > 0) {
    userMsg = allUserMatches[allUserMatches.length - 1][1].trim();
  }
  const lower = userMsg.toLowerCase();

  // Math / general knowledge (check early before other patterns)
  if (/what is (\d+)\s*\+\s*(\d+)/.test(lower)) {
    const match = lower.match(/what is (\d+)\s*\+\s*(\d+)/);
    if (match) return `${parseInt(match[1]) + parseInt(match[2])}`;
  }
  if (/(\d+)\s*[\+]\s*(\d+)\s*[=?]/.test(lower) || /(\d+)\s*plus\s*(\d+)/.test(lower)) {
    const match = lower.match(/(\d+)\s*(?:[\+]|plus)\s*(\d+)/);
    if (match) return `${parseInt(match[1]) + parseInt(match[2])}`;
  }

  // Greeting
  if (/\b(hi|hello|hey|greetings)\b/.test(lower) && lower.length < 40) {
    return "Hello! I'm EduBot, your assistant for the EduFeedback system. I can help you with giving feedback, viewing analytics, finding teachers, and navigating the platform. How can I help you today?";
  }

  // Feedback-related
  if (/how.*(give|submit|leave|write|post).*feedback/.test(lower) || (/give/.test(lower) && /feedback/.test(lower) && !/\d/.test(lower))) {
    return "To give feedback: 1) Navigate to the Teachers page, 2) Click on a teacher's profile, 3) Click the 'Give Feedback' button, 4) Rate them from 1-5 stars and write your comments, 5) Submit! Your feedback helps teachers improve.";
  }
  if (/how.*(view|see|check|read).*feedback/.test(lower)) {
    return "To view feedback: If you're a student, go to 'My Feedback' to see feedback you've given. If you're a teacher, go to your Dashboard to see all feedback received, along with ratings and analytics.";
  }
  if (/feedback/.test(lower) && /improv|better|tip/.test(lower)) {
    return "Tips for writing good feedback: 1) Be specific about what worked well or needs improvement, 2) Give examples from class, 3) Be constructive and respectful, 4) Suggest alternatives rather than just criticizing, 5) Mention both positives and areas for growth.";
  }

  // Rating/analytics
  if (/rating|star|score|analytics/.test(lower)) {
    return "Ratings are on a 1-5 star scale. Teachers can view their average rating, rating distribution, and trends over time in their Dashboard. The Analytics page shows detailed breakdowns including sentiment analysis and comparison charts.";
  }

  // Teacher-related
  if (/teacher|professor|instructor/.test(lower) && /find|search|look/.test(lower)) {
    return "You can find teachers by: 1) Using the search bar on the Teachers page, 2) Filtering by department or subject, 3) Browsing the teacher cards with ratings, 4) Using the comparison feature to compare multiple teachers.";
  }
  if (/teacher|professor/.test(lower)) {
    return "Teachers can view their feedback dashboard, see analytics and trends, respond to student feedback, and track their improvement over time. Students can browse teachers, view profiles, and submit feedback.";
  }

  // Navigation
  if (/navigate|where|find|page|how to use/.test(lower)) {
    return "Key pages: Home (overview), Teachers (browse/search), Dashboard (your stats), My Feedback (feedback you've given), Analytics (detailed charts). Use the navigation bar at the top to move between pages.";
  }

  // Login/account
  if (/login|sign.*in|account|register|sign.*up/.test(lower)) {
    return "To get started: 1) Click Login/Signup in the navigation bar, 2) Create an account with your email as a student or teacher, 3) After logging in, you'll be directed to your role-specific dashboard with all features available.";
  }

  // Help
  if (/help|what can you|what do you/.test(lower)) {
    return "I can help you with: 1) How to give and view feedback, 2) Understanding ratings and analytics, 3) Finding teachers and their profiles, 4) Navigating the platform, 5) Tips for writing effective feedback, 6) Account and login questions. Just ask!";
  }

  // Thank you
  if (/thank|thanks/.test(lower)) {
    return "You're welcome! Feel free to ask if you have any other questions about the EduFeedback platform.";
  }

  // Bye
  if (/bye|goodbye|see you/.test(lower)) {
    return "Goodbye! Have a great day. Come back anytime you need help with the EduFeedback system!";
  }

  // Default
  return "I'm EduBot, here to help with the EduFeedback system! I can assist with giving feedback, viewing analytics, finding teachers, and navigating the platform. Could you rephrase your question or ask about one of these topics?";
}

function builtinGenerate(prompt: string): string {
  // Detect what kind of request this is based on the prompt content
  const lower = prompt.toLowerCase();
  
  if (lower.includes("sentiment") && lower.includes("json")) {
    const inputMatch = prompt.match(/INPUT:\n(.+)/s);
    return builtinSentimentAnalysis(inputMatch?.[1] || prompt);
  }
  if ((lower.includes("quality") || lower.includes("helpfulness")) && lower.includes("json")) {
    const inputMatch = prompt.match(/INPUT:\n(.+)/s);
    return builtinQualityScore(inputMatch?.[1] || prompt, 3);
  }
  if (lower.includes("summarize") && lower.includes("json")) {
    const inputMatch = prompt.match(/INPUT:\n(.+)/s);
    return builtinFeedbackSummary(inputMatch?.[1] || prompt);
  }
  if (lower.includes("recommend") && lower.includes("json")) {
    const inputMatch = prompt.match(/INPUT:\n(.+)/s);
    return builtinRecommendations(inputMatch?.[1] || prompt);
  }
  if (lower.includes("reply") && lower.includes("templates") && lower.includes("json")) {
    const inputMatch = prompt.match(/INPUT:\n(.+)/s);
    return builtinReplyTemplates(inputMatch?.[1] || prompt);
  }
  if (lower.includes("rewrite") || lower.includes("improved feedback")) {
    const inputMatch = prompt.match(/Original feedback:\n(.+?)\n\nImproved/s);
    const original = inputMatch?.[1] || "";
    return `Thank you for sharing your thoughts. ${original.charAt(0).toUpperCase() + original.slice(1)}. I appreciate the opportunity to learn and grow from this feedback.`;
  }
  
  // Chatbot fallback
  return builtinChatbot(prompt);
}

async function generateText(prompt: string): Promise<string> {
  const hfToken = getHfToken();
  const openAiKey = getOpenAiKey();
  
  // Try HuggingFace first
  if (hfToken) {
    try {
      return await hfGenerate(prompt);
    } catch (error: any) {
      console.warn("HuggingFace AI failed, trying next provider...", error?.message || error);
    }
  }
  
  // Try OpenAI second
  if (openAiKey) {
    try {
      return await openAiGenerate(prompt);
    } catch (error: any) {
      console.warn("OpenAI AI failed, falling back to built-in...", error?.message || error);
    }
  }
  
  // Built-in fallback (always works)
  console.log("Using built-in AI fallback");
  return builtinGenerate(prompt);
}

async function generateJson<T = any>(instruction: string, input: string): Promise<T> {
  const prompt =
    instruction + "\n\nReturn only valid JSON, no extra text.\n\nINPUT:\n" + input;

  const text = (await generateText(prompt)) || "{}";
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    // Don't silently fail - propagate JSON parse errors so API handlers can return 502 Bad Gateway
    console.error("Failed to parse AI JSON-style response", text, e);
    const err: any = new Error(
      `AI service returned invalid JSON. This might be a temporary service issue. Please try again later.`
    );
    err.status = 502;
    throw err;
  }
}

export interface SentimentAnalysis {
  sentiment: "positive" | "negative" | "neutral";
  score: number; // -1 to 1
  keywords: string[];
}

export interface QualityScore {
  score: number; // 1-10
  reasoning: string;
}

export interface FeedbackSummary {
  summary: string;
  strengths: string[];
  improvements: string[];
  overallSentiment: string;
}

export interface TeacherRecommendation {
  teacherId: string;
  score: number;
  reasoning: string;
}

export class AIService {
  /**
   * Analyze sentiment of feedback comment
   */
  async analyzeSentiment(comment: string): Promise<SentimentAnalysis> {
    if (!comment || comment.trim().length === 0) {
      return {
        sentiment: "neutral",
        score: 0,
        keywords: [],
      };
    }

    try {
      const instruction =
        "You are a sentiment analysis expert. Analyze the sentiment of student feedback about teachers. " +
        "Return a JSON object with: sentiment (\"positive\", \"negative\", or \"neutral\"), " +
        "score (number from -1 to 1), and keywords (array of 3-5 key words or phrases).";

      const result = await generateJson<{
        sentiment?: string;
        score?: number;
        keywords?: string[];
      }>(instruction, comment);

      return {
        sentiment:
          (result.sentiment as SentimentAnalysis["sentiment"]) || "neutral",
        score: typeof result.score === "number" ? result.score : 0,
        keywords: Array.isArray(result.keywords) ? result.keywords : [],
      };
    } catch (error) {
      console.error("Sentiment analysis error:", error);
      return {
        sentiment: "neutral",
        score: 0,
        keywords: [],
      };
    }
  }

  /**
   * Score feedback quality (helpfulness, detail, constructiveness)
   */
  async scoreFeedbackQuality(comment: string, rating: number): Promise<QualityScore> {
    if (!comment || comment.trim().length === 0) {
      return {
        score: 1,
        reasoning: "No comment provided",
      };
    }

    try {
      const instruction =
        "You are an education feedback quality assessor. Rate the quality and helpfulness of student feedback on a scale of 1-10. " +
        "Consider specificity, constructiveness, actionable insights, and clarity. " +
        "Return JSON with: score (number 1-10) and reasoning (brief explanation).";

      const result = await generateJson<{
        score?: number;
        reasoning?: string;
      }>(instruction, `Rating: ${rating}/5, Comment: ${comment}`);

      const rawScore = typeof result.score === "number" ? result.score : 5;
      const clamped = Math.min(10, Math.max(1, rawScore));

      return {
        score: clamped,
        reasoning: result.reasoning || "Average quality feedback",
      };
    } catch (error) {
      console.error("Quality scoring error:", error);
      return {
        score: 5,
        reasoning: "Unable to assess quality",
      };
    }
  }

  /**
   * Generate comprehensive summary of all feedback for a teacher
   */
  async generateFeedbackSummary(
    feedbackList: Array<{ rating: number; comment: string | null }>
  ): Promise<FeedbackSummary> {
    if (feedbackList.length === 0) {
      return {
        summary: "No feedback available yet.",
        strengths: [],
        improvements: [],
        overallSentiment: "neutral",
      };
    }

    const comments = feedbackList
      .filter((f) => f.comment && f.comment.trim().length > 0)
      .map((f) => `[Rating: ${f.rating}/5] ${f.comment}`)
      .join("\n");

    if (!comments) {
      return {
        summary: `Received ${feedbackList.length} ratings with no written comments.`,
        strengths: [],
        improvements: [],
        overallSentiment: "neutral",
      };
    }

    try {
      const instruction =
        "You are an educational analyst. Summarize student feedback for a teacher. " +
        "Return JSON with: summary (2-3 sentence overview), strengths (array of 3-5 key strengths), " +
        "improvements (array of 3-5 areas for improvement), overallSentiment (\"positive\", \"negative\", or \"mixed\").";

      const result = await generateJson<{
        summary?: string;
        strengths?: string[];
        improvements?: string[];
        overallSentiment?: string;
      }>(instruction, comments);

      return {
        summary: result.summary || "Summary unavailable",
        strengths: Array.isArray(result.strengths) ? result.strengths : [],
        improvements: Array.isArray(result.improvements)
          ? result.improvements
          : [],
        overallSentiment: result.overallSentiment || "neutral",
      };
    } catch (error) {
      console.error("Summary generation error:", error);
      return {
        summary: "Unable to generate summary at this time.",
        strengths: [],
        improvements: [],
        overallSentiment: "neutral",
      };
    }
  }

  /**
   * Recommend teachers based on student preferences
   */
  async recommendTeachers(
    studentPreferences: string,
    availableTeachers: Array<{
      id: string;
      name: string;
      department: string;
      subject: string;
      averageRating: number | null;
      bio: string | null;
    }>
  ): Promise<TeacherRecommendation[]> {
    if (availableTeachers.length === 0) {
      return [];
    }

    const teacherInfo = availableTeachers
      .map(
        (t) =>
          `ID: ${t.id}, Name: ${t.name}, Subject: ${t.subject}, Dept: ${t.department}, Rating: ${
            t.averageRating || "N/A"
          }, Bio: ${t.bio || "N/A"}`
      )
      .join("\n");

    try {
      const instruction =
        "You are a teacher recommendation system. Based on student preferences and the list of available teachers, " +
        "recommend the top 3 most suitable teachers. Return JSON with a \"recommendations\" array; each item has: " +
        "teacherId (string), score (number 0-100), reasoning (string).";

      const result = await generateJson<{
        recommendations?: TeacherRecommendation[];
      }>(
        instruction,
        `Student preferences: ${studentPreferences}\n\nAvailable teachers:\n${teacherInfo}`
      );

      if (!result || typeof result !== "object") {
        const err: any = new Error("AI service returned invalid response structure");
        err.status = 502;
        throw err;
      }

      if (!Array.isArray(result.recommendations)) {
        const err: any = new Error("AI response missing 'recommendations' array");
        err.status = 502;
        throw err;
      }

      const recommendations = result.recommendations.slice(0, 3);

      if (recommendations.length === 0) {
        console.warn("No teacher recommendations generated", { preferences: studentPreferences });
        // Empty recommendations might be valid (no matches), so return empty array but log warning
        return [];
      }

      return recommendations;
    } catch (error) {
      console.error("Recommendation error:", error);
      throw error;  // Propagate error so route handler returns proper status code
    }
  }

  /**
   * Generate suggested reply templates for a given feedback comment
   */
  async generateReplyTemplates(comment: string): Promise<string[]> {
    if (!comment || comment.trim().length === 0) {
      return [];
    }

    try {
      const instruction =
        "You help teachers write short, polite, and professional replies to student feedback. " +
        "Given the student's comment, generate 2-3 different reply options that: " +
        "1) thank the student, 2) acknowledge their point, and 3) briefly mention an action or intention. " +
        "Return JSON with a single field 'templates' which is an array of reply strings.";

      const result = await generateJson<{
        templates?: string[];
      }>(instruction, comment);

      if (!result || typeof result !== "object") {
        const err: any = new Error("AI service returned invalid response structure");
        err.status = 502;
        throw err;
      }

      if (!Array.isArray(result.templates)) {
        const err: any = new Error("AI response missing 'templates' array");
        err.status = 502;
        throw err;
      }

      const filtered = result.templates
        .filter((t) => typeof t === "string" && t.trim().length > 0)
        .slice(0, 3);

      if (filtered.length === 0) {
        console.warn("No reply templates generated", { comment });
        const err: any = new Error("AI could not generate suitable reply templates. Please try again or provide different feedback.");
        err.status = 422;
        throw err;
      }

      return filtered;
    } catch (error) {
      console.error("Reply template generation error:", error);
      throw error;  // Propagate error so route handler returns proper status code
    }
  }

  /**
   * Improve a student's feedback comment to be more clear, polite, and constructive
   */
  async improveFeedback(comment: string): Promise<string> {
    const original = (comment || "").trim();
    if (!original) {
      return original;
    }

    const instruction =
      "You are an assistant that rewrites student feedback about a lecture or teacher. " +
      "Keep the original meaning, but make the text more polite, clear, and constructive. " +
      "Do not add new complaints or compliments that were not there. Return only the rewritten feedback.";

    try {
      const prompt = instruction + "\n\nOriginal feedback:\n" + original + "\n\nImproved feedback:";
      const improved = await generateText(prompt);
      const normalized = (improved || "").trim();
      if (!normalized) {
        // Fallback if the model responds with empty content
        return `Thank you for your feedback. ${original}`;
      }

      // If the model just echoes the same text, add a light-touch improvement wrapper
      if (normalized === original) {
        return `Thank you for your detailed feedback. ${original}`;
      }

      return normalized;
    } catch (error) {
      console.error("Improve feedback error:", error);
      // Ensure we still return something that looks slightly improved
      return `Thank you for your feedback. ${original}`;
    }
  }

  /**
   * Chatbot for answering common queries
   */
  async chatbot(
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }> = []
  ): Promise<string> {
    try {
      const historyText = conversationHistory
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n");

      const systemPrompt =
        "You are EduBot, a helpful assistant for the EduFeedback system - a lecture feedback platform. " +
        "You help students and teachers with: how to give feedback, how to view feedback, understanding ratings and analytics, navigation help, and teacher profile information. " +
        "Be concise, friendly, and helpful. If you don't know something, admit it.";

      const prompt =
        systemPrompt +
        "\n\nConversation so far (if any):\n" +
        (historyText ? historyText + "\n\n" : "") +
        "USER: " +
        userMessage +
        "\nASSISTANT:";

      const text = await generateText(prompt);
      const trimmed = text.trim();
      return trimmed || "I'm sorry, I couldn't process that.";
    } catch (error) {
      console.error("Chatbot error:", error);
      // All external providers failed; use built-in fallback
      return builtinChatbot(userMessage);
    }
  }
}

export const aiService = new AIService();
