/**
 * ClassIntel Intelligence Module (Pure TypeScript / Node.js)
 * 
 * Rule-based text analysis for education feedback:
 * - Sentiment Analysis: keyword matching with domain-specific lexicon + weighted scoring
 * - Topic Extraction: keyword-cluster matching with confidence scoring
 * - Student Risk Prediction: weighted composite scoring model
 * - Suggestion Generation: template-based suggestions driven by topic & sentiment analysis
 * 
 * No external AI services — just Node.js string processing and math.
 */

// ═══════════════════════════════════════════════════════════════
// TEXT PREPROCESSING
// ═══════════════════════════════════════════════════════════════

const STOPWORDS = new Set([
  "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your",
  "yours", "yourself", "yourselves", "he", "him", "his", "himself", "she", "her",
  "hers", "herself", "it", "its", "itself", "they", "them", "their", "theirs",
  "themselves", "what", "which", "who", "whom", "this", "that", "these", "those",
  "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
  "having", "do", "does", "did", "doing", "a", "an", "the", "and", "but", "if",
  "or", "because", "as", "until", "while", "of", "at", "by", "for", "with",
  "about", "against", "between", "through", "during", "before", "after", "above",
  "below", "to", "from", "up", "down", "in", "out", "on", "off", "over", "under",
  "again", "further", "then", "once", "here", "there", "when", "where", "why",
  "how", "all", "both", "each", "few", "more", "most", "other", "some", "such",
  "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "can", "will", "just", "should", "now",
]);

function cleanText(text: string): string {
  let t = text.toLowerCase().trim();
  t = t.replace(/http\S+|www\.\S+/g, "");       // remove URLs
  t = t.replace(/<[^>]+>/g, "");                  // remove HTML
  t = t.replace(/[^\w\s]/g, " ");                 // remove punctuation
  t = t.replace(/\d+/g, "");                      // remove numbers
  t = t.replace(/\s+/g, " ").trim();              // collapse whitespace
  return t;
}

function tokenize(text: string): string[] {
  const cleaned = cleanText(text);
  return cleaned.split(" ").filter(t => t.length > 2 && !STOPWORDS.has(t));
}


// ═══════════════════════════════════════════════════════════════
// SENTIMENT ANALYSIS
// ═══════════════════════════════════════════════════════════════

/** Positive education-domain words with sentiment weights */
const POSITIVE_EDU_WORDS: Record<string, number> = {
  excellent: 0.4, amazing: 0.35, outstanding: 0.4, brilliant: 0.35,
  inspiring: 0.35, engaging: 0.3, helpful: 0.25, clear: 0.25,
  wonderful: 0.3, fantastic: 0.3, knowledgeable: 0.25, supportive: 0.25,
  motivating: 0.3, interactive: 0.25, organized: 0.2, prepared: 0.2,
  passionate: 0.3, patient: 0.25, approachable: 0.25, practical: 0.2,
  thorough: 0.2, responsive: 0.2, innovative: 0.2, dedicated: 0.25,
  encourage: 0.2, recommend: 0.2, enjoyable: 0.25, effective: 0.2,
  love: 0.3, best: 0.3, great: 0.25, good: 0.15,
};

/** Negative education-domain words with sentiment weights */
const NEGATIVE_EDU_WORDS: Record<string, number> = {
  boring: -0.35, confusing: -0.3, unclear: -0.3, unhelpful: -0.35,
  disorganized: -0.3, rushed: -0.25, monotone: -0.3, difficult: -0.2,
  frustrating: -0.3, waste: -0.35, poor: -0.3, terrible: -0.4,
  awful: -0.4, worst: -0.4, slow: -0.2, fast: -0.15,
  rude: -0.35, unprepared: -0.3, lazy: -0.35, unfair: -0.3,
  biased: -0.3, irrelevant: -0.25, outdated: -0.25, incompetent: -0.4,
  intimidating: -0.25, unapproachable: -0.3, disappointing: -0.3,
  hate: -0.35, bad: -0.25, horrible: -0.4, never: -0.15,
};

