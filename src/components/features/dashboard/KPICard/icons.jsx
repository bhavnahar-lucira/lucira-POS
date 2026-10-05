export function RevenueIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20H20" />
        <path d="M6.5 17V14" />
        <path d="M10.5 17V11" />
        <path d="M14.5 17V8" />
        <path d="M18.5 17V5" />
        <path d="M7.5 9.5C10.3 9.5 11.8 7 13.8 7C15.4 7 16.2 8.2 18 8.2" />
        <path d="M17.2 5.4L19.2 8.2L16 8.6" />
      </g>
    </svg>
  );
}

export function OrdersIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="3.5" width="12" height="17" rx="2" />
        <path d="M9 3.5V2.5" />
        <path d="M15 3.5V2.5" />
        <path d="M9 9H15" />
        <path d="M9 13H15" />
        <path d="M9 17H13" />
      </g>
    </svg>
  );
}

export function PendingReturnsIcon({ size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 7H20" />
        <path d="M16 3L20 7L16 11" />
        <path d="M16 17H4" />
        <path d="M8 13L4 17L8 21" />
      </g>
    </svg>
  );
}
