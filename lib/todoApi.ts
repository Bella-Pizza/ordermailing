// Client for the public /todo page. Separate from apiFetch on purpose: that attaches
// a Firebase login, which the people using this page don't have.

export type Importance = 1 | 2 | 3;

export type TodoStore = { id: string; name: string };

export type TodoTask = {
  id: string;
  title: string;
  dueDate: string;
  importance: Importance;
  categoryId: string;
  categoryName: string;
  categoryHue: number;
  completedAt: string | null;
  createdAt: string;
};

export type TodoCategory = { id: string; name: string; hue: number };

export type TodoBoardData = {
  storeName: string;
  open: TodoTask[];
  completed: TodoTask[];
  categories: TodoCategory[];
};

export type TaskInput = { title: string; dueDate: string; importance: Importance; category: string };

export class TodoApiError extends Error {
  constructor(
    public status: number,
    public retryAfterSeconds?: number,
  ) {
    super(`Request failed with status ${status}`);
  }
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; token?: string; keepalive?: boolean } = {},
): Promise<T> {
  const res = await fetch(`/api/todo${path}`, {
    method: init.method ?? "GET",
    keepalive: init.keepalive,
    headers: {
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(init.token ? { "X-Todo-Token": init.token } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new TodoApiError(res.status, data?.retryAfterSeconds);
  }
  return res.json() as Promise<T>;
}

export const fetchTodoStores = () => request<TodoStore[]>("/stores");

export const verifyPin = (storeId: string, pin: string) =>
  request<{ token: string }>(`/stores/${storeId}/verify`, { method: "POST", body: { pin } });

export const fetchBoard = (storeId: string, token: string) =>
  request<TodoBoardData>(`/stores/${storeId}/board`, { token });

export const createTask = (storeId: string, token: string, input: TaskInput) =>
  request<TodoTask>(`/stores/${storeId}/tasks`, { method: "POST", token, body: input });

export const updateTask = (
  storeId: string,
  token: string,
  taskId: string,
  patch: Partial<TaskInput> & { completed?: boolean },
) => request<TodoTask>(`/stores/${storeId}/tasks/${taskId}`, { method: "PATCH", token, body: patch });

export const deleteTask = (storeId: string, token: string, taskId: string, keepalive = false) =>
  request<{ ok: true }>(`/stores/${storeId}/tasks/${taskId}`, { method: "DELETE", token, keepalive });

// ─── Remembered access ────────────────────────────────────────────────────────
// Storage can throw in private windows. The page still works then; the browser
// just asks for the PIN again next time.
const TOKENS_KEY = "todo_access_tokens";
const LAST_STORE_KEY = "todo_last_store";

function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* see above */
  }
}

export const getStoredToken = (storeId: string) => readJson<Record<string, string>>(TOKENS_KEY)?.[storeId] ?? null;

export function storeToken(storeId: string, token: string) {
  writeJson(TOKENS_KEY, { ...readJson<Record<string, string>>(TOKENS_KEY), [storeId]: token });
}

export function forgetToken(storeId: string) {
  const tokens = readJson<Record<string, string>>(TOKENS_KEY) ?? {};
  delete tokens[storeId];
  writeJson(TOKENS_KEY, tokens);
}

export const getLastStore = () => readJson<TodoStore>(LAST_STORE_KEY);
export const setLastStore = (store: TodoStore | null) => writeJson(LAST_STORE_KEY, store);

// ─── Dates ────────────────────────────────────────────────────────────────────
// Due dates are plain local calendar days, so "today" means today in the store.
export function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return isoDay(new Date(y, m - 1, d + days));
}

export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
