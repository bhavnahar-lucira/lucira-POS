export default function BrandDiamond({ size = 24, className, fill = 'currentColor', ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      className={className}
      {...props}
    >
      <path d="M22.06 12C18.7 12 12 18.7 12 22.06C12 18.7 5.3 12 1.94 12C5.3 12 12 5.3 12 1.94C12 5.3 18.7 12 22.06 12Z" />
    </svg>
  );
}
