import { Card, CardContent } from "@/components/ui/card";
import { CallbacksLayout } from "./layout";

export default function CallbacksAuditPage() {
  return (
    <CallbacksLayout>
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-semibold">Callbacks Audit</h1>
          <p className="text-muted-foreground mt-1">Outbound email and action audit will appear here as the comms layer is implemented.</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Audit data model is in place; send/action endpoints are the next implementation slice.
          </CardContent>
        </Card>
      </div>
    </CallbacksLayout>
  );
}