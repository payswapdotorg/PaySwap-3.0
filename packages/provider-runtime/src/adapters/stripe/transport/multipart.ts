/**
 * @payswap/provider-runtime — the multipart/form-data serializer (P25, the
 * audit's G5 fill: the catalogue's single multipart operation, PostFiles).
 *
 * PARAMETERS STAY JSON ON PAYSWAP'S SIDE: the `file` parameter travels as a
 * base64 string through validation, the prepared-action digest and the
 * channel — exactly like every other parameter (the digest law). ONLY at the
 * wire edge does the transport decode it into a binary part. The base64
 * payload is subject to the validator's parameter-size bound (≤100k chars ≈
 * 75 KB binary) — the honest IMPLEMENTED_WITH_LIMITS state on PostFiles;
 * larger artifacts belong to a future attachment plane.
 *
 * PURE TS: no node builtins (the boundary battery's law). The boundary is a
 * fixed reviewed constant (deterministic — byte-stable bodies for tests);
 * Stripe accepts any boundary not present in the content.
 */

/** The reviewed multipart boundary (P25). */
const MULTIPART_BOUNDARY = 'payswap-stripe-multipart-v1';

/** The name of the binary file parameter (the pinned spec's PostFiles uses
 *  exactly `file`; the law is reviewed with the pin). */
export const STRIPE_MULTIPART_FILE_PARAMETER = 'file';

/** A serialized multipart body (bytes — binary part included). */
export interface StripeMultipartBody {
  readonly body: Uint8Array<ArrayBuffer>;
  readonly contentType: string;
}

/** Is `value` a plausible base64 payload? (Structural check only — the
 *  validator has already bounded its length; whitespace is tolerated and
 *  stripped, matching MIME wrapped encodings; decode errors surface as
 *  INVALID_PARAMETERS at dispatch, never as a crash.) */
function isBase64Like(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  return /^[A-Za-z0-9+/]*={0,2}$/.test(value.replace(/\s+/g, ''));
}

/** Decode base64 to bytes (pure TS — no Buffer, no atob dependency shape). */
function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const clean = value.replace(/[^A-Za-z0-9+/]/g, '');
  let bitBuffer = 0;
  let bitCount = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const code = char.charCodeAt(0);
    let digit: number;
    if (code >= 65 && code <= 90) digit = code - 65; // A-Z
    else if (code >= 97 && code <= 122) digit = code - 97 + 26; // a-z
    else if (code >= 48 && code <= 57) digit = code - 48 + 52; // 0-9
    else if (char === '+') digit = 62;
    else if (char === '/') digit = 63;
    else continue;
    bitBuffer = (bitBuffer << 6) | digit;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((bitBuffer >> bitCount) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

/** Serialize one part's bytes with CRLF framing. */
function appendPart(out: number[], lines: string[], content: Uint8Array<ArrayBuffer>): void {
  for (const line of lines) {
    for (const char of line) out.push(char.charCodeAt(0) & 0xff);
    out.push(13, 10);
  }
  out.push(...content);
  out.push(13, 10);
}

/** Serialize validated body parameters as multipart/form-data.
 *
 * - the file parameter becomes a binary part (base64-decoded, filename
 *   `upload`, `application/octet-stream`);
 * - string parameters become plain form fields;
 * - composite parameters (objects/arrays) become JSON-encoded fields
 *   (Stripe's multipart convention for structured form values). */
export function stripeMultipartBody(
  params: Readonly<Record<string, unknown>>,
): StripeMultipartBody {
  const out: number[] = [];
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (name === STRIPE_MULTIPART_FILE_PARAMETER) {
      if (!isBase64Like(value)) {
        throw new Error(
          `multipart file parameter '${name}' must be a non-empty base64 string (the digest-bound parameter law)`,
        );
      }
      appendPart(
        out,
        [
          `--${MULTIPART_BOUNDARY}`,
          `Content-Disposition: form-data; name="${name}"; filename="upload"`,
          'Content-Type: application/octet-stream',
          '',
        ],
        decodeBase64(value),
      );
      continue;
    }
    const field =
      typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
    appendPart(
      out,
      [
        `--${MULTIPART_BOUNDARY}`,
        `Content-Disposition: form-data; name="${name}"`,
        '',
        field,
      ],
      new Uint8Array(0),
    );
  }
  const closing = `--${MULTIPART_BOUNDARY}--`;
  for (const char of closing) out.push(char.charCodeAt(0) & 0xff);
  out.push(13, 10);
  return {
    body: new Uint8Array(out),
    contentType: `multipart/form-data; boundary=${MULTIPART_BOUNDARY}`,
  };
}
