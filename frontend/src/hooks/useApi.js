import { useState, useEffect, useCallback } from 'react';

const BASE = '/api';

export function useReviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch_ = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${BASE}/reviews`);
      const json = await res.json();
      setReviews(json.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);
  return { reviews, loading, error, refetch: fetch_ };
}

export function useStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE}/reviews/stats`)
      .then((r) => r.json())
      .then((j) => setStats(j.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return { stats, loading };
}

export function useReviewDetail(id) {
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`${BASE}/reviews/${id}`)
      .then((r) => r.json())
      .then((j) => setReview(j.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  return { review, loading };
}
