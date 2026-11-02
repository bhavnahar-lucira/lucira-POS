'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImagePlus } from 'lucide-react';

import TicketFileThumb from '@/components/features/ticketing/TicketFileThumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCategories } from '@/hooks/catalog/useCategoryFilters';
import { useAttributeOptions, useKaratOptions } from '@/hooks/catalog/useCatalogFilterOptions';
import { uploadTicketFile } from '@/services/ticketingService';
import { prepareTicketFile } from '@/lib/ticketing/prepareTicketFile';
import { TICKET_FILE_TYPES, TICKET_MAX_FILES } from '@/lib/ticketing/constants';
import APP_CONFIG from '@/constants/appConfig';

export const EMPTY_SPECS = {
  category: '', metal: '', karat: '', size: '', budget: '', gold_weight: '', requirement_notes: '', description: '',
};

export function specsFromTicket(specs = {}) {
  return Object.fromEntries(Object.keys(EMPTY_SPECS).map((key) => [key, specs[key] ?? EMPTY_SPECS[key]]));
}

function Field({ label, required, htmlFor, children, className = '' }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <Label htmlFor={htmlFor}>{label} {required && <span className="text-destructive">*</span>}</Label>
      {children}
    </div>
  );
}

function Group({ title, children }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

export function NameSelect({ id, value, onChange, options, placeholder, disabled }) {
  return (
    <Select value={value || ''} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="h-11 w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-64 overflow-y-auto">
        {[...new Set(options)].map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

const uniqueNames = (items, key) => [...new Set(items.map((i) => i[key]).filter(Boolean))];

/**
 * Customer requirement + reference files, shared by the new-ticket form and the
 * "update request" dialog. `files` holds newly uploaded files ({ id, url, file_name, type }).
 */
export default function TicketRequestFields({ specs, onSpecsChange, files, onFilesChange, existingFileCount = 0, requireFiles }) {
  const fileInputRef = useRef(null);
  const [isUploading, setIsUploading] = useState(false);

  const { data: categories = [] } = useCategories();
  const { options: metalOptions } = useAttributeOptions(APP_CONFIG.ATTRIBUTE_TYPES.METAL_COLOR);
  const { options: karatOptions } = useKaratOptions();

  const set = (key) => (value) => onSpecsChange({ ...specs, [key]: value });
  const setFromInput = (key) => (e) => set(key)(e.target.value);

  const handleFilesSelected = async (event) => {
    const selected = [...event.target.files];
    event.target.value = '';
    const room = TICKET_MAX_FILES - files.length - existingFileCount;
    if (selected.length > room) toast.error(`You can add ${Math.max(room, 0)} more file(s).`);

    const uploaded = [];
    setIsUploading(true);
    for (const file of selected.slice(0, Math.max(room, 0))) {
      if (!TICKET_FILE_TYPES.includes(file.type)) {
        toast.error(`${file.name}: only JPG, PNG or PDF files are allowed.`);
        continue;
      }
      try {
        uploaded.push(await uploadTicketFile(await prepareTicketFile(file)));
      } catch (err) {
        toast.error(`${file.name}: ${err.message}`);
      }
    }
    setIsUploading(false);
    if (uploaded.length) onFilesChange([...files, ...uploaded]);
  };

  return (
    <div className="flex flex-col gap-5">
      <Group title="Design">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Category" required htmlFor="ticket-category">
            <NameSelect
              id="ticket-category"
              value={specs.category}
              onChange={set('category')}
              options={uniqueNames(categories, 'type_name')}
              placeholder="Select category"
            />
          </Field>
          <Field label="Size" htmlFor="ticket-size">
            <Input id="ticket-size" className="h-11" value={specs.size} onChange={setFromInput('size')} placeholder="e.g. 12" maxLength={100} />
          </Field>
          <Field label="Budget (₹)" htmlFor="ticket-budget">
            <Input id="ticket-budget" className="h-11" type="number" min="0" inputMode="decimal" value={specs.budget} onChange={setFromInput('budget')} />
          </Field>
        </div>
      </Group>

      <Group title="Metal">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Karat" htmlFor="ticket-karat">
            <NameSelect id="ticket-karat" value={specs.karat} onChange={set('karat')} options={karatOptions.map((o) => o.label)} placeholder="Select karat" />
          </Field>
          <Field label="Color" htmlFor="ticket-metal">
            <NameSelect id="ticket-metal" value={specs.metal} onChange={set('metal')} options={metalOptions.map((o) => o.label)} placeholder="Select color" />
          </Field>
          <Field label="Weight (g)" htmlFor="ticket-gold">
            <Input id="ticket-gold" className="h-11" type="number" min="0" step="0.001" inputMode="decimal" value={specs.gold_weight} onChange={setFromInput('gold_weight')} />
          </Field>
        </div>
      </Group>

      <Field label="Customer requirement" required htmlFor="ticket-notes">
        <Textarea
          id="ticket-notes"
          rows={4}
          maxLength={2000}
          value={specs.requirement_notes}
          onChange={setFromInput('requirement_notes')}
          placeholder="Design, finish, engraving, occasion, deadline…"
        />
      </Field>

      <Field label="Description / discount & offer" htmlFor="ticket-description">
        <Textarea
          id="ticket-description"
          rows={3}
          maxLength={2000}
          value={specs.description}
          onChange={setFromInput('description')}
          placeholder="Any discount or offer promised to the customer, other notes…"
        />
      </Field>

      <Field label="Reference images" required={requireFiles}>
        <div className="flex flex-wrap gap-2">
          {files.map((file) => (
            <TicketFileThumb key={file.id} file={file} onRemove={() => onFilesChange(files.filter((f) => f.id !== file.id))} />
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || files.length + existingFileCount >= TICKET_MAX_FILES}
            className="size-24 flex-col gap-1 text-xs"
          >
            <ImagePlus size={20} aria-hidden="true" />
            {isUploading ? 'Uploading…' : 'Add files'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">JPG, PNG or PDF · up to {TICKET_MAX_FILES} files</p>
        <input
          ref={fileInputRef}
          type="file"
          accept={TICKET_FILE_TYPES.join(',')}
          multiple
          className="hidden"
          onChange={handleFilesSelected}
        />
      </Field>
    </div>
  );
}
