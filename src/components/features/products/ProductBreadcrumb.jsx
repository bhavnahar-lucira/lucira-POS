'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight, ArrowLeft } from 'lucide-react';

/**
 * @param {{ product: object }} props
 * Reads from product: type_id, type_name, sub_type_id, sub_type_name,
 * item_group_id, item_group_name, item_name
 */
export default function ProductBreadcrumb({ product }) {
  const router = useRouter();

  const crumbs = [
    product?.item_group_name
      ? {
          label: product.item_group_name,
          href:  `/catalog?group=${product.item_group_id}`,
        }
      : null,
    product?.type_name
      ? {
          label: product.type_name,
          href:  `/catalog?cat=${product.type_id}${product.item_group_id ? `&group=${product.item_group_id}` : ''}`,
        }
      : null,
    product?.sub_type_name
      ? {
          label: product.sub_type_name,
          href:  `/catalog?cat=${product.type_id}&sub=${product.sub_type_id}`,
        }
      : null,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => router.back()}
        aria-label="Go back"
        className="
          flex items-center justify-center
          w-9 h-9 rounded-lg
          text-muted-foreground hover:bg-muted
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
          transition-colors shrink-0
        "
      >
        <ArrowLeft size={18} />
      </button>

      <nav aria-label="Breadcrumb" className="flex items-center gap-1 overflow-hidden">
        {crumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1 min-w-0">
            {i > 0 && (
              <ChevronRight
                size={14}
                className="text-muted-foreground/50 shrink-0"
                aria-hidden="true"
              />
            )}
            <button
              onClick={() => router.push(crumb.href)}
              className="
                text-sm text-muted-foreground hover:text-accent
                truncate max-w-[120px]
                focus-visible:outline-none focus-visible:underline
                transition-colors
              "
            >
              {crumb.label}
            </button>
          </span>
        ))}

        {/* Current product name — not tappable */}
        {crumbs.length > 0 && product?.item_name && (
          <span className="flex items-center gap-1 min-w-0">
            <ChevronRight
              size={14}
              className="text-muted-foreground/50 shrink-0"
              aria-hidden="true"
            />
            <span
              aria-current="page"
              className="text-sm font-semibold text-foreground/80 truncate max-w-[160px]"
            >
              {product.item_name}
            </span>
          </span>
        )}
      </nav>
    </div>
  );
}
