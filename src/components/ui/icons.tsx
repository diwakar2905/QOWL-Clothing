/** Thin-stroke icons re-exported from lucide with consistent sizing. */
export {
  Search, User, Heart, ShoppingBag, Menu, X, ArrowRight, ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Plus, Minus,
  Truck, RefreshCw, Ruler, Layers, Shirt, Scissors, Check, AlertTriangle, Info, Loader2, SlidersHorizontal, Eye, Trash2,
  Package, MapPin, LogOut, Pause, Play, ExternalLink, ArrowUpRight, Star, ZoomIn, Upload, GripVertical, Copy,
} from "lucide-react";

/** Four-point star ornament used in section headings (original geometric mark). */
export function Sparkle({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12 0c.6 6.2 5.8 11.4 12 12-6.2.6-11.4 5.8-12 12-.6-6.2-5.8-11.4-12-12C6.2 11.4 11.4 6.2 12 0z" />
    </svg>
  );
}