export interface SentimentResult {
  sentiment: "positive" | "negative" | "neutral";
  polarity: number;
  subjectivity: number;
  confidence: number;
  scores: { positive: number; negative: number; neutral: number };
  keywords: Array<{ word: string; impact: string; weight: number }>;
}

export interface BatchSentimentResult {
  results: SentimentResult[];
  aggregate: {
    total: number;
    positive: number;
    negative: number;
    neutral: number;
    positivePercent: number;
    negativePercent: number;
    neutralPercent: number;
    avgPolarity: number;
  };
}

/**
 * Analyze sentiment of a single feedback text using keyword matching
 * with education-domain lexicon and weighted scoring.
 */
export function analyzeSentiment(text: string): SentimentResult {
  if (!text || !text.trim()) {
    return {
      sentiment: "neutral",
      polarity: 0,
      subjectivity: 0.5,
      confidence: 0,
      scores: { positive: 0.33, negative: 0.33, neutral: 0.34 },
      keywords: [],
    };
  }

  const lower = text.toLowerCase();
  let domainScore = 0;
  const keywords: SentimentResult["keywords"] = [];

  // Match positive words
  for (const [word, score] of Object.entries(POSITIVE_EDU_WORDS)) {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(lower)) {
      domainScore += score;
      keywords.push({ word, impact: "positive", weight: score });
    }
  }

  // Match negative words
  for (const [word, score] of Object.entries(NEGATIVE_EDU_WORDS)) {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(lower)) {
      domainScore += score; // score is already negative
      keywords.push({ word, impact: "negative", weight: Math.abs(score) });
    }
  }

  // Clamp polarity to [-1, 1]
  const polarity = Math.max(-1, Math.min(1, domainScore));

  // Estimate subjectivity: more emotional words → higher subjectivity
  const subjectivity = Math.min(1, keywords.length * 0.15);

  // Compute sentiment label and probability scores
  let posScore: number, negScore: number, neuScore: number;
  let sentiment: SentimentResult["sentiment"];

  if (polarity > 0.1) {
    posScore = Math.min(0.95, 0.5 + polarity * 0.45);
    negScore = Math.max(0.02, 0.3 - polarity * 0.25);
    neuScore = 1.0 - posScore - negScore;
    sentiment = "positive";
  } else if (polarity < -0.1) {
    negScore = Math.min(0.95, 0.5 + Math.abs(polarity) * 0.45);
    posScore = Math.max(0.02, 0.3 - Math.abs(polarity) * 0.25);
    neuScore = 1.0 - posScore - negScore;
    sentiment = "negative";
  } else {
    neuScore = 0.5 + (1 - Math.abs(polarity) * 10) * 0.2;
    posScore = (1 - neuScore) / 2 + polarity * 0.1;
    negScore = (1 - neuScore) / 2 - polarity * 0.1;
    sentiment = "neutral";
  }

  // Normalize scores to sum to 1
  const total = posScore + negScore + neuScore;
  posScore /= total;
  negScore /= total;
  neuScore /= total;

  const confidence = Math.max(posScore, negScore, neuScore);

  // Sort keywords by weight descending, take top 8
  keywords.sort((a, b) => b.weight - a.weight);

  return {
    sentiment,
    polarity: parseFloat(polarity.toFixed(4)),
    subjectivity: parseFloat(subjectivity.toFixed(4)),
    confidence: parseFloat(confidence.toFixed(4)),
    scores: {
      positive: parseFloat(posScore.toFixed(4)),
      negative: parseFloat(negScore.toFixed(4)),
      neutral: parseFloat(neuScore.toFixed(4)),
    },
    keywords: keywords.slice(0, 8),
  };
}

/**
 * Batch sentiment analysis with aggregate statistics.
 */
