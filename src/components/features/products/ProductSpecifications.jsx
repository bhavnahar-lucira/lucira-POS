'use client';

// Card-based product specifications layout, 2 cards per row. Empty sections
// are hidden entirely. Each card's "i" button opens a BottomSheet with
// static explainer content — only "Metal" has real content so far; the
// others fall back to a placeholder until content is supplied (see
// SPEC_INFO_CONTENT below).

import { useState } from 'react';
import Image from 'next/image';
import { Info, Gem, Copy, Check } from 'lucide-react';
import { toast } from 'react-toastify';
import BottomSheet from '@/components/shared/BottomSheet';

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function val(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && v === 0) return null;
  const str = String(v).trim();
  if (str === 'NA' || str === 'N/A' || str === '0') return null;
  return str;
}

function formatWeight(value) {
  if (value === null || value === undefined) return null;
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return null;
  return `${num.toFixed(3)} g`;
}

function formatCarats(value) {
  if (value === null || value === undefined) return null;
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return null;
  return `${num.toFixed(2)} ct`;
}

function formatDimension(value) {
  if (value === null || value === undefined) return null;
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return null;
  return `${num} mm`;
}

// Gemstone ("Colour Stone" in OrnaVerse's vocabulary, item_group_id 113)
// details live one level down, on the BOM row for that component, not as a
// top-level field — filter the master/live-priced item_components list to
// this group to find it.
function getColorStoneComponents(list) {
  return (list ?? []).filter(
    (c) => c.item_group_id === 113 || c.item_group_name === 'Color Stone'
  );
}

// shape_id -> shape_name map, built from the product's own master BOM
// (never a hardcoded table) — diamond and colour-stone rows share the same
// shape vocabulary, so this resolves a friendly name for a live-priced
// colour-stone row that only carries the raw id.
function buildShapeNameMap(components) {
  const map = new Map();
  (components ?? []).forEach((c) => {
    const name = val(c.shape_name);
    if (c.shape_id && name) map.set(c.shape_id, name);
  });
  return map;
}

// `attribute` on every BOM row is "{ShapeCode}/{ColorCode}/{MetalCode}/
// {Size}/{QualityCode}" (e.g. "PR/RED/NA/4.5*4.5/NA") — used as a fallback
// when a row has no resolved _name field, since the codes are already
// human-readable without a lookup table.
function parseAttribute(attribute) {
  const parts = typeof attribute === 'string' ? attribute.split('/') : [];
  return { shapeCode: parts[0], colorCode: parts[1], sizeCode: parts[3] };
}

// Static/educational content, not per-product. Add new keys here (matching
// a SpecCard's `title`) as content is supplied.

