import { UPSTREAM } from '@/lib/ornaverse/upstream';
import {
  getSessionFromRequest,
  buildClearSessionCookieHeaders,
} from '@/lib/ornaverse/session';

function isLoginPage(html) {
  return /<title>\s*Login to your account\s*<\/title>/i.test(html);
}
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
  
  if (!session) {
    return Response.json(
      { error: 'Your OrnaVerse session has expired. Sign out and back in to print invoices.' },
      { status: 401 },
    );
  }

  try {
    const result = await render(session, form);
    
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
    
    const printStyles = '<style>'
      + '@page { size: A4; margin: 0; }'
      + '@media print { .fr-toolbar { display: none !important; } }'
      + '</style>';
    const wrapped = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}">${printStyles}</head><body>${result.html}</body></html>`;

    return new Response(wrapped, {
      status:  200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[report/render]', err);
    return Response.json({ error: 'Report rendering failed.' }, { status: 502 });
  }
}