export function batchSentiment(texts: string[]): BatchSentimentResult {
  const results = texts.filter(t => t.trim()).map(t => analyzeSentiment(t));

  if (results.length === 0) {
    return {
      results: [],
      aggregate: { total: 0, positive: 0, negative: 0, neutral: 0, positivePercent: 0, negativePercent: 0, neutralPercent: 0, avgPolarity: 0 },
    };
  }

  const posCount = results.filter(r => r.sentiment === "positive").length;
  const negCount = results.filter(r => r.sentiment === "negative").length;
  const neuCount = results.filter(r => r.sentiment === "neutral").length;
  const avgPolarity = results.reduce((sum, r) => sum + r.polarity, 0) / results.length;

  return {
    results,
    aggregate: {
      total: results.length,
      positive: posCount,
      negative: negCount,
      neutral: neuCount,
      positivePercent: parseFloat((posCount / results.length * 100).toFixed(1)),
      negativePercent: parseFloat((negCount / results.length * 100).toFixed(1)),
      neutralPercent: parseFloat((neuCount / results.length * 100).toFixed(1)),
      avgPolarity: parseFloat(avgPolarity.toFixed(4)),
    },
  };
}


// ═══════════════════════════════════════════════════════════════
// TOPIC EXTRACTION
// ═══════════════════════════════════════════════════════════════

/** Education-domain topic clusters with associated keywords */
const TOPIC_CLUSTERS: Record<string, { keywords: string[]; label: string; icon: string }> = {
  pace: {
    keywords: ["fast", "slow", "pace", "speed", "rushed", "quick", "hurry", "hurried",
      "too fast", "too slow", "pacing", "time management"],
    label: "Teaching Pace",
    icon: "⏱️",
  },
  clarity: {
    keywords: ["clear", "unclear", "confusing", "confused", "understand", "explain",
      "explanation", "clarity", "understandable", "hard to follow", "vague",
      "ambiguous", "straightforward"],
    label: "Clarity & Explanation",
    icon: "💡",
  },
  examples: {
    keywords: ["example", "examples", "practical", "practice", "real world", "hands on",
      "demo", "demonstration", "application", "applied", "case study",
      "real life", "scenario"],
    label: "Practical Examples",
    icon: "📝",
  },
  engagement: {
    keywords: ["boring", "engaging", "interesting", "interactive", "participation",
      "involve", "involved", "monotone", "dull", "exciting", "fun",
      "enthusiasm", "passionate", "energy", "dynamic", "lively"],
    label: "Student Engagement",
    icon: "🎯",
  },
  content: {
    keywords: ["content", "material", "syllabus", "curriculum", "topic", "depth",
      "coverage", "relevant", "irrelevant", "outdated", "comprehensive",
      "thorough", "surface level", "detailed"],
    label: "Course Content",
    icon: "📚",
  },
  assessment: {
    keywords: ["exam", "test", "quiz", "assignment", "grading", "marks", "grade",
      "evaluation", "fair", "unfair", "difficult", "easy", "hard",
      "homework", "project", "rubric"],
    label: "Assessment & Grading",
    icon: "📊",
  },
  communication: {
    keywords: ["communicate", "communication", "respond", "response", "email",
      "available", "availability", "approachable", "feedback", "listen",
      "accessible", "office hours", "doubt", "question", "answer"],
    label: "Communication",
    icon: "💬",
  },
  resources: {
    keywords: ["resource", "resources", "material", "slides", "notes", "textbook",
      "reference", "video", "recording", "online", "pdf", "handout",
      "study material"],
    label: "Learning Resources",
    icon: "📖",
  },
  support: {
    keywords: ["help", "support", "guidance", "mentor", "mentoring", "encourage",
      "encouraging", "patient", "caring", "understanding", "helpful",
      "supportive", "motivate", "motivation"],
    label: "Student Support",
    icon: "🤝",
  },
  organization: {
    keywords: ["organized", "disorganized", "structure", "plan", "planning",
      "prepared", "unprepared", "schedule", "systematic", "chaotic",
      "well structured", "structured"],
    label: "Organization & Preparation",
    icon: "📋",
  },
};

