"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ApiClient, Application, LetterTemplate, SendResult } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogOut, Mail, AlertCircle, CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SendLettersPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();

  const [applications, setApplications] = useState<Application[]>([]);
  const [pendingLetterApplications, setPendingLetterApplications] = useState<
    Application[]
  >([]);
  const [selectedApplicants, setSelectedApplicants] = useState<Set<number>>(
    new Set(),
  );
  const [activeTab, setActiveTab] = useState<"accepted" | "pending_letters">(
    "pending_letters",
  );
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [admissionDate, setAdmissionDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [templateId, setTemplateId] = useState<string>("");
  const [templates, setTemplates] = useState<LetterTemplate[]>([]);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "admin") {
      router.replace("/auth/login");
      return;
    }

    loadApplications();
    loadTemplates();
  }, [isAuthenticated, user, router]);

  const loadApplications = async () => {
    try {
      const [acceptedResponse, pendingLettersResponse] = await Promise.all([
        ApiClient.getApplications("accepted"),
        ApiClient.getApplications("pending_letters"),
      ]);
      setApplications(acceptedResponse.applications || []);
      setPendingLetterApplications(pendingLettersResponse.applications || []);
    } catch (err) {
      setError("Failed to load applications. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await ApiClient.getLetterTemplates();
      const list: LetterTemplate[] = response.templates || [];
      setTemplates(list);
      if (list.length > 0 && !templateId) {
        setTemplateId(String(list[0].id));
      }
    } catch (err) {
      console.error("Error loading letter templates:", err);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    const activeList =
      activeTab === "pending_letters" ? pendingLetterApplications : applications;
    if (checked) {
      setSelectedApplicants(new Set(activeList.map((app) => app.id)));
    } else {
      setSelectedApplicants(new Set());
    }
  };

  const handleSelectApplicant = (applicantId: number, checked: boolean) => {
    const newSelected = new Set(selectedApplicants);
    if (checked) {
      newSelected.add(applicantId);
    } else {
      newSelected.delete(applicantId);
    }
    setSelectedApplicants(newSelected);
  };

  const handleSendLetters = async () => {
    if (selectedApplicants.size === 0) {
      setError("Please select at least one applicant");
      return;
    }

    if (!templateId) {
      setError("Please choose a letter template");
      return;
    }

    setSending(true);
    setError(null);
    setSendResult(null);

    try {
      const result = await ApiClient.sendBatchLetters(
        Array.from(selectedApplicants),
        admissionDate,
        templateId as any,
      );
      setSendResult(result);
      setSelectedApplicants(new Set());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to send letters";
      setError(message);
    } finally {
      setSending(false);
    }
  };

  const handlePreview = async () => {
    setError(null);
    if (selectedApplicants.size !== 1) {
      setError("Please select exactly one applicant to preview the letter");
      return;
    }

    if (!templateId) {
      setError("Please choose a letter template");
      return;
    }

    const applicantId = Array.from(selectedApplicants)[0];

    try {
      const blob = await ApiClient.previewAdmissionLetter(
        applicantId,
        admissionDate,
        templateId as any,
      );
      const url = URL.createObjectURL(blob as Blob);
      window.open(url, "_blank");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to generate preview";
      setError(message);
      console.error(err);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  if (!isAuthenticated || user?.role !== "admin") {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      {/* Navigation */}
      <nav className="bg-background border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image
              src="/images/logo new.png"
              alt="PCU Logo"
              width={28}
              height={28}
              className="object-contain"
            />
            <span className="font-bold text-lg">Admission Portal - Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm">
              <p className="text-muted-foreground">Logged in as</p>
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/admin/dashboard"
            className="text-primary hover:underline text-sm mb-2 block"
          >
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Send Admission Letters
          </h1>
          <p className="text-muted-foreground">
            Generate and send admission letters to accepted candidates
          </p>
        </div>

        {error && (
          <Card className="mb-6 border-destructive/50 bg-destructive/5">
            <CardContent className="pt-6 flex gap-3">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {sendResult && (
          <Card className="mb-6 border-green-500/50 bg-green-50">
            <CardContent className="pt-6">
              <div className="flex gap-3 mb-4">
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-green-900">
                    Letters Sent Successfully
                  </p>
                  <p className="text-sm text-green-800">
                    {sendResult.letters_created} letters created,{" "}
                    {sendResult.errors} failed
                  </p>
                </div>
              </div>

              {sendResult.failed.length > 0 && (
                <div className="mt-4 pt-4 border-t border-green-200">
                  <p className="font-medium text-sm text-green-900 mb-2">
                    Failed Recipients:
                  </p>
                  <ul className="text-sm text-green-800 space-y-1">
                    {sendResult.failed.map((fail) => (
                      <li key={fail.applicant_id}>
                        • Applicant {fail.applicant_id}: {fail.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Settings Panel */}
          <Card className="lg:row-span-2">
            <CardHeader>
              <CardTitle>Letter Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admission-date">Admission Date</Label>
                <Input
                  id="admission-date"
                  type="date"
                  value={admissionDate}
                  onChange={(e) => setAdmissionDate(e.target.value)}
                  disabled={sending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="template">Letter Template</Label>
                <Select
                  value={templateId}
                  onValueChange={setTemplateId}
                  disabled={sending || templates.length === 0}
                >
                  <SelectTrigger id="template">
                    <SelectValue
                      placeholder={
                        templates.length === 0
                          ? "No templates available"
                          : "Select template"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((tpl) => (
                      <SelectItem key={tpl.id} value={String(tpl.id)}>
                        {tpl.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-4 border-t border-border">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Selected Applicants</p>
                  <Badge variant="secondary" className="text-lg py-2 px-3">
                    {selectedApplicants.size} / {applications.length}
                  </Badge>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={handlePreview}
                  disabled={
                    sending || selectedApplicants.size !== 1 || !templateId
                  }
                  className="gap-2"
                >
                  Preview
                </Button>
                <Button
                  onClick={handleSendLetters}
                  disabled={sending || selectedApplicants.size === 0}
                  className="flex-1 gap-2"
                >
                  <Mail className="h-4 w-4" />
                  {sending
                    ? "Sending Letters..."
                    : `Send to ${selectedApplicants.size} Applicant${selectedApplicants.size !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Applicants List */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>
                      {activeTab === "pending_letters"
                        ? "Pending Letters"
                        : "Accepted Applicants"}
                    </CardTitle>
                    <CardDescription>
                      {activeTab === "pending_letters"
                        ? "Accepted applicants awaiting admission letters"
                        : "All accepted applicants"}
                    </CardDescription>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 border-b border-border">
                  <button
                    onClick={() => {
                      setActiveTab("pending_letters");
                      setSelectedApplicants(new Set());
                    }}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === "pending_letters"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Pending Letters (
                    {pendingLetterApplications.length})
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab("accepted");
                      setSelectedApplicants(new Set());
                    }}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === "accepted"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    All Accepted ({applications.length})
                  </button>
                </div>

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      const activeList =
                        activeTab === "pending_letters"
                          ? pendingLetterApplications
                          : applications;
                      handleSelectAll(
                        selectedApplicants.size !== activeList.length,
                      );
                    }}
                    disabled={sending}
                  >
                    {activeTab === "pending_letters"
                      ? selectedApplicants.size ===
                        pendingLetterApplications.length
                        ? "Deselect All"
                        : "Select All"
                      : selectedApplicants.size === applications.length
                        ? "Deselect All"
                        : "Select All"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
                  <p className="text-muted-foreground">Loading applicants...</p>
                </div>
              ) : (activeTab === "pending_letters"
                  ? pendingLetterApplications.length === 0
                  : applications.length === 0) ? (
                <div className="text-center py-12">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    {activeTab === "pending_letters"
                      ? "No applicants awaiting letters"
                      : "No accepted applications found"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {(activeTab === "pending_letters"
                    ? pendingLetterApplications
                    : applications
                  ).map((app) => (
                    <div
                      key={app.id}
                      className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-accent"
                    >
                      <Checkbox
                        id={`app-${app.id}`}
                        checked={selectedApplicants.has(app.id)}
                        onCheckedChange={(checked) =>
                          handleSelectApplicant(app.id, checked as boolean)
                        }
                        disabled={sending}
                      />
                      <label
                        htmlFor={`app-${app.id}`}
                        className="flex-1 cursor-pointer"
                      >
                        <p className="font-medium">{app.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {app.email} • {app.program_name}
                        </p>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