const SPEC_INFO_CONTENT = {
  Metal: {
    sections: [
      {
        heading: 'KARAT',
        image: 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/Frame_1437257497_1_c572a805-3945-45f8-bf40-c47876e90aed.png',
        imageAlt: 'Karat options — 9KT (37.5% gold), 14KT (58.5% gold), 18KT (75% gold)',
      },
      {
        heading: 'COLOR',
        image: 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/Frame_1437257497_a6e4ef63-b2e7-4278-8c32-38b167679ebd.png',
        imageAlt: 'Metal color options — Yellow Gold, Rose Gold, White Gold',
      },
      {
        heading: 'NET WT.',
        text: 'Net Wt. indicates only the weight of Metal from the Total Weight of the jewelry.',
      },
    ],
  },
  Dimension: {
    // Side-by-side columns (Height / Width), unlike Metal's stacked sections.
    columns: [
      {
        heading: 'HEIGHT',
        image: 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/Frame_1437257497_ef0e1883-fce6-4ae5-8f5f-7d767cc4a343.png',
        imageAlt: 'Height — the vertical measurement of the jewelry from the bottom to the top of the jewelry',
      },
      {
        heading: 'WIDTH',
        image: 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/Frame_1437257497_4df01e1c-7846-4b7d-a1ae-48e44907e308.png',
        imageAlt: 'Width — the horizontal measurement across the jewelry from one side to the other',
      },
    ],
    sections: [
      {
        heading: 'GROSS WT.',
        text: 'Gross Weight indicates the total weight of the jewelry, including the metal, diamonds, gemstones, and all other components used in the piece.',
      },
    ],
  },
  Diamond: {
    sections: [
      {
        heading: 'POSITION',
        image: 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/Frame_1437257503_e5b7f116-3848-44e1-b838-e3691c85d5a2.png',
        imageAlt: 'Diamond position options — Center, Side',
      },
      {
        heading: 'QUALITY',
        image: 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/Frame_1437257505_d217c271-1e27-4513-b571-c6464e313e2b.png',
        imageAlt: 'Diamond quality options — VVS-VS, E-F',
      },
      {
        heading: 'SHAPE',
        image: 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/Frame_1437257506_6987bc69-acbf-4dfb-b2e0-df136b4f6ed5.png',
        imageAlt: 'Diamond shape options — Emerald, Oval, Cushion, Round, Princess, Pear, Marquise, Heart',
        imageHeight: 480,
      },
      {
        heading: 'QUANTITY',
        text: 'Quantity indicates the total number of Diamonds used in the jewelry.',
      },
      {
        heading: 'CARAT',
        text: 'Carat (ct) is the standard unit of measurement used to indicate the weight of Diamonds used in the jewelry.',
      },
    ],
  },
  Gemstone: {
    sections: [
      {
        heading: 'COLOR',
        image: 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/Frame_1437257506_1_8d9ce413-b8c0-4273-865c-f77702ff25bb.png',
        imageAlt: 'Gemstone Colors'
      },
      {
        heading: 'SHAPE',
        image: 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/Frame_1437257506_6987bc69-acbf-4dfb-b2e0-df136b4f6ed5.png',
        imageAlt: 'Gemstone Shapes'
      },
      {
        heading: 'QUANTITY',
        text: 'Quantity indicates the total number of Gemstones used in the jewelry.'
      },
      {
        heading: 'CARAT',
        text: 'Carat (ct) is the standard unit of measurement used to indicate the weight of Gemstones used in the jewelry.'
      }
    ]
  }
};

function SpecInfoColumn({ heading, image, imageAlt }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">
        {heading}
      </h3>
      {image ? (
        <div className="w-full overflow-hidden rounded-2xl bg-muted">
          <Image
            src={image}
            alt={imageAlt ?? heading}
            width={375}
            height={317}
            className="h-auto w-full"
            loading="lazy"
            fetchPriority="low"
          />
        </div>
      ) : (
        <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-muted">
          <span className="text-xs text-muted-foreground/70">Image coming soon</span>
        </div>
      )}
    </div>
  );
}