export interface TopicMatch {
  topic: string;
  label: string;
  icon: string;
  confidence: number;
  matchedKeywords: string[];
  score: number;
}

export interface TopicResult {
  topics: TopicMatch[];
  tokens: string[];
  topicCount: number;
}

export interface BatchTopicResult {
  frequency: Array<{
    topic: string;
    label: string;
    icon: string;
    count: number;
    percentage: number;
    avgConfidence: number;
  }>;
  weakAreas: string[];
  totalFeedback: number;
  topicsDetected: number;
  perFeedback: TopicResult[];
}

/**
 * Extract education-relevant topics from a single feedback text
 * using keyword-cluster matching with confidence scoring.
 */
export function extractTopics(text: string): TopicResult {
  if (!text || !text.trim()) {
    return { topics: [], tokens: [], topicCount: 0 };
  }

  const lower = text.toLowerCase();
  const tokens = tokenize(text);
  const matchedTopics: TopicMatch[] = [];

  for (const [topicKey, topicData] of Object.entries(TOPIC_CLUSTERS)) {
    let score = 0;
    const matchedKeywords: string[] = [];

    for (const kw of topicData.keywords) {
      if (kw.includes(" ")) {
        // Multi-word keyword: direct substring match
        if (lower.includes(kw)) {
          score += 2;
          matchedKeywords.push(kw);
        }
      } else {
        // Single word: word boundary match
        const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        if (regex.test(lower)) {
          score += 1;
          matchedKeywords.push(kw);
        }
      }
    }

    if (score > 0) {
      matchedTopics.push({
        topic: topicKey,
        label: topicData.label,
        icon: topicData.icon,
        confidence: parseFloat(Math.min(1, score / 3).toFixed(2)),
        matchedKeywords,
        score,
      });
    }
  }

  // Sort by score descending
  matchedTopics.sort((a, b) => b.score - a.score);

  return {
    topics: matchedTopics,
    tokens: tokens.slice(0, 20),
    topicCount: matchedTopics.length,
  };
}

/**
 * Batch topic extraction with frequency statistics.
 */
export function batchTopicExtraction(texts: string[]): BatchTopicResult {
  const topicCounts: Record<string, number> = {};
  const topicDetails: Record<string, { label: string; icon: string; totalMentions: number; confidenceSum: number }> = {};
  const perFeedback: TopicResult[] = [];
  let processedCount = 0;

  for (const text of texts) {
    if (!text.trim()) continue;
    processedCount++;

    const result = extractTopics(text);
    perFeedback.push(result);

    for (const topic of result.topics) {
      const key = topic.topic;
      topicCounts[key] = (topicCounts[key] || 0) + 1;
      if (!topicDetails[key]) {
        topicDetails[key] = { label: topic.label, icon: topic.icon, totalMentions: 0, confidenceSum: 0 };
      }
      topicDetails[key].totalMentions++;
      topicDetails[key].confidenceSum += topic.confidence;
    }
  }

  // Build frequency chart data, sorted by count descending
  const frequency = Object.entries(topicCounts)
    .map(([topicKey, count]) => {
      const detail = topicDetails[topicKey];
      const avgConf = detail.confidenceSum / detail.totalMentions;
      return {
        topic: topicKey,
        label: detail.label,
        icon: detail.icon,
        count,
        percentage: processedCount ? parseFloat((count / processedCount * 100).toFixed(1)) : 0,
        avgConfidence: parseFloat(avgConf.toFixed(2)),
      };
    })
    .sort((a, b) => b.count - a.count);

  const weakAreas = frequency.slice(0, 5).map(f => f.label);

  return {
    frequency,
    weakAreas,
    totalFeedback: processedCount,
    topicsDetected: frequency.length,
    perFeedback: perFeedback.slice(0, 50),
  };
}


