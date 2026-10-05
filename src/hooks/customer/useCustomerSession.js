import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'sonner';
import {
  selectCartCustomerId,
  selectCartCustomerName,
  selectCartCustomerMobile,
  attachCustomer,
  detachCustomer,
} from '@/store/slices/cartSlice';
import TOAST   from '@/constants/toastMessages';

export function useCustomerSession() {
  const dispatch = useDispatch();

  const customerId     = useSelector(selectCartCustomerId);
  const customerName   = useSelector(selectCartCustomerName);
  const customerMobile = useSelector(selectCartCustomerMobile);

  const isAttached = !!customerId;

  /**
   * @param {{ customerId: number, customerName: string, customerMobile: string }} customer
   * @param {{ silent?: boolean }} [options]
   */
  const attach = (customer, options = {}) => {
    dispatch(attachCustomer(customer));

    if (!options.silent) {
      toast.success(TOAST.CUSTOMER.FOUND(customer.customerName ?? 'Customer'));
    }
  };

  const detach = () => {
    const name = customerName ?? 'Customer';
    dispatch(detachCustomer());
    toast.success(TOAST.CUSTOMER.DETACHED(name));
  };

  return {
    customerId,
    customerName,
    customerMobile,
    isAttached,
    attach,
    detach,
  };
}