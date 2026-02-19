"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogOut, AlertCircle, DollarSign, CheckCircle } from "lucide-react";

interface PaymentInfo {
  applicant_id: number;
  program_name: string;
  admission_status: string;
  acceptance_fee: number;
  tuition_fee: number;
  has_paid_acceptance_fee: boolean;
  has_paid_tuition: boolean;
}

interface PaymentModal {
  isOpen: boolean;
  type: "acceptance" | "tuition" | null;
  step: "select" | "confirm" | "processing" | "success";
  transactionId?: string;
  transactionDbId?: number;
}

export default function PaymentPage() {
  const router = useRouter();
  const { user, applicant, isAuthenticated, logout } = useAuth();
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentModal, setPaymentModal] = useState<PaymentModal>({
    isOpen: false,
    type: null,
    step: "select",
    transactionId: undefined,
  });
  const [processingPayment, setProcessingPayment] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "applicant") {
      router.replace("/auth/login");
      return;
    }

    if (applicant?.admission_status !== "admitted") {
      router.replace("/applicant/dashboard");
      return;
    }

    loadPaymentInfo();
  }, [isAuthenticated, user, applicant, router]);

  const loadPaymentInfo = async () => {
    try {
      // Get applicant status from backend
      const statusData = await ApiClient.getApplicantStatus();
      const appStatus = statusData.applicant;

      // Get program fees from admission letter data
      const letterData = await ApiClient.getAdmissionLetter();

      // Parse fees from formatted strings
      const parseFee = (feeStr: string) => {
        return parseInt(feeStr.replace(/₦|,/g, ""), 10);
      };

      const acceptance_fee = parseFee(letterData.acceptanceFee);
      const tuition_fee = parseFee(letterData.tuition);

      setPaymentInfo({
        applicant_id: appStatus.id,
        program_name: appStatus.program_name,
        admission_status: appStatus.admission_status,
        acceptance_fee,
        tuition_fee,
        has_paid_acceptance_fee: appStatus.has_paid_acceptance_fee,
        has_paid_tuition: appStatus.has_paid_tuition,
      });
    } catch (err) {
      console.error("Error loading payment info:", err);
      // Fallback to default if API fails
      setPaymentInfo({
        applicant_id: 0,
        program_name: "Unknown",
        admission_status: "admitted",
        acceptance_fee: 0,
        tuition_fee: 0,
        has_paid_acceptance_fee: false,
        has_paid_tuition: false,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  const openPaymentModal = (type: "acceptance" | "tuition") => {
    // Prevent tuition payment if acceptance fee not paid
    if (type === "tuition" && !paymentInfo?.has_paid_acceptance_fee) {
      alert(
        "You must pay the acceptance fee first before paying tuition."
      );
      return;
    }

    setPaymentModal({
      isOpen: true,
      type,
      step: "confirm",
    });
  };

  const closePaymentModal = () => {
    setPaymentModal({
      isOpen: false,
      type: null,
      step: "select",
      transactionId: undefined,
    });
  };

  const downloadReceipt = async () => {
    if (!paymentModal.transactionDbId) {
      alert("Transaction ID not available. Please try again.");
      return;
    }

    try {
      const blob = await ApiClient.downloadPaymentReceipt(paymentModal.transactionDbId);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `payment_receipt_${paymentModal.transactionId || "receipt"}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("[v0] Error downloading receipt:", error);
      alert("Failed to download receipt. Please try again.");
    }
  };

  const simulateRemittaPayment = async () => {
    if (!paymentModal.type || !paymentInfo) return;

    setProcessingPayment(true);
    setPaymentModal((prev) => ({ ...prev, step: "processing" }));

    try {
      // Determine payment type and amount
      const paymentType =
        paymentModal.type === "acceptance" ? "acceptance_fee" : "tuition";
      const amount =
        paymentModal.type === "acceptance"
          ? paymentInfo.acceptance_fee
          : paymentInfo.tuition_fee;

      // Process payment via backend
      const result = await ApiClient.processPayment(
        paymentType as "acceptance_fee" | "tuition",
        amount,
        "remita",
        `TXN-${Date.now()}`
      );

      console.log("[v0] Payment processed successfully:", result);

      // Update payment status
      if (paymentInfo) {
        const updatedInfo = { ...paymentInfo };
        if (paymentModal.type === "acceptance") {
          updatedInfo.has_paid_acceptance_fee = true;
        } else if (paymentModal.type === "tuition") {
          updatedInfo.has_paid_tuition = true;
        }
        setPaymentInfo(updatedInfo);
      }

      setProcessingPayment(false);
      setPaymentModal((prev) => ({
        ...prev,
        step: "success",
        transactionId: result.transaction_id,
        transactionDbId: result.transaction_db_id,
      }));

      // Close modal after 2 seconds and reload data
      setTimeout(() => {
        closePaymentModal();
        loadPaymentInfo(); // Refresh to get latest data
      }, 2000);
    } catch (error) {
      console.error("[v0] Payment processing error:", error);
      alert(
        `Payment failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      setProcessingPayment(false);
      setPaymentModal((prev) => ({ ...prev, step: "confirm" }));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">
            Loading payment information...
          </p>
        </div>
      </div>
    );
  }

  if (!paymentInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <p className="text-foreground font-semibold mb-2">
              Error Loading Payment
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              Unable to load payment information. Please try again later.
            </p>
            <Link href="/applicant/dashboard">
              <Button>Go Back</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      {/* Navigation */}
      <nav className="bg-background border-b border-border sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image
              src="/images/logo new.png"
              alt="PCU Logo"
              width={28}
              height={28}
              className="object-contain"
            />
            <span className="font-bold text-lg">Admission Portal</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm">
              <p className="text-muted-foreground">Welcome back</p>
              <p className="font-medium text-foreground">{user?.name}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="gap-2"
            >
              <LogOut className="h-4 w-4" />
              Log Out
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="outline"
            className="mb-4 bg-transparent"
            onClick={() => router.back()}
          >
            ← Back
          </Button>
          <h1 className="text-3xl font-bold text-foreground mb-2">Payment</h1>
          <p className="text-muted-foreground">
            Complete your payment to finalize your admission
          </p>
        </div>

        {/* Admission Status */}
        <Card className="mb-8 border-green-500/50 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-800 font-medium">
                  Admission Status
                </p>
                <p className="text-lg font-semibold text-green-900">
                  Congratulations! You have been admitted.
                </p>
              </div>
              <Badge className="bg-green-600">Admitted</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Payment Order Info */}
        <Card className="mb-8 border-blue-500/50 bg-blue-50">
          <CardContent className="pt-6">
            <p className="text-sm text-blue-800">
              <strong>Payment Order:</strong> You must pay the acceptance fee first before you can proceed with tuition payment.
            </p>
          </CardContent>
        </Card>

        {/* Payment Summary */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Acceptance Fee */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Acceptance Fee
              </CardTitle>
              <CardDescription>
                Required to confirm your admission
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Amount</p>
                <p className="text-3xl font-bold">
                  ₦{paymentInfo.acceptance_fee.toLocaleString()}
                </p>
              </div>

              <div className="pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">Status:</span>
                  {paymentInfo.has_paid_acceptance_fee ? (
                    <Badge className="bg-green-600 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Paid
                    </Badge>
                  ) : (
                    <Badge variant="outline">Pending</Badge>
                  )}
                </div>
                <Button
                  onClick={() => openPaymentModal("acceptance")}
                  disabled={paymentInfo.has_paid_acceptance_fee}
                  className="w-full gap-2"
                  variant={
                    paymentInfo.has_paid_acceptance_fee ? "outline" : "default"
                  }
                >
                  <DollarSign className="h-4 w-4" />
                  {paymentInfo.has_paid_acceptance_fee
                    ? "Payment Completed"
                    : "Pay via Remita"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Tuition Fee */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Tuition Fee
              </CardTitle>
              <CardDescription>For your first year of study</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Amount</p>
                <p className="text-3xl font-bold">
                  ₦{paymentInfo.tuition_fee.toLocaleString()}
                </p>
              </div>

              <div className="pt-4 border-t border-border">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">Status:</span>
                  {paymentInfo.has_paid_tuition ? (
                    <Badge className="bg-green-600 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Paid
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      {paymentInfo.has_paid_acceptance_fee
                        ? "Pending"
                        : "Locked"}
                    </Badge>
                  )}
                </div>
                <Button
                  onClick={() => openPaymentModal("tuition")}
                  disabled={
                    paymentInfo.has_paid_tuition ||
                    !paymentInfo.has_paid_acceptance_fee
                  }
                  className="w-full gap-2"
                  variant={paymentInfo.has_paid_tuition ? "outline" : "default"}
                >
                  <DollarSign className="h-4 w-4" />
                  {paymentInfo.has_paid_tuition
                    ? "Payment Completed"
                    : !paymentInfo.has_paid_acceptance_fee
                    ? "Pay Acceptance Fee First"
                    : "Pay via Remita"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Total Summary */}
        <Card className="bg-primary/5 border-primary/20 mb-8">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span>Acceptance Fee:</span>
                <span>₦{paymentInfo.acceptance_fee.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span>Tuition Fee:</span>
                <span>₦{paymentInfo.tuition_fee.toLocaleString()}</span>
              </div>
              <div className="border-t border-primary/20 pt-2 mt-2 flex justify-between items-center font-bold">
                <span>Total Amount:</span>
                <span className="text-lg">
                  ₦
                  {(
                    paymentInfo.acceptance_fee + paymentInfo.tuition_fee
                  ).toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="mt-8 flex gap-4 justify-between">
          <Button
            variant="outline"
            onClick={() => router.push("/applicant/dashboard")}
          >
            Back to Dashboard
          </Button>
        </div>
      </div>

      {/* Remita Payment Modal */}
      {paymentModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            {paymentModal.step === "confirm" && (
              <>
                <CardHeader>
                  <CardTitle>Confirm Payment</CardTitle>
                  <CardDescription>
                    Processing via Remita Gateway
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">
                      Payment Type
                    </p>
                    <p className="font-semibold text-foreground capitalize">
                      {paymentModal.type === "acceptance"
                        ? "Acceptance Fee"
                        : "Tuition Fee"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Amount</p>
                    <p className="text-2xl font-bold">
                      ₦
                      {(paymentModal.type === "acceptance"
                        ? paymentInfo.acceptance_fee
                        : paymentInfo.tuition_fee
                      ).toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-gray-100 p-3 rounded text-sm">
                    <p className="text-xs text-muted-foreground mb-2">
                      Gateway: Remita
                    </p>
                    <p className="text-xs">
                      You will be redirected to Remita to complete your payment
                      securely.
                    </p>
                  </div>
                </CardContent>
                <div className="border-t px-6 py-4 flex gap-3">
                  <Button
                    variant="outline"
                    onClick={closePaymentModal}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={simulateRemittaPayment}
                    className="flex-1"
                    disabled={processingPayment}
                  >
                    {processingPayment ? "Processing..." : "Proceed to Pay"}
                  </Button>
                </div>
              </>
            )}

            {paymentModal.step === "processing" && (
              <CardContent className="py-12 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
                <p className="text-foreground font-semibold">
                  Processing Payment
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Redirecting to Remita...
                </p>
              </CardContent>
            )}

            {paymentModal.step === "success" && (
              <>
                <CardContent className="py-12 text-center">
                  <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
                  <p className="text-foreground font-semibold mb-2">
                    Payment Successful
                  </p>
                  <p className="text-sm text-muted-foreground mb-4">
                    {paymentModal.type === "acceptance"
                      ? "Acceptance fee has been processed"
                      : "Tuition fee has been processed"}
                  </p>
                  {paymentModal.transactionId && (
                    <p className="text-xs text-muted-foreground bg-gray-100 rounded p-2 mb-4">
                      Transaction ID: {paymentModal.transactionId}
                    </p>
                  )}
                </CardContent>
                {paymentModal.transactionId && (
                  <div className="border-t px-6 py-4">
                    <Button
                      onClick={() => downloadReceipt()}
                      className="w-full gap-2"
                      variant="outline"
                    >
                      Download Receipt
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
