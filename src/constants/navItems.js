// src/constants/navItems.js
//
// Single source of truth for sidebar navigation config. Extracted out of
// Sidebar/index.jsx so other pieces of the shell (e.g. Header's page-title
// lookup) can reuse the same labels instead of maintaining a second,
// duplicate list that could drift out of sync.

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
  { label: 'Customers',    href: '/customers',    icon: Users           },
  { label: 'Schemes',      href: '/schemes',      icon: BookOpen        },
  { label: 'Walk-ins',     href: '/walkins',      icon: Footprints      },
];

export const BOTTOM_ITEMS = [
  { label: 'Settings', href: '/settings', icon: Settings },
];
