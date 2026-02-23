"""
Topic Extraction Model
Uses TF-IDF + domain-specific keyword mapping to extract education-relevant topics.
"""
import re
from collections import Counter
from typing import Dict, Any, List

from utils.preprocess import tokenize, extract_ngrams


# Education-domain topic clusters
TOPIC_CLUSTERS = {
    "pace": {
        "keywords": ["fast", "slow", "pace", "speed", "rushed", "quick", "hurry", "hurried",
                      "too fast", "too slow", "pacing", "time management"],
        "label": "Teaching Pace",
        "icon": "⏱️",
    },
    "clarity": {
        "keywords": ["clear", "unclear", "confusing", "confused", "understand", "explain",
                      "explanation", "clarity", "understandable", "hard to follow", "vague",
                      "ambiguous", "straightforward"],
        "label": "Clarity & Explanation",
        "icon": "💡",
    },
    "examples": {
        "keywords": ["example", "examples", "practical", "practice", "real world", "hands on",
                      "demo", "demonstration", "application", "applied", "case study",
                      "real life", "scenario"],
        "label": "Practical Examples",
        "icon": "📝",
    },
    "engagement": {
        "keywords": ["boring", "engaging", "interesting", "interactive", "participation",
                      "involve", "involved", "monotone", "dull", "exciting", "fun",
                      "enthusiasm", "passionate", "energy", "dynamic", "lively"],
        "label": "Student Engagement",
        "icon": "🎯",
    },
    "content": {
        "keywords": ["content", "material", "syllabus", "curriculum", "topic", "depth",
                      "coverage", "relevant", "irrelevant", "outdated", "comprehensive",
                      "thorough", "surface level", "detailed"],
        "label": "Course Content",
        "icon": "📚",
    },
    "assessment": {
        "keywords": ["exam", "test", "quiz", "assignment", "grading", "marks", "grade",
                      "evaluation", "fair", "unfair", "difficult", "easy", "hard",
                      "homework", "project", "rubric"],
        "label": "Assessment & Grading",
        "icon": "📊",
    },
    "communication": {
        "keywords": ["communicate", "communication", "respond", "response", "email",
                      "available", "availability", "approachable", "feedback", "listen",
                      "accessible", "office hours", "doubt", "question", "answer"],
        "label": "Communication",
        "icon": "💬",
    },
    "resources": {
        "keywords": ["resource", "resources", "material", "slides", "notes", "textbook",
                      "reference", "video", "recording", "online", "pdf", "handout",
                      "study material"],
        "label": "Learning Resources",
        "icon": "📖",
    },
    "support": {
        "keywords": ["help", "support", "guidance", "mentor", "mentoring", "encourage",
                      "encouraging", "patient", "caring", "understanding", "helpful",
                      "supportive", "motivate", "motivation"],
        "label": "Student Support",
        "icon": "🤝",
    },
    "organization": {
        "keywords": ["organized", "disorganized", "structure", "plan", "planning",
                      "prepared", "unprepared", "schedule", "systematic", "chaotic",
                      "well structured", "structured"],
        "label": "Organization & Preparation",
        "icon": "📋",
    },
}


def extract_topics(text: str) -> Dict[str, Any]:
    """
    Extract education-relevant topics from a single feedback text.
    
    Returns:
        dict with matched topics, their confidence scores, and raw tokens
    """
    if not text or not text.strip():
        return {"topics": [], "tokens": [], "topicCount": 0}

    lower = text.lower()
    tokens = tokenize(text)
    bigrams = extract_ngrams(text, 2)
    all_terms = tokens + bigrams

    matched_topics = []

    for topic_key, topic_data in TOPIC_CLUSTERS.items():
        score = 0
        matched_keywords = []

        for kw in topic_data["keywords"]:
            if " " in kw:
                # multi-word keyword
                if kw in lower:
                    score += 2
                    matched_keywords.append(kw)
            else:
                pattern = rf"\b{re.escape(kw)}\b"
                if re.search(pattern, lower):
                    score += 1
                    matched_keywords.append(kw)

        if score > 0:
            confidence = min(1.0, score / 3)
            matched_topics.append({
                "topic": topic_key,
                "label": topic_data["label"],
                "icon": topic_data["icon"],
                "confidence": round(confidence, 2),
                "matchedKeywords": matched_keywords,
                "score": score,
            })

    # Sort by score descending
    matched_topics.sort(key=lambda t: t["score"], reverse=True)

    return {
        "topics": matched_topics,
        "tokens": tokens[:20],
        "topicCount": len(matched_topics),
    }


def batch_topic_extraction(texts: List[str]) -> Dict[str, Any]:
    """
    Extract topics from multiple feedback texts and compute frequency stats.
    """
    all_topics: Counter = Counter()
    topic_details: Dict[str, Dict] = {}
    per_feedback = []

    for text in texts:
        if not text.strip():
            continue
        result = extract_topics(text)
        per_feedback.append(result)

        for topic in result["topics"]:
            key = topic["topic"]
            all_topics[key] += 1
            if key not in topic_details:
                topic_details[key] = {
                    "label": topic["label"],
                    "icon": topic["icon"],
                    "totalMentions": 0,
                    "avgConfidence": 0,
                    "confidenceSum": 0,
                }
            topic_details[key]["totalMentions"] += 1
            topic_details[key]["confidenceSum"] += topic["confidence"]

    # Build frequency chart data
    frequency = []
    for topic_key, count in all_topics.most_common():
        detail = topic_details[topic_key]
        avg_conf = detail["confidenceSum"] / detail["totalMentions"]
        frequency.append({
            "topic": topic_key,
            "label": detail["label"],
            "icon": detail["icon"],
            "count": count,
            "percentage": round(count / len(texts) * 100, 1) if texts else 0,
            "avgConfidence": round(avg_conf, 2),
        })

    # Top weak areas (most mentioned topics, which are likely complaint areas)
    weak_areas = [f["label"] for f in frequency[:5]]

    return {
        "frequency": frequency,
        "weakAreas": weak_areas,
        "totalFeedback": len(texts),
        "topicsDetected": len(frequency),
        "perFeedback": per_feedback[:50],  # limit to avoid huge payloads
    }
