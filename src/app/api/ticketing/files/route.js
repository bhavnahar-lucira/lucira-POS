import { getSessionFromRequest } from '@/lib/ornaverse/session';
import { getFileBucket, newFileId, fileUrl } from '@/lib/ticketing/server';
import { TICKET_FILE_TYPES, TICKET_FILE_MAX_BYTES } from '@/lib/ticketing/constants';

const MAGIC = {
  'image/jpeg':      [0xff, 0xd8, 0xff],
  'image/png':       [0x89, 0x50, 0x4e, 0x47],
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
};

export async function POST(request) {
  const session = await getSessionFromRequest(request);
  if (!session) return Response.json({ error: 'Not authenticated' }, { status: 401 });

  let file;
  try {
    file = (await request.formData()).get('file');
  } catch {
    return Response.json({ error: 'Expected multipart form data' }, { status: 400 });
  }
  if (!file || typeof file === 'string') return Response.json({ error: 'file is required' }, { status: 400 });
  if (!TICKET_FILE_TYPES.includes(file.type)) {
    return Response.json({ error: 'Only JPG, PNG or PDF files are allowed' }, { status: 400 });
  }
  if (file.size > TICKET_FILE_MAX_BYTES) {
    return Response.json({ error: 'File is larger than 4 MB' }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!MAGIC[file.type].every((b, i) => bytes[i] === b)) {
    return Response.json({ error: 'File content does not match its type' }, { status: 400 });
  }

  const fileId = newFileId();
  const fileName = String(file.name || 'file').slice(0, 200);
  try {
    const bucket = await getFileBucket();
    await new Promise((resolve, reject) => {
      bucket.openUploadStreamWithId(fileId, fileName, {
        metadata: {
          contentType: file.type,
          env: session.env,
          uploaded_by: session.username,
          store_id: session.companyId ?? null,
          ticket_number: null,
        },
      }).on('finish', resolve).on('error', reject).end(bytes);
    });
  } catch (err) {
    console.error('[api/ticketing/files] POST', err);
    return Response.json({ error: 'Failed to store file' }, { status: 500 });
  }

  return Response.json({ id: fileId, url: fileUrl(request, fileId), file_name: fileName, type: file.type });
}
