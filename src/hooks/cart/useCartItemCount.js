import { useSelector } from 'react-redux';
import { selectCartItemCount } from '@/store/slices/cartSlice';

export function useCartItemCount() {
  return useSelector(selectCartItemCount);
}