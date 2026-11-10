import { NextResponse } from 'next/server';

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const API_VERSION   = '2025-10';

const MEDIA_QUERY = `
  query ProductMedia($id: ID!) {
    product(id: $id) {
      handle
      variants(first: 100) { nodes { id sku } pageInfo { hasNextPage endCursor } }
      descriptionHtml
      media(first: 50) {
        edges {
          node {
            __typename
            mediaContentType
            alt
            ... on MediaImage {
              image { url altText width height }
            }
            ... on Video {
              sources { url format }
              preview { image { url } }
            }
          }
        }
      }
    }
  }
`;

const VARIANTS_PAGE_QUERY = `
  query ProductVariants($id: ID!, $after: String) {
    product(id: $id) {
      variants(first: 100, after: $after) { nodes { id sku } pageInfo { hasNextPage endCursor } }
    }
  }
`;
const MAX_VARIANT_PAGES = 5;

async function fetchRemainingVariants(url, productGid, firstPage) {
  const nodes = [...(firstPage?.nodes ?? [])];
  let pageInfo = firstPage?.pageInfo;
  for (let page = 1; pageInfo?.hasNextPage && page < MAX_VARIANT_PAGES; page++) {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: VARIANTS_PAGE_QUERY, variables: { id: productGid, after: pageInfo.endCursor } }),
      next: { revalidate: 600 },
    });
    if (!res.ok) break;
    const json = await res.json();
    const conn = json?.data?.product?.variants;
    if (!conn) break;
    nodes.push(...(conn.nodes ?? []));
    pageInfo = conn.pageInfo;
  }
  return nodes;
}

function htmlToPlainText(html) {
  if (!html) return null;
  const text = html
    .replace(/<\/(p|div|li)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, '\'')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}

export async function GET(request, { params }) {
  const { productId } = await params;

  if (!SHOPIFY_STORE || !SHOPIFY_TOKEN) {
    console.error('[Shopify] Missing SHOPIFY_STORE or SHOPIFY_ADMIN_TOKEN env vars');
    return NextResponse.json(
      { images: [], videos: [], description: null, error: 'Shopify not configured' },
      { status: 500 }
    );
  }

  if (!productId || !/^\d+$/.test(productId)) {
    return NextResponse.json(
      { images: [], videos: [], description: null, error: 'Invalid product ID' },
      { status: 400 }
    );
  }

  const url = `https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`;

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        'Content-Type':           'application/json',
      },
      body: JSON.stringify({
        query:     MEDIA_QUERY,
        variables: { id: `gid://shopify/Product/${productId}` },
      }),
      // Cache for 10 minutes — product media rarely changes mid-day
      next: { revalidate: 600 },
    });

    if (!res.ok) {
      console.error(`[Shopify] media fetch failed: ${res.status} for product ${productId}`);
      return NextResponse.json(
        { images: [], videos: [], description: null, error: `Shopify returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const product = data?.data?.product;
    const edges = product?.media?.edges ?? [];
    const description = htmlToPlainText(product?.descriptionHtml);

    if (data.errors) {
      console.error('[Shopify] media GraphQL errors:', data.errors);
      return NextResponse.json(
        { images: [], videos: [], description: null, error: 'Shopify GraphQL error' },
        { status: 502 }
      );
    }
    
    const images = [];
    const videos = [];

    edges.forEach(({ node }) => {
      if (node.__typename === 'MediaImage' && node.image?.url) {
        images.push({
          id:       node.image.url,
          src:      node.image.url,
          alt:      node.alt ?? node.image.altText ?? null,
          width:    node.image.width  ?? null,
          height:   node.image.height ?? null,
          position: images.length + 1,
        });
      } else if (node.__typename === 'Video') {
        const mp4 = node.sources?.find((s) => s.format === 'mp4') ?? node.sources?.[0] ?? null;
        if (mp4?.url) {
          videos.push({
            id:       mp4.url,
            src:      mp4.url,
            poster:   node.preview?.image?.url ?? null,
            alt:      node.alt ?? null,
            position: videos.length + 1,
          });
        }
      }
    });

    const variantNodes = await fetchRemainingVariants(url, `gid://shopify/Product/${productId}`, product?.variants)
      .catch(() => product?.variants?.nodes ?? []);
    const variants = variantNodes
      .map((v) => ({ id: String(v.id ?? '').split('/').pop(), sku: v.sku ?? null }))
      .filter((v) => v.id && v.sku);

    return NextResponse.json({ images, videos, description, handle: product?.handle ?? null, variants });

  } catch (err) {
    console.error('[Shopify] media fetch error:', err);
    return NextResponse.json(
      { images: [], videos: [], description: null, error: 'Failed to fetch media' },
      { status: 500 }
    );
  }
}
