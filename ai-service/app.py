"""
ClassIntel AI - Python AI Service
FastAPI microservice providing NLP and ML capabilities.

Endpoints:
  POST /analyze           - Full analysis (sentiment + topics)
  POST /sentiment         - Sentiment analysis only
  POST /sentiment/batch   - Batch sentiment analysis
  POST /topics            - Topic extraction only
  POST /topics/batch      - Batch topic extraction
  POST /risk              - Single student risk prediction
  POST /risk/class        - Entire class risk prediction
  POST /suggestions       - Generate improvement suggestions
  GET  /health            - Health check
"""
import os
import sys
from contextlib import asynccontextmanager
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Ensure project root is on path for local imports
sys.path.insert(0, os.path.dirname(__file__))

from models.sentiment import analyze_sentiment, batch_sentiment
from models.topic_extraction import extract_topics, batch_topic_extraction
from models.risk_prediction import compute_risk_score, predict_class_risk
from models.suggestion import generate_suggestions

load_dotenv()


# ───────────────────────── Lifespan ──────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: warm up TextBlob
    print("[AI] ClassIntel AI Service starting...")
    try:
        from textblob import TextBlob
        TextBlob("warmup").sentiment
        print("[AI] TextBlob ready")
    except Exception as e:
        print(f"[AI] TextBlob warmup warning: {e}")
    yield
    print("[AI] ClassIntel AI Service shutting down")


# ───────────────────────── App ───────────────────────────────

app = FastAPI(
    title="ClassIntel AI Service",
    description="NLP & ML microservice for the ClassIntel AI platform",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ───────────────────────── Request / Response Models ─────────

class FeedbackInput(BaseModel):
    feedback: str = Field(..., min_length=1, description="Feedback text to analyze")

class BatchFeedbackInput(BaseModel):
    feedbacks: List[str] = Field(..., min_length=1, description="List of feedback texts")

class StudentRiskInput(BaseModel):
    name: str = "Student"
    attendance: float = Field(75.0, ge=0, le=100)
    marks: float = Field(50.0, ge=0, le=100)
    feedback: Optional[str] = ""
    engagementScore: Optional[float] = Field(50.0, ge=0, le=100)

class ClassRiskInput(BaseModel):
    students: List[StudentRiskInput]

class SuggestionInput(BaseModel):
    feedbacks: List[str] = Field(..., min_length=1)
    teacherName: str = "Teacher"
    subject: str = "General"

class AnalyzeInput(BaseModel):
    feedback: str = Field(..., min_length=1)


# ───────────────────────── Routes ────────────────────────────

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "ClassIntel AI", "version": "2.0.0"}


@app.post("/analyze")
async def full_analysis(body: AnalyzeInput):
    """Full analysis: sentiment + topic extraction on a single feedback."""
    try:
        sentiment = analyze_sentiment(body.feedback)
        topics = extract_topics(body.feedback)
        return {
            "sentiment": sentiment["sentiment"],
            "confidence": sentiment["confidence"],
            "scores": sentiment["scores"],
            "polarity": sentiment["polarity"],
            "topics": [t["topic"] for t in topics["topics"]],
            "topicDetails": topics["topics"],
            "keywords": sentiment["keywords"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/sentiment")
async def sentiment_endpoint(body: FeedbackInput):
    """Analyze sentiment of a single feedback text."""
    try:
        return analyze_sentiment(body.feedback)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/sentiment/batch")
async def batch_sentiment_endpoint(body: BatchFeedbackInput):
    """Analyze sentiment of multiple feedback texts with aggregate stats."""
    try:
        return batch_sentiment(body.feedbacks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/topics")
async def topics_endpoint(body: FeedbackInput):
    """Extract topics from a single feedback text."""
    try:
        return extract_topics(body.feedback)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/topics/batch")
async def batch_topics_endpoint(body: BatchFeedbackInput):
    """Extract topics from multiple feedbacks and compute frequency stats."""
    try:
        return batch_topic_extraction(body.feedbacks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/risk")
async def risk_endpoint(body: StudentRiskInput):
    """Predict risk level for a single student."""
    try:
        sentiment_polarity = 0.0
        if body.feedback:
            from models.sentiment import analyze_sentiment as sa
            sentiment_polarity = sa(body.feedback)["polarity"]

        return compute_risk_score(
            attendance=body.attendance,
            marks=body.marks,
            sentiment_polarity=sentiment_polarity,
            engagement_score=body.engagementScore or 50.0,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/risk/class")
async def class_risk_endpoint(body: ClassRiskInput):
    """Predict risk levels for an entire class."""
    try:
        students = [s.model_dump() for s in body.students]
        return predict_class_risk(students)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/suggestions")
async def suggestions_endpoint(body: SuggestionInput):
    """Generate actionable improvement suggestions based on feedback analysis."""
    try:
        return generate_suggestions(
            feedback_texts=body.feedbacks,
            teacher_name=body.teacherName,
            subject=body.subject,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ───────────────────────── Run ───────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("AI_SERVICE_PORT", "8000"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)
