import {
  LayoutDashboard,
  ShoppingBag,
  ShoppingCart,
  Users,
  ClipboardList,
  FileText,
  FileSpreadsheet,
  BookOpen,
  ArrowLeftRight,
  Repeat,
  Bookmark,
  Settings,
  Wrench,
  Footprints,
  UserCheck,
  BarChart3,
  UserX,
  Ticket,

} from 'lucide-react';

export const NAV_ITEMS = [
  { label: 'Dashboard',    href: '/dashboard',    icon: LayoutDashboard },
  { label: 'Catalog',      href: '/catalog',      icon: ShoppingBag     },
  { label: 'Cart',         href: '/cart',         icon: ShoppingCart    },
  { label: 'Orders',       href: '/orders',       icon: ClipboardList   },
  { label: 'Invoices',     href: '/invoices',     icon: FileText        },
  { label: 'Transactions', href: '/transactions', icon: ArrowLeftRight  },
  { label: 'Repair',       href: '/repair',       icon: Wrench          },
  { label: 'Transfers',    href: '/transfers',    icon: Repeat          },
  { label: 'Estimation',   href: '/estimation',   icon: FileSpreadsheet },
  { label: 'Ticketing',    href: '/ticketing',    icon: Ticket          },
  // { label: 'Customers',    href: '/customers',    icon: Users           },
  { label: 'Schemes',      href: '/schemes',      icon: BookOpen        },
  { label: 'Walk-ins',     href: '/walkins',      icon: Footprints      },
  { label: 'Buyers',       href: '/buyers',       icon: UserCheck       },
  { label: 'Non-Buyers',   href: '/non-buyers',   icon: UserX           },
  { label: 'Reports',      href: '/reports',      icon: BarChart3       },
];

export const BOTTOM_ITEMS = [
  { label: 'Settings', href: '/settings', icon: Settings },
];
