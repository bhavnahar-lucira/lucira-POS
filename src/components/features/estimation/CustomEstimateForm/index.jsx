'use client';

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';
import { Plus, X, PauseCircle, History, Share2 } from 'lucide-react';

import { useCustomEstimateItems, useItemSizesByType, useStoneTypeDetails } from '@/hooks/estimation/useCustomEstimate';
import { useItemGroups } from '@/hooks/catalog/useCategoryFilters';
import { useAttributeOptions, useKaratOptions } from '@/hooks/catalog/useCatalogFilterOptions';
import { calculateItemRates } from '@/services/pricingService';
import {
  getStoneRate, getLabourRate, applyLabourToLine, getMetalRateForItem, createEstimationTempVoucher,
} from '@/services/customEstimateService';
import { createOrder, postOrder } from '@/services/orderService';
import { useOrderHeaderConfig } from '@/hooks/checkout/useOrderHeaderConfig';
import { buildTransactionHeaderFields } from '@/services/transactionHeaderService';
import { listHeldEstimates, holdEstimate, removeHeldEstimate } from '@/lib/estimation/heldEstimates';
import { isMaskedValue } from '@/lib/normalizers/customer';
import SalesPersonSelect from '@/components/features/checkout/SalesPersonSelect';
import CustomerAttachedBanner from '@/components/shared/CustomerAttachedBanner';
import InlineLoader from '@/components/shared/InlineLoader';
import InvoiceReportButton from '@/components/features/checkout/InvoiceReportButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import { selectCartCustomerId, selectCartCustomerName, selectCartCustomerMobile } from '@/store/slices/cartSlice';
import { selectAuthUser } from '@/store/slices/authSlice';
import APP_CONFIG from '@/constants/appConfig';
import { formatAmountOrDash as formatINR } from '@/lib/priceUtils';

function getErrorMessage(error) {
  return (
    error?.response?.data?.Message ??
    error?.response?.data?.message ??
    error?.message ??
    'Something went wrong.'
  );
}

function FormField({ label, required, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label} {required && <span className="text-destructive">*</span>}</Label>
      {children}
    </div>
  );
}

