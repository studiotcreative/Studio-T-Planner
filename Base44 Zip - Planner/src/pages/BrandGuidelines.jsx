import React from "react";
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
  const { loading } = useAuth(); // you can keep user/isAdmin/workspaceMemberships if you want later
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const urlParams = new URLSearchParams(window.location.search);
  const workspaceId = urlParams.get("workspace");

  const { data: workspace, isLoading: loadingWorkspace } = useQuery({
    queryKey: ["workspace", workspaceId],
    enabled: !!workspaceId && !loading,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("*")
        .eq("id", workspaceId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const { data: guidelines, isLoading: loadingGuidelines } = useQuery({
    queryKey: ["brandGuidelines", workspaceId],
    enabled: !!workspaceId && !loading,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_guidelines")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle(); // returns null if no row

      // if table has 0 rows for this workspace, maybeSingle() is clean
      if (error) throw error;
      return data ?? null;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (formData) => {
      const payload = { ...formData, workspace_id: workspaceId };

      // If guidelines exists, update. Otherwise insert.
      if (guidelines?.id) {
        const { data, error } = await supabase
          .from("brand_guidelines")
          .update(payload)
          .eq("id", guidelines.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("brand_guidelines")
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brandGuidelines", workspaceId] });
      toast.success("Brand guidelines saved successfully");
    },
    onError: (err) => {
      console.error("[BrandGuidelines] save error:", err);
      toast.error("Failed to save brand guidelines");
    },
  });

  if (!workspaceId) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No workspace selected</p>
          <Button
            onClick={() => navigate(createPageUrl("Workspaces"))}
            className="mt-4"
          >
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

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() =>
              navigate(createPageUrl(`WorkspaceDetails?id=${workspaceId}`))
            }
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
              <h1 className="text-3xl font-bold text-gray-900">
                Brand Guidelines
              </h1>
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
