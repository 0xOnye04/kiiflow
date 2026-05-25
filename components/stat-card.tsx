import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  delta,
  icon: Icon
}: {
  label: string;
  value: string;
  delta: string;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <div className="mt-2 text-2xl font-semibold">{value}</div>
            <p className="mt-2 text-xs text-teal-200">{delta}</p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.08]">
            <Icon className="h-5 w-5 text-teal-200" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