function PickerSelect({ value, onChange, placeholder, options, getValue, getLabel, disabled }) {
  return (
    <Select value={value != null && value !== '' ? String(value) : ''} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-10 w-full text-sm">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-64 overflow-y-auto">
        {options.map((o) => (
          <SelectItem key={getValue(o)} value={String(getValue(o))}>{getLabel(o)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Section({ title, children }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 flex flex-col gap-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
      {children}
    </div>
  );
}

const STONE_COSTING_DEFAULTS = {
  112: { baseItemId: 13, salesCostingId: 10, purchaseCostingId: 10 },
};

function emptyStoneDraft() {
  return { itemGroupId: '', shapeId: '', stoneColorId: '', qualityId: '', typeId: '', pieces: 1, weight: '' };
}

export default function CustomEstimateForm({ onDone }) {
  const storeId        = useSelector(selectActiveStoreId);
  const customerId     = useSelector(selectCartCustomerId);
  const customerName   = useSelector(selectCartCustomerName);
  const customerMobile = useSelector(selectCartCustomerMobile);
  const authUser       = useSelector(selectAuthUser);
  const headerConfig   = useOrderHeaderConfig(APP_CONFIG.DOCUMENT_TYPES.POS_ORDER);

  const { items: customEstimateItems, isLoading: itemsLoading } = useCustomEstimateItems();
  const { data: itemGroupsRaw } = useItemGroups();
  const stoneItemGroups = (itemGroupsRaw ?? []).filter(
    (g) => g.base_item_id === APP_CONFIG.CUSTOM_ESTIMATE_STONE_BASE_ITEM_ID
  );
  const { options: shapeOptions }   = useAttributeOptions(APP_CONFIG.ATTRIBUTE_TYPES.DIAMOND_SHAPE);
  const { options: colorOptions }   = useAttributeOptions(APP_CONFIG.ATTRIBUTE_TYPES.STONE_COLOR);
  const { options: qualityOptions } = useAttributeOptions(APP_CONFIG.ATTRIBUTE_TYPES.STONE_QUALITY);
  const { options: karatOptions }      = useKaratOptions();
  const { options: metalColorOptions } = useAttributeOptions(APP_CONFIG.ATTRIBUTE_TYPES.METAL_COLOR);

  const [selectedItem, setSelectedItem] = useState(null);
  const [sizeId, setSizeId]             = useState('');
  const [weight, setWeight]             = useState('');
  const [baseRow, setBaseRow]           = useState(null);
  const [taxTemplate, setTaxTemplate]   = useState(null);
  const [isPricingItem, setIsPricingItem] = useState(false);
  const { sizes } = useItemSizesByType(selectedItem?.type_id);

  const [stoneDraft, setStoneDraft]   = useState(emptyStoneDraft());
  const [stones, setStones]           = useState([]);
  const [isAddingStone, setIsAddingStone] = useState(false);
  const { types: stoneTypeOptions } = useStoneTypeDetails(stoneDraft.itemGroupId ? Number(stoneDraft.itemGroupId) : null);

  const [labourProposal, setLabourProposal] = useState(null);
  const [appliedLabour, setAppliedLabour]   = useState(null);
  const [isLabourBusy, setIsLabourBusy]     = useState(false);

  const [salesPersonId, setSalesPersonId] = useState('');
  const [isSubmitting, setIsSubmitting]   = useState(false);

  const [isHoldOpen, setIsHoldOpen]       = useState(false);
  const [holdReason, setHoldReason]       = useState('');
  const [isRetrieveOpen, setIsRetrieveOpen] = useState(false);
  const [heldList, setHeldList]           = useState([]);

  const [isShareOpen, setIsShareOpen]   = useState(false);
  const [shareMobile, setShareMobile]   = useState('');
  const [shareEmail, setShareEmail]     = useState('');

  const handleSelectItem = async (itemIdStr) => {
    const item = customEstimateItems.find((i) => i.item_id === Number(itemIdStr));
    if (!item) return;
    setSelectedItem(item);
    setSizeId(item.item_size_id ?? '');
    setWeight(item.weight ?? '');
    setStones([]);
    setLabourProposal(null);
    setAppliedLabour(null);
    setBaseRow(null);
    setTaxTemplate(null);
    setIsPricingItem(true);
    try {
      const [priced] = await calculateItemRates([item], APP_CONFIG.DOCUMENT_TYPES.POS_ORDER);
      if (!priced) throw new Error('Could not price this item.');
      setBaseRow(priced);
      setTaxTemplate(priced.item_taxes ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err));
      setSelectedItem(null);
    } finally {
      setIsPricingItem(false);
    }
  };
  
  const metalComponent = baseRow?.item_components?.[0] ?? null;
  const purity    = metalComponent?.purity ?? 0;
  const metalRate = metalComponent?.rate ?? 0;
  const weightNum = Number(weight) || 0;
  const pureWeight  = +(weightNum * purity).toFixed(3);
  const metalAmount = +(pureWeight * metalRate).toFixed(2);

  // Karat change re-fetches Rate (GetMetalRate) — Purity comes from the
  // Karat option's own std_purity, no network call needed for it. Color
  // change needs no call at all: confirmed live, it never affects
  // purity/rate (see getMetalRateForItem's header for both findings).
  const patchMetalComponent = (patch) => setBaseRow((prev) => ({
    ...prev,
    item_components: [{ ...prev.item_components[0], ...patch }, ...prev.item_components.slice(1)],
  }));

  const handleKaratChange = async (valueStr) => {
    const karatId = Number(valueStr);
    const karatOpt = karatOptions.find((o) => o.value === karatId);
    if (!karatOpt || !metalComponent) return;
    setIsPricingItem(true);
    try {
      const { rate } = await getMetalRateForItem({
        baseItemId:        metalComponent.base_item_id,
        typeId:            metalComponent.type_id,
        subTypeId:         metalComponent.sub_type_id,
        karatId,
        metalId:           metalComponent.metal_id,
        itemGroupId:       metalComponent.item_group_id,
        salesCostingId:    metalComponent.sales_costing_id,
        purchaseCostingId: metalComponent.purchase_costing_id,
      });
      patchMetalComponent({ karat_id: karatId, karat_name: karatOpt.label, purity: karatOpt.purity, rate: rate || 0 });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsPricingItem(false);
    }
  };

  const handleColorChange = (valueStr) => {
    const colorId = Number(valueStr);
    const colorOpt = metalColorOptions.find((o) => o.value === colorId);
    if (!colorOpt) return;
    patchMetalComponent({ metal_color_id: colorId, metal_color_name: colorOpt.label });
  };

  const stonesTotal  = +stones.reduce((s, row) => s + (row.amount || 0), 0).toFixed(2);
  const labourAmount = appliedLabour ? +appliedLabour.reduce((s, op) => s + (op.amount || 0), 0).toFixed(2) : 0;
  const subTotal  = +(metalAmount + stonesTotal + labourAmount).toFixed(2);
  const diamondStones = stones.filter((s) => s.itemGroupId === 112);
  const otherStones    = stones.filter((s) => s.itemGroupId !== 112);
  const diamondAmount = +diamondStones.reduce((s, r) => s + (r.amount || 0), 0).toFixed(2);
  const diamondPieces = diamondStones.reduce((s, r) => s + (r.pieces || 0), 0);
  const diamondWeight = +diamondStones.reduce((s, r) => s + (r.weight || 0), 0).toFixed(3);
  const stoneAmount   = +otherStones.reduce((s, r) => s + (r.amount || 0), 0).toFixed(2);
  const stonePieces   = otherStones.reduce((s, r) => s + (r.pieces || 0), 0);
  const stoneWeight   = +otherStones.reduce((s, r) => s + (r.weight || 0), 0).toFixed(3);
  const taxAmount = +(subTotal * APP_CONFIG.TAX.GST_RATE).toFixed(2);
  const netAmount = +(subTotal + taxAmount).toFixed(2);

  const handleAddStone = async () => {
    const { itemGroupId, shapeId, stoneColorId, qualityId, typeId, pieces, weight: stoneWeight } = stoneDraft;
    if (!itemGroupId || !shapeId || !stoneColorId || !qualityId || !typeId || !stoneWeight) {
      return toast.error('Fill in every stone field before adding.');
    }
    const defaults = STONE_COSTING_DEFAULTS[Number(itemGroupId)];
    if (!defaults) {
      return toast.error('This item group has no confirmed costing setup yet — only Diamond is wired.');
    }
    setIsAddingStone(true);
    try {
      const { rate } = await getStoneRate({
        baseItemId: defaults.baseItemId,
        itemGroupId: Number(itemGroupId),
        typeId: Number(typeId),
        shapeId: Number(shapeId),
        stoneColorId: Number(stoneColorId),
        qualityId: Number(qualityId),
        weight: Number(stoneWeight),
        salesCostingId: defaults.salesCostingId,
        purchaseCostingId: defaults.purchaseCostingId,
      });
      const amount = +(Number(stoneWeight) * (rate || 0)).toFixed(2);
      setStones((prev) => [...prev, {
        itemGroupId: Number(itemGroupId), shapeId: Number(shapeId),
        stoneColorId: Number(stoneColorId), qualityId: Number(qualityId), typeId: Number(typeId),
        pieces: Number(pieces) || 1, weight: Number(stoneWeight), rate: rate || 0, amount,
        baseItemId: defaults.baseItemId, salesCostingId: defaults.salesCostingId, purchaseCostingId: defaults.purchaseCostingId,
        itemGroupName: stoneItemGroups.find((g) => g.item_group_id === Number(itemGroupId))?.item_group_name,
        shapeName:   shapeOptions.find((o) => o.value === Number(shapeId))?.label,
        colorName:   colorOptions.find((o) => o.value === Number(stoneColorId))?.label,
        qualityName: qualityOptions.find((o) => o.value === Number(qualityId))?.label,
      }]);
      setStoneDraft(emptyStoneDraft());
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsAddingStone(false);
    }
  };

  const handleRemoveStone = (index) => setStones((prev) => prev.filter((_, i) => i !== index));

  const handleProposeLabour = async () => {
    if (!selectedItem || !baseRow) return;
    setIsLabourBusy(true);
    try {
      const proposal = await getLabourRate({
        itemId: selectedItem.item_id,
        itemAttributeId: selectedItem.item_attribute_id,
        itemGroupId: selectedItem.item_group_id,
        typeId: selectedItem.type_id,
        karatId: metalComponent?.karat_id,
        pieces: 1,
        weight: weightNum,
        netWeight: weightNum,
        diamondWeight: stones.filter((s) => s.itemGroupId === 112).reduce((s, r) => s + r.weight, 0),
        stoneWeight: stones.reduce((s, r) => s + r.weight, 0),
        companyId: storeId,
        purity,
        baseItemId: selectedItem.base_item_id,
      });
      if (!proposal.length) return toast.error('No labour rate available for this item.');
      setLabourProposal(proposal);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsLabourBusy(false);
    }
  };

  const handleApplyLabour = async () => {
    if (!labourProposal || !baseRow) return;
    setIsLabourBusy(true);
    try {
      const [rePriced] = await applyLabourToLine({
        item: { ...baseRow, weight: weightNum, net_weight: weightNum },
        operations: labourProposal,
        documentId: APP_CONFIG.DOCUMENT_TYPES.POS_ORDER,
      });
      if (!rePriced) throw new Error('Labour could not be applied.');
      setBaseRow(rePriced);
      setAppliedLabour(labourProposal);
      toast.success('Labour applied.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsLabourBusy(false);
    }
  };

  // Shared by Proceed to Order AND Print Estimate's temp voucher — both need
  // the exact same fully-priced line, just handed to a different endpoint.
  const buildLineItem = () => {
    const chosenSize = sizes.find((s) => s.item_size_id === Number(sizeId));
    const rebuiltItemTaxes = taxTemplate?.length
      ? taxTemplate.map((t) => {
          const rowTax = +(taxAmount / taxTemplate.length).toFixed(2);
          return { ...t, taxable_amount: subTotal, tax_amount: rowTax, base_tax_amount: rowTax };
        })
      : [];
    return {
      ...baseRow,
      weight: weightNum,
      net_weight: weightNum,
      pure_weight: pureWeight,
      sub_total: subTotal,
      taxable_amount: subTotal,
      net_amount: netAmount,
      tax_amount: taxAmount,
      base_sub_total: subTotal,
      base_net_amount: netAmount,
      base_tax_amount: taxAmount,
      item_size_id: sizeId ? Number(sizeId) : undefined,
      item_size_name: chosenSize?.item_size_name,
      item_components: [
        { ...metalComponent, weight: weightNum, pure_weight: pureWeight, amount: metalAmount, base_amount: metalAmount },
        ...stones.map((s) => ({
          item_id: selectedItem.item_id, rm_id: 0, rm_attribute_id: 0, setting_id: 0,
          stone_status_id: 1, certificate_no: '', pieces: s.pieces, weight: s.weight,
          uoc_id: 4, uom_id: 7, purity: 0, pure_weight: s.weight,
          rate: s.rate, amount: s.amount, base_amount: s.amount,
          markup: 0, pointer_weight: 0, parts: 0, discount: 0, discount_percent: 0,
          is_center_stone: false, base_item_id: s.baseItemId,
          metal_id: 0, metal_name: 'NA', metal_code: 'NA', karat_id: 0,
          item_group_id: s.itemGroupId, type_id: s.typeId, sub_type_id: 0, metal_color_id: 0,
          attribute: '', item_code: '', is_customer_item: false,
          sales_costing_id: s.salesCostingId, purchase_costing_id: s.purchaseCostingId,
          is_configurable: false,
          shape_id: s.shapeId, stone_color_id: s.stoneColorId, quality_id: s.qualityId,
        })),
      ],
      item_operations: appliedLabour ?? [],
      item_taxes: rebuiltItemTaxes,
      metal_amount: metalAmount,
      diamond_amount: diamondAmount,
      diamond_pieces: diamondPieces,
      diamond_weight: diamondWeight,
      stone_amount: stoneAmount,
      stone_pieces: stonePieces,
      stone_weight: stoneWeight,
      item_labour: labourAmount,
    };
  };

  const handleSubmit = async () => {
    if (!customerId) return toast.error('Assign a customer to the session before submitting.');
    if (!selectedItem || !baseRow) return toast.error('Select a custom estimate item first.');
    if (!salesPersonId) return toast.error('Select a sales person.');
    if (!headerConfig.isReady) {
      if (headerConfig.isError) headerConfig.refetch();
      return toast.error(
        headerConfig.isConfigMissing
          ? "Orders aren't set up for your store yet — contact OrnaVerse support."
          : headerConfig.isError
            ? 'Store configuration failed to load — retrying now, try again in a moment.'
            : 'Store configuration is still loading — try again in a moment.'
      );
    }
    setIsSubmitting(true);
    try {
      const lineItem = buildLineItem();
      const createRes = await createOrder({
        ...buildTransactionHeaderFields({
          subTotal, taxableAmount: subTotal, taxAmount, netAmount,
          pieces: 1, weight: weightNum, netWeight: weightNum,
          customerId, customerName, customerMobile,
          activeStoreId: storeId,
          headerConfig,
          documentTypeId: APP_CONFIG.DOCUMENT_TYPES.POS_ORDER,
          receiptAmount: 0,
        }),
        sales_person_id: Number(salesPersonId),
        line_items: [lineItem],
        receipt_details: [],
        promotion_details: [],
      });
      const transactionId = createRes?.EntityId;
      if (!transactionId) throw new Error('Creation failed — no EntityId returned.');
      if (!headerConfig.autoPosting) {
        await postOrder(transactionId);
      }
      toast.success('Custom order placed.');
      onDone();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmHold = () => {
    if (!selectedItem || !baseRow) return;
    if (!holdReason.trim()) return toast.error('Enter a reason to hold this estimate.');
    holdEstimate(storeId, {
      reason: holdReason.trim(),
      heldBy: authUser?.username ?? null,
      selectedItem, sizeId, weight, baseRow, taxTemplate, stones, labourProposal, appliedLabour, salesPersonId,
      netAmount,
    });
    // Confirmed live 2026-10-14 against OrnaVerse's own Estimation > Custom
    // tab: holding does NOT clear the working item — it stays fully
    // populated and still editable (so the operator can keep refining it,
    // or hold it again under a different reason) rather than forcing a
    // fresh start.
    toast.success('Estimate held.');
    setIsHoldOpen(false);
    setHoldReason('');
  };

  const handleOpenRetrieve = () => {
    setHeldList(listHeldEstimates(storeId));
    setIsRetrieveOpen(true);
  };

  const handleSelectHeld = (record) => {
    setSelectedItem(record.selectedItem);
    setSizeId(record.sizeId);
    setWeight(record.weight);
    setBaseRow(record.baseRow);
    setTaxTemplate(record.taxTemplate);
    setStones(record.stones);
    setLabourProposal(record.labourProposal);
    setAppliedLabour(record.appliedLabour);
    setSalesPersonId(record.salesPersonId);
    removeHeldEstimate(storeId, record.id);
    setIsRetrieveOpen(false);
  };

  // Passed to InvoiceReportButton as resolveTransactionId: creates a fresh,
  // unsaved temp voucher right as "Print Estimate" is clicked (not before —
  // it must reflect whatever's on screen at that exact moment), then that
  // button's own existing report-picker/preview/print flow takes over.
  const resolvePrintTransactionId = async () => {
    if (!selectedItem || !baseRow) {
      toast.error('Select a custom estimate item first.');
      return null;
    }
    return createEstimationTempVoucher(buildLineItem());
  };

  // No durable, publicly-openable link exists for a rendered estimate (the
  // report render endpoint needs this session's own OrnaVerse auth, so a
  // customer's phone could never load it) — this shares a plain-text
  // summary instead of a broken "link", and leaves the actual send to the
  // operator by opening WhatsApp/their email client pre-filled, rather than
  // dispatching anything from our own server.
  const buildShareText = () =>
    `Your estimate for ${selectedItem?.item_name ?? 'your item'} — ${formatINR(netAmount)}. Thank you for visiting Lucira Jewelry!`;

  const handleOpenShare = () => {
    if (!selectedItem || !baseRow) return toast.error('Select a custom estimate item first.');
    // A masked mobile ("******5670" — see customer normalizer's own header
    // for why OrnaVerse returns it this way for a non-admin session) can't
    // be prefilled: stripping its asterisks would leave only the last 4
    // real digits, an unusable "phone number" a wa.me link would silently
    // fail against. Leave it blank for the operator to type instead.
    setShareMobile(customerMobile && !isMaskedValue(customerMobile) ? customerMobile : '');
    setShareEmail('');
    setIsShareOpen(true);
  };

  const handleShareWhatsApp = () => {
    const digits = shareMobile.replace(/\D/g, '');
    if (!digits) return toast.error('Enter a mobile number.');
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(buildShareText())}`, '_blank');
    setIsShareOpen(false);
  };

  const handleShareEmail = () => {
    if (!shareEmail.trim()) return toast.error('Enter an email address.');
    const subject = encodeURIComponent('Your Estimate from Lucira Jewelry');
    const body = encodeURIComponent(buildShareText());
    window.location.href = `mailto:${shareEmail.trim()}?subject=${subject}&body=${body}`;
    setIsShareOpen(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <CustomerAttachedBanner customerId={customerId} customerName={customerName} />
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-3 -mt-3">
        <p className="text-xs text-muted-foreground">
          Isolated from Scan / Browse — only items marked Custom Estimate on the item master appear here.
        </p>
        <Button type="button" variant="outline" size="sm" className="self-start shrink-0 gap-1.5" onClick={handleOpenRetrieve}>
          <History size={14} /> Retrieve Held
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Item" required>
          {itemsLoading ? (
            <InlineLoader label="Loading…" />
          ) : (
            <PickerSelect
              value={selectedItem?.item_id}
              onChange={handleSelectItem}
              placeholder="Select item"
              options={customEstimateItems}
              getValue={(i) => i.item_id}
              getLabel={(i) => i.item_name}
            />
          )}
        </FormField>
        <FormField label="Item size">
          <PickerSelect
            value={sizeId}
            onChange={setSizeId}
            placeholder="—"
            options={sizes}
            getValue={(s) => s.item_size_id}
            getLabel={(s) => s.item_size_name}
            disabled={!selectedItem || !sizes.length}
          />
        </FormField>
      </div>

      {isPricingItem && <InlineLoader label="Pricing item…" />}

      {selectedItem && baseRow && (
        <>
          <Section title="Metal">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <FormField label="Karat">
                <PickerSelect
                  value={metalComponent?.karat_id}
                  onChange={handleKaratChange}
                  placeholder="Select karat"
                  options={karatOptions}
                  getValue={(o) => o.value}
                  getLabel={(o) => o.label}
                  disabled={isPricingItem}
                />
              </FormField>
              <FormField label="Color">
                <PickerSelect
                  value={metalComponent?.metal_color_id}
                  onChange={handleColorChange}
                  placeholder="Select color"
                  options={metalColorOptions}
                  getValue={(o) => o.value}
                  getLabel={(o) => o.label}
                  disabled={isPricingItem}
                />
              </FormField>
              <div><span className="text-xs text-muted-foreground block">Purity</span>{purity}</div>
              <FormField label="Weight (g)" required>
                <Input type="number" inputMode="decimal" step="0.001" value={weight}
                  onChange={(e) => setWeight(e.target.value)} className="h-10 text-sm" />
              </FormField>
              <div><span className="text-xs text-muted-foreground block">Rate (₹/g)</span>{formatINR(metalRate)}</div>
              <div><span className="text-xs text-muted-foreground block">Amount</span>{formatINR(metalAmount)}</div>
            </div>
          </Section>

          <Section title="Diamonds / stones">
            {stones.length > 0 && (
              <div className="flex flex-col gap-2">
                {stones.map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                    <span className="truncate">
                      {s.itemGroupName} · {s.shapeName} · {s.colorName} · {s.qualityName} · {s.pieces}pc/{s.weight}ct
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      {formatINR(s.amount)}
                      <button type="button" onClick={() => handleRemoveStone(i)} className="text-muted-foreground hover:text-destructive">
                        <X size={14} />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 rounded-lg border border-dashed border-border p-3">
              <FormField label="Item group">
                <PickerSelect
                  value={stoneDraft.itemGroupId}
                  onChange={(v) => setStoneDraft((d) => ({ ...d, itemGroupId: v, typeId: '' }))}
                  placeholder="Item group"
                  options={stoneItemGroups}
                  getValue={(g) => g.item_group_id}
                  getLabel={(g) => g.item_group_name}
                />
              </FormField>
              <FormField label="Shape">
                <PickerSelect
                  value={stoneDraft.shapeId}
                  onChange={(v) => setStoneDraft((d) => ({ ...d, shapeId: v }))}
                  placeholder="Shape"
                  options={shapeOptions}
                  getValue={(o) => o.value}
                  getLabel={(o) => o.label}
                />
              </FormField>
              <FormField label="Color">
                <PickerSelect
                  value={stoneDraft.stoneColorId}
                  onChange={(v) => setStoneDraft((d) => ({ ...d, stoneColorId: v }))}
                  placeholder="Color"
                  options={colorOptions}
                  getValue={(o) => o.value}
                  getLabel={(o) => o.label}
                />
              </FormField>
              <FormField label="Quality">
                <PickerSelect
                  value={stoneDraft.qualityId}
                  onChange={(v) => setStoneDraft((d) => ({ ...d, qualityId: v }))}
                  placeholder="Quality"
                  options={qualityOptions}
                  getValue={(o) => o.value}
                  getLabel={(o) => o.label}
                />
              </FormField>
              <FormField label="Type">
                <PickerSelect
                  value={stoneDraft.typeId}
                  onChange={(v) => setStoneDraft((d) => ({ ...d, typeId: v }))}
                  placeholder="Type"
                  options={stoneTypeOptions}
                  getValue={(o) => o.type_id}
                  getLabel={(o) => o.type_name}
                  disabled={!stoneDraft.itemGroupId}
                />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Pcs">
                  <Input type="number" inputMode="numeric" min={1} placeholder="Pcs" value={stoneDraft.pieces}
                    onChange={(e) => setStoneDraft((d) => ({ ...d, pieces: e.target.value }))} className="h-10 text-sm" />
                </FormField>
                <FormField label="Weight (ct)">
                  <Input type="number" inputMode="decimal" placeholder="Weight (ct)" value={stoneDraft.weight}
                    onChange={(e) => setStoneDraft((d) => ({ ...d, weight: e.target.value }))} className="h-10 text-sm" />
                </FormField>
              </div>
              <Button type="button" variant="outline" size="sm" className="col-span-1 sm:col-span-2 lg:col-span-3 gap-1.5"
                disabled={isAddingStone} onClick={handleAddStone}>
                <Plus size={14} /> {isAddingStone ? 'Pricing…' : 'Add'}
              </Button>
            </div>
          </Section>

          <Section title="Labour">
            {appliedLabour ? (
              <p className="text-sm text-foreground">{appliedLabour[0]?.operation_name} — {formatINR(labourAmount)}</p>
            ) : labourProposal ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                <span>{labourProposal[0]?.operation_name} — {formatINR(labourProposal[0]?.amount)}</span>
                <Button type="button" size="sm" disabled={isLabourBusy} onClick={handleApplyLabour} className="sm:shrink-0">
                  {isLabourBusy ? 'Applying…' : 'Confirm'}
                </Button>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled={isLabourBusy} onClick={handleProposeLabour} className="self-start">
                {isLabourBusy ? 'Checking…' : 'Apply labour'}
              </Button>
            )}
          </Section>

          <FormField label="Sales Person" required>
            <SalesPersonSelect companyId={storeId} value={salesPersonId} onChange={setSalesPersonId} />
          </FormField>

          <Section title="Estimate Summary">
            <div className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatINR(subTotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{formatINR(taxAmount)}</span></div>
              <div className="flex justify-between font-semibold border-t border-border pt-1.5 mt-0.5"><span>Net</span><span>{formatINR(netAmount)}</span></div>
            </div>
          </Section>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <InvoiceReportButton
              resolveTransactionId={resolvePrintTransactionId}
              documentId={APP_CONFIG.DOCUMENT_TYPES.ESTIMATION}
              documentLabel="Estimate"
            />

            <Button type="button" variant="outline" className="h-12 w-full gap-2" onClick={handleOpenShare}>
              <Share2 size={18} aria-hidden="true" /> Share
            </Button>

            <Button type="button" variant="outline" className="h-12 w-full gap-2" onClick={() => setIsHoldOpen(true)}>
              <PauseCircle size={18} aria-hidden="true" /> Hold Estimate
            </Button>

            <Button type="button" disabled={isSubmitting} className="h-12 w-full" onClick={handleSubmit}>
              {isSubmitting ? 'Placing Order…' : 'Proceed to Order'}
            </Button>
          </div>
        </>
      )}

      <Dialog open={isShareOpen} onOpenChange={setIsShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share estimate</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            Prefills from the attached customer when available.
          </p>
          <FormField label="Mobile">
            <Input value={shareMobile} onChange={(e) => setShareMobile(e.target.value)} placeholder="Mobile number" className="h-11" />
          </FormField>
          <FormField label="Email">
            <Input type="email" value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} placeholder="Email address" className="h-11" />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsShareOpen(false)}>Cancel</Button>
            <Button type="button" variant="outline" onClick={handleShareEmail}>Email</Button>
            <Button type="button" onClick={handleShareWhatsApp}>WhatsApp</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isHoldOpen} onOpenChange={setIsHoldOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hold estimate</DialogTitle>
          </DialogHeader>
          <FormField label="Hold reason" required>
            <Input
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
              placeholder="e.g. Customer deciding on karat"
              className="h-11"
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsHoldOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleConfirmHold}>Hold</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRetrieveOpen} onOpenChange={setIsRetrieveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retrieve held estimate</DialogTitle>
          </DialogHeader>
          {heldList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No held estimates on this till.</p>
          ) : (
            <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
              {heldList.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => handleSelectHeld(record)}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-left hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{record.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(record.heldAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      {record.heldBy && ` · ${record.heldBy}`}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-foreground shrink-0">{formatINR(record.netAmount)}</span>
                </button>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsRetrieveOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
