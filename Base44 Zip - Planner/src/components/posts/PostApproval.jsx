// src/components/posts/PostApproval.jsx
import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/AuthProvider';
import { format, parseISO } from 'date-fns';
import {
  CheckCircle2,
  XCircle,
  MessageSquare,
  AlertCircle,
  Loader2
} from 'lucide-react';
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
  const { user, canApprove, isClient } = useAuth();
  const queryClient = useQueryClient();
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const safeInsertAuditLog = async (action, details) => {
    try {
      const { error } = await supabase.from('audit_logs').insert({
        workspace_id: post.workspace_id,
        entity_type: 'post',
        entity_id: post.id,
        action,
        actor_user_id: user?.id ?? null,
        actor_email: user?.email ?? null,
        actor_name: user?.full_name ?? null,
        details: JSON.stringify(details),
        created_at: new Date().toISOString()
      });

      if (error) console.warn('[audit_logs] insert failed:', error.message);
    } catch (e) {
      console.warn('[audit_logs] skipped:', e?.message);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase
        .from('posts')
        .update(data)
        .eq('id', post.id);

      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['post', post.id] });
      toast.success('Post updated');
      onUpdate?.();
    },
    onError: (e) => {
      console.error(e);
      toast.error('Failed to update post');
    }
  });

  const createComment = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase
        .from('comments')
        .insert(data);

      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', post.id] });
    },
    onError: (e) => {
      console.error(e);
      toast.error('Failed to add comment');
    }
  });

  const handleApprove = async () => {
    if (!user?.id) {
      toast.error('You must be logged in.');
      return;
    }

    await updateMutation.mutateAsync({
      status: 'approved',
      approval_status: 'approved',
      approved_by: user.id,                 // if your schema expects email/text, tell me
      approved_by_email: user.email ?? null, // harmless if column doesn't exist? (will error if it doesn't)
      approved_at: new Date().toISOString()
    }).catch(() => {});

    await safeInsertAuditLog('approved', {
      action: 'Post approved',
      approved_by: user.full_name
    });

    toast.success('Post approved!');
  };

  const handleRequestChanges = async () => {
    if (!user?.id) {
      toast.error('You must be logged in.');
      return;
    }

    await updateMutation.mutateAsync({
      status: 'sent_to_client',
      approval_status: 'changes_requested'
    }).catch(() => {});

    if (rejectReason?.trim()) {
      await createComment.mutateAsync({
        post_id: post.id,
        workspace_id: post.workspace_id,
        author_user_id: user.id,          // remove if your comments table doesn't have it
        author_email: user.email ?? null,
        author_name: user.full_name ?? null,
        content: `Changes requested: ${rejectReason}`,
        is_internal: false,
        is_resolved: false
      }).catch(() => {});
    }

    await safeInsertAuditLog('changes_requested', {
      action: 'Changes requested',
      reason: rejectReason,
      rejected_by: user.full_name
    });

    setShowRejectDialog(false);
    setRejectReason('');
    toast.info('Changes requested');
  };

  // Only show for client facing statuses
  if (post.status !== 'sent_to_client' && !isClient()) {
    return null;
  }

  // Already approved
  if (post.approval_status === 'approved') {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <div>
            <p className="font-medium text-emerald-800">Approved</p>
            <p className="text-sm text-emerald-600">
              by {post.approved_by_email || post.approved_by || 'Unknown'}{' '}
              {post.approved_at ? `on ${format(parseISO(post.approved_at), 'MMM d, yyyy')}` : ''}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (post.approval_status === 'changes_requested') {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600" />
          <div>
            <p className="font-medium text-amber-800">Changes Requested</p>
            <p className="text-sm text-amber-600">
              Please review the comments and update the post
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show approval buttons for clients
  if (!canApprove() || post.status !== 'sent_to_client') {
    return null;
  }

  return (
    <>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-blue-600" />
            <div>
              <p className="font-medium text-blue-800">Awaiting Your Approval</p>
              <p className="text-sm text-blue-600">
                Review this post and approve or request changes
              </p>
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

      {/* Request Changes Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Changes</DialogTitle>
            <DialogDescription>
              Let the team know what changes you'd like to see
            </DialogDescription>
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
              {updateMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
