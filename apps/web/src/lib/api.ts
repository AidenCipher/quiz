export interface Me {
  user: { id: string; name: string; email: string | null; picture: string | null } | null;
  devLogin: boolean;
  google: boolean;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error((body as { error?: string }).error ?? res.statusText), {
      status: res.status,
      body,
    });
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  me: () => req<Me>('/api/me'),
  devLogin: (name: string) => req('/api/auth/dev', { method: 'POST', body: JSON.stringify({ name }) }),
  logout: () => req('/api/auth/logout', { method: 'POST' }),
  quizzes: () => req<{ id: string; title: string; updatedAt: number; questionCount: number }[]>('/api/quizzes'),
  quiz: (id: string) => req<QuizDoc>(`/api/quizzes/${id}`),
  createQuiz: (body: unknown) => req<{ id: string }>('/api/quizzes', { method: 'POST', body: JSON.stringify(body) }),
  saveQuiz: (id: string, body: unknown) =>
    req<{ ok: true; updatedAt: number }>(`/api/quizzes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteQuiz: (id: string) => req(`/api/quizzes/${id}`, { method: 'DELETE' }),
  hostQuiz: (id: string) => req<{ pin: string }>(`/api/quizzes/${id}/host`, { method: 'POST' }),
  ticket: (pin: string, role: 'host' | 'screen') =>
    req<{ ticket: string }>(`/api/games/${pin}/ticket?role=${role}`, { method: 'POST' }),
  results: () =>
    req<{ id: string; pin: string; endedAt: number; title: string | null; players: number }[]>('/api/results'),
  result: (id: string) => req<import('@quiz/shared').ResultsPayload>(`/api/results/${id}`),
  gameInfo: (pin: string) =>
    req<{ exists: boolean; phase?: string; locked?: boolean; title?: string }>(`/api/games/${pin}`),
};

export interface QuizDoc {
  id: string;
  title: string;
  settings: import('@quiz/shared').GameSettings;
  questions: import('@quiz/shared').Question[];
  updatedAt: number;
}

export function logClientError(err: unknown): void {
  try {
    navigator.sendBeacon?.('/api/log', JSON.stringify({ msg: String(err), url: location.pathname }));
  } catch {
    /* best effort */
  }
}
