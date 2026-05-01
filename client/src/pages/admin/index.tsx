import { useQuery, useMutation } from "@tanstack/react-query";
import { Users, Database, ArrowRight, Settings, Upload, CheckCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminLayout } from "@/components/admin-layout";
import { Link } from "wouter";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface AdminStats {
  totalCustomers: number;
  totalJobs: number;
  totalQuotes: number;
  pendingApprovals: number;
  recentApprovals: number;
  lastImport: string | null;
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  isLoading,
  href 
}: { 
  title: string; 
  value: number | string; 
  icon: typeof Users;
  isLoading: boolean;
  href?: string;
}) {
  const content = (
    <Card className={href ? "hover-elevate cursor-pointer" : ""}>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <Skeleton className="h-8 w-20 mb-1" />
          ) : (
            <div className="text-2xl font-bold">{value}</div>
          )}
          <div className="text-sm text-muted-foreground">{title}</div>
        </div>
        {href && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} data-testid={`card-stat-${title.toLowerCase().replace(/\s+/g, '-')}`}>
        {content}
      </Link>
    );
  }

  return content;
}

interface ImportResult {
  success: boolean;
  jobsImported: number;
  accountsCreated: number;
  duplicatesSkipped: number;
  errorCount: number;
  errors: { row: number; message: string }[];
}

interface ImportError {
  message: string;
  hint?: string;
  foundColumns?: string[];
}

export default function AdminDashboard() {
  const { data: stats, isLoading, refetch } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
  });
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<ImportError | null>(null);

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      
      const response = await fetch("/api/admin/import-replace", {
        method: "POST",
        headers: {
          "X-Requested-By": "lvc-portal",
        },
        body: formData,
        credentials: "include",
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw data;
      }
      
      return data as ImportResult;
    },
    onSuccess: (result) => {
      setImportResult(result);
      setImportError(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({
        title: "Import successful",
        description: `Imported ${result.jobsImported} jobs${result.accountsCreated > 0 ? `, created ${result.accountsCreated} new accounts` : ''}`,
      });
      refetch();
    },
    onError: (error: ImportError) => {
      setImportError(error);
      setImportResult(null);
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImportResult(null);
      setImportError(null);
      importMutation.mutate(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-8 max-w-6xl">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Admin Overview</h1>
          <p className="text-muted-foreground mt-1">Manage customer accounts and system settings</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            title="Customer Accounts"
            value={stats?.totalCustomers ?? 0}
            icon={Users}
            isLoading={isLoading}
            href="/admin/accounts"
          />
          <StatCard
            title="Total Jobs"
            value={stats?.totalJobs ?? 0}
            icon={Database}
            isLoading={isLoading}
          />
          <StatCard
            title="Total Quotes"
            value={stats?.totalQuotes ?? 0}
            icon={Database}
            isLoading={isLoading}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Import Jobs Data</CardTitle>
              <CardDescription>
                Upload a CSV file to replace the current jobs dataset
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Required columns: <span className="font-medium">JobID, Account Code, Site Name, Portal Status</span></p>
                <p>Optional: Visit Date, Parts Due, Equipment, Allocated Engineer, Job Type, Total Job Value</p>
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
                data-testid="input-import-file"
              />
              
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={importMutation.isPending}
                className="w-full"
                data-testid="button-upload-csv"
              >
                {importMutation.isPending ? (
                  <>Importing...</>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload CSV File
                  </>
                )}
              </Button>

              {importResult && (
                <div className="p-3 rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-green-800 dark:text-green-200">Import complete</p>
                      <ul className="mt-1 text-green-700 dark:text-green-300 space-y-0.5">
                        <li>{importResult.jobsImported} jobs imported</li>
                        {importResult.accountsCreated > 0 && (
                          <li>{importResult.accountsCreated} new accounts created</li>
                        )}
                        {importResult.duplicatesSkipped > 0 && (
                          <li>{importResult.duplicatesSkipped} duplicate job IDs skipped</li>
                        )}
                        {importResult.errorCount > 0 && (
                          <li className="text-amber-600 dark:text-amber-400">{importResult.errorCount} rows had errors</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {importError && (
                <div className="p-3 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-red-800 dark:text-red-200">{importError.message}</p>
                      {importError.hint && (
                        <p className="mt-1 text-red-700 dark:text-red-300">{importError.hint}</p>
                      )}
                      {importError.foundColumns && (
                        <p className="mt-1 text-red-600 dark:text-red-400 text-xs">
                          Found columns: {importError.foundColumns.join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/admin/accounts">
                <Button variant="outline" className="w-full justify-start gap-3" data-testid="button-manage-accounts">
                  <Users className="h-4 w-4" />
                  Manage Accounts
                </Button>
              </Link>
              <Link href="/admin/settings">
                <Button variant="outline" className="w-full justify-start gap-3" data-testid="button-settings">
                  <Settings className="h-4 w-4" />
                  System Settings
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">System Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Data Source</span>
              <span className="font-medium">Protean Integration</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Support Email</span>
              <span className="font-medium">service@lvcuk.com</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Database</span>
              <span className="font-medium">PostgreSQL</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