// ═══════════════════════════════════════════════════════════════
// STUDENT RISK PREDICTION
// ═══════════════════════════════════════════════════════════════

const HIGH_RISK_THRESHOLD = 40;
const MEDIUM_RISK_THRESHOLD = 65;

const RISK_WEIGHTS = {
  attendance: 0.30,
  marks: 0.35,
  sentiment: 0.20,
  engagement: 0.15,
};

export interface RiskResult {
  riskLevel: "high" | "medium" | "low";
  riskScore: number;
  safetyScore: number;
  riskColor: string;
  components: {
    attendance: { value: number; weight: number; contribution: number };
    marks: { value: number; weight: number; contribution: number };
    sentiment: { value: number; weight: number; contribution: number };
    engagement: { value: number; weight: number; contribution: number };
  };
  factors: Array<{ factor: string; severity: string; value: string }>;
  recommendations: string[];
  studentName?: string;
  studentId?: string;
}

export interface ClassRiskResult {
  students: RiskResult[];
  summary: {
    total: number;
    highRisk: number;
    mediumRisk: number;
    lowRisk: number;
    highRiskPercent: number;
    mediumRiskPercent: number;
    lowRiskPercent: number;
    avgRiskScore: number;
  };
}

/**
 * Compute risk score for a single student using a weighted scoring model.
 * Higher riskScore = more at-risk. Higher safetyScore = safer.
 */
export function computeRiskScore(
  attendance: number,
  marks: number,
  sentimentPolarity: number = 0,
  engagementScore: number = 50
): RiskResult {
  // Clamp inputs
  attendance = Math.max(0, Math.min(100, attendance));
  marks = Math.max(0, Math.min(100, marks));
  sentimentPolarity = Math.max(-1, Math.min(1, sentimentPolarity));
  engagementScore = Math.max(0, Math.min(100, engagementScore));

  // Normalize sentiment from [-1, 1] to [0, 100]
  const sentimentNormalized = (sentimentPolarity + 1) * 50;

  // Weighted composite score (0-100, higher = safer)
  let composite =
    attendance * RISK_WEIGHTS.attendance +
    marks * RISK_WEIGHTS.marks +
    sentimentNormalized * RISK_WEIGHTS.sentiment +
    engagementScore * RISK_WEIGHTS.engagement;
  composite = Math.max(0, Math.min(100, composite));

  // Determine risk level
  let riskLevel: RiskResult["riskLevel"];
  let riskColor: string;
  if (composite < HIGH_RISK_THRESHOLD) {
    riskLevel = "high";
    riskColor = "#ef4444";
  } else if (composite < MEDIUM_RISK_THRESHOLD) {
    riskLevel = "medium";
    riskColor = "#f59e0b";
  } else {
    riskLevel = "low";
    riskColor = "#22c55e";
  }

  // Generate risk factors
  const factors: RiskResult["factors"] = [];
  if (attendance < 60) {
    factors.push({ factor: "Low attendance", severity: "high", value: `${attendance.toFixed(0)}%` });
  } else if (attendance < 75) {
    factors.push({ factor: "Below-average attendance", severity: "medium", value: `${attendance.toFixed(0)}%` });
  }
  if (marks < 40) {
    factors.push({ factor: "Failing marks", severity: "high", value: `${marks.toFixed(0)}%` });
  } else if (marks < 60) {
    factors.push({ factor: "Below-average marks", severity: "medium", value: `${marks.toFixed(0)}%` });
  }
  if (sentimentPolarity < -0.3) {
    factors.push({ factor: "Negative feedback sentiment", severity: "medium", value: sentimentPolarity.toFixed(2) });
  }
  if (engagementScore < 30) {
    factors.push({ factor: "Low engagement", severity: "medium", value: `${engagementScore.toFixed(0)}/100` });
  }

  // Generate recommendations
  const recommendations: string[] = [];
  if (attendance < 75) recommendations.push("Schedule a meeting to discuss attendance improvement");
  if (marks < 60) recommendations.push("Provide additional study resources and tutoring");
  if (sentimentPolarity < -0.2) recommendations.push("Address student concerns from negative feedback");
  if (engagementScore < 40) recommendations.push("Encourage participation through interactive activities");
  if (recommendations.length === 0) recommendations.push("Continue monitoring — student is performing well");

  return {
    riskLevel,
    riskScore: parseFloat((100 - composite).toFixed(1)),
    safetyScore: parseFloat(composite.toFixed(1)),
    riskColor,
    components: {
      attendance: { value: parseFloat(attendance.toFixed(1)), weight: RISK_WEIGHTS.attendance, contribution: parseFloat((attendance * RISK_WEIGHTS.attendance).toFixed(1)) },
      marks: { value: parseFloat(marks.toFixed(1)), weight: RISK_WEIGHTS.marks, contribution: parseFloat((marks * RISK_WEIGHTS.marks).toFixed(1)) },
      sentiment: { value: parseFloat(sentimentNormalized.toFixed(1)), weight: RISK_WEIGHTS.sentiment, contribution: parseFloat((sentimentNormalized * RISK_WEIGHTS.sentiment).toFixed(1)) },
      engagement: { value: parseFloat(engagementScore.toFixed(1)), weight: RISK_WEIGHTS.engagement, contribution: parseFloat((engagementScore * RISK_WEIGHTS.engagement).toFixed(1)) },
    },
    factors,
    recommendations,
  };
}

