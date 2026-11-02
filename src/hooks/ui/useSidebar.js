import { useSelector, useDispatch } from 'react-redux';
import {
  toggleSidebar,
  openSidebar,
  closeSidebar,
  setSidebarCollapsed,
  selectSidebarOpen,
  selectSidebarCollapsed,
} from '@/store/slices/uiSlice';

/**
 * Provides sidebar state and actions. Two independent flags, because the
 * sidebar is two different things depending on viewport:
 *   - below md it is an overlay drawer — `sidebarOpen` / open / close / toggle
 *   - md and up it is a permanent column that is either expanded (labels)
 *     or an icon rail — `collapsed` / setCollapsed. `collapsed` is null
 *     until the operator chooses: then the viewport decides (rail on a
 *     tablet, expanded on a laptop — see Sidebar and uiSlice).
 * Reads from and writes to the Redux ui slice.
 * @returns {{ sidebarOpen: boolean, collapsed: boolean|null, toggle: Function,
 *             open: Function, close: Function, setCollapsed: (collapsed: boolean) => void }}
 */
export function useSidebar() {
  const dispatch = useDispatch();
  const sidebarOpen = useSelector(selectSidebarOpen);
  const collapsed   = useSelector(selectSidebarCollapsed);

  const toggle = () => dispatch(toggleSidebar());
  const open   = () => dispatch(openSidebar());
  const close  = () => dispatch(closeSidebar());
  const setCollapsed = (value) => dispatch(setSidebarCollapsed(value));

  return { sidebarOpen, collapsed, toggle, open, close, setCollapsed };
}
