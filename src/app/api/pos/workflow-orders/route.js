// src/app/api/pos/workflow-orders/route.js
import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { getWorkflowOrders } from '@/lib/workflow/workflowOrdersClient';
import { getWorkflowStoreCodes, effectiveStoreCodes } from '@/lib/workflow/access';

export const dynamic = 'force-dynamic';

const EXPECTED_API_KEY = process.env.WORKFLOW_ORDERS_API_KEY;
const ALLOWED_ORIGINS = (process.env.WORKFLOW_ORDERS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

function getCorsHeaders(origin = '') {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
    Vary: 'Origin',
  };
}

/**
 * Who is asking: an outside system with the API key (every store), or a POS login (limited to its own
 * store unless it is a super admin). Returns null when neither.
 */
async function authenticateRequest(request) {
  const apiKeyHeader = request.headers.get('x-api-key');
  const authHeader = request.headers.get('authorization') || '';
  const [scheme, token] = authHeader.split(' ');
  if (EXPECTED_API_KEY && (apiKeyHeader === EXPECTED_API_KEY || (scheme?.toLowerCase() === 'bearer' && token === EXPECTED_API_KEY))) {
    return { allowedCodes: null };
  }

  const session = await getSessionFromRequest(request);
  if (!session) return null;
  return { allowedCodes: await getWorkflowStoreCodes(session) };
}

export async function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request.headers.get('origin') || ''),
  });
}

export async function GET(request) {
  const origin = request.headers.get('origin') || '';
  let auth;
  try {
    auth = await authenticateRequest(request);
  } catch (err) {
    console.error('[api/pos/workflow-orders] store access check failed', err);
    return Response.json({ success: false, error: 'Could not verify store access.' }, { status: 502, headers: getCorsHeaders(origin) });
  }
  if (!auth) {
    return Response.json(
      {
        success: false,
        error: 'Unauthorized: Invalid or missing API key.',
      },
      {
        status: 401,
        headers: getCorsHeaders(origin),
      }
    );
  }

  try {
    const { searchParams } = new URL(request.url);

    const params = {
      search: searchParams.get('search') || searchParams.get('query') || '',
      query: searchParams.get('query') || '',
      order_number: searchParams.get('order_number') || '',
      po_number: searchParams.get('po_number') || '',
      document_no: searchParams.get('document_no') || '',
      step: searchParams.get('step') || 'all',
      status: searchParams.get('status') || '',
      from_date: searchParams.get('from_date') || '',
      to_date: searchParams.get('to_date') || '',
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 50,
      offset: searchParams.get('offset') ? Number(searchParams.get('offset')) : 0,
    };
    const storeCodes = effectiveStoreCodes(auth.allowedCodes, searchParams.get('store'));
    if (storeCodes) params.store_codes = storeCodes;

    const result = await getWorkflowOrders(params);

    return Response.json(result, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(origin),
      },
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message || 'Internal Server Error while querying workflow orders.',
      },
      {
        status: 500,
        headers: getCorsHeaders(origin),
      }
    );
  }
}

// Strictly Read-Only handlers: return 405 Method Not Allowed
export async function POST() {
  return Response.json(
    { success: false, error: 'Method Not Allowed. Workflow Orders API is strictly read-only.' },
    { status: 405, headers: getCorsHeaders() }
  );
}

export async function PUT() {
  return Response.json(
    { success: false, error: 'Method Not Allowed. Workflow Orders API is strictly read-only.' },
    { status: 405, headers: getCorsHeaders() }
  );
}

export async function DELETE() {
  return Response.json(
    { success: false, error: 'Method Not Allowed. Workflow Orders API is strictly read-only.' },
    { status: 405, headers: getCorsHeaders() }
  );
}

export async function PATCH() {
  return Response.json(
    { success: false, error: 'Method Not Allowed. Workflow Orders API is strictly read-only.' },
    { status: 405, headers: getCorsHeaders() }
  );
}

