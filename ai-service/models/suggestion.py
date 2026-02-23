"""
AI Suggestion Generator
Generates actionable improvement suggestions for teachers based on feedback analysis.
"""
from typing import Dict, Any, List
from models.sentiment import batch_sentiment
from models.topic_extraction import batch_topic_extraction


# Suggestion templates mapped to topics
SUGGESTION_TEMPLATES = {
    "pace": [
        {"suggestion": "Consider varying your lecture pace — slow down for complex topics and speed up for review", "priority": "high", "category": "teaching-style"},
        {"suggestion": "Add periodic 'checkpoint' moments where students can indicate if they need more time", "priority": "medium", "category": "teaching-style"},
        {"suggestion": "Provide recorded lectures so students can review at their own pace", "priority": "medium", "category": "resources"},
    ],
    "clarity": [
        {"suggestion": "Use more visual aids (diagrams, flowcharts) to explain complex concepts", "priority": "high", "category": "content"},
        {"suggestion": "Start each topic with a real-world analogy before diving into theory", "priority": "high", "category": "teaching-style"},
        {"suggestion": "Summarize key takeaways at the end of each lecture section", "priority": "medium", "category": "teaching-style"},
    ],
    "examples": [
        {"suggestion": "Include more hands-on coding examples and live demonstrations", "priority": "high", "category": "content"},
        {"suggestion": "Add case studies from industry to show real-world applications", "priority": "high", "category": "content"},
        {"suggestion": "Create practice problem sets that mirror exam-style questions", "priority": "medium", "category": "assessment"},
    ],
    "engagement": [
        {"suggestion": "Introduce interactive polls or quizzes during lectures", "priority": "high", "category": "engagement"},
        {"suggestion": "Use think-pair-share activities to boost participation", "priority": "medium", "category": "engagement"},
        {"suggestion": "Start lectures with an interesting hook or current event related to the topic", "priority": "medium", "category": "teaching-style"},
    ],
    "content": [
        {"suggestion": "Update course material with the latest industry trends and technologies", "priority": "high", "category": "content"},
        {"suggestion": "Align content more closely with the learning objectives", "priority": "medium", "category": "content"},
        {"suggestion": "Add supplementary reading lists for students who want to go deeper", "priority": "low", "category": "resources"},
    ],
    "assessment": [
        {"suggestion": "Provide clearer rubrics so students know exactly how they'll be evaluated", "priority": "high", "category": "assessment"},
        {"suggestion": "Include more formative assessments (mini-quizzes, reflections) throughout the course", "priority": "medium", "category": "assessment"},
        {"suggestion": "Offer practice exams or sample questions before major assessments", "priority": "medium", "category": "assessment"},
    ],
    "communication": [
        {"suggestion": "Set up regular office hours and respond to student queries within 24 hours", "priority": "high", "category": "communication"},
        {"suggestion": "Create an FAQ document addressing common student questions", "priority": "medium", "category": "resources"},
        {"suggestion": "Use a discussion forum or chat channel for quick student-teacher communication", "priority": "medium", "category": "communication"},
    ],
    "resources": [
        {"suggestion": "Share lecture slides and notes before each class", "priority": "high", "category": "resources"},
        {"suggestion": "Curate a list of free online resources (videos, articles) for each topic", "priority": "medium", "category": "resources"},
        {"suggestion": "Create short summary videos for key concepts", "priority": "low", "category": "resources"},
    ],
    "support": [
        {"suggestion": "Identify struggling students early and offer targeted help sessions", "priority": "high", "category": "support"},
        {"suggestion": "Create peer tutoring or study group programs", "priority": "medium", "category": "support"},
        {"suggestion": "Provide positive reinforcement and constructive feedback on assignments", "priority": "medium", "category": "support"},
    ],
    "organization": [
        {"suggestion": "Share a detailed course outline with clear milestones at the start", "priority": "high", "category": "organization"},
        {"suggestion": "Use a consistent lecture structure so students know what to expect", "priority": "medium", "category": "organization"},
        {"suggestion": "Send weekly summary emails outlining upcoming topics and deadlines", "priority": "low", "category": "organization"},
    ],
}


def generate_suggestions(
    feedback_texts: List[str],
    teacher_name: str = "Teacher",
    subject: str = "the subject",
) -> Dict[str, Any]:
    """
    Generate actionable suggestions for a teacher based on their feedback.
    
    Args:
        feedback_texts: list of feedback comment strings
        teacher_name: name of the teacher
        subject: subject being taught
    
    Returns:
        dict with prioritized suggestions, sentiment overview, and topic analysis
    """
    if not feedback_texts:
        return {
            "suggestions": [],
            "sentimentOverview": {},
            "topicAnalysis": {},
            "summary": f"No feedback available for {teacher_name} yet.",
        }

    # Run sentiment analysis
    sentiment_data = batch_sentiment(feedback_texts)
    
    # Run topic extraction
    topic_data = batch_topic_extraction(feedback_texts)

    # Generate suggestions based on detected topics
    suggestions = []
    seen = set()

    for topic_freq in topic_data["frequency"]:
        topic_key = topic_freq["topic"]
        if topic_key in SUGGESTION_TEMPLATES:
            for template in SUGGESTION_TEMPLATES[topic_key]:
                suggestion_text = template["suggestion"]
                if suggestion_text not in seen:
                    seen.add(suggestion_text)
                    suggestions.append({
                        "suggestion": suggestion_text,
                        "priority": template["priority"],
                        "category": template["category"],
                        "basedOnTopic": topic_freq["label"],
                        "topicMentions": topic_freq["count"],
                        "topicIcon": topic_freq["icon"],
                    })

    # Add general suggestions based on sentiment
    agg = sentiment_data.get("aggregate", {})
    neg_pct = agg.get("negativePercent", 0)
    pos_pct = agg.get("positivePercent", 0)

    if neg_pct > 50:
        suggestions.insert(0, {
            "suggestion": f"Critical: {neg_pct}% of feedback is negative. Consider a comprehensive teaching approach review.",
            "priority": "high",
            "category": "overall",
            "basedOnTopic": "Sentiment Analysis",
            "topicMentions": agg.get("negative", 0),
            "topicIcon": "⚠️",
        })
    
    if pos_pct > 70:
        suggestions.append({
            "suggestion": f"Great work! {pos_pct}% of feedback is positive. Keep up the excellent teaching!",
            "priority": "low",
            "category": "overall",
            "basedOnTopic": "Sentiment Analysis",
            "topicMentions": agg.get("positive", 0),
            "topicIcon": "🌟",
        })

    # Sort by priority
    priority_order = {"high": 0, "medium": 1, "low": 2}
    suggestions.sort(key=lambda s: priority_order.get(s["priority"], 1))

    # Generate summary
    top_topics = [t["label"] for t in topic_data["frequency"][:3]]
    summary_parts = [f"Analysis of {len(feedback_texts)} feedback entries for {teacher_name} ({subject})."]
    if top_topics:
        summary_parts.append(f"Most discussed areas: {', '.join(top_topics)}.")
    if neg_pct > 30:
        summary_parts.append(f"⚠️ {neg_pct}% negative sentiment detected — attention needed.")
    elif pos_pct > 60:
        summary_parts.append(f"✅ {pos_pct}% positive sentiment — strong performance.")

    return {
        "suggestions": suggestions[:15],  # Top 15
        "sentimentOverview": sentiment_data["aggregate"],
        "topicAnalysis": topic_data["frequency"],
        "summary": " ".join(summary_parts),
        "teacherName": teacher_name,
        "subject": subject,
    }
