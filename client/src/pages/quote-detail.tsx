import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { ArrowLeft, Calendar, FileText, CheckCircle, Clock, User, Mail, MessageCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerLayout } from "@/components/customer-layout";
import { StatusBadge } from "@/components/status-badge";
import { useCustomerPortal } from "@/lib/customer-portal";
import { format } from "date-fns";
import type { Quote, ApprovalEvent } from "@shared/schema";

const SUPPORT_EMAIL = "service@lvcuk.com";

interface QuoteDetailResponse {
  quote: Quote;
  approvalEvents: ApprovalEvent[];
}

function ApprovalTimeline({ events }: { events: ApprovalEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <Clock className="h-4 w-4" />
        Approval History
      </h3>
      <div className="space-y-3">
        {events.map((event) => (
          <div 
            key={event.id} 
            className="flex items-start gap-3 p-3 rounded-md bg-muted/50"
            data-testid={`approval-event-${event.id}`}
          >
            <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{event.approverName}</span>
                <span className="text-xs text-muted-foreground">approved this quote</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {format(new Date(event.capturedAt), "MMM d, yyyy 'at' h:mm a")}
              </div>
              {event.customerPoNumber && (
                <div className="text-xs mt-1">
                  PO: <span className="font-medium">{event.customerPoNumber}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function createMailtoLink(action: 'approve' | 'query', quote: Quote): string {
  const subject = action === 'approve' 
    ? `Quote Approval: ${quote.quoteId}`
    : `Quote Query: ${quote.quoteId}`;
  
  const body = action === 'approve'
    ? `Hi LVC Team,

I would like to approve the following quote:

Quote ID: ${quote.quoteId}
${quote.jobId ? `Job ID: ${quote.jobId}` : ''}
Quote Date: ${format(new Date(quote.quoteDate), "MMMM d, yyyy")}
Amount: £${Number(quote.grossTotal).toLocaleString("en-GB", { minimumFractionDigits: 2 })}

My Details:
Name: [Please enter your name]
PO Number: [Please enter your PO number if applicable]

I confirm approval and authorize the work to proceed as quoted.

Best regards`
    : `Hi LVC Team,

I have a query about the following quote:

Quote ID: ${quote.quoteId}
${quote.jobId ? `Job ID: ${quote.jobId}` : ''}
Quote Date: ${format(new Date(quote.quoteDate), "MMMM d, yyyy")}
Amount: £${Number(quote.grossTotal).toLocaleString("en-GB", { minimumFractionDigits: 2 })}

My question:
[Please describe your query here]

Best regards`;

  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function QuoteDetailPage() {
  const portal = useCustomerPortal();
  const { quoteId } = useParams<{ quoteId: string }>();

  const { data, isLoading, error } = useQuery<QuoteDetailResponse>({
    queryKey: [portal.api.quoteDetail(quoteId), portal.accountParams],
  });

  if (isLoading) {
    return (
      <CustomerLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-64 w-full" />
            </div>
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </CustomerLayout>
    );
  }

  if (error || !data?.quote) {
    return (
      <CustomerLayout>
        <div className="text-center py-16">
          <h2 className="text-xl font-semibold mb-2">Quote Not Found</h2>
          <p className="text-muted-foreground mb-4">The quote you're looking for doesn't exist or you don't have access.</p>
          <Link href={portal.routes.quotes}>
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Quotes
            </Button>
          </Link>
        </div>
      </CustomerLayout>
    );
  }

  const { quote, approvalEvents } = data;
  const isAwaitingApproval = quote.quoteStatus.toLowerCase().includes("awaiting") || 
                              quote.quoteStatus.toLowerCase().includes("pending");

  return (
    <CustomerLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href={portal.routes.quotes}>
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-semibold" data-testid="text-quote-id">{quote.quoteId}</h1>
              <StatusBadge status={quote.quoteStatus} />
            </div>
            {quote.jobId && (
              <p className="text-muted-foreground text-sm mt-1">
                Job: <Link href={portal.routes.jobDetail(quote.jobId)} className="text-primary hover:underline">
                  {quote.jobId}
                </Link>
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Quote Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="flex items-start gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Quote Date</div>
                      <div className="text-sm mt-0.5">{format(new Date(quote.quoteDate), "MMMM d, yyyy")}</div>
                    </div>
                  </div>
                  
                  {quote.leadTimeText && (
                    <div className="flex items-start gap-3">
                      <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lead Time</div>
                        <div className="text-sm mt-0.5">{quote.leadTimeText}</div>
                      </div>
                    </div>
                  )}
                </div>

                {quote.topLinesSummary && (
                  <div className="pt-4 border-t">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                      Summary
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{quote.topLinesSummary}</p>
                  </div>
                )}

                {quote.quoteTextSummary && (
                  <div className="pt-4 border-t">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                      Details
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{quote.quoteTextSummary}</p>
                  </div>
                )}

                <div className="pt-4 border-t">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-4">
                    Totals
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Net Total</span>
                      <span>£{Number(quote.netTotal).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">VAT</span>
                      <span>£{Number(quote.vatTotal).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex items-center justify-between text-lg font-semibold pt-2 border-t">
                      <span>Gross Total</span>
                      <span data-testid="text-gross-total">
                        £{Number(quote.grossTotal).toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                {quote.pdfUrl && (
                  <div className="pt-4 border-t">
                    <a 
                      href={quote.pdfUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                      data-testid="link-pdf"
                    >
                      <FileText className="h-4 w-4" />
                      View Quote PDF
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            {approvalEvents.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <ApprovalTimeline events={approvalEvents} />
                </CardContent>
              </Card>
            )}
          </div>

          <div>
            {isAwaitingApproval ? (
              <Card className="border-primary/50">
                <CardHeader>
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    Take Action
                  </CardTitle>
                  <CardDescription>
                    Approve this quote or send us a query
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <a href={createMailtoLink('approve', quote)}>
                    <Button className="w-full gap-2" data-testid="button-approve-quote">
                      <Mail className="h-4 w-4" />
                      Approve Quote
                    </Button>
                  </a>
                  <a href={createMailtoLink('query', quote)}>
                    <Button variant="outline" className="w-full gap-2" data-testid="button-query-quote">
                      <MessageCircle className="h-4 w-4" />
                      Query Quote
                    </Button>
                  </a>
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    Opens your email app to contact our team
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">Need Help?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <a href={createMailtoLink('query', quote)}>
                    <Button variant="outline" className="w-full gap-2" data-testid="button-query-quote">
                      <MessageCircle className="h-4 w-4" />
                      Query Quote
                    </Button>
                  </a>
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    Opens your email app to contact our team
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </CustomerLayout>
  );
}
