'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import APP_CONFIG from '@/constants/appConfig';

/**
 * @param {{
 *   onSearch: (query: string) => void,
 *   isLoading?: boolean,
 * }} props
 */
export default function CustomerLookupInput({ onSearch, isLoading = false }) {
  const [value, setValue] = useState('');
  const debounceRef = useRef(null);

  const handleChange = (e) => {
    const val = e.target.value;
    setValue(val);
    clearTimeout(debounceRef.current);
    if (val.trim() === '') {
      onSearch('');
      return;
    }
    debounceRef.current = setTimeout(() => onSearch(val), APP_CONFIG.SEARCH.DEBOUNCE_MS);
  };

  const handleClear = () => {
    clearTimeout(debounceRef.current);
    setValue('');
    onSearch('');
  };

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  return (
    <div className="relative flex items-center">
      <Search size={16} className="absolute left-3 text-muted-foreground pointer-events-none" aria-hidden="true" />
      <Input
        type="text"
        inputMode="search"
        placeholder="Search by name or mobile number"
        value={value}
        onChange={handleChange}
        aria-label="Customer name or mobile number"
        className="h-11 pl-9 pr-9"
      />
      {isLoading && (
        <div className="absolute right-9 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden="true" />
      )}
      {value.length > 0 && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-2 flex items-center justify-center h-7 w-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
