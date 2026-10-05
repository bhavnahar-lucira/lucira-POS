'use client';

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useSalesPersonOptions } from '@/hooks/schemes/useSalesPersonOptions';

/**
 * @param {{ companyId: number|null, value: number|null, onChange: (employeeId: number) => void }} props
 */
export default function SalesPersonSelect({ companyId, value, onChange }) {
  const { salesPersons, isLoading } = useSalesPersonOptions(companyId);

  return (
    <Select
      value={value != null ? String(value) : ''}
      onValueChange={(v) => onChange(Number(v))}
      disabled={isLoading}
    >
      <SelectTrigger className="h-11 w-full">
        <SelectValue placeholder={isLoading ? 'Loading…' : 'Select sales person'} />
      </SelectTrigger>
      <SelectContent className="max-h-56 overflow-y-auto">
        {salesPersons.map((p) => (
          <SelectItem key={p.employee_id} value={String(p.employee_id)}>
            {p.employee_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