/**
 * Predict risk for an entire class of students.
 */
export function predictClassRisk(
  students: Array<{ name?: string; studentId?: string; id?: string; attendance?: number; marks?: number; feedback?: string; engagementScore?: number }>
): ClassRiskResult {
  let highRisk = 0, mediumRisk = 0, lowRisk = 0;

  const results: RiskResult[] = students.map(student => {
    const name = student.name || "Unknown";
    const attendance = Number(student.attendance) || 75;
    const marks = Number(student.marks) || 50;
    const feedback = student.feedback || "";
    const engagement = Number(student.engagementScore) || 50;

    // Analyze sentiment if feedback is provided
    let sentimentPolarity = 0;
    if (feedback.trim()) {
      sentimentPolarity = analyzeSentiment(feedback).polarity;
    }

    const risk = computeRiskScore(attendance, marks, sentimentPolarity, engagement);
    risk.studentName = name;
    risk.studentId = student.studentId || student.id || "";

    if (risk.riskLevel === "high") highRisk++;
    else if (risk.riskLevel === "medium") mediumRisk++;
    else lowRisk++;

    return risk;
  });

  // Sort by risk score descending (highest risk first)
  results.sort((a, b) => b.riskScore - a.riskScore);

  const total = results.length;
  return {
    students: results,
    summary: {
      total,
      highRisk,
      mediumRisk,
      lowRisk,
      highRiskPercent: total ? parseFloat((highRisk / total * 100).toFixed(1)) : 0,
      mediumRiskPercent: total ? parseFloat((mediumRisk / total * 100).toFixed(1)) : 0,
      lowRiskPercent: total ? parseFloat((lowRisk / total * 100).toFixed(1)) : 0,
      avgRiskScore: total ? parseFloat((results.reduce((sum, r) => sum + r.riskScore, 0) / total).toFixed(1)) : 0,
    },
  };
}


// ═══════════════════════════════════════════════════════════════
// SUGGESTION GENERATION
// ═══════════════════════════════════════════════════════════════

