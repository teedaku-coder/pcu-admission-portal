"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { Recommendation } from "@/lib/api";

interface RecommendationCardProps {
  recommendation: Recommendation;
  onRespond: (review_id: number, response: "accepted" | "declined") => Promise<void>;
  loading: boolean;
}

export default function RecommendationCard({
  recommendation,
  onRespond,
  loading,
}: RecommendationCardProps) {
  const [responding, setResponding] = useState(false);

  const handleRespond = async (response: "accepted" | "declined") => {
    try {
      setResponding(true);
      await onRespond(recommendation.review_id, response);
    } finally {
      setResponding(false);
    }
  };

  const getResponseBadge = () => {
    if (!recommendation.response) {
      return <Badge variant="outline">Pending Response</Badge>;
    }
    if (recommendation.response === "accepted") {
      return (
        <Badge className="bg-green-100 text-green-800 gap-2">
          <CheckCircle className="h-3 w-3" />
          Accepted
        </Badge>
      );
    }
    return (
      <Badge className="bg-red-100 text-red-800 gap-2">
        <XCircle className="h-3 w-3" />
        Declined
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{recommendation.program_name}</CardTitle>
            <CardDescription>
              Recommended by {recommendation.reviewed_by} on{" "}
              {recommendation.reviewed_at
                ? new Date(recommendation.reviewed_at).toLocaleDateString()
                : "Unknown date"}
            </CardDescription>
          </div>
          {getResponseBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {recommendation.review_notes && (
          <div>
            <h4 className="font-semibold text-sm mb-2">Recommendation Notes</h4>
            <p className="text-sm text-muted-foreground">
              {recommendation.review_notes}
            </p>
          </div>
        )}

        {!recommendation.response ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800">
              The admissions team has recommended you for {recommendation.program_name}.
              Please review the recommendation and let us know if you accept or decline.
            </p>
          </div>
        ) : null}

        <div className="flex gap-3 justify-end">
          {!recommendation.response ? (
            <>
              <Button
                variant="outline"
                onClick={() => handleRespond("declined")}
                disabled={responding || loading}
              >
                Decline
              </Button>
              <Button
                onClick={() => handleRespond("accepted")}
                disabled={responding || loading}
              >
                Accept
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              You {recommendation.response === "accepted" ? "accepted" : "declined"} this
              recommendation
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
