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
  Columns3Cog,
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
  // ADDED 2026-09-17 — Interstore Return went from a static "not available
  // yet" placeholder to a fully wired feature (see /transfers/page.jsx),
  // but was never added to the sidebar, so it was unreachable from the UI
  // despite working end to end. Fixed here.
  { label: 'Transfers',    href: '/transfers',    icon: Repeat          },
  { label: 'Estimation',   href: '/estimation',   icon: FileSpreadsheet },
  // { label: 'Custom',   href: '/custom',   icon: Columns3Cog },
  { label: 'Customers',    href: '/customers',    icon: Users           },
  { label: 'Schemes',      href: '/schemes',      icon: BookOpen        },
  // ADDED 2026-09-08, rebuilt on live OrnaVerse CRM data 2026-09-28 (no
  // local DB) — see app/(pos)/walkins/page.jsx's own header.
  { label: 'Walk-ins',     href: '/walkins',      icon: Footprints      },
];

export const BOTTOM_ITEMS = [
  { label: 'Settings', href: '/settings', icon: Settings },
];
