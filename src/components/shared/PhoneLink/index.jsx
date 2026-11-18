'use client';

import { formatMobileWithCountryCode, toTelHref } from '@/lib/phoneFormat';
import { cn } from '@/lib/utils';

export default function PhoneLink({
  phone,
  children,
  className,
  title,
  onClick,
  stopPropagation = true,
  ...props
}) {
  if (phone == null && !children) return null;

  const displayText = children ?? (phone ? formatMobileWithCountryCode(phone) : '—');
  const href = toTelHref(phone);

  if (!href) {
    return (
      <span className={cn('whitespace-nowrap', className)} {...props}>
        {displayText}
      </span>
    );
  }

  const handleClick = (e) => {
    if (stopPropagation) {
      e.stopPropagation();
    }
    onClick?.(e);
  };

  const textForTitle = typeof displayText === 'string' ? displayText : String(phone);
  const accessibleTitle = title ?? `Call ${textForTitle}`;

  return (
    <a
      href={href}
      onClick={handleClick}
      className={cn(
        'whitespace-nowrap underline-offset-2 hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-ring text-inherit hover:text-primary transition-colors cursor-pointer',
        className
      )}
      title={accessibleTitle}
      aria-label={accessibleTitle}
      {...props}
    >
      {displayText}
    </a>
  );
}

export { toTelHref };
