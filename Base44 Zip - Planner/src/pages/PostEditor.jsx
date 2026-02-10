// src/pages/PostEditor.jsx
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { supabase } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/AuthProvider";
import { ArrowLeft, Copy, Download, CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import PostForm from "@/components/posts/PostForm";
import PostComments from "@/components/posts/PostComments";
import PostApproval from "@/components/posts/PostApproval";
import StatusBadge from "@/components/ui/StatusBadge";
import PlatformIcon from "@/components/ui/PlatformIcon";

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "wait_for_approval", label: "Waiting for Approval" },
  { value: "changes_requested", label: "Changes Requested" },
  { value: "ready_to_post", label: "Ready to Post" },
  { value: "completed", label: "Completed" },
];

export default function PostEditor() {
  const navigate = useNavigate();
  const auth = useAuth();
  const queryClient = useQueryClient();

  // Normalize isClient (some versions are boolean vs function)
  const isClientFn = useMemo(() => {
    if (typeof auth?.isClient === "function") return auth.isClient;
    return () => !!auth?.isClient;
  }, [auth]);

  const user = auth?.user;

  const urlParams = new URLSearchParams(window.location.search);
  const postId = urlParams.get("id");
  const initialDate = urlParams.get("date");

  // ----------------------------
  // Load post (edit mode)
  // ----------------------------
  const { data: post, isLoading: loadingPost } = useQuery({
    queryKey: ["post", postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("id", postId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  // ----------------------------
  // Accounts + Workspaces (used for header display + validation)
  // NOTE: This does NOT change UI dropdowns inside PostForm yet.
  // We'll fix the actual dropdown in PostForm next.
  // ----------------------------
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    enabled: !auth?.loading,
    queryFn: async () => {
      const { data, error } = await supabase.from("social_accounts").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: workspaces = [] } = useQuery({
    queryKey: ["workspaces"],
    enabled: !auth?.loading,
    queryFn: async () => {
      const { data, error } = await supabase.from("workspaces").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  // ----------------------------
  // Mutations
  // ----------------------------
  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const { data: created, error } = await supabase
        .from("posts")
        .insert(payload)
        .select("*")
        .single();

      if (error) throw error;
      return created;
    },
    onSuccess: (newPost) => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Post created");
      navigate(createPageUrl(`PostEditor?id=${newPost.id}`));
    },
    onError: (e) => {
      console.error(e);
      toast.error(e?.message || "Failed to create post");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from("posts").update(payload).eq("id", postId);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["post", postId] });
      toast.success("Post updated");
    },
    onError: (e) => {
      console.error(e);
      toast.error(e?.message || "Failed to update post");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("posts").delete().eq("id", id);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Post deleted");
      navigate(createPageUrl("Calendar"));
    },
    onError: (e) => {
      console.error(e);
      toast.error(e?.message || "Failed to delete post");
    },
  });

  // ✅ Team status mutation (DB-enforced)
  const statusMutation = useMutation({
    mutationFn: async (nextStatus) => {
      if (!postId) throw new Error("Missing post id");

      const { data, error } = await supabase.rpc("rpc_set_post_status", {
        p_post_id: postId,
        p_next_status: nextStatus,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["post", postId] });
      toast.success("Status updated");
    },
    onError: (e) => {
      console.error(e);
      toast.error(e?.message || "Failed to update status");
    },
  });

  // ----------------------------
  // Save / Delete handlers
  // ----------------------------
  const handleSave = (formData) => {
    if (!user?.id) {
      toast.error("You must be logged in to save.");
      return;
    }

    // ✅ SAFETY FIX:
    // If a social account is selected, force workspace_id to match that account.
    // And block save if mismatch.
    const selectedAccountId = formData?.social_account_id || null;
    const selectedWorkspaceId = formData?.workspace_id || null;

    if (!selectedAccountId) {
      toast.error("Please select a social account.");
      return;
    }

    const acct = accounts.find((a) => a.id === selectedAccountId);
    if (!acct) {
      toast.error("Selected social account not found.");
      return;
    }

    // If the form has a workspace selected and it doesn't match the account, block save.
    if (selectedWorkspaceId && acct.workspace_id && selectedWorkspaceId !== acct.workspace_id) {
      toast.error("Workspace and social account do not match. Please re-select.");
      return;
    }

    // Force correct workspace_id from the selected account (source of truth)
    const payload = {
      ...formData,
      workspace_id: acct.workspace_id,
    };

    if (postId) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate({
        status: "draft",
        ...payload,
        created_by: user.id,
      });
    }
  };

  const handleDelete = () => {
    if (!postId) return;
    if (confirm("Are you sure you want to delete this post?")) {
      deleteMutation.mutate(postId);
    }
  };

  const safeInsertAuditLog = async (payload) => {
    try {
      const { error } = await supabase.from("audit_logs").insert(payload);
      if (error) console.warn("[audit_logs] insert blocked/failed:", error.message);
    } catch (e) {
      console.warn("[audit_logs] insert skipped:", e?.message);
    }
  };

  const handleMarkCompleted = async () => {
    if (!user?.id) {
      toast.error("You must be logged in.");
      return;
    }
    if (!postId || !post) return;

    await statusMutation.mutateAsync("completed");

    await safeInsertAuditLog({
      workspace_id: post.workspace_id,
      entity_type: "post",
      entity_id: postId,
      action: "completed",
      actor_user_id: user.id,
      actor_email: user.email ?? null,
      actor_name: user.full_name ?? null,
      details: JSON.stringify({ action: "Marked as completed" }),
      created_at: new Date().toISOString(),
    });

    toast.success("Post marked as completed!");
  };

  const copyAll = async () => {
    if (!post) return;
    const text = [post.caption, "", post.hashtags, "", post.first_comment ? `First Comment: ${post.first_comment}` : ""]
      .filter(Boolean)
      .join("\n");

    await navigator.clipboard.writeText(text);
    toast.success("All content copied!");
  };

  const downloadAllAssets = () => {
    if (!post?.asset_urls?.length) return;

    post.asset_urls.forEach((url, i) => {
      setTimeout(() => {
        const link = document.createElement("a");
        link.href = url;
        link.download = `asset-${i + 1}`;
        link.click();
      }, i * 500);
    });

    toast.success("Downloading assets...");
  };

  // Header context (edit mode)
  const headerAccount = accounts.find((a) => a.id === post?.social_account_id);
  const headerWorkspace = workspaces.find((w) => w.id === post?.workspace_id);

  if (loadingPost && postId) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Skeleton className="h-8 w-48 mb-8" />
        <Skeleton className="h-[600px] w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {postId ? "Edit Post" : "New Post"}
            </h1>

            {post && headerAccount && (
              <div className="flex items-center gap-2 mt-1">
                <PlatformIcon platform={post.platform} size="sm" />
                <span className="text-slate-500">@{headerAccount.handle}</span>
                {headerWorkspace && <span className="text-slate-400">• {headerWorkspace.name}</span>}
              </div>
            )}
          </div>
        </div>

        {post && (
          <div className="flex items-center gap-3">
            <StatusBadge status={post.status} />

            {/* Team status control (clients read-only) */}
            {!isClientFn() && (
              <Select
                value={post.status ?? "draft"}
                onValueChange={(v) => statusMutation.mutate(v)}
                disabled={statusMutation.isPending}
              >
                <SelectTrigger className="w-[220px] bg-white">
                  <SelectValue placeholder="Change status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Actions only when READY_TO_POST */}
            {!isClientFn() && post.status === "ready_to_post" && (
              <>
                <Button variant="outline" onClick={copyAll}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy All
                </Button>

                {post.asset_urls?.length > 0 && (
                  <Button variant="outline" onClick={downloadAllAssets}>
                    <Download className="w-4 h-4 mr-2" />
                    Download Assets
                  </Button>
                )}

                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={handleMarkCompleted}
                  disabled={statusMutation.isPending}
                >
                  {statusMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCheck className="w-4 h-4 mr-2" />
                  )}
                  Mark Completed
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {post && <PostApproval post={post} />}

          <PostForm
            post={post}
            onSave={handleSave}
            onDelete={handleDelete}
            initialDate={initialDate}
            isLoading={createMutation.isPending || updateMutation.isPending}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {post?.asset_urls?.[0] && (
            <div className="bg-white rounded-xl border border-slate-200/60 p-6">
              <h3 className="text-sm font-medium text-slate-700 mb-4">Preview</h3>
              <div className="aspect-square rounded-lg overflow-hidden bg-slate-100">
                {post.asset_types?.[0] === "video" ? (
                  <video src={post.asset_urls[0]} controls className="w-full h-full object-cover" />
                ) : (
                  <img src={post.asset_urls[0]} alt="" className="w-full h-full object-cover" />
                )}
              </div>
            </div>
          )}

          {postId && <PostComments postId={postId} workspaceId={post?.workspace_id} />}
        </div>
      </div>
    </div>
  );
}



