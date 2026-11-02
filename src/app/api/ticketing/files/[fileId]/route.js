import { getFileBucket } from '@/lib/ticketing/server';

// Public by design: the workflow panel loads these URLs without a POS session. The 128-bit random id is the only key.
export async function GET(request, { params }) {
  const { fileId } = await params;
  if (!/^[a-f0-9]{32}$/.test(fileId)) return new Response('Not found', { status: 404 });

  try {
    const bucket = await getFileBucket();
    const [file] = await bucket.find({ _id: fileId }).limit(1).toArray();
    if (!file) return new Response('Not found', { status: 404 });

    const chunks = [];
    for await (const chunk of bucket.openDownloadStream(fileId)) chunks.push(chunk);

    return new Response(Buffer.concat(chunks), {
      headers: {
        'Content-Type': file.metadata?.contentType ?? 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('[api/ticketing/files] GET', err);
    return new Response('Failed to load file', { status: 500 });
  }
}
