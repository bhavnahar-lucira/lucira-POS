import { getSessionFromRequest } from "@/lib/ornaverse/session";
import { signOneviewToken } from "@/lib/oneview/token";

export async function POST(request) {
    if(!(await getSessionFromRequest(request))) {
        return Response.json({ error: 'Not Authenticated' }, { status: 401 })
    }

    let body;
    try {
        body = await request.json();
    } catch (error) {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const partyId = Number(body?.partyId);
    const mobile = typeof body?.mobile === 'string' ? body.mobile : null;
    if(!Number.isInteger(partyId) || partyId <= 0 || !mobile) {
        return Response.json({ error: 'partyId and mobile are required' }, { status: 400 })
    }

    try {
        const token = signOneviewToken({ partyId, mobile })
        return Response.json({ token })
    } catch (err) {
        console.error('[api/oneview/token] POST', err);
        return Response.json({ error: 'Failed to generate token' }, { status: 500 });
    }
}