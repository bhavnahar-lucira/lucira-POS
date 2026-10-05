import { useSelector } from 'react-redux';
import {
  selectCartSubtotal,
  selectCartDiscount,
  selectCartTax,
  selectCartTotal,
} from '@/store/slices/cartSlice';

export function useCartTotals() {
  const subtotal = useSelector(selectCartSubtotal);
  const discount = useSelector(selectCartDiscount);
  const tax      = useSelector(selectCartTax);
  const total    = useSelector(selectCartTotal);

  return { subtotal, discount, tax, total };
}