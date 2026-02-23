"""
Risk Prediction Model
Predicts student performance risk based on attendance, marks, and feedback sentiment.
Uses a weighted scoring model with configurable thresholds.
"""
from typing import Dict, Any, List, Optional
from models.sentiment import analyze_sentiment


# Risk thresholds
HIGH_RISK_THRESHOLD = 40
MEDIUM_RISK_THRESHOLD = 65

# Component weights
WEIGHTS = {
    "attendance": 0.30,
    "marks": 0.35,
    "sentiment": 0.20,
    "engagement": 0.15,
}


def compute_risk_score(
    attendance: float,
    marks: float,
    sentiment_polarity: float = 0.0,
    engagement_score: float = 50.0,
) -> Dict[str, Any]:
    """
    Compute risk score for a student.
    
    Args:
        attendance: 0-100 percentage
        marks: 0-100 percentage
        sentiment_polarity: -1 to 1 (from sentiment analysis of their feedback)
        engagement_score: 0-100 (based on feedback count, doubt participation, etc.)
    
    Returns:
        dict with risk level, score, component breakdown, and recommendations
    """
    # Normalize sentiment from [-1, 1] to [0, 100]
    sentiment_normalized = (sentiment_polarity + 1) * 50

    # Weighted composite score (0-100, higher = safer)
    composite = (
        attendance * WEIGHTS["attendance"]
        + marks * WEIGHTS["marks"]
        + sentiment_normalized * WEIGHTS["sentiment"]
        + engagement_score * WEIGHTS["engagement"]
    )
    composite = max(0, min(100, composite))

    # Determine risk level
    if composite < HIGH_RISK_THRESHOLD:
        risk_level = "high"
        risk_color = "#ef4444"
    elif composite < MEDIUM_RISK_THRESHOLD:
        risk_level = "medium"
        risk_color = "#f59e0b"
    else:
        risk_level = "low"
        risk_color = "#22c55e"

    # Generate factors
    factors = []
    if attendance < 60:
        factors.append({"factor": "Low attendance", "severity": "high", "value": f"{attendance:.0f}%"})
    elif attendance < 75:
        factors.append({"factor": "Below-average attendance", "severity": "medium", "value": f"{attendance:.0f}%"})

    if marks < 40:
        factors.append({"factor": "Failing marks", "severity": "high", "value": f"{marks:.0f}%"})
    elif marks < 60:
        factors.append({"factor": "Below-average marks", "severity": "medium", "value": f"{marks:.0f}%"})

    if sentiment_polarity < -0.3:
        factors.append({"factor": "Negative feedback sentiment", "severity": "medium", "value": f"{sentiment_polarity:.2f}"})

    if engagement_score < 30:
        factors.append({"factor": "Low engagement", "severity": "medium", "value": f"{engagement_score:.0f}/100"})

    # Recommendations
    recommendations = []
    if attendance < 75:
        recommendations.append("Schedule a meeting to discuss attendance improvement")
    if marks < 60:
        recommendations.append("Provide additional study resources and tutoring")
    if sentiment_polarity < -0.2:
        recommendations.append("Address student concerns from negative feedback")
    if engagement_score < 40:
        recommendations.append("Encourage participation through interactive activities")
    if not recommendations:
        recommendations.append("Continue monitoring — student is performing well")

    return {
        "riskLevel": risk_level,
        "riskScore": round(100 - composite, 1),  # invert: higher = more risk
        "safetyScore": round(composite, 1),
        "riskColor": risk_color,
        "components": {
            "attendance": {"value": round(attendance, 1), "weight": WEIGHTS["attendance"], "contribution": round(attendance * WEIGHTS["attendance"], 1)},
            "marks": {"value": round(marks, 1), "weight": WEIGHTS["marks"], "contribution": round(marks * WEIGHTS["marks"], 1)},
            "sentiment": {"value": round(sentiment_normalized, 1), "weight": WEIGHTS["sentiment"], "contribution": round(sentiment_normalized * WEIGHTS["sentiment"], 1)},
            "engagement": {"value": round(engagement_score, 1), "weight": WEIGHTS["engagement"], "contribution": round(engagement_score * WEIGHTS["engagement"], 1)},
        },
        "factors": factors,
        "recommendations": recommendations,
    }


def predict_class_risk(students: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Predict risk for an entire class of students.
    
    Args:
        students: list of dicts with {name, attendance, marks, feedback?, engagementScore?}
    
    Returns:
        dict with per-student risk and class-level summary
    """
    results = []
    high_risk = 0
    medium_risk = 0
    low_risk = 0

    for student in students:
        name = student.get("name", "Unknown")
        attendance = float(student.get("attendance", 75))
        marks = float(student.get("marks", 50))
        feedback_text = student.get("feedback", "")
        engagement = float(student.get("engagementScore", 50))

        # Analyze sentiment if feedback provided
        sentiment_polarity = 0.0
        if feedback_text:
            sentiment_result = analyze_sentiment(feedback_text)
            sentiment_polarity = sentiment_result["polarity"]

        risk = compute_risk_score(attendance, marks, sentiment_polarity, engagement)
        risk["studentName"] = name
        risk["studentId"] = student.get("studentId", student.get("id", ""))

        if risk["riskLevel"] == "high":
            high_risk += 1
        elif risk["riskLevel"] == "medium":
            medium_risk += 1
        else:
            low_risk += 1

        results.append(risk)

    # Sort by risk score descending (highest risk first)
    results.sort(key=lambda r: r["riskScore"], reverse=True)

    total = len(results)
    return {
        "students": results,
        "summary": {
            "total": total,
            "highRisk": high_risk,
            "mediumRisk": medium_risk,
            "lowRisk": low_risk,
            "highRiskPercent": round(high_risk / total * 100, 1) if total else 0,
            "mediumRiskPercent": round(medium_risk / total * 100, 1) if total else 0,
            "lowRiskPercent": round(low_risk / total * 100, 1) if total else 0,
            "avgRiskScore": round(sum(r["riskScore"] for r in results) / total, 1) if total else 0,
        },
    }
