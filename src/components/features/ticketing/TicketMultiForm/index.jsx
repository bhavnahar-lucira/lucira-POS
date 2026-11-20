'use client';

import { useState } from 'react';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import TicketRequestFields, { EMPTY_SPECS } from '@/components/features/ticketing/TicketRequestFields';
import TicketFileThumb from '@/components/features/ticketing/TicketFileThumb';
import SalesPersonSelect from '@/components/features/checkout/SalesPersonSelect';
import CustomerAttachedBanner from '@/components/shared/CustomerAttachedBanner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSalesPersonOptions } from '@/hooks/schemes/useSalesPersonOptions';
import { useCreateTicket } from '@/hooks/ticketing/useTickets';
import { selectActiveStoreId } from '@/store/slices/storeSlice';
import {
  selectCartCustomerId, selectCartCustomerName, selectCartCustomerMobile, selectCartCustomerContactMobile,
} from '@/store/slices/cartSlice';
import { isMaskedValue } from '@/lib/normalizers/customer';
import { formatAmountOrDash } from '@/lib/priceUtils';
import { TICKET_ITEM_MAX_FILES, TICKET_MAX_ITEMS } from '@/lib/ticketing/constants';

function Section({ title, children, action }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Problems that stop a product from being added, or null. */
export function productProblem(specs, files) {
  if (!specs.category) return 'Select the jewellery category.';
  if (specs.requirement_notes.trim().length < 3) return 'Describe the customer requirement.';
  if (!files.length) return 'Add at least one reference image.';
  return null;
}

const isDirty = (specs, files) => files.length > 0 || Object.entries(specs).some(([, v]) => String(v ?? '').trim() !== '');

/** New ticket with one or more products, each with its own requirement and reference images. */
export default function TicketMultiForm({ onCreated }) {
  const storeId        = useSelector(selectActiveStoreId);
  const customerId     = useSelector(selectCartCustomerId);
  const customerName   = useSelector(selectCartCustomerName);
  const customerMobile = useSelector(selectCartCustomerMobile);
  const contactMobile  = useSelector(selectCartCustomerContactMobile);
  const mobile = contactMobile ?? customerMobile ?? null;
  const { salesPersons } = useSalesPersonOptions(storeId);
  const createTicket = useCreateTicket();

  const [salesPersonId, setSalesPersonId] = useState(null);
  const [generalNotes, setGeneralNotes] = useState('');
  const [products, setProducts] = useState([]);
  const [specs, setSpecs] = useState(EMPTY_SPECS);
  const [files, setFiles] = useState([]);
  const [editingKey, setEditingKey] = useState(null);
  const [formKey, setFormKey] = useState(0);

  const resetEditor = () => {
    setSpecs(EMPTY_SPECS);
    setFiles([]);
    setEditingKey(null);
    setFormKey((k) => k + 1);
  };

  const saveProduct = () => {
    const problem = productProblem(specs, files);
    if (problem) return toast.error(problem);
    if (editingKey) {
      setProducts((list) => list.map((p) => (p.key === editingKey ? { ...p, specs, files } : p)));
      toast.success('Product updated.');
    } else {
      if (products.length >= TICKET_MAX_ITEMS) return toast.error(`A ticket can hold up to ${TICKET_MAX_ITEMS} products.`);
      setProducts((list) => [...list, { key: crypto.randomUUID(), specs, files }]);
      toast.success(`Product ${products.length + 1} added.`);
    }
    resetEditor();
  };

  const editProduct = (product) => {
    if (isDirty(specs, files) && editingKey !== product.key) {
      return toast.error('Add or clear the product in the form first.');
    }
    setSpecs(product.specs);
    setFiles(product.files);
    setEditingKey(product.key);
    setFormKey((k) => k + 1);
  };

  const removeProduct = (key) => {
    setProducts((list) => list.filter((p) => p.key !== key));
    if (editingKey === key) resetEditor();
  };

  const budgetTotal = products.reduce((t, p) => t + (Number(p.specs.budget) || 0), 0);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!customerId) return toast.error('Assign a customer from the header before raising a ticket.');
    const salesPerson = salesPersons.find((p) => p.employee_id === salesPersonId);
    if (!salesPerson) return toast.error('Select the jewelry consultant.');
    if (isDirty(specs, files)) return toast.error(editingKey ? 'Save the product you are editing first.' : 'Click "Add product" for the product in the form, or clear it.');
    if (!products.length) return toast.error('Add at least one product.');

    createTicket.mutate(
      {
        customer: {
          party_id: customerId,
          name: customerName,
          mobile: mobile && !isMaskedValue(mobile) ? (parsePhoneNumberFromString(String(mobile), 'IN')?.number ?? mobile) : mobile,
        },
        sales_person: { id: salesPerson.employee_id, name: salesPerson.employee_name },
        general_notes: generalNotes.trim() || null,
        items: products.map((p) => ({ specs: p.specs, file_ids: p.files.map((f) => f.id) })),
      },
      {
        onSuccess: (ticket) => {
          toast.success(`Ticket ${ticket.ticket_number} created with ${products.length} product${products.length > 1 ? 's' : ''} and sent to the CAD team.`);
          onCreated?.(ticket);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <CustomerAttachedBanner
        customerId={customerId}
        customerName={customerName}
        emptyMessage="Assign or create the customer from the header before raising a ticket."
      />

      <Section title="Jewelry Consultant & notes">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Jewelry Consultant <span className="text-destructive">*</span></Label>
            <SalesPersonSelect companyId={storeId} value={salesPersonId} onChange={setSalesPersonId} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ticket-general-notes">Notes for the whole ticket</Label>
            <Textarea
              id="ticket-general-notes"
              rows={2}
              maxLength={2000}
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              placeholder="e.g. Bridal set, all pieces to match; occasion date…"
            />
          </div>
        </div>
      </Section>

      <Section
        title={editingKey ? 'Edit product' : `Product ${products.length + 1}`}
        action={editingKey && <Button type="button" variant="ghost" size="sm" onClick={resetEditor}>Cancel edit</Button>}
      >
        <TicketRequestFields
          key={formKey}
          idPrefix="new-product"
          specs={specs}
          onSpecsChange={setSpecs}
          files={files}
          onFilesChange={setFiles}
          maxFiles={TICKET_ITEM_MAX_FILES}
          requireFiles
        />
        <Button type="button" variant="outline" className="h-11 gap-1.5 sm:self-end" onClick={saveProduct}>
          {editingKey ? <><Pencil size={16} aria-hidden="true" /> Save product</> : <><Plus size={16} aria-hidden="true" /> Add product</>}
        </Button>
      </Section>

      <Section
        title={`Products in this ticket (${products.length})`}
        action={budgetTotal > 0 && <span className="text-sm text-muted-foreground">Total budget <strong className="text-foreground">{formatAmountOrDash(budgetTotal)}</strong></span>}
      >
        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground">Fill in the product above and click &quot;Add product&quot;. Add as many products as the customer wants.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {products.map((p, i) => (
              <li key={p.key} className={`flex flex-col gap-2 rounded-lg border p-3 ${editingKey === p.key ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">Product {i + 1} · {p.specs.category}</p>
                    <p className="text-xs text-muted-foreground">
                      {[p.specs.karat, p.specs.metal, p.specs.size && `Size ${p.specs.size}`, p.specs.gold_weight && `${p.specs.gold_weight} g`].filter(Boolean).join(' · ') || '—'}
                      {p.specs.budget ? ` · Budget ${formatAmountOrDash(p.specs.budget)}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={`Edit product ${i + 1}`} onClick={() => editProduct(p)}>
                      <Pencil size={16} aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="size-9 text-destructive" aria-label={`Remove product ${i + 1}`} onClick={() => removeProduct(p.key)}>
                      <Trash2 size={16} aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                <p className="line-clamp-3 text-sm whitespace-pre-line text-foreground">{p.specs.requirement_notes}</p>
                <div className="flex flex-wrap gap-2">
                  {p.files.map((f) => <TicketFileThumb key={f.id} file={f} />)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Button type="submit" className="h-12 w-full sm:w-auto sm:self-end sm:px-8" disabled={createTicket.isPending}>
        {createTicket.isPending ? 'Creating ticket…' : `Create ticket${products.length > 1 ? ` with ${products.length} products` : ''}`}
      </Button>
    </form>
  );
}