/** Suggestion templates mapped to detected topics */
const SUGGESTION_TEMPLATES: Record<string, Array<{ suggestion: string; priority: "high" | "medium" | "low"; category: string }>> = {
  pace: [
    { suggestion: "Consider varying your lecture pace — slow down for complex topics and speed up for review", priority: "high", category: "teaching-style" },
    { suggestion: "Add periodic 'checkpoint' moments where students can indicate if they need more time", priority: "medium", category: "teaching-style" },
    { suggestion: "Provide recorded lectures so students can review at their own pace", priority: "medium", category: "resources" },
  ],
  clarity: [
    { suggestion: "Use more visual aids (diagrams, flowcharts) to explain complex concepts", priority: "high", category: "content" },
    { suggestion: "Start each topic with a real-world analogy before diving into theory", priority: "high", category: "teaching-style" },
    { suggestion: "Summarize key takeaways at the end of each lecture section", priority: "medium", category: "teaching-style" },
  ],
  examples: [
    { suggestion: "Include more hands-on coding examples and live demonstrations", priority: "high", category: "content" },
    { suggestion: "Add case studies from industry to show real-world applications", priority: "high", category: "content" },
    { suggestion: "Create practice problem sets that mirror exam-style questions", priority: "medium", category: "assessment" },
  ],
  engagement: [
    { suggestion: "Introduce interactive polls or quizzes during lectures", priority: "high", category: "engagement" },
    { suggestion: "Use think-pair-share activities to boost participation", priority: "medium", category: "engagement" },
    { suggestion: "Start lectures with an interesting hook or current event related to the topic", priority: "medium", category: "teaching-style" },
  ],
  content: [
    { suggestion: "Update course material with the latest industry trends and technologies", priority: "high", category: "content" },
    { suggestion: "Align content more closely with the learning objectives", priority: "medium", category: "content" },
    { suggestion: "Add supplementary reading lists for students who want to go deeper", priority: "low", category: "resources" },
  ],
  assessment: [
    { suggestion: "Provide clearer rubrics so students know exactly how they'll be evaluated", priority: "high", category: "assessment" },
    { suggestion: "Include more formative assessments (mini-quizzes, reflections) throughout the course", priority: "medium", category: "assessment" },
    { suggestion: "Offer practice exams or sample questions before major assessments", priority: "medium", category: "assessment" },
  ],
  communication: [
    { suggestion: "Set up regular office hours and respond to student queries within 24 hours", priority: "high", category: "communication" },
    { suggestion: "Create an FAQ document addressing common student questions", priority: "medium", category: "resources" },
    { suggestion: "Use a discussion forum or chat channel for quick student-teacher communication", priority: "medium", category: "communication" },
  ],
  resources: [
    { suggestion: "Share lecture slides and notes before each class", priority: "high", category: "resources" },
    { suggestion: "Curate a list of free online resources (videos, articles) for each topic", priority: "medium", category: "resources" },
    { suggestion: "Create short summary videos for key concepts", priority: "low", category: "resources" },
  ],
  support: [
    { suggestion: "Identify struggling students early and offer targeted help sessions", priority: "high", category: "support" },
    { suggestion: "Create peer tutoring or study group programs", priority: "medium", category: "support" },
    { suggestion: "Provide positive reinforcement and constructive feedback on assignments", priority: "medium", category: "support" },
  ],
  organization: [
    { suggestion: "Share a detailed course outline with clear milestones at the start", priority: "high", category: "organization" },
    { suggestion: "Use a consistent lecture structure so students know what to expect", priority: "medium", category: "organization" },
    { suggestion: "Send weekly summary emails outlining upcoming topics and deadlines", priority: "low", category: "organization" },
  ],
};

export interface SuggestionItem {
  suggestion: string;
  priority: "high" | "medium" | "low";
  category: string;
  basedOnTopic: string;
  topicMentions: number;
  topicIcon: string;
}

export interface SuggestionResult {
  suggestions: SuggestionItem[];
  sentimentOverview: BatchSentimentResult["aggregate"];
  topicAnalysis: BatchTopicResult["frequency"];
  summary: string;
  teacherName: string;
  subject: string;
}

/**
 * Generate actionable improvement suggestions for a teacher
 * based on sentiment and topic analysis of their feedback.
 */
