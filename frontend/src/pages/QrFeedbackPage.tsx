import { useEffect, useState } from "react";
import { useRoute } from "wouter";

interface ApiError {
  error?: string;
}

export default function QrFeedbackPage() {
  const [match, params] = useRoute("/qr-feedback/:teacherId");
  const teacherId = params?.teacherId || "";

  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [rating, comment]);

  if (!match || !teacherId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center px-4">
          <h1 className="text-2xl font-bold mb-2">Invalid QR link</h1>
          <p className="text-muted-foreground">This feedback link is not valid.</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) {
      setError("Please select a rating before submitting.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const res = await fetch(`/api/qr-feedback/${teacherId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rating,
          comment: comment.trim() || undefined,
        }),
        credentials: "include",
      });

      if (!res.ok) {
        const data: ApiError = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to submit feedback. Please try again.");
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err?.message || "Failed to submit feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md w-full px-4 text-center">
          <h1 className="text-2xl font-bold mb-3">Thank you!</h1>
          <p className="text-muted-foreground mb-4">
            Your quick feedback has been recorded.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full px-4 py-8">
        <h1 className="text-2xl font-bold mb-2 text-center">Quick Feedback</h1>
        <p className="text-muted-foreground mb-6 text-center text-sm">
          This is a 10-second, anonymous feedback form for this teacher. No login required.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground text-center">How was this lecture?</p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center border text-sm font-medium transition-colors ${
                    rating === star
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-input hover:bg-muted"
                  }`}
                >
                  {star}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="comment" className="text-sm font-medium text-foreground">
              Optional comment
            </label>
            <textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 300))}
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              placeholder="In one short sentence, what stood out or could be better?"
            />
            <p className="text-xs text-muted-foreground text-right">{comment.length}/300</p>
          </div>

          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Submit Feedback"}
          </button>
        </form>
      </div>
    </div>
  );
}
