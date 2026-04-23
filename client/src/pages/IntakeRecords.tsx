import { useState, useMemo } from "react";
import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";
import {
  Search,
  PhoneIncoming,
  Building2,
  Scale,
  Stethoscope,
  User,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";

const CALLER_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  carrier: { label: "Carrier", icon: Building2, color: "bg-blue-100 text-blue-700" },
  law_office: { label: "Law Office", icon: Scale, color: "bg-purple-100 text-purple-700" },
  medical_provider: { label: "Medical", icon: Stethoscope, color: "bg-green-100 text-green-700" },
  member: { label: "Member", icon: User, color: "bg-orange-100 text-orange-700" },
  claimant: { label: "Claimant", icon: User, color: "bg-yellow-100 text-yellow-700" },
  police: { label: "Police", icon: User, color: "bg-red-100 text-red-700" },
  wrong_department: { label: "Wrong Dept", icon: HelpCircle, color: "bg-gray-100 text-gray-600" },
  unknown: { label: "Unknown", icon: HelpCircle, color: "bg-gray-100 text-gray-600" },
};

const SOURCE_LABELS: Record<string, string> = {
  ai_ivr: "AI IVR",
  voicemail: "Voicemail",
  manual: "Manual",
};

const PAGE_SIZE = 20;

export default function IntakeRecords() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(0);

  // Debounce search
  useMemo(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, refetch } = trpc.intake.list.useQuery({
    search: debouncedSearch || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
    callerType: typeFilter === "all" ? undefined : typeFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const updateMutation = trpc.intake.update.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Record updated");
    },
    onError: () => toast.error("Failed to update record"),
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <WhipLayout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#171b31]">Intake Records</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {data?.total ?? 0} total records
            </p>
          </div>
          <Link href="/intake/new">
            <Button className="bg-[#ff6221] hover:bg-[#e5541a] text-white gap-2">
              <PlusCircle className="w-4 h-4" />
              New Intake
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search name, org, claim number, phone..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as "all" | "open" | "closed");
              setPage(0);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={typeFilter}
            onValueChange={(v) => {
              setTypeFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Caller Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="carrier">Carrier</SelectItem>
              <SelectItem value="law_office">Law Office</SelectItem>
              <SelectItem value="medical_provider">Medical Provider</SelectItem>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="claimant">Claimant</SelectItem>
              <SelectItem value="police">Police</SelectItem>
              <SelectItem value="wrong_department">Wrong Dept</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading records...</div>
            ) : data?.records.length === 0 ? (
              <div className="p-12 text-center">
                <PhoneIncoming className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">No records found.</p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Caller</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Whip Claim #</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Type</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Handler</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Source</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Status</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Date</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data?.records.map((record) => {
                        const cfg = CALLER_TYPE_CONFIG[record.callerType] ?? CALLER_TYPE_CONFIG.unknown;
                        const Icon = cfg.icon;
                        return (
                          <tr key={record.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                                  <Icon className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                  <div className="font-medium text-[#171b31]">
                                    {record.callerName || "—"}
                                  </div>
                                  {record.organization && (
                                    <div className="text-xs text-muted-foreground">{record.organization}</div>
                                  )}
                                  {record.callerPhone && (
                                    <div className="text-xs text-muted-foreground">{record.callerPhone}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {record.whipClaimNumber ? (
                                <span className="font-mono text-xs bg-[#171b31]/8 text-[#171b31] px-2 py-0.5 rounded">
                                  {record.whipClaimNumber}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={`text-xs ${cfg.color} border-0`}>
                                {cfg.label}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {record.assignedHandler || "—"}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs text-muted-foreground">
                                {SOURCE_LABELS[record.source] ?? record.source}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <Select
                                value={record.status}
                                onValueChange={(v) =>
                                  updateMutation.mutate({
                                    id: record.id,
                                    status: v as "open" | "closed",
                                  })
                                }
                              >
                                <SelectTrigger className={`h-7 w-24 text-xs border-0 ${
                                  record.status === "open"
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-green-50 text-green-700"
                                }`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="open">Open</SelectItem>
                                  <SelectItem value="closed">Closed</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(record.createdAt), "MMM d, h:mm a")}
                            </td>
                            <td className="px-4 py-3">
                              <Link href={`/intake/${record.id}`}>
                                <Button variant="ghost" size="sm" className="h-7 text-xs">
                                  View
                                </Button>
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile list */}
                <div className="md:hidden divide-y">
                  {data?.records.map((record) => {
                    const cfg = CALLER_TYPE_CONFIG[record.callerType] ?? CALLER_TYPE_CONFIG.unknown;
                    const Icon = cfg.icon;
                    return (
                      <Link key={record.id} href={`/intake/${record.id}`}>
                        <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 cursor-pointer">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {record.callerName || record.callerPhone || "Unknown"}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {record.organization || cfg.label} ·{" "}
                              {formatDistanceToNow(new Date(record.createdAt), { addSuffix: true })}
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className={`text-xs flex-shrink-0 ${
                              record.status === "open"
                                ? "border-amber-300 text-amber-700 bg-amber-50"
                                : "border-green-300 text-green-700 bg-green-50"
                            }`}
                          >
                            {record.status}
                          </Badge>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data?.total ?? 0)} of{" "}
              {data?.total ?? 0}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </WhipLayout>
  );
}
