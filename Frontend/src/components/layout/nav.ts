import {
  LayoutDashboard,
  Globe,
  FileCode2,
  Package,
  History,
  ClipboardList,
  CalendarClock,
  Settings,
  MousePointerClick,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Routes that are not yet implemented show a "soon" hint. */
  soon?: boolean;
  end?: boolean;
}

export interface NavGroup {
  heading: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    heading: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/scraper/new', label: 'New Scraper', icon: MousePointerClick },
    ],
  },
  {
    heading: 'Data',
    items: [
      { to: '/products', label: 'Products', icon: Package },
      { to: '/crawls', label: 'Crawl History', icon: History },
    ],
  },
  {
    heading: 'Configuration',
    items: [
      { to: '/sources', label: 'Sources', icon: Globe, soon: true },
      { to: '/profiles', label: 'Profiles', icon: FileCode2 },
      { to: '/pending', label: 'Pending', icon: ClipboardList, soon: true },
      { to: '/scheduler', label: 'Scheduler', icon: CalendarClock, soon: true },
      { to: '/settings', label: 'Settings', icon: Settings, soon: true },
    ],
  },
];