export function generateSuggestions(
  feedbackTexts: string[],
  teacherName: string = "Teacher",
  subject: string = "General"
): SuggestionResult {
  if (!feedbackTexts || feedbackTexts.length === 0) {
    return {
      suggestions: [],
      sentimentOverview: { total: 0, positive: 0, negative: 0, neutral: 0, positivePercent: 0, negativePercent: 0, neutralPercent: 0, avgPolarity: 0 },
      topicAnalysis: [],
      summary: `No feedback available for ${teacherName} yet.`,
      teacherName,
      subject,
    };
  }

  // Run analyses
  const sentimentData = batchSentiment(feedbackTexts);
  const topicData = batchTopicExtraction(feedbackTexts);

  // Generate suggestions based on detected topics
  const suggestions: SuggestionItem[] = [];
  const seen = new Set<string>();

  for (const topicFreq of topicData.frequency) {
    const templates = SUGGESTION_TEMPLATES[topicFreq.topic];
    if (!templates) continue;

    for (const template of templates) {
      if (!seen.has(template.suggestion)) {
        seen.add(template.suggestion);
        suggestions.push({
          suggestion: template.suggestion,
          priority: template.priority,
          category: template.category,
          basedOnTopic: topicFreq.label,
          topicMentions: topicFreq.count,
          topicIcon: topicFreq.icon,
        });
      }
    }
  }

  // Add sentiment-based suggestions
  const agg = sentimentData.aggregate;
  if (agg.negativePercent > 50) {
    suggestions.unshift({
      suggestion: `Critical: ${agg.negativePercent}% of feedback is negative. Consider a comprehensive teaching approach review.`,
      priority: "high",
      category: "overall",
      basedOnTopic: "Sentiment Analysis",
      topicMentions: agg.negative,
      topicIcon: "⚠️",
    });
  }
  if (agg.positivePercent > 70) {
    suggestions.push({
      suggestion: `Great work! ${agg.positivePercent}% of feedback is positive. Keep up the excellent teaching!`,
      priority: "low",
      category: "overall",
      basedOnTopic: "Sentiment Analysis",
      topicMentions: agg.positive,
      topicIcon: "🌟",
    });
  }

  // Sort by priority
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));

  // Build summary
  const topTopics = topicData.frequency.slice(0, 3).map(t => t.label);
  const summaryParts = [`Analysis of ${feedbackTexts.length} feedback entries for ${teacherName} (${subject}).`];
  if (topTopics.length > 0) {
    summaryParts.push(`Most discussed areas: ${topTopics.join(", ")}.`);
  }
  if (agg.negativePercent > 30) {
    summaryParts.push(`⚠️ ${agg.negativePercent}% negative sentiment detected — attention needed.`);
  } else if (agg.positivePercent > 60) {
    summaryParts.push(`✅ ${agg.positivePercent}% positive sentiment — strong performance.`);
  }

  return {
    suggestions: suggestions.slice(0, 15),
    sentimentOverview: agg,
    topicAnalysis: topicData.frequency,
    summary: summaryParts.join(" "),
    teacherName,
    subject,
  };
}


// ═══════════════════════════════════════════════════════════════
// FULL ANALYSIS (Sentiment + Topics combined — replaces /analyze endpoint)
// ═══════════════════════════════════════════════════════════════

export interface FullAnalysisResult {
  sentiment: string;
  confidence: number;
  scores: { positive: number; negative: number; neutral: number };
  polarity: number;
  topics: string[];
  topicDetails: TopicMatch[];
  keywords: SentimentResult["keywords"];
}

/**
 * Full analysis combining sentiment and topic extraction on a single feedback.
 */
export function fullAnalysis(feedback: string): FullAnalysisResult {
  const sentiment = analyzeSentiment(feedback);
  const topics = extractTopics(feedback);

  return {
    sentiment: sentiment.sentiment,
    confidence: sentiment.confidence,
    scores: sentiment.scores,
    polarity: sentiment.polarity,
    topics: topics.topics.map(t => t.topic),
    topicDetails: topics.topics,
    keywords: sentiment.keywords,
  };
}
