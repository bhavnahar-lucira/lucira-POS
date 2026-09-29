// Renders an OrnaVerse document report (invoice, e-certificate, ...) and
// returns its HTML so the POS can show it inline.
//
// /Print/Render is cookie-authenticated, same as every other Services/* call
// since the 2026-09 auth rewire — see lib/ornaverse/session.js for why this
// is now the app's one and only session mechanism, not a side channel.
//
// Request  (JSON): { reportKey, opt, reportFile, reportFolder, reportSubFolder? }
// Response: text/html on success, JSON { error } otherwise.

import { UPSTREAM } from '@/lib/ornaverse/upstream';
import {
  getSessionFromRequest,
  buildClearSessionCookieHeaders,
} from '@/lib/ornaverse/session';

/** Their login page comes back as HTML with this title when auth is refused. */
function isLoginPage(html) {
  return /<title>\s*Login to your account\s*<\/title>/i.test(html);
}

// Some report templates return a 200 OK with this literal sentence as the
// entire body instead of real HTML — a broken FastReport template on
// OrnaVerse's side, not a session or data problem.
function isReportGenerationError(html) {
  return html.trim() === 'An error occurred while generating the report';
}

async function render(session, form) {
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Cookie: session.cookie,
  };
  if (session.csrf) headers['X-CSRF-TOKEN'] = session.csrf;

  const response = await fetch(`${UPSTREAM}/Print/Render`, {
    method: 'POST',
    headers,
    body:   new URLSearchParams(form).toString(),
    cache:  'no-store',
    redirect: 'manual',
  });

  return { status: response.status, html: await response.text() };
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { reportKey, opt, reportFile, reportFolder, reportSubFolder } = payload ?? {};
  if (!reportKey || !reportFile) {
    return Response.json({ error: 'reportKey and reportFile are required.' }, { status: 400 });
  }

  const form = {
    key:             reportKey,
    opt:             typeof opt === 'string' ? opt : JSON.stringify(opt ?? {}),
    reportFile,
    reportFolder:    reportFolder ?? '',
    reportSubFolder: reportSubFolder ?? '',
  };

  const session = await getSessionFromRequest(request);

  // The password is never kept, so a missing session can't be silently
  // re-established — tell the operator to sign in again.
  if (!session) {
    return Response.json(
      { error: 'Your OrnaVerse session has expired. Sign out and back in to print invoices.' },
      { status: 401 },
    );
  }

  try {
    const result = await render(session, form);

    // A rejected cookie doesn't 401 — it renders the login page with a 200.
    // No server-side record to invalidate anymore (see session.js's
    // 2026-09-26 note) — clearing the browser's own session cookies here is
    // the equivalent: the next request has genuinely nothing to send, same
    // end state as a destroyed Mongo record used to produce.
    if (isLoginPage(result.html)) {
      const response = Response.json(
        { error: 'Your OrnaVerse print session is no longer valid. Sign out and back in to print invoices.' },
        { status: 401 },
      );
      for (const header of buildClearSessionCookieHeaders()) {
        response.headers.append('Set-Cookie', header);
      }
      return response;
    }

    if (isReportGenerationError(result.html)) {
      return Response.json(
        { error: 'This report format is currently broken on OrnaVerse’s side — try a different format, or ask OrnaVerse to fix this template.' },
        { status: 502 },
      );
    }

    if (result.status >= 400) {
      return Response.json(
        { error: `OrnaVerse could not render this report (HTTP ${result.status}).` },
        { status: 502 },
      );
    }

    // OrnaVerse's response is a bare fragment (no <html>/<head>) with inline
    // <script> tags and root-relative URLs like `/_fr/resources.getResource`.
    // Deliberately no <base> tag: that would resolve those URLs straight to
    // OrnaVerse and hit a cross-origin CORS block. Left root-relative, they
    // resolve against our own origin instead, where app/_fr/[...path]/route.js
    // proxies them through same-origin.
    //
    // The embedding iframe needs sandbox="allow-scripts allow-same-origin"
    // (see InvoiceReportButton), which would let a compromised report script
    // read this origin's localStorage and exfiltrate it. Mitigated with a CSP
    // whose connect-src 'self' blocks any request to a third-party domain
    // while still allowing the fragment's legitimate same-origin needs.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "frame-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ');
    const wrapped = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}"></head><body>${result.html}</body></html>`;

    return new Response(wrapped, {
      status:  200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[report/render]', err);
    return Response.json({ error: 'Report rendering failed.' }, { status: 502 });
  }
}