function SpecInfoSheetBody({ title }) {
  const content = title ? SPEC_INFO_CONTENT[title] : null;

  if (!content) {
    return (
      <p className="text-sm text-muted-foreground">
        More details about {title?.toLowerCase()} will be added here soon.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {content.columns && (
        <div className="grid grid-cols-2 gap-4">
          {content.columns.map((col) => (
            <SpecInfoColumn key={col.heading} {...col} />
          ))}
        </div>
      )}
      {content.sections?.map((section) => (
        <div key={section.heading} className="flex flex-col gap-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">
            {section.heading}
          </h3>
          {section.image && (
            <div className="overflow-hidden rounded-2xl bg-muted">
              <Image
                src={section.image}
                alt={section.imageAlt ?? section.heading}
                width={768}
                height={section.imageHeight ?? 240}
                className="h-auto w-full"
                loading="lazy"
                fetchPriority="low"
              />
            </div>
          )}
          {section.text && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {section.text}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// copyable (Item Code / SKU only, Classification card — reported directly,
// 2026-09-29) shows its own small copy icon next to the value, independent
// of any other row on the same card.
function SpecRow({ label, value, copyable }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  const handleCopy = async () => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      toast.success(`${label} copied.`);
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast.error(`Could not copy ${label.toLowerCase()}.`);
    }
  };

  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground text-right">
        {copyable && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label={`Copy ${label}`}
            className="text-muted-foreground/50 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          </button>
        )}
        {value}
      </span>
    </div>
  );
}

function SpecCard({ icon, title, rows, onOpenInfo }) {
  const hasAny = rows.some(({ value }) => Boolean(value));
  if (!hasAny) return null;

  return (
    <div className="rounded-2xl bg-muted p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon && (
            <span className="text-foreground shrink-0" aria-hidden="true">
              {icon}
            </span>
          )}
          <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">
            {title}
          </h3>
        </div>
        <button
          type="button"
          aria-label={`About ${title}`}
          onClick={() => onOpenInfo(title)}
          className="text-muted-foreground/50 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
        >
          {title !== "Classification" ? <Info size={15} aria-hidden="true" /> : ""}
        </button>
      </div>
      <div className="flex flex-col">
        {rows.map(({ label, value, copyable }) => (
          <SpecRow key={label} label={label} value={value} copyable={copyable} />
        ))}
      </div>
    </div>
  );
}

const ICON_URLS = {
  metal: 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/PDPIcons_metal.svg',
  dimension: 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/PDPIcons_dimension.svg',
  diamond: 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/PDPIcons_diamond.svg',
  classification: 'https://cdn.shopify.com/s/files/1/0739/8516/3482/files/PDPIcons_diamond.svg',
  gemstone: 'https://www.lucirajewelry.com/images/icons/gemstone.svg'
};

function SpecIcon({ src, alt }) {
  return (
    <img src={src} alt={alt} width={14} height={14} className="shrink-0" loading="lazy" />
  );
}

const MetalIcon = () => <SpecIcon src={ICON_URLS.metal} alt="Metal" />;
const DimensionIcon = () => <SpecIcon src={ICON_URLS.dimension} alt="Dimension" />;
const DiamondIcon = () => <SpecIcon src={ICON_URLS.diamond} alt="Diamond" />;
const TagIcon = () => <SpecIcon src={ICON_URLS.classification} alt="Classification" />;
const GemstoneIcon = () => <SpecIcon src={ICON_URLS.gemstone} alt="Gemstone" />;

/**
 * @param {{ product: object, pricedItem?: object|null }} props
 *   product — the master record, source for every card except the gemstone
 *   one, which prefers `pricedItem` (the live-priced SetSalesItems entity)
 *   when resolved: the master's colour-stone BOM row is only a per-design
 *   default, and the physical piece actually being sold can carry a
 *   different colour stone.
 */
export default function ProductSpecifications({ product, pricedItem = null }) {
  const [infoTitle, setInfoTitle] = useState(null);

  if (!product) return null;

  const metalPurity = val(product.karat_name)
    ?? (product.purity && product.purity !== 0 ? String(product.purity) : null);
  const metalColor  = val(product.metal_color_name);
  const metalType   = val(product.metal_name);
  const netWeight   = formatWeight(product.net_weight);

  const height        = formatDimension(product.height);
  const width         = formatDimension(product.width);
  const depth         = formatDimension(product.depth);
  const length         = formatDimension(product.length);
  const grossWeight   = formatWeight(product.weight);
  const stoneWeight   = formatWeight(product.stone_weight);
  const diamondWeight = formatWeight(product.diamond_weight);
  const pointerCt     = formatCarats(product.pointer_weight);

  const diamondPieces    = product.diamond_pieces      > 0 ? String(product.diamond_pieces)     : null;
  const diamondCarats    = formatCarats(product.diamond_weight);
  const stonePieces      = product.stone_pieces        > 0 ? String(product.stone_pieces)       : null;
  const otherPieces      = product.other_pieces        > 0 ? String(product.other_pieces)       : null;
  const otherWeight      = formatWeight(product.other_weight);

  // Gemstone card — see the JSDoc above for why pricedItem is preferred.
  const masterComponents = product.item_components ?? product.components ?? [];
  const shapeNameById     = buildShapeNameMap(masterComponents);
  const liveColorStones   = getColorStoneComponents(pricedItem?.item_components);
  const masterColorStones = getColorStoneComponents(masterComponents);
  const colorStoneRows    = liveColorStones.length ? liveColorStones : masterColorStones;

  const uniqueJoined = (values) => {
    const list = [...new Set(values.filter(Boolean))];
    return list.length ? list.join(', ') : null;
  };

  const gemstonePieces = (pricedItem?.color_stone_pieces ?? product.color_stone_pieces) > 0
    ? String(pricedItem?.color_stone_pieces ?? product.color_stone_pieces)
    : null;
  const gemstoneWeight = formatCarats(pricedItem?.color_stone_weight ?? product.color_stone_weight);
  const gemstoneType   = uniqueJoined(colorStoneRows.map((c) => val(c.type_name) ?? val(c.type_code)));
  const gemstoneName   = uniqueJoined(colorStoneRows.map((c) => val(c.sub_type_name) ?? val(c.sub_type_code)));
  const gemstoneShape  = uniqueJoined(colorStoneRows.map((c) => {
    const { shapeCode } = parseAttribute(c.attribute);
    return (c.shape_id && shapeNameById.get(c.shape_id)) || val(c.shape_name) || val(shapeCode);
  }));
  const gemstoneColor  = uniqueJoined(colorStoneRows.map((c) => {
    const { colorCode } = parseAttribute(c.attribute);
    return val(c.stone_color_name) || val(colorCode);
  }));
  const gemstoneSize   = uniqueJoined(colorStoneRows.map((c) => {
    const { sizeCode } = parseAttribute(c.attribute);
    if (val(c.sieve_name)) return `${val(c.sieve_name)} mm`;
    return sizeCode && sizeCode !== 'NA' ? `${sizeCode} mm` : null;
  }));

  const itemGroup   = val(product.item_group_name);
  const category    = val(product.type_name);
  const subCategory = val(product.sub_type_name);
  const collection  = val(product.collection_name);
  const brand       = val(product.brand_name);
  const hsn         = val(product.hsn);
  const itemCode    = val(product.item_code)
  // product.sku (the master/catalog record) is always empty — a catalog item
  // has no serialized piece attached. Only pricedItem carries a real
  // per-piece sku, once pricing has resolved an actual piece.
  const sku         = val(pricedItem?.sku) ?? val(product.sku);

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">

        <SpecCard
          icon={<MetalIcon />}
          title="Metal"
          onOpenInfo={setInfoTitle}
          rows={[
            { label: 'Purity',     value: metalPurity },
            { label: 'Color',      value: metalColor },
            { label: 'Metal Type', value: metalType },
            { label: 'Net Wt',     value: netWeight },
          ]}
        />

        <SpecCard
          icon={<DimensionIcon />}
          title="Dimension"
          onOpenInfo={setInfoTitle}
          rows={[
            { label: 'Height',       value: height },
            { label: 'Width',        value: width },
            { label: 'Length',       value: length },
            { label: 'Depth',        value: depth },
            { label: 'Gross Wt',     value: grossWeight },
            { label: 'Stone Wt',     value: stoneWeight },
            { label: 'Diamond Wt',   value: diamondWeight },
            { label: 'Diamond (ct)', value: pointerCt },
          ]}
        />

        <SpecCard
          icon={<DiamondIcon />}
          title="Diamond"
          onOpenInfo={setInfoTitle}
          rows={[
            { label: 'Quantity',     value: diamondPieces },
            { label: 'Carat',        value: diamondCarats },
            { label: 'Stone Pieces', value: stonePieces },
            { label: 'Other Pieces', value: otherPieces },
            { label: 'Other Weight', value: otherWeight },
          ]}
        />

        {/* Only ever present on a "Gemstone" design; self-hidden elsewhere
            via SpecCard's own hasAny check. */}
        <SpecCard
          icon={<GemstoneIcon />}
          title="Gemstone"
          onOpenInfo={setInfoTitle}
          rows={[
            { label: 'Type',     value: gemstoneType },
            { label: 'Stone',    value: gemstoneName },
            { label: 'Shape',    value: gemstoneShape },
            { label: 'Colour',   value: gemstoneColor },
            { label: 'Size',     value: gemstoneSize },
            { label: 'Quantity', value: gemstonePieces },
            { label: 'Weight',   value: gemstoneWeight },
          ]}
        />

        <SpecCard
          icon={<TagIcon />}
          title="Classification"
          onOpenInfo={setInfoTitle}
          rows={[
            { label: 'Item Group',   value: itemGroup },
            { label: 'Category',     value: category },
            { label: 'Sub-Category', value: subCategory },
            { label: 'Collection',   value: collection },
            { label: 'Brand',        value: brand },
            { label: 'HSN Code',     value: hsn },
            { label: 'Item Code',    value: itemCode, copyable: true },
            { label: 'SKU',          value: sku,      copyable: true },
          ]}
        />

      </div>

      <BottomSheet
        isOpen={!!infoTitle}
        onClose={() => setInfoTitle(null)}
        // BottomSheet uppercases its own title — pass the real-case string.
        title={infoTitle}
      >
        <SpecInfoSheetBody title={infoTitle} />
      </BottomSheet>
    </>
  );
}
