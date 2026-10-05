import axios from 'axios';
import { attachInterceptors } from './interceptors';

const BASE_URL = process.env.NEXT_PUBLIC_ORNAVERSE_BASE_URL;

if (!BASE_URL) {
  throw new Error(
    '[Lucira POS] NEXT_PUBLIC_ORNAVERSE_BASE_URL is not set. ' +
    'Add it to .env.local and restart the dev server.'
  );
}

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Pragma':        'no-cache',
  },
  timeout: 30000,
});
attachInterceptors(axiosInstance);

export default axiosInstance;
