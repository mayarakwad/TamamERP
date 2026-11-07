import {
  Baby,
  CircleEllipsis,
  Fuel,
  Gift,
  HeartPulse,
  PencilRuler,
  Receipt,
  ShoppingCart,
  Smartphone,
  Sofa,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "shopping-cart": ShoppingCart,
  utensils: Utensils,
  fuel: Fuel,
  receipt: Receipt,
  "pencil-ruler": PencilRuler,
  baby: Baby,
  "heart-pulse": HeartPulse,
  smartphone: Smartphone,
  sofa: Sofa,
  wrench: Wrench,
  gift: Gift,
  "circle-ellipsis": CircleEllipsis,
};

export function CategoryIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = ICONS[icon] ?? CircleEllipsis;
  return <Icon className={className} />;
}
