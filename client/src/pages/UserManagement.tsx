import { useState } from "react";
import WhipLayout from "@/components/WhipLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Users, ShieldCheck, User, Trash2, Clock, LogIn, Link2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const utils = trpc.useUtils();

  const { data: users, isLoading } = trpc.userManagement.list.useQuery();
  const { data: handlersList } = trpc.handlers.list.useQuery();

  const updateRoleMutation = trpc.userManagement.updateRole.useMutation({
    onSuccess: () => {
      utils.userManagement.list.invalidate();
      toast.success("Role updated");
    },
    onError: (e) => toast.error("Failed to update role: " + e.message),
  });

  const removeMutation = trpc.userManagement.remove.useMutation({
    onSuccess: () => {
      utils.userManagement.list.invalidate();
      toast.success("User removed");
    },
    onError: (e) => toast.error("Failed to remove user: " + e.message),
  });

  const linkToHandlerMutation = trpc.userManagement.linkToHandler.useMutation({
    onSuccess: () => {
      utils.userManagement.list.invalidate();
      toast.success("Handler profile linked");
    },
    onError: (e) => toast.error("Failed to link handler: " + e.message),
  });

  if (currentUser?.role !== "admin") {
    return (
      <WhipLayout>
        <div className="p-6 text-center text-muted-foreground">
          <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-semibold">Admin access required</p>
          <p className="text-sm mt-1">Only admins can manage users.</p>
        </div>
      </WhipLayout>
    );
  }

  const adminCount = (users ?? []).filter((u) => u.role === "admin").length;
  const userCount = (users ?? []).filter((u) => u.role === "user").length;
  const activeHandlers = (handlersList ?? []).filter((h) => h.active);

  return (
    <WhipLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#171b31] flex items-center gap-2">
              <Users className="w-6 h-6" />
              User Management
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage who can access the Whip IVR portal and their permission level.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="text-center">
              <div className="text-xl font-bold text-[#171b31]">{adminCount}</div>
              <div className="text-xs text-muted-foreground">Admins</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-[#171b31]">{userCount}</div>
              <div className="text-xs text-muted-foreground">Handlers</div>
            </div>
          </div>
        </div>

        {/* Info banner */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <strong>How it works:</strong> Users appear here after their first login. To grant someone access,
          have them log in via the Whip IVR portal — they'll be added as a <em>Handler</em> by default.
          Promote them to <em>Admin</em> using the role dropdown. Use the <strong>Handler Profile</strong> column
          to link their login to their Aircall profile so their call stats appear correctly.
        </div>

        {/* Users table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              All Users ({users?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading users…</div>
            ) : !users || users.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No users found. Users appear here after their first login.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Name</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Email</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Role</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Handler Profile</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Last Sign-In</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {users.map((u) => {
                      const isSelf = u.openId === currentUser?.openId;
                      const linkedHandler = activeHandlers.find((h) => h.id === u.handlerProfileId);
                      return (
                        <tr key={u.id} className={`hover:bg-muted/20 ${isSelf ? "bg-blue-50/40" : ""}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-[#171b31] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                                {(u.name ?? "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <span className="font-medium text-[#171b31]">{u.name ?? "—"}</span>
                                {isSelf && (
                                  <Badge className="ml-2 text-xs bg-blue-100 text-blue-700 border-blue-200 border">You</Badge>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{u.email ?? "—"}</td>
                          <td className="px-4 py-3">
                            <Select
                              value={u.role}
                              onValueChange={(role) => {
                                if (isSelf && role !== "admin") {
                                  toast.error("You cannot demote yourself");
                                  return;
                                }
                                updateRoleMutation.mutate({ userId: u.id, role: role as "user" | "admin" });
                              }}
                              disabled={updateRoleMutation.isPending}
                            >
                              <SelectTrigger className="h-7 w-28 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">
                                  <span className="flex items-center gap-1.5">
                                    <ShieldCheck className="w-3 h-3 text-[#ff6221]" />
                                    Admin
                                  </span>
                                </SelectItem>
                                <SelectItem value="user">
                                  <span className="flex items-center gap-1.5">
                                    <User className="w-3 h-3 text-muted-foreground" />
                                    Handler
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-4 py-3">
                            <Select
                              value={u.handlerProfileId?.toString() ?? "none"}
                              onValueChange={(val) => {
                                const handlerProfileId = val === "none" ? null : parseInt(val, 10);
                                linkToHandlerMutation.mutate({ userId: u.id, handlerProfileId });
                              }}
                              disabled={linkToHandlerMutation.isPending}
                            >
                              <SelectTrigger className="h-7 w-44 text-xs">
                                <SelectValue placeholder="Not linked" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">
                                  <span className="text-muted-foreground italic">Not linked</span>
                                </SelectItem>
                                {activeHandlers.map((h) => (
                                  <SelectItem key={h.id} value={h.id.toString()}>
                                    <span className="flex items-center gap-1.5">
                                      <Link2 className="w-3 h-3 text-[#ff6221]" />
                                      {h.name}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {linkedHandler && (
                              <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                                <Link2 className="w-3 h-3" />
                                Linked to {linkedHandler.name}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <LogIn className="w-3 h-3" />
                              {u.lastSignedIn
                                ? format(new Date(u.lastSignedIn), "MMM d, h:mm a")
                                : "Never"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {!isSelf && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remove {u.name ?? "this user"}?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will remove their access to the Whip IVR portal. They can regain access by logging in again (they'll be added as a Handler).
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-red-600 hover:bg-red-700 text-white"
                                      onClick={() => removeMutation.mutate({ userId: u.id })}
                                    >
                                      Remove
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Role guide */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-[#ff6221]" />
                <span className="font-semibold text-sm">Admin</span>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Full access to all pages and data</li>
                <li>• View all handler queues and metrics</li>
                <li>• Push QA scorecards to handler profiles</li>
                <li>• Manage users and roles</li>
                <li>• Access IVR setup and webhook config</li>
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="font-semibold text-sm">Handler</span>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Access to My Dashboard and personal queue</li>
                <li>• View and update assigned intake records</li>
                <li>• View own call history and QA scores</li>
                <li>• Use softphone (when available)</li>
                <li>• Cannot access admin-only pages</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Handler profile link guide */}
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Link2 className="w-4 h-4 text-amber-600" />
              <span className="font-semibold text-sm text-amber-800">About Handler Profile Links</span>
            </div>
            <p className="text-xs text-amber-700 leading-relaxed">
              Each user's login account needs to be linked to their handler profile so their call metrics, 
              intake records, and QA scores display correctly on their dashboard. When a user logs in for 
              the first time, the system tries to auto-link by matching their email address. If it doesn't 
              match automatically (e.g. different email), use the <strong>Handler Profile</strong> dropdown 
              above to link them manually. New hires like Daniel Giono will auto-link once they log in with 
              their <code>@drivewhip.com</code> email.
            </p>
          </CardContent>
        </Card>
      </div>
    </WhipLayout>
  );
}
