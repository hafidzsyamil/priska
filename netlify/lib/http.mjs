/* Fetch helpers and the error type shared by the analysis pipeline. */

/* An error that maps to an HTTP response for the browser. `pesan` is shown to the user. */
export class ApiError extends Error {
  constructor(status, galat, pesan) {
    super(pesan);
    this.status = status;
    this.galat = galat;
    this.pesan = pesan;
  }
}

/* An error from an upstream service, with its HTTP status when there was one. */
export class UpstreamError extends Error {
  constructor(service, status, detail) {
    super(`${service}: ${status ? `HTTP ${status}` : 'gagal'}${detail ? ` ${detail}` : ''}`);
    this.service = service;
    this.status = status;
  }
}

/* A time budget for the whole request. Netlify stops synchronous functions at 60 s. */
export function createDeadline(totalMs) {
  const endsAt = Date.now() + totalMs;
  return {
    /* Timeout for the next call: at most `maxMs`, never past the deadline. */
    timeout(maxMs) {
      const remaining = endsAt - Date.now() - 1000;
      if (remaining <= 0) {
        throw new ApiError(504, 'waktu_habis', 'Analisis memakan waktu terlalu lama. Coba lagi beberapa saat lagi.');
      }
      return Math.min(maxMs, remaining);
    },
  };
}

export async function fetchJson(service, url, { timeoutMs, ...init }) {
  let response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new UpstreamError(service, 0, error.name === 'TimeoutError' ? 'waktu habis' : error.message);
  }
  const text = await response.text();
  if (!response.ok) throw new UpstreamError(service, response.status, text.slice(0, 300));
  try {
    return JSON.parse(text);
  } catch {
    throw new UpstreamError(service, response.status, 'respons bukan JSON');
  }
}
