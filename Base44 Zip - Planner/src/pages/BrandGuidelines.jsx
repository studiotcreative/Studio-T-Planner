// Planner/src/pages/BrandGuidelines.jsx
import React, { useMemo } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import BrandGuidelinesForm from "@/components/brand/BrandGuidelinesForm";
import { Book, ArrowLeft } from "lucide-react";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function BrandGuidelines() {
  const { loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const urlParams = new URLSearchParams(window.location.search);
  const workspaceId = urlParams.get("workspace");

  // -----------------------------
  // Workspace (title only)
  // -----------------------------
  const { data: workspace, isLoading: loadingWorkspace } = useQuery({
    queryKey: ["workspace", workspaceId],
    enabled: !!workspaceId && !loading,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name, slug")
        .eq("id", workspaceId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  // -----------------------------
  // Brand Guidelines Row
  // Schema: id, workspace_id, data(jsonb), additional_notes(text), updated_by, created_at, updated_at
  // -----------------------------
  const { data: guidelinesRow, isLoading: loadingGuidelines } = useQuery({
    queryKey: ["brandGuidelinesRow", workspaceId],
    enabled: !!workspaceId && !loading,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_guidelines")
        .select("id, workspace_id, data, additional_notes, created_at, updated_at")
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (error) throw error;
      return data ?? null;
    },
  });

  // Flatten DB row -> what the form expects
  const guidelines = useMemo(() => {
    if (!guidelinesRow) return null;

    const saved = guidelinesRow.data ?? {};
    return {
      ...saved,
      additional_notes: guidelinesRow.additional_notes ?? "",
      // keep these harmlessly in case your form reads them
      id: guidelinesRow.id,
      workspace_id: guidelinesRow.workspace_id,
    };
  }, [guidelinesRow]);

  // -----------------------------
  // SAVE (UPSERT)
  // Writes:
  //   - additional_notes -> column
  //   - everything else -> data jsonb
  // -----------------------------
  const saveMutation = useMutation({
    mutationFn: async (formData) => {
      if (!workspaceId) throw new Error("Missing workspace id");

      const incoming = formData || {};

      // remove fields that should NOT go into jsonb
      const {
        additional_notes = "",
        id: _ignoreId,
        workspace_id: _ignoreWs,
        created_at: _ignoreCreated,
        updated_at: _ignoreUpdated,
        ...jsonFields
      } = incoming;

      const payload = {
        workspace_id: workspaceId,
        additional_notes: additional_notes ?? "",
        data: jsonFields, // ALL other form fields live here
        updated_at: new Date().toISOString(),
      };

      // Upsert ensures "create if missing / update if exists"
      const { data, error } = await supabase
        .from("brand_guidelines")
        .upsert(payload, { onConflict: "workspace_id" })
        .select("id, workspace_id, data, additional_notes, created_at, updated_at")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brandGuidelinesRow", workspaceId] });
      toast.success("Brand guidelines saved successfully");
    },
    onError: (err) => {
      console.error("[BrandGuidelines] save error:", err);
      toast.error(err?.message || "Failed to save brand guidelines");
    },
  });

  // -----------------------------
  // Guards
  // -----------------------------
  if (!workspaceId) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No workspace selected</p>
          <Button onClick={() => navigate(createPageUrl("Workspaces"))} className="mt-4">
            Go to Workspaces
          </Button>
        </div>
      </div>
    );
  }

  if (loading || loadingWorkspace || loadingGuidelines) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  // -----------------------------
  // UI
  // -----------------------------
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate(createPageUrl(`WorkspaceDetails?id=${workspaceId}`))}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Workspace
          </Button>

          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-purple-500 to-pink-500 p-3 rounded-xl">
              <Book className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Brand Guidelines</h1>
              <p className="text-gray-600">{workspace?.name}</p>
            </div>
          </div>
        </div>

        <BrandGuidelinesForm
          guidelines={guidelines}
          onSave={(data) => saveMutation.mutate(data)}
          loading={saveMutation.isPending}
        />
      </div>
    </div>
  );
}

