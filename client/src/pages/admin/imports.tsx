import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminLayout } from "@/components/admin-layout";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import type { ImportBatch } from "@shared/schema";

function DropZone({ 
  fileType, 
  onUpload, 
  isUploading 
}: { 
  fileType: "jobs" | "quotes" | "purchase_orders";
  onUpload: (file: File) => void;
  isUploading: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true);
    } else if (e.type === "dragleave") {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".csv") || file.name.endsWith(".xlsx"))) {
      onUpload(file);
    }
  }, [onUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
    e.target.value = "";
  }, [onUpload]);

  const labels = {
    jobs: "Jobs",
    quotes: "Quotes",
    purchase_orders: "Purchase Orders",
  };

  return (
    <div
      className={`
        relative border-2 border-dashed rounded-md h-48 flex flex-col items-center justify-center gap-4 transition-colors
        ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"}
        ${isUploading ? "opacity-50 pointer-events-none" : ""}
      `}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      data-testid={`dropzone-${fileType}`}
    >
      {isUploading ? (
        <>
          <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
          <p className="text-sm text-muted-foreground">Processing file...</p>
        </>
      ) : (
        <>
          <Upload className="h-10 w-10 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium">Drop your {labels[fileType]} file here</p>
            <p className="text-xs text-muted-foreground mt-1">CSV or Excel (XLSX) files supported</p>
          </div>
          <label>
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={handleFileSelect}
              className="sr-only"
            />
            <Button variant="outline" size="sm" className="pointer-events-none">
              Browse Files
            </Button>
          </label>
        </>
      )}
    </div>
  );
}

function ImportHistory({ batches, isLoading }: { batches: ImportBatch[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No imports yet</p>
      </div>
    );
  }

  return (
    <Accordion type="single" collapsible className="space-y-2">
      {batches.map((batch) => {
        const errors = batch.errors ? JSON.parse(batch.errors) : [];
        const hasErrors = errors.length > 0;
        
        return (
          <AccordionItem 
            key={batch.id} 
            value={batch.id} 
            className="border rounded-md px-4"
            data-testid={`import-batch-${batch.id}`}
          >
            <AccordionTrigger className="hover:no-underline py-3">
              <div className="flex items-center gap-4 flex-1 text-left">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{batch.fileName}</span>
                    <Badge variant="outline" className="text-xs">
                      {batch.fileType}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {format(new Date(batch.importedAt), "MMM d, yyyy 'at' h:mm a")}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">{batch.rowCount} rows</span>
                  {hasErrors ? (
                    <Badge variant="destructive" className="gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {batch.errorCount} errors
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                      <CheckCircle className="h-3 w-3" />
                      Success
                    </Badge>
                  )}
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {hasErrors ? (
                <div className="space-y-2 pb-4">
                  <p className="text-sm font-medium text-destructive">Import Errors:</p>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {errors.map((error: { row: number; message: string }, i: number) => (
                      <div key={i} className="text-xs p-2 bg-destructive/10 rounded">
                        <span className="font-medium">Row {error.row}:</span> {error.message}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground pb-4">
                  All {batch.rowCount} rows imported successfully.
                </p>
              )}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

export default function AdminImportsPage() {
  const { toast } = useToast();
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  const { data: batches, isLoading } = useQuery<ImportBatch[]>({
    queryKey: ["/api/admin/imports"],
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, type }: { file: File; type: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);

      const response = await fetch("/api/admin/imports", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Upload failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/imports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/system/last-import"] });
      toast({
        title: "Import Complete",
        description: `Successfully imported ${data.rowCount} rows${data.errorCount > 0 ? ` with ${data.errorCount} errors` : ""}`,
      });
      setUploadingType(null);
    },
    onError: (error) => {
      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
      setUploadingType(null);
    },
  });

  const handleUpload = (file: File, type: "jobs" | "quotes" | "purchase_orders") => {
    setUploadingType(type);
    uploadMutation.mutate({ file, type });
  };

  return (
    <AdminLayout>
      <div className="space-y-8 max-w-4xl">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Data Imports</h1>
          <p className="text-muted-foreground mt-1">Upload CSV or Excel files to import jobs, quotes, and purchase orders</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-base font-medium">Download Templates</CardTitle>
                <CardDescription>Use these templates to format your data correctly</CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap">
                <a href="/api/admin/templates/jobs" download>
                  <Button variant="outline" size="sm" data-testid="button-download-jobs-template">
                    <Download className="mr-2 h-4 w-4" />
                    Jobs Template
                  </Button>
                </a>
                <a href="/api/admin/templates/quotes" download>
                  <Button variant="outline" size="sm" data-testid="button-download-quotes-template">
                    <Download className="mr-2 h-4 w-4" />
                    Quotes Template
                  </Button>
                </a>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Upload Data</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="jobs">
              <TabsList className="mb-4">
                <TabsTrigger value="jobs" data-testid="tab-jobs">Jobs</TabsTrigger>
                <TabsTrigger value="quotes" data-testid="tab-quotes">Quotes</TabsTrigger>
                <TabsTrigger value="purchase_orders" data-testid="tab-po">Purchase Orders</TabsTrigger>
              </TabsList>
              
              <TabsContent value="jobs">
                <DropZone 
                  fileType="jobs" 
                  onUpload={(file) => handleUpload(file, "jobs")}
                  isUploading={uploadingType === "jobs"}
                />
                <div className="mt-4 text-xs text-muted-foreground">
                  <p className="font-medium mb-1">Required columns:</p>
                  <p>job_id, account_code, site_name, status, created_date, last_updated_date, short_description</p>
                </div>
              </TabsContent>

              <TabsContent value="quotes">
                <DropZone 
                  fileType="quotes" 
                  onUpload={(file) => handleUpload(file, "quotes")}
                  isUploading={uploadingType === "quotes"}
                />
                <div className="mt-4 text-xs text-muted-foreground">
                  <p className="font-medium mb-1">Required columns:</p>
                  <p>quote_id, account_code, quote_status, net_total, vat_total, gross_total, quote_date</p>
                </div>
              </TabsContent>

              <TabsContent value="purchase_orders">
                <DropZone 
                  fileType="purchase_orders" 
                  onUpload={(file) => handleUpload(file, "purchase_orders")}
                  isUploading={uploadingType === "purchase_orders"}
                />
                <div className="mt-4 text-xs text-muted-foreground">
                  <p className="font-medium mb-1">Required columns:</p>
                  <p>po_id, account_code, po_status</p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Import History</CardTitle>
          </CardHeader>
          <CardContent>
            <ImportHistory batches={batches ?? []} isLoading={isLoading} />
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
