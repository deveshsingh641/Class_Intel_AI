"""
Sentiment Analysis Model
Uses TextBlob + custom education-domain lexicon for accurate sentiment scoring.
"""
from textblob import TextBlob
from typing import Dict, Any
import re

# Education-domain sentiment boosters
POSITIVE_EDU_WORDS = {
    "excellent": 0.4, "amazing": 0.35, "outstanding": 0.4, "brilliant": 0.35,
    "inspiring": 0.35, "engaging": 0.3, "helpful": 0.25, "clear": 0.25,
    "wonderful": 0.3, "fantastic": 0.3, "knowledgeable": 0.25, "supportive": 0.25,
    "motivating": 0.3, "interactive": 0.25, "organized": 0.2, "prepared": 0.2,
    "passionate": 0.3, "patient": 0.25, "approachable": 0.25, "practical": 0.2,
    "thorough": 0.2, "responsive": 0.2, "innovative": 0.2, "dedicated": 0.25,
    "encourage": 0.2, "recommend": 0.2, "enjoyable": 0.25, "effective": 0.2,
    "love": 0.3, "best": 0.3, "great": 0.25, "good": 0.15,
}

NEGATIVE_EDU_WORDS = {
    "boring": -0.35, "confusing": -0.3, "unclear": -0.3, "unhelpful": -0.35,
    "disorganized": -0.3, "rushed": -0.25, "monotone": -0.3, "difficult": -0.2,
    "frustrating": -0.3, "waste": -0.35, "poor": -0.3, "terrible": -0.4,
    "awful": -0.4, "worst": -0.4, "slow": -0.2, "fast": -0.15,
    "rude": -0.35, "unprepared": -0.3, "lazy": -0.35, "unfair": -0.3,
    "biased": -0.3, "irrelevant": -0.25, "outdated": -0.25, "incompetent": -0.4,
    "intimidating": -0.25, "unapproachable": -0.3, "disappointing": -0.3,
    "hate": -0.35, "bad": -0.25, "horrible": -0.4, "never": -0.15,
}


def analyze_sentiment(text: str) -> Dict[str, Any]:
    """
    Analyze sentiment of feedback text using TextBlob + domain-specific lexicon.
    
    Returns:
        dict with sentiment label, scores, confidence, and breakdown
    """
    if not text or not text.strip():
        return {
            "sentiment": "neutral",
            "polarity": 0.0,
            "subjectivity": 0.5,
            "confidence": 0.0,
            "scores": {"positive": 0.33, "negative": 0.33, "neutral": 0.34},
            "keywords": [],
        }

    # TextBlob analysis
    blob = TextBlob(text)
    base_polarity = blob.sentiment.polarity  # -1 to 1
    subjectivity = blob.sentiment.subjectivity  # 0 to 1

    # Domain-specific adjustment
    lower = text.lower()
    domain_score = 0.0
    keywords = []

    for word, score in POSITIVE_EDU_WORDS.items():
        if re.search(rf"\b{word}\b", lower):
            domain_score += score
            keywords.append({"word": word, "impact": "positive", "weight": score})

    for word, score in NEGATIVE_EDU_WORDS.items():
        if re.search(rf"\b{word}\b", lower):
            domain_score += score
            keywords.append({"word": word, "impact": "negative", "weight": abs(score)})

    # Blend TextBlob score with domain score
    combined_polarity = (base_polarity * 0.4 + domain_score * 0.6)
    combined_polarity = max(-1.0, min(1.0, combined_polarity))

    # Compute sentiment probabilities
    if combined_polarity > 0.1:
        pos_score = min(0.95, 0.5 + combined_polarity * 0.45)
        neg_score = max(0.02, 0.3 - combined_polarity * 0.25)
        neu_score = 1.0 - pos_score - neg_score
        sentiment = "positive"
    elif combined_polarity < -0.1:
        neg_score = min(0.95, 0.5 + abs(combined_polarity) * 0.45)
        pos_score = max(0.02, 0.3 - abs(combined_polarity) * 0.25)
        neu_score = 1.0 - pos_score - neg_score
        sentiment = "negative"
    else:
        neu_score = 0.5 + (1 - abs(combined_polarity) * 10) * 0.2
        pos_score = (1 - neu_score) / 2 + combined_polarity * 0.1
        neg_score = (1 - neu_score) / 2 - combined_polarity * 0.1
        sentiment = "neutral"

    # Ensure scores sum to 1
    total = pos_score + neg_score + neu_score
    pos_score /= total
    neg_score /= total
    neu_score /= total

    confidence = max(pos_score, neg_score, neu_score)

    return {
        "sentiment": sentiment,
        "polarity": round(combined_polarity, 4),
        "subjectivity": round(subjectivity, 4),
        "confidence": round(confidence, 4),
        "scores": {
            "positive": round(pos_score, 4),
            "negative": round(neg_score, 4),
            "neutral": round(neu_score, 4),
        },
        "keywords": sorted(keywords, key=lambda k: k["weight"], reverse=True)[:8],
    }


def batch_sentiment(texts: list[str]) -> Dict[str, Any]:
    """Analyze sentiment for multiple texts and return aggregate statistics."""
    results = [analyze_sentiment(t) for t in texts if t.strip()]
    
    if not results:
        return {"results": [], "aggregate": {"positive": 0, "negative": 0, "neutral": 0, "avgPolarity": 0}}

    pos_count = sum(1 for r in results if r["sentiment"] == "positive")
    neg_count = sum(1 for r in results if r["sentiment"] == "negative")
    neu_count = sum(1 for r in results if r["sentiment"] == "neutral")
    avg_polarity = sum(r["polarity"] for r in results) / len(results)

    return {
        "results": results,
        "aggregate": {
            "total": len(results),
            "positive": pos_count,
            "negative": neg_count,
            "neutral": neu_count,
            "positivePercent": round(pos_count / len(results) * 100, 1),
            "negativePercent": round(neg_count / len(results) * 100, 1),
            "neutralPercent": round(neu_count / len(results) * 100, 1),
            "avgPolarity": round(avg_polarity, 4),
        },
    }
