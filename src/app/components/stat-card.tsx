import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  iconColor?: string;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  trendUp = true,
  iconColor = "bg-[#2E7D32]/10 text-[#2E7D32]",
}: StatCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 ${iconColor} rounded-lg flex items-center justify-center`}>
          <Icon className="w-6 h-6" />
        </div>
        {trend && (
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              trendUp
                ? "text-[#66BB6A] bg-[#66BB6A]/10"
                : "text-red-500 bg-red-50"
            }`}
          >
            {trend}
          </span>
        )}
      </div>
      <h3 className="text-sm text-[#717182] mb-1">{title}</h3>
      <p className="text-2xl font-bold text-[#424242]">{value}</p>
    </div>
  );
}
