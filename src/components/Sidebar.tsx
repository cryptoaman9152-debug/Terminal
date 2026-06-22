import { 
  LayoutDashboard, BarChart3, TrendingUp, LineChart, Activity, Diamond, DollarSign,
  Search, Bell, ScanLine, PieChart, BookOpen, Settings, Wifi, WifiOff
} from 'lucide-react';
import { useAppStore, type Workspace } from '@/store/appStore';
import { useMarketStore } from '@/store/marketStore';
import { cn } from '@/utils/helpers';

const WORKSPACES: { id: Workspace; icon: React.ReactNode; label: string; color: string }[] = [
  { id: 'index', icon: <BarChart3 size={18} />, label: 'Index', color: '#2962ff' },
  { id: 'stocks', icon: <TrendingUp size={18} />, label: 'Stocks', color: '#26a69a' },
  { id: 'futures', icon: <LineChart size={18} />, label: 'Futures', color: '#ff9800' },
  { id: 'options', icon: <Activity size={18} />, label: 'Options', color: '#ab47bc' },
  { id: 'mcx', icon: <Diamond size={18} />, label: 'MCX', color: '#f59e0b' },
  { id: 'cds', icon: <DollarSign size={18} />, label: 'CDS', color: '#06b6d4' },
];

export function Sidebar() {
  const { activeWorkspace, setActiveWorkspace, setSearchOpen, setBottomTab } = useAppStore();
  const marketStatus = useMarketStore((s) => s.marketStatus);

  return (
    <div className="w-[52px] min-w-[52px] h-full bg-[#0c0e14] border-r border-fw-border flex flex-col items-center py-2 select-none flex-shrink-0">
      {/* Brand Icon */}
      <div className="mb-2 pb-2 border-b border-fw-border/40 w-full flex justify-center">
        <div className="relative">
          <div className="absolute -inset-1 rounded-lg bg-gradient-to-br from-[#00D4FF]/15 via-[#4F46E5]/10 to-[#7C3AED]/15 blur-md opacity-60" />
          <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-[#0a0a0a] to-[#1a1a2e] border border-white/10 flex items-center justify-center overflow-hidden">
            <img
              src="/logo.png"
              alt="FW"
              className="w-6 h-6 object-contain"
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                el.style.display = 'none';
                el.parentElement!.innerHTML = '<span class="text-[10px] font-black bg-gradient-to-br from-[#00D4FF] via-[#4F46E5] to-[#7C3AED] bg-clip-text text-transparent">FW</span>';
              }}
            />
          </div>
        </div>
      </div>

      {/* Dashboard */}
      <SidebarBtn
        icon={<LayoutDashboard size={17} />}
        label="Dashboard"
        active={false}
        onClick={() => {/* Dashboard view — Backend integration pending */}}
      />

      {/* Divider */}
      <div className="w-7 h-px bg-fw-border/40 my-1.5" />

      {/* Workspace Icons */}
      <div className="flex flex-col items-center gap-0.5 w-full px-1.5">
        {WORKSPACES.map((ws) => (
          <button
            key={ws.id}
            onClick={() => setActiveWorkspace(ws.id)}
            title={ws.label}
            className={cn(
              'w-10 h-9 flex items-center justify-center rounded-md transition-all relative group',
              activeWorkspace === ws.id
                ? 'bg-fw-hover text-white'
                : 'text-fw-text-secondary hover:text-fw-text hover:bg-fw-hover/50'
            )}
          >
            {ws.icon}
            {activeWorkspace === ws.id && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full" style={{ backgroundColor: ws.color }} />
            )}
            <div className="absolute left-full ml-2 px-2 py-1 bg-[#1a1d28] border border-fw-border rounded text-[11px] text-fw-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl">
              {ws.label}
            </div>
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="w-7 h-px bg-fw-border/40 my-1.5" />

      {/* Tools */}
      <div className="flex flex-col items-center gap-0.5 w-full px-1.5">
        <SidebarBtn icon={<Search size={16} />} label="Search (Ctrl+K)" onClick={() => setSearchOpen(true)} />
        <SidebarBtn icon={<ScanLine size={16} />} label="Scanner" onClick={() => {}} />
        <SidebarBtn icon={<Bell size={16} />} label="Alerts" onClick={() => setBottomTab('alerts')} />
        <SidebarBtn icon={<BookOpen size={16} />} label="Journal" onClick={() => setBottomTab('journal')} />
        <SidebarBtn icon={<PieChart size={16} />} label="Analytics" onClick={() => setBottomTab('analytics')} />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Connection Status */}
      <div className="mb-2">
        <div className={cn(
          'w-8 h-8 flex items-center justify-center rounded-md',
          marketStatus === 'OPEN' ? 'text-emerald-400' : 'text-red-400'
        )} title={marketStatus === 'OPEN' ? 'Connected — Market Open' : 'Market Closed'}>
          {marketStatus === 'OPEN' ? <Wifi size={15} /> : <WifiOff size={15} />}
        </div>
      </div>

      {/* Settings */}
      <div className="pt-2 border-t border-fw-border/40 w-full flex justify-center">
        <SidebarBtn icon={<Settings size={16} />} label="Settings" onClick={() => {}} />
      </div>
    </div>
  );
}

function SidebarBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        'w-10 h-9 flex items-center justify-center rounded-md transition-all relative group',
        active ? 'bg-fw-hover text-white' : 'text-fw-text-secondary hover:text-fw-text hover:bg-fw-hover/50'
      )}
    >
      {icon}
      <div className="absolute left-full ml-2 px-2 py-1 bg-[#1a1d28] border border-fw-border rounded text-[11px] text-fw-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl">
        {label}
      </div>
    </button>
  );
}
