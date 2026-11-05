<script module>
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import Bot from '@lucide/svelte/icons/bot';
  import Brain from '@lucide/svelte/icons/brain';
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';
  import CircleX from '@lucide/svelte/icons/circle-x';
  import Clock from '@lucide/svelte/icons/clock';
  import Code from '@lucide/svelte/icons/code';
  import Compass from '@lucide/svelte/icons/compass';
  import Copy from '@lucide/svelte/icons/copy';
  import Download from '@lucide/svelte/icons/download';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import Eraser from '@lucide/svelte/icons/eraser';
  import Eye from '@lucide/svelte/icons/eye';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import FilePlus from '@lucide/svelte/icons/file-plus';
  import FileText from '@lucide/svelte/icons/file-text';
  import Flag from '@lucide/svelte/icons/flag';
  import GraduationCap from '@lucide/svelte/icons/graduation-cap';
  import Info from '@lucide/svelte/icons/info';
  import Key from '@lucide/svelte/icons/key';
  import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
  import Lightbulb from '@lucide/svelte/icons/lightbulb';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import MessageSquareQuote from '@lucide/svelte/icons/message-square-quote';
  import Monitor from '@lucide/svelte/icons/monitor';
  import Moon from '@lucide/svelte/icons/moon';
  import Network from '@lucide/svelte/icons/network';
  import PanelLeft from '@lucide/svelte/icons/panel-left';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Phone from '@lucide/svelte/icons/phone';
  import Pin from '@lucide/svelte/icons/pin';
  import PinOff from '@lucide/svelte/icons/pin-off';
  import Plus from '@lucide/svelte/icons/plus';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import Search from '@lucide/svelte/icons/search';
  import SendHorizontal from '@lucide/svelte/icons/send-horizontal';
  import Server from '@lucide/svelte/icons/server';
  import Settings from '@lucide/svelte/icons/settings';
  import SkipForward from '@lucide/svelte/icons/skip-forward';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import Square from '@lucide/svelte/icons/square';
  import Sun from '@lucide/svelte/icons/sun';
  import Terminal from '@lucide/svelte/icons/terminal';
  import Trash from '@lucide/svelte/icons/trash';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Upload from '@lucide/svelte/icons/upload';
  import User from '@lucide/svelte/icons/user';
  import Users from '@lucide/svelte/icons/users';
  import Wifi from '@lucide/svelte/icons/wifi';
  import WifiOff from '@lucide/svelte/icons/wifi-off';
  import X from '@lucide/svelte/icons/x';
  import Zap from '@lucide/svelte/icons/zap';
  import Mic from '@lucide/svelte/icons/mic';
  import MicOff from '@lucide/svelte/icons/mic-off';
  import Timer from '@lucide/svelte/icons/timer';
  import Maximize2 from '@lucide/svelte/icons/maximize-2';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import Gauge from '@lucide/svelte/icons/gauge';
  import Play from '@lucide/svelte/icons/play';

  /** Name → component registry. Add icons here so every import stays explicit and tree-shakeable. */
  export const ICONS = {
    'arrow-down': ArrowDown,
    'bot': Bot,
    'brain': Brain,
    'check': Check,
    'chevron-down': ChevronDown,
    'circle-check': CircleCheck,
    'circle-question-mark': CircleQuestionMark,
    'circle-x': CircleX,
    'clock': Clock,
    'code': Code,
    'compass': Compass,
    'copy': Copy,
    'download': Download,
    'ellipsis': Ellipsis,
    'eraser': Eraser,
    'eye': Eye,
    'eye-off': EyeOff,
    'file-plus': FilePlus,
    'file-text': FileText,
    'flag': Flag,
    'graduation-cap': GraduationCap,
    'info': Info,
    'key': Key,
    'layout-dashboard': LayoutDashboard,
    'lightbulb': Lightbulb,
    'loader-circle': LoaderCircle,
    'message-square': MessageSquare,
    'message-square-quote': MessageSquareQuote,
    'monitor': Monitor,
    'moon': Moon,
    'network': Network,
    'panel-left': PanelLeft,
    'pencil': Pencil,
    'phone': Phone,
    'pin': Pin,
    'pin-off': PinOff,
    'plus': Plus,
    'refresh-cw': RefreshCw,
    'rotate-ccw': RotateCcw,
    'search': Search,
    'send-horizontal': SendHorizontal,
    'server': Server,
    'settings': Settings,
    'skip-forward': SkipForward,
    'sliders-horizontal': SlidersHorizontal,
    'sparkles': Sparkles,
    'square': Square,
    'sun': Sun,
    'terminal': Terminal,
    'trash': Trash,
    'triangle-alert': TriangleAlert,
    'upload': Upload,
    'user': User,
    'users': Users,
    'wifi': Wifi,
    'wifi-off': WifiOff,
    'x': X,
    'zap': Zap,
    'mic': Mic,
    'mic-off': MicOff,
    'timer': Timer,
    'maximize-2': Maximize2,
    'chevron-right': ChevronRight,
    'book-open': BookOpen,
    'gauge': Gauge,
    play: Play,
  };
</script>

<script>
  /** @type {{ name: keyof typeof ICONS | string, size?: number, strokeWidth?: number, class?: string, spin?: boolean }} */
  let { name, size = 16, strokeWidth = 2, class: className = '', spin = false } = $props();
  const Component = $derived(ICONS[name] ?? ICONS['circle-question-mark']);
</script>

<Component {size} {strokeWidth} class={["ic-icon", className, spin && "ic-spin"]} aria-hidden="true" />

<style>
  :global(.ic-icon) {
    flex-shrink: 0;
  }
  :global(.ic-spin) {
    animation: ic-spin 0.9s linear infinite;
  }
  @keyframes -global-ic-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
