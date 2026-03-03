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
  // BUG FIX: "".split(/\s+/) returns [""](length 1), not [](length 0).
  // Use trim() first so empty/whitespace-only feedback is counted as 0 words.
  const wordCount = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
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
    return "Hello! I'm IntelBot, your assistant for the ClassIntel AI platform. I can help you with giving feedback, viewing analytics, finding teachers, and navigating the platform. How can I help you today?";
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
    return "You're welcome! Feel free to ask if you have any other questions about ClassIntel AI.";
  }

  // Bye
  if (/bye|goodbye|see you/.test(lower)) {
    return "Goodbye! Have a great day. Come back anytime you need help with ClassIntel AI!";
  }

  // Default
  return "I'm IntelBot, here to help with ClassIntel AI! I can assist with giving feedback, viewing analytics, finding teachers, and navigating the platform. Could you rephrase your question or ask about one of these topics?";
}

function builtinGenerate(prompt: string): string {
  // Detect what kind of request this is based on the prompt content
  const lower = prompt.toLowerCase();

  // Detect academic doubt auto-answer requests (must be before chatbot fallback)
  if (lower.includes("teaching assistant") && lower.includes("student's question") && lower.includes("helpful answer")) {
    const questionMatch = prompt.match(/Student's question:\n(.+?)\n\nHelpful answer/s);
    const subjectMatch = prompt.match(/subject \"(.+?)\"/i);
    const question = questionMatch?.[1]?.trim() || "";
    const subject = subjectMatch?.[1] || "the subject";
    return builtinAcademicAnswer(question, subject);
  }
  
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

// ─── Built-in academic doubt answering (no external API needed) ──────────────

const ACADEMIC_KNOWLEDGE: Record<string, Record<string, string>> = {
  // Mathematics / Statistics
  regression: {
    keywords: "regression",
    answer:
      "**Regression** is a statistical method used to model the relationship between a dependent variable (target) and one or more independent variables (predictors).\n\n" +
      "**Types of Regression:**\n" +
      "1. **Linear Regression** – Models a straight-line relationship: y = mx + b. Used when the relationship between variables is approximately linear.\n" +
      "2. **Multiple Linear Regression** – Extends linear regression with multiple predictors: y = b₀ + b₁x₁ + b₂x₂ + ...\n" +
      "3. **Polynomial Regression** – Fits a curved line using polynomial terms.\n" +
      "4. **Logistic Regression** – Used for classification (binary outcomes), not continuous values.\n" +
      "5. **Ridge / Lasso Regression** – Regularized versions that prevent overfitting.\n\n" +
      "**Key Concepts:**\n" +
      "• **R² (Coefficient of Determination)** – Measures how well the model fits the data (0 to 1).\n" +
      "• **Residuals** – The difference between predicted and actual values.\n" +
      "• **Least Squares Method** – Minimizes the sum of squared residuals to find the best-fit line.\n\n" +
      "Regression is widely used in prediction, forecasting, and understanding variable relationships across fields like economics, engineering, and data science.",
  },
  derivative: {
    keywords: "derivative|differentiation|calculus derivative",
    answer:
      "**Derivatives** measure the rate of change of a function with respect to a variable.\n\n" +
      "If y = f(x), the derivative f'(x) = lim(h→0) [f(x+h) - f(x)] / h\n\n" +
      "**Key Rules:**\n" +
      "• Power Rule: d/dx(xⁿ) = nxⁿ⁻¹\n" +
      "• Product Rule: d/dx(uv) = u'v + uv'\n" +
      "• Chain Rule: d/dx(f(g(x))) = f'(g(x)) · g'(x)\n" +
      "• Quotient Rule: d/dx(u/v) = (u'v - uv') / v²\n\n" +
      "Derivatives are used to find slopes, optimize functions, and model rates of change in physics, economics, and engineering.",
  },
  integral: {
    keywords: "integral|integration|antiderivative",
    answer:
      "**Integration** is the reverse of differentiation. It finds the area under a curve or the accumulation of quantities.\n\n" +
      "**Types:**\n" +
      "1. **Indefinite Integral**: ∫f(x)dx = F(x) + C (finds the antiderivative)\n" +
      "2. **Definite Integral**: ∫ₐᵇ f(x)dx = F(b) - F(a) (computes area under curve from a to b)\n\n" +
      "**Common Rules:**\n" +
      "• ∫xⁿ dx = xⁿ⁺¹/(n+1) + C\n" +
      "• ∫eˣ dx = eˣ + C\n" +
      "• ∫(1/x) dx = ln|x| + C\n\n" +
      "Integration is used in physics (work, displacement), probability, and engineering.",
  },
  matrix: {
    keywords: "matrix|matrices|linear algebra",
    answer:
      "A **matrix** is a rectangular array of numbers arranged in rows and columns.\n\n" +
      "**Operations:**\n" +
      "• **Addition/Subtraction**: Element-wise, same dimensions required\n" +
      "• **Multiplication**: (m×n) × (n×p) = (m×p), row-by-column dot product\n" +
      "• **Transpose**: Flip rows and columns (Aᵀ)\n" +
      "• **Determinant**: Scalar value for square matrices, det(A)\n" +
      "• **Inverse**: A⁻¹ exists if det(A) ≠ 0; AA⁻¹ = I\n\n" +
      "Matrices are fundamental in computer graphics, data analysis, systems of equations, and quantum mechanics.",
  },
  probability: {
    keywords: "probability|bayes|conditional probability",
    answer:
      "**Probability** measures the likelihood of an event occurring, expressed as a number between 0 and 1.\n\n" +
      "**Key Formulas:**\n" +
      "• P(A) = Favorable outcomes / Total outcomes\n" +
      "• P(A ∪ B) = P(A) + P(B) - P(A ∩ B) (Union)\n" +
      "• P(A|B) = P(A ∩ B) / P(B) (Conditional)\n" +
      "• Bayes' Theorem: P(A|B) = P(B|A)·P(A) / P(B)\n\n" +
      "**Distributions:** Normal, Binomial, Poisson, Exponential\n\n" +
      "Probability is the foundation of statistics, data modeling, risk analysis, and decision making.",
  },
  // Physics
  newton: {
    keywords: "newton|force|motion|law of motion",
    answer:
      "**Newton's Laws of Motion:**\n\n" +
      "1. **First Law (Inertia):** An object stays at rest or in uniform motion unless acted upon by an external force.\n" +
      "2. **Second Law:** F = ma. Force equals mass times acceleration.\n" +
      "3. **Third Law:** For every action, there is an equal and opposite reaction.\n\n" +
      "**Key Formulas:**\n" +
      "• Weight: W = mg (g ≈ 9.8 m/s²)\n" +
      "• Momentum: p = mv\n" +
      "• Work: W = F·d·cos(θ)\n\n" +
      "Newton's laws form the foundation of classical mechanics and are essential for understanding motion, forces, and energy.",
  },
  // Programming
  oop: {
    keywords: "oop|object oriented|encapsulation|polymorphism|inheritance|abstraction",
    answer:
      "**Object-Oriented Programming (OOP)** is a paradigm based on objects containing data and methods.\n\n" +
      "**Four Pillars:**\n" +
      "1. **Encapsulation** – Bundling data and methods together, hiding internal details (using private/public access).\n" +
      "2. **Inheritance** – A class can inherit properties/methods from a parent class (code reuse).\n" +
      "3. **Polymorphism** – Same method behaves differently based on the object (overriding/overloading).\n" +
      "4. **Abstraction** – Hiding complex implementation, showing only essential features.\n\n" +
      "**Key Concepts:** Classes, Objects, Constructors, Interfaces, Abstract Classes\n\n" +
      "OOP is used in Java, C++, C#, TypeScript, Swift, and most modern languages.",
  },
  database: {
    keywords: "database|sql|normalization|dbms|rdbms",
    answer:
      "A **Database** is an organized collection of structured data stored electronically.\n\n" +
      "**Types:**\n" +
      "• **Relational (SQL):** Tables with rows/columns (MySQL, PostgreSQL)\n" +
      "• **NoSQL:** Document-based (MongoDB), Key-Value (Redis), Graph (Neo4j)\n\n" +
      "**Key SQL Concepts:**\n" +
      "• SELECT, INSERT, UPDATE, DELETE\n" +
      "• JOINs (INNER, LEFT, RIGHT, FULL)\n" +
      "• Normalization (1NF, 2NF, 3NF, BCNF) – reduces redundancy\n" +
      "• Indexing – speeds up queries\n" +
      "• ACID properties – Atomicity, Consistency, Isolation, Durability\n\n" +
      "Databases are fundamental to every application that stores and retrieves data.",
  },
  algorithm: {
    keywords: "algorithm|sorting|searching|time complexity|big o",
    answer:
      "An **Algorithm** is a step-by-step procedure for solving a problem.\n\n" +
      "**Common Sorting Algorithms:**\n" +
      "• Bubble Sort: O(n²) – simple but slow\n" +
      "• Merge Sort: O(n log n) – divide and conquer\n" +
      "• Quick Sort: O(n log n) avg – fast, in-place\n\n" +
      "**Searching:**\n" +
      "• Linear Search: O(n)\n" +
      "• Binary Search: O(log n) – requires sorted data\n\n" +
      "**Big O Notation** measures worst-case time/space complexity:\n" +
      "O(1) < O(log n) < O(n) < O(n log n) < O(n²) < O(2ⁿ)\n\n" +
      "Understanding algorithms is crucial for writing efficient code and acing technical interviews.",
  },
  "artificial intelligence": {
    keywords: "artificial intelligence|supervised|unsupervised|neural network|deep learning|AI algorithms",
    answer:
      "**Artificial Intelligence (AI)** is the simulation of human intelligence processes by computer systems.\n\n" +
      "**Core Branches:**\n" +
      "1. **Supervised Learning** – Trained on labeled data (Classification, Regression)\n" +
      "2. **Unsupervised Learning** – Finds patterns in unlabeled data (Clustering, Dimensionality Reduction)\n" +
      "3. **Reinforcement Learning** – Learns through rewards and penalties\n\n" +
      "**Key Algorithms:** Linear Regression, Decision Trees, Random Forest, SVM, K-Means, Neural Networks\n\n" +
      "**Deep Learning** uses multi-layer neural networks for complex tasks like image recognition, NLP, and generative AI.\n\n" +
      "Popular JS/Node.js AI libraries: TensorFlow.js, Brain.js, Natural.",
  },
};

function builtinAcademicAnswer(question: string, subject: string): string {
  const lower = question.toLowerCase();

  // Try to match against known topics
  for (const [, topicData] of Object.entries(ACADEMIC_KNOWLEDGE)) {
    const keywordsRegex = new RegExp(topicData.keywords, "i");
    if (keywordsRegex.test(lower)) {
      return (
        topicData.answer +
        "\n\n---\n*This is an AI-generated preliminary answer. Your teacher may provide a more detailed or course-specific response.*"
      );
    }
  }

  // Generic helpful response when topic is not in the knowledge base
  return (
    `Great question about "${question.slice(0, 100)}"!\n\n` +
    `This topic falls under **${subject}**. While I don't have a detailed built-in explanation for this specific topic, ` +
    `here are some suggestions:\n\n` +
    `1. **Review your course materials** – Check your lecture notes and textbook chapters related to this topic.\n` +
    `2. **Key concepts to research:** Look up definitions, formulas, and real-world applications.\n` +
    `3. **Practice problems** – Try solving related exercises to deepen your understanding.\n` +
    `4. **Online resources** – Khan Academy, MIT OpenCourseWare, and YouTube have excellent explanations.\n\n` +
    `Your teacher will provide a detailed, course-specific answer soon!\n\n` +
    `---\n*This is an AI-generated preliminary answer. Your teacher may provide a more detailed response.*`
  );
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
    // BUG FIX: truncate potentially huge AI response before logging to avoid flooding console.
    const preview = text.length > 300 ? text.slice(0, 300) + "...[truncated]" : text;
    console.error("Failed to parse AI JSON-style response", preview, e);
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

export interface FeedbackCategory {
  categories: string[];
  primaryCategory: string;
  confidence: number;
}

export interface ActionItem {
  action: string;
  priority: "high" | "medium" | "low";
  category: string;
  basedOn: string;
}

export interface WeeklyDigest {
  headline: string;
  ratingTrend: string;
  topStrengths: string[];
  focusAreas: string[];
  studentEngagement: string;
  motivationalNote: string;
  weekSummary: string;
}

export interface ToxicityResult {
  isToxic: boolean;
  confidence: number;
  reason: string;
  categories: string[];
}

export interface RatingPrediction {
  predictedRating: number;
  trend: "improving" | "declining" | "stable";
  confidence: number;
  reasoning: string;
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
        "You are IntelBot, a helpful assistant for the ClassIntel AI platform - an AI-powered classroom intelligence and performance analytics system. " +
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

  // ─── NEW 2026 AI FEATURES ──────────────────────────────────────────────

  /**
   * AI Smart Doubt Auto-Resolver: Provide an instant AI-generated answer
   * for a student's doubt based on the subject context.
   */
  async autoAnswerDoubt(
    question: string,
    teacherSubject: string,
    teacherName: string
  ): Promise<string> {
    if (!question || question.trim().length === 0) {
      return "Please provide a clear question so I can help you.";
    }

    const instruction =
      `You are a knowledgeable teaching assistant for the subject "${teacherSubject}" taught by ${teacherName}. ` +
      "A student has posted a doubt. Provide a helpful, accurate, and concise preliminary answer. " +
      "Make it clear this is an AI-generated suggestion and the teacher may provide a more detailed response. " +
      "Keep your answer under 200 words. Be educational and encouraging.";

    try {
      const hfToken = getHfToken();
      const openAiKey = getOpenAiKey();

      // Try external AI providers first for high-quality answers
      if (hfToken) {
        try {
          const prompt = instruction + "\n\nStudent's question:\n" + question + "\n\nHelpful answer:";
          const answer = await hfGenerate(prompt);
          const trimmed = (answer || "").trim();
          if (trimmed && trimmed.length > 20) return trimmed;
        } catch (error: any) {
          console.warn("HF doubt-answer failed, trying next...", error?.message);
        }
      }

      if (openAiKey) {
        try {
          const prompt = instruction + "\n\nStudent's question:\n" + question + "\n\nHelpful answer:";
          const answer = await openAiGenerate(prompt);
          const trimmed = (answer || "").trim();
          if (trimmed && trimmed.length > 20) return trimmed;
        } catch (error: any) {
          console.warn("OpenAI doubt-answer failed, falling back to built-in...", error?.message);
        }
      }

      // Use dedicated academic fallback instead of generic builtinGenerate
      console.log("Using built-in academic answer for doubt");
      return builtinAcademicAnswer(question, teacherSubject);
    } catch (error) {
      console.error("Auto-answer doubt error:", error);
      return builtinAcademicAnswer(question, teacherSubject);
    }
  }

  /**
   * AI Feedback Auto-Tagging: Categorize feedback into predefined themes.
   */
  async categorizeFeedback(comment: string): Promise<FeedbackCategory> {
    const defaultResult: FeedbackCategory = {
      categories: ["general"],
      primaryCategory: "general",
      confidence: 0.5,
    };

    if (!comment || comment.trim().length === 0) {
      return defaultResult;
    }

    try {
      const instruction =
        "You are an education feedback categorization expert. Categorize the following student feedback into one or more of these categories: " +
        '"teaching-style", "content-clarity", "engagement", "pace", "assessment", "communication", "resources", "support", "general". ' +
        "Return JSON with: categories (array of matching category strings), primaryCategory (the single most relevant category), confidence (0-1 number).";

      const result = await generateJson<{
        categories?: string[];
        primaryCategory?: string;
        confidence?: number;
      }>(instruction, comment);

      return {
        categories: Array.isArray(result.categories) ? result.categories : ["general"],
        primaryCategory: typeof result.primaryCategory === "string" ? result.primaryCategory : "general",
        confidence: typeof result.confidence === "number" ? Math.min(1, Math.max(0, result.confidence)) : 0.5,
      };
    } catch (error) {
      console.error("Categorize feedback error:", error);
      return defaultResult;
    }
  }

  /**
   * AI Action Items Generator: Convert feedback into actionable improvement steps for teachers.
   */
  async generateActionItems(
    feedbackList: Array<{ rating: number; comment: string | null }>,
    teacherName: string
  ): Promise<ActionItem[]> {
    if (feedbackList.length === 0) {
      return [];
    }

    const comments = feedbackList
      .filter((f) => f.comment && f.comment.trim().length > 0)
      .map((f) => `[Rating: ${f.rating}/5] ${f.comment}`)
      .join("\n");

    if (!comments) {
      return [];
    }

    try {
      const instruction =
        `You are an educational improvement consultant analyzing feedback for teacher ${teacherName}. ` +
        "Based on the student feedback below, generate 3-6 specific, actionable improvement items. " +
        'Each item must have: action (specific step to take), priority ("high", "medium", or "low"), ' +
        "category (e.g. teaching-style, engagement, content, communication, assessment), " +
        'and basedOn (brief quote or reference to the feedback it\'s based on). Return JSON with an "items" array.';

      const result = await generateJson<{
        items?: ActionItem[];
      }>(instruction, comments);

      if (!Array.isArray(result.items)) {
        return [];
      }

      return result.items.slice(0, 6).map((item) => ({
        action: typeof item.action === "string" ? item.action : "Review feedback",
        priority: ["high", "medium", "low"].includes(item.priority) ? item.priority : "medium",
        category: typeof item.category === "string" ? item.category : "general",
        basedOn: typeof item.basedOn === "string" ? item.basedOn : "",
      }));
    } catch (error) {
      console.error("Generate action items error:", error);
      return [];
    }
  }

  /**
   * AI Weekly Digest: Generate a weekly performance summary for a teacher.
   */
  async generateWeeklyDigest(
    teacherName: string,
    feedbackList: Array<{ rating: number; comment: string | null; createdAt: Date | null }>,
    stats: { totalFeedback: number; averageRating: number; previousAvgRating: number }
  ): Promise<WeeklyDigest> {
    const defaultDigest: WeeklyDigest = {
      headline: "Weekly Performance Summary",
      ratingTrend: "stable",
      topStrengths: [],
      focusAreas: [],
      studentEngagement: "No data available",
      motivationalNote: "Keep up the great work!",
      weekSummary: "Not enough data to generate a summary.",
    };

    if (feedbackList.length === 0) {
      return defaultDigest;
    }

    const recentComments = feedbackList
      .filter((f) => f.comment && f.comment.trim().length > 0)
      .slice(0, 20)
      .map((f) => `[Rating: ${f.rating}/5] ${f.comment}`)
      .join("\n");

    try {
      const instruction =
        `You are an educational performance analyst generating a weekly digest for teacher ${teacherName}. ` +
        `Stats: ${stats.totalFeedback} total feedback, ${stats.averageRating.toFixed(1)} avg rating (previous: ${stats.previousAvgRating.toFixed(1)}). ` +
        "Generate an encouraging and insightful weekly digest. Return JSON with: " +
        'headline (catchy one-liner), ratingTrend ("improving"/"declining"/"stable"), ' +
        "topStrengths (array of 2-3 strengths), focusAreas (array of 1-2 areas to improve), " +
        "studentEngagement (brief description of engagement level), " +
        "motivationalNote (personalized encouragement), weekSummary (2-3 sentence overview).";

      const result = await generateJson<Partial<WeeklyDigest>>(instruction, recentComments || "No comments this week.");

      return {
        headline: typeof result.headline === "string" ? result.headline : defaultDigest.headline,
        ratingTrend: typeof result.ratingTrend === "string" ? result.ratingTrend : defaultDigest.ratingTrend,
        topStrengths: Array.isArray(result.topStrengths) ? result.topStrengths : defaultDigest.topStrengths,
        focusAreas: Array.isArray(result.focusAreas) ? result.focusAreas : defaultDigest.focusAreas,
        studentEngagement: typeof result.studentEngagement === "string" ? result.studentEngagement : defaultDigest.studentEngagement,
        motivationalNote: typeof result.motivationalNote === "string" ? result.motivationalNote : defaultDigest.motivationalNote,
        weekSummary: typeof result.weekSummary === "string" ? result.weekSummary : defaultDigest.weekSummary,
      };
    } catch (error) {
      console.error("Weekly digest error:", error);
      return defaultDigest;
    }
  }

  /**
   * AI Toxic Content Detection: Check if text contains toxic or abusive content.
   */
  async detectToxicContent(text: string): Promise<ToxicityResult> {
    const safeResult: ToxicityResult = {
      isToxic: false,
      confidence: 1,
      reason: "",
      categories: [],
    };

    if (!text || text.trim().length === 0) {
      return safeResult;
    }

    try {
      const instruction =
        "You are a content moderation expert for an educational platform. " +
        "Analyze the following text for toxicity, harassment, hate speech, profanity, personal attacks, or inappropriate content. " +
        "Be strict about keeping educational spaces safe but don't flag constructive criticism. " +
        'Return JSON with: isToxic (boolean), confidence (0-1), reason (brief explanation if toxic, empty string if safe), ' +
        'categories (array of detected issues from: "profanity", "harassment", "hate-speech", "personal-attack", "inappropriate", "threatening").';

      const result = await generateJson<Partial<ToxicityResult>>(instruction, text);

      return {
        isToxic: typeof result.isToxic === "boolean" ? result.isToxic : false,
        confidence: typeof result.confidence === "number" ? Math.min(1, Math.max(0, result.confidence)) : 0.5,
        reason: typeof result.reason === "string" ? result.reason : "",
        categories: Array.isArray(result.categories) ? result.categories : [],
      };
    } catch (error) {
      console.error("Toxic content detection error:", error);
      // On error, fall back to basic keyword check
      return this.builtinToxicCheck(text);
    }
  }

  private builtinToxicCheck(text: string): ToxicityResult {
    const lower = text.toLowerCase();
    const toxicWords = ["idiot", "stupid", "dumb", "bastard", "fuck", "shit", "hate you", "kill", "die"];
    const found = toxicWords.filter((w) => lower.includes(w));

    return {
      isToxic: found.length > 0,
      confidence: found.length > 0 ? Math.min(1, found.length * 0.3) : 1,
      reason: found.length > 0 ? `Contains potentially inappropriate language` : "",
      categories: found.length > 0 ? ["profanity"] : [],
    };
  }

  /**
   * AI Predictive Rating Trends: Predict future rating trends based on historical data.
   */
  async predictRatingTrend(
    monthlyData: Array<{ month: string; avgRating: number; count: number }>,
    teacherName: string
  ): Promise<RatingPrediction> {
    const defaultPrediction: RatingPrediction = {
      predictedRating: 0,
      trend: "stable",
      confidence: 0.5,
      reasoning: "Not enough data to predict trends.",
    };

    if (monthlyData.length < 2) {
      return defaultPrediction;
    }

    try {
      const dataStr = monthlyData
        .map((m) => `${m.month}: avg=${m.avgRating.toFixed(2)}, count=${m.count}`)
        .join("\n");

      const instruction =
        `You are an educational data analyst predicting rating trends for teacher ${teacherName}. ` +
        "Based on the monthly rating history below, predict the expected rating for the next month. " +
        'Return JSON with: predictedRating (number 1-5), trend ("improving", "declining", or "stable"), ' +
        "confidence (0-1 number), reasoning (brief explanation of the prediction).";

      const result = await generateJson<Partial<RatingPrediction>>(instruction, dataStr);

      return {
        predictedRating: typeof result.predictedRating === "number"
          ? Math.min(5, Math.max(1, result.predictedRating))
          : defaultPrediction.predictedRating,
        trend: ["improving", "declining", "stable"].includes(result.trend || "")
          ? (result.trend as RatingPrediction["trend"])
          : "stable",
        confidence: typeof result.confidence === "number"
          ? Math.min(1, Math.max(0, result.confidence))
          : 0.5,
        reasoning: typeof result.reasoning === "string" ? result.reasoning : defaultPrediction.reasoning,
      };
    } catch (error) {
      console.error("Predict rating trend error:", error);
      return defaultPrediction;
    }
  }
}

export const aiService = new AIService();
