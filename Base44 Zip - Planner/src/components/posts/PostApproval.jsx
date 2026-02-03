// src/components/posts/PostApproval.jsx
import React, { useMemo, useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";
import { format, parseISO } from "date-fns";
import { CheckCircle2, XCircle, MessageSquare, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export default function PostApproval({ post, onUpdate }) {
  const auth = useAuth();
  const queryClient = useQueryClient();

  // Normalize auth helpers (some versions expose functions vs booleans)
  const isClientFn = useMemo(() => {
    if (typeof auth?.isClient === "function") return auth.isClient;
    return () => !!auth?.isClient;
  }, [auth]);

  const canApproveFn = useMemo(() => {
    if (typeof auth?.canApprove === "function") return auth.canApprove;
    return () => !!auth?.canApprove;
  }, [auth]);

  const user = auth?.user;

  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // ✅ Only clients should see this component
  if (!isClientFn()) return null;

  // We only care about these client-visible states
  const isAwaitingApproval = post?.status === "wait_for_approval";
  const isChangesRequested = post?.status === "changes_requested";
  const isReadyToPost = post?.status === "ready_to_post";
  const isCompleted = post?.status === "completed";

  // If post is draft, clients should not see approval UI at all.
  if (post?.status === "draft") return null;

  const safeInsertAuditLog = async (action, details) => {
    try {
      const { error } = await supabase.from("audit_logs").insert({
        workspace_id: post.workspace_id,
        entity_type: "post",
        entity_id: post.id,
        action,
        actor_user_id: user?.id ?? null,
        actor_email: user?.email ?? null,
        actor_name: user?.full_name ?? null,
        details: JSON.stringify(details),
        created_at: new Date().toISOString(),
      });

      if (error) console.warn("[audit_logs] insert failed:", error.message);
    } catch (e) {
      console.warn("[audit_logs] skipped:", e?.message);
    }
  };

  const updateMutation = useMutation({
  mutationFn: async ({ decision, comment }) => {
    const { data, error } = await supabase.rpc("rpc_client_decide_post", {
      p_post_id: post.id,
      p_decision: decision, // 'approve' | 'request_changes'
      p_comment: comment ?? null,
    });

    if (error) throw error;
    return data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["posts"] });
    queryClient.invalidateQueries({ queryKey: ["post", post.id] });
    toast.success("Post updated");
    onUpdate?.();
  },
  onError: (e) => {
    console.error(e);
    toast.error(e?.message || "Failed to update post");
  },
});

  // Best-effort comment insert that works even if your comments schema differs.
  const safeCreateComment = async (content) => {
    if (!content?.trim()) return;

    // Attempt #1: rich schema (if your comments table has workspace_id/is_internal/etc.)
    try {
      const { error } = await supabase.from("comments").insert({
        post_id: post.id,
        workspace_id: post.workspace_id,
        author_id: user?.id ?? null,
        content,
        is_internal: false,
        is_resolved: false,
        created_at: new Date().toISOString(),
      });

      if (!error) {
        queryClient.invalidateQueries({ queryKey: ["comments", post.id] });
        return;
      }

      // If error, fall through to attempt #2
      console.warn("[comments] rich insert failed:", error.message);
    } catch (e) {
      console.warn("[comments] rich insert exception:", e?.message);
    }

    // Attempt #2: minimal schema (post_id, author_id, content)
    try {
      const { error } = await supabase.from("comments").insert({
        post_id: post.id,
        author_id: user?.id ?? null,
        content,
      });

      if (error) {
        console.warn("[comments] minimal insert failed:", error.message);
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["comments", post.id] });
    } catch (e) {
      console.warn("[comments] minimal insert exception:", e?.message);
    }
  };

  const handleApprove = async () => {
    if (!user?.id) {
      toast.error("You must be logged in.");
      return;
    }
    if (!isAwaitingApproval) {
      toast.error("This post is not awaiting approval.");
      return;
    }

    await updateMutation
      .mutateAsync({
        status: "ready_to_post",
        approval_status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .catch(() => {});

    await safeInsertAuditLog("approved", {
      action: "Client approved post",
      approved_by: user.full_name ?? user.email ?? user.id,
    });

    toast.success("Approved! Post is now Ready to Post.");
  };

  const handleRequestChanges = async () => {
    if (!user?.id) {
      toast.error("You must be logged in.");
      return;
    }
    if (!isAwaitingApproval) {
      toast.error("This post is not awaiting approval.");
      return;
    }

    await updateMutation
      .mutateAsync({
        status: "changes_requested",
        approval_status: "changes_requested",
      })
      .catch(() => {});

    if (rejectReason?.trim()) {
      await safeCreateComment(`Client requested changes: ${rejectReason.trim()}`);
    }

    await safeInsertAuditLog("changes_requested", {
      action: "Client requested changes",
      reason: rejectReason,
      by: user.full_name ?? user.email ?? user.id,
    });

    setShowRejectDialog(false);
    setRejectReason("");
    toast.info("Changes requested");
  };

  // ✅ Client “status cards” (always visible when relevant)
  if (isReadyToPost || (post?.approval_status === "approved" && post?.approved_at)) {
    let approvedDate = "";
    try {
      approvedDate = post?.approved_at ? format(parseISO(post.approved_at), "MMM d, yyyy") : "";
    } catch {
      approvedDate = "";
    }

    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <div>
            <p className="font-medium text-emerald-800">Approved</p>
            <p className="text-sm text-emerald-600">
              {post?.approved_by ? `Approved by team • ` : ""}{approvedDate ? `on ${approvedDate}` : ""}
            </p>
            <p className="text-sm text-emerald-600 mt-1">
              Status: <span className="font-medium">Ready to Post</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-700" />
          <div>
            <p className="font-medium text-green-900">Completed</p>
            <p className="text-sm text-green-700">This post has been completed.</p>
          </div>
        </div>
      </div>
    );
  }

  if (isChangesRequested) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600" />
          <div>
            <p className="font-medium text-amber-800">Changes Requested</p>
            <p className="text-sm text-amber-600">Please review the comments and update the post.</p>
          </div>
        </div>
      </div>
    );
  }

  // ✅ Approval buttons ONLY when client can approve AND post is waiting_for_approval
  if (!canApproveFn() || !isAwaitingApproval) {
    return null;
  }

  return (
    <>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-blue-600" />
            <div>
              <p className="font-medium text-blue-800">Awaiting Your Approval</p>
              <p className="text-sm text-blue-600">Approve or request changes.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={() => setShowRejectDialog(true)}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Request Changes
            </Button>

            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleApprove}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Approve
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Changes</DialogTitle>
            <DialogDescription>Tell the team what changes you want.</DialogDescription>
          </DialogHeader>

          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Describe the changes needed..."
            className="min-h-[120px]"
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRequestChanges}
              disabled={updateMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
