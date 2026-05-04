export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: BodyInit | object | null;
};

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

function buildUrl(path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function getAuthToken(): string | null {
  return localStorage.getItem('devpulse_token');
}

function handleUnauthorized(): void {
  localStorage.clear();
  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

async function getErrorMessage(response: Response): Promise<string> {
  const fallback = response.statusText || 'Request failed';
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body = await response.json().catch(() => null) as {
      error?: string;
      message?: string;
      detail?: string;
      title?: string;
    } | null;

    return body?.error ?? body?.message ?? body?.detail ?? body?.title ?? fallback;
  }

  const text = await response.text().catch(() => '');
  return text || fallback;
}

function isJsonBody(body: ApiRequestOptions['body']): body is object {
  return Boolean(
    body &&
      typeof body === 'object' &&
      !(body instanceof FormData) &&
      !(body instanceof Blob) &&
      !(body instanceof ArrayBuffer) &&
      !(body instanceof URLSearchParams),
  );
}

export async function apiClient<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getAuthToken();
  let body = options.body as BodyInit | null | undefined;

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (isJsonBody(options.body)) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }

  const response = await fetch(buildUrl(path), {
    ...options,
    headers,
    body,
  });

  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized();
    }
    throw new ApiError(response.status, await getErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
