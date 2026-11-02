'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from '@/components/shared/Logo';
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/hooks/ui/useSidebar';
import { useAuth } from '@/hooks/auth/useAuth';
import { useMediaQuery } from '@/hooks/ui/useMediaQuery';
import { useHasMounted } from '@/hooks/ui/useHasMounted';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { NAV_ITEMS, BOTTOM_ITEMS } from '@/constants/navItems';

// Tailwind's default `lg` breakpoint — the laptop/desktop cut-off above
// which the sidebar is expanded by default (see uiSlice.sidebarCollapsed).
const LAPTOP_QUERY = '(min-width: 1024px)';

function getInitial(name) {
  return name?.trim()?.[0]?.toUpperCase() ?? '?';
}

/**
 * The md+ sidebar has three visual modes, all resolved in CSS so the server
 * render and the first client render always agree (no media-query JS in the
 * class names):
 *   'rail'     — operator collapsed it: icon rail at every md+ size
 *   'expanded' — operator expanded it: labels at every md+ size
 *   'auto'     — nobody has clicked yet: icon rail on a tablet (md..lg),
 *                expanded on a laptop/desktop (lg+)
 * Below md none of this applies — the overlay drawer is always full width.
 *
 * `rail` are md: classes, `expanded` the explicit-expanded ones, and
 * `autoExpanded` the lg: overrides that undo `rail` on a laptop; 'auto'
 * applies `rail` at md and `autoExpanded` again at lg.
 */
function railClasses(mode, { rail, expanded = '', autoExpanded = '' }) {
  if (mode === 'rail')     return rail;
  if (mode === 'expanded') return expanded;
  return cn(rail, autoExpanded);
}

function SidebarNavItem({ item, mode, isRail, onNavigate }) {
  const pathname = usePathname();
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
  const Icon = item.icon;

  const linkContent = (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-standard ease-premium min-h-[44px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        isActive
          ? 'bg-sidebar-primary text-sidebar-primary-foreground'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
        railClasses(mode, {
          rail:         'md:justify-center md:px-2',
          autoExpanded: 'lg:justify-start lg:px-3',
        })
      )}
      aria-current={isActive ? 'page' : undefined}
    >
      <Icon size={20} aria-hidden="true" className="shrink-0" />
      <span
        className={cn(
          'flex items-center gap-2 truncate',
          railClasses(mode, { rail: 'md:hidden', autoExpanded: 'lg:flex' })
        )}
      >
        <span className='truncate'>{item.label}</span>
        {item.comingSoon && (
          <span className="shrink-0 rounded-full bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-semibold leading-none text-sidebar-foreground/60">Soon</span>
        )}
      </span>
    </Link>
  );

  // Tooltip only while the label is actually hidden (a JS decision, so it
  // uses the post-mount effective state rather than the CSS mode).
  if (isRail) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
        <TooltipContent side="right">
          <p>{item.label}{item.comingSoon ? ' (Coming Soon)' : ''}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return linkContent;
}

export default function Sidebar() {
  // sidebarOpen → the below-md overlay drawer; collapsed → the md+ icon rail.
  // Independent on purpose: expanding the desktop rail by default must not
  // also pop the drawer open over the page on a phone (see uiSlice).
  const { sidebarOpen, collapsed, close, setCollapsed } = useSidebar();
  const { user, logout } = useAuth();

  const mode = collapsed === null ? 'auto' : collapsed ? 'rail' : 'expanded';

  // Effective rail state for the few things CSS can't gate (tooltips, the
  // toggle's aria-label and what the toggle does next). Only meaningful
  // after mount — before that it mirrors the server render ('expanded'
  // visuals are what the laptop, the common case, sees anyway).
  const isLaptop   = useMediaQuery(LAPTOP_QUERY);
  const hasMounted = useHasMounted();
  const isRail = collapsed ?? (hasMounted ? !isLaptop : false);

  const toggleRail = () => setCollapsed(!isRail);

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'flex flex-col border-r border-sidebar-border bg-sidebar shadow-lg shrink-0',
          'fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-300 ease-in-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          'md:relative md:inset-auto md:z-auto md:translate-x-0 md:transition-[width] md:duration-300 md:ease-in-out',
          railClasses(mode, { rail: 'md:w-16', expanded: 'md:w-56', autoExpanded: 'lg:w-56' })
        )}
        aria-label="Main navigation"
      >
        <div
          className={cn(
            'flex items-center border-b border-sidebar-border min-h-[64px] px-4 gap-3',
            railClasses(mode, {
              rail:         'md:justify-center md:px-2',
              autoExpanded: 'lg:justify-start lg:px-4',
            })
          )}
        >
          <span className={railClasses(mode, { rail: 'md:hidden', autoExpanded: 'lg:inline' })}>
            <Logo variant="full" color="white" height={32} width={110} />
          </span>
          <span className={cn('hidden', railClasses(mode, { rail: 'md:inline', autoExpanded: 'lg:hidden' }))}>
            <Logo variant="icon" color="white" height={24} width={24} />
          </span>
        </div>

        <nav
          className="flex flex-col gap-1 flex-1 overflow-y-auto scrollbar-none p-2"
          aria-label="Primary"
        >
          {NAV_ITEMS.map((item) => (
            <SidebarNavItem key={item.href} item={item} mode={mode} isRail={isRail} onNavigate={close} />
          ))}
        </nav>

        <Separator className="bg-sidebar-border" />

        <nav className="hidden flex-col gap-1 p-2" aria-label="Secondary">
          {BOTTOM_ITEMS.map((item) => (
            <SidebarNavItem key={item.href} item={item} mode={mode} isRail={isRail} onNavigate={close} />
          ))}
        </nav>

        <Separator className="bg-sidebar-border" />
        <div className="flex items-center gap-3 border-t border-sidebar-border px-4 py-3 md:hidden">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sm font-semibold text-sidebar-foreground">
            {getInitial(user?.username)}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-sidebar-foreground">
            {user?.username ?? 'Staff'}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={logout}
            aria-label="Sign out"
            className="shrink-0 text-sidebar-foreground/60 hover:text-destructive hover:bg-sidebar-accent"
          >
            <LogOut size={18} aria-hidden="true" />
          </Button>
        </div>

        {/* md+: expand/collapse the icon rail. Below md: close the drawer.
            Two buttons gated by CSS rather than one driven by a JS media
            query, so the server and first client render always agree. */}
        <div className="p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleRail}
            className={cn(
              'hidden md:flex w-full min-h-[44px] text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent',
              railClasses(mode, {
                rail:         'md:px-0 md:justify-center',
                autoExpanded: 'lg:px-3',
              })
            )}
            aria-label={isRail ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span
              className={cn(
                'flex items-center gap-2',
                railClasses(mode, { rail: 'md:hidden', autoExpanded: 'lg:flex' })
              )}
            >
              <ChevronLeft size={16} aria-hidden="true" />
              <span className="text-xs">Collapse</span>
            </span>
            <span className={cn('hidden', railClasses(mode, { rail: 'md:inline', autoExpanded: 'lg:hidden' }))}>
              <ChevronRight size={16} aria-hidden="true" />
            </span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={close}
            className="flex md:hidden w-full min-h-[44px] gap-2 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            aria-label="Close navigation menu"
          >
            <ChevronLeft size={16} aria-hidden="true" />
            <span className="text-xs">Close</span>
          </Button>
        </div>
      </aside>
    </>
  );
}
