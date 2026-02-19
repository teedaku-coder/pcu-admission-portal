const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export interface ApiResponse<T> {
  data?: T;
  message?: string;
  error?: string;
  [key: string]: any;
}

export interface ApplicantStatus {
  id: number;
  program_id: number;
  program_name: string;
  application_status: string;
  admission_status: string;
  has_paid_acceptance_fee: boolean;
  has_paid_tuition: boolean;
  submitted_at: string | null;
}

export interface Application {
  id: number;
  name: string;
  email: string;
  program_name: string;
  application_status: string;
}

export interface LetterTemplate {
  id: string;
  name: string;
  description?: string;
  mode?: string | null;
}

export interface SendResult {
  total_requested: number;
  letters_created: number;
  errors: number;
  created: Array<{ applicant_id: number; letter_id: number }>;
  failed: Array<{ applicant_id: number; error: string }>;
}

export interface AdmissionLetterData {
  candidateName: string;
  programme: string;
  level: string;
  department: string;
  faculty: string;
  session: string;
  mode: string;
  date: string;
  resumptionDate: string;
  acceptanceFee: string;
  tuition: string;
  otherFees: string;
  reference: string;
}

export interface PaymentTransaction {
  transaction_id: number;
  payment_type: string;
  amount: number;
  status: string;
  payment_method: string;
  reference_id: string;
  created_at: string | null;
  completed_at: string | null;
}

export interface PaymentResponse {
  message: string;
  transaction_id: string;
  transaction_db_id: number;
  applicant_id: number;
  payment_type: string;
  amount: number;
  status: string;
  completed_at: string;
}

export class ApiClient {
  private static token: string | null = null;

  static setToken(token: string | null) {
    this.token = token;
    if (typeof window !== "undefined") {
      if (token) {
        localStorage.setItem("auth_token", token);
      } else {
        localStorage.removeItem("auth_token");
      }
    }
  }

  static getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("auth_token");
    }
    return this.token;
  }

  private static async fetch<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<{ data: T; status: number }> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "API request failed");
    }

    return { data: data as T, status: response.status };
  }

  // Auth endpoints
  static async signup(
    name: string,
    email: string,
    password: string,
    phone_number: string,
  ) {
    const { data } = await this.fetch("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ name, email, password, phone_number }),
    });
    return data;
  }

  static async login(email: string, password: string) {
    const { data } = await this.fetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return data;
  }

  static async verifyToken() {
    const { data } = await this.fetch("/auth/verify-token", {
      method: "GET",
    });
    return data;
  }

  static async logout() {
    const { data } = await this.fetch("/auth/logout", {
      method: "POST",
    });
    return data;
  }

  // Applicant endpoints
  static async getPrograms() {
    const { data } = await this.fetch("/applicant/programs");
    return data;
  }

  static async selectProgram(program_id: number) {
    const { data } = await this.fetch("/applicant/select-program", {
      method: "POST",
      body: JSON.stringify({ program_id }),
    });
    return data;
  }

  static async getFormTemplate(program_id: number) {
    const { data } = await this.fetch(`/applicant/form/${program_id}`);
    return data;
  }

  static async submitForm(formData: any) {
    // Backend expects standard form fields via request.form,
    // so we must send a FormData/multipart request (NOT JSON).
    const fd = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        fd.append(key, String(value));
      }
    });

    const token = this.getToken();
    const headers: HeadersInit = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/applicant/submit-form`, {
      method: "POST",
      headers,
      body: fd,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to save application form");
    }

    return data;
  }

  static async uploadDocument(
    file: File,
    form_id: number,
    document_type: string,
  ) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("form_id", form_id.toString());
    formData.append("document_type", document_type);

    const token = this.getToken();
    const headers: HeadersInit = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/applicant/upload-document`, {
      method: "POST",
      headers,
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Upload failed");
    }

    return data;
  }

  static async getForm(applicant_id: number) {
    const { data } = await this.fetch(`/applicant/get-form/${applicant_id}`);
    return data;
  }

  static async submitApplication(applicant_id: number) {
    const { data } = await this.fetch("/applicant/submit-application", {
      method: "POST",
      body: JSON.stringify({ applicant_id }),
    });
    return data;
  }

  static async previewAdmissionLetter(
    applicantId: number,
    admissionDate?: string,
    templateId?: string,
  ) {
    const token = this.getToken();
    const res = await fetch(`${API_BASE_URL}/admin/preview-admission-letter`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        applicant_id: applicantId,
        admission_date: admissionDate,
        template_id: templateId,
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Preview request failed: ${res.status} ${txt}`);
    }

    const blob = await res.blob();
    return blob;
  }

  static async getApplicantStatus(): Promise<{ applicant: ApplicantStatus }> {
    const { data } = await this.fetch<{ applicant: ApplicantStatus }>(
      "/applicant/get-applicant-status",
    );
    return data;
  }

  static async getAdmissionLetter(): Promise<AdmissionLetterData> {
    const { data } = await this.fetch<AdmissionLetterData>(
      "/applicant/admission-letter",
    );
    return data;
  }

  static async printAdmissionLetterPDF(): Promise<Blob> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      ...(token && { Authorization: `Bearer ${token}` }),
    };

    const response = await fetch(
      `${API_BASE_URL}/applicant/print-admission-letter`,
      {
        method: "POST",
        headers,
      },
    );

    if (!response.ok) {
      throw new Error("Failed to generate PDF");
    }

    return await response.blob();
  }

  // Payment endpoints
  static async processPayment(
    payment_type: "acceptance_fee" | "tuition",
    amount: number,
    payment_method: string = "online",
    reference_id: string = "",
  ): Promise<PaymentResponse> {
    const { data } = await this.fetch<PaymentResponse>(
      "/applicant/process-payment",
      {
        method: "POST",
        body: JSON.stringify({
          payment_type,
          amount,
          payment_method,
          reference_id,
        }),
      },
    );
    return data;
  }

  static async getPaymentHistory(): Promise<{
    payment_history: PaymentTransaction[];
    total_payments: number;
  }> {
    const { data } = await this.fetch<{
      payment_history: PaymentTransaction[];
      total_payments: number;
    }>("/applicant/payment-history");
    return data;
  }

  static async downloadPaymentReceipt(transaction_id: number): Promise<Blob> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      ...(token && { Authorization: `Bearer ${token}` }),
    };

    const response = await fetch(
      `${API_BASE_URL}/applicant/payment-receipt/${transaction_id}`,
      {
        method: "GET",
        headers,
      },
    );

    if (!response.ok) {
      throw new Error("Failed to download payment receipt");
    }

    return await response.blob();
  }

  static async downloadDocument(document_id: number): Promise<Blob> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      ...(token && { Authorization: `Bearer ${token}` }),
    };

    const response = await fetch(
      `${API_BASE_URL}/applicant/download-document/${document_id}`,
      {
        method: "GET",
        headers,
      },
    );

    if (!response.ok) {
      throw new Error("Failed to download document");
    }

    return await response.blob();
  }

  // Admin endpoints
  static async getApplications(
    status?: string,
    program_id?: number,
  ): Promise<{ applications: Application[] }> {
    let endpoint = "/admin/applications";
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (program_id) params.append("program_id", program_id.toString());
    if (params.toString()) endpoint += `?${params.toString()}`;

    const { data } = await this.fetch<{ applications: Application[] }>(
      endpoint,
    );
    return data;
  }

  static async getApplicationDetails(applicant_id: number) {
    const { data } = await this.fetch(`/admin/application/${applicant_id}`);
    return data;
  }

  static async reviewApplication(
    applicant_id: number,
    recommendation: "accept" | "reject" | "recommend_other_program",
    review_notes?: string,
    recommended_program_id?: number,
  ) {
    const { data } = await this.fetch("/admin/review-application", {
      method: "POST",
      body: JSON.stringify({
        applicant_id,
        recommendation,
        review_notes,
        recommended_program_id,
      }),
    });
    return data;
  }

  static async sendAdmissionLetter(
    applicant_id: number,
    admission_date?: string,
    template_id?: string,
  ) {
    const { data } = await this.fetch("/admin/send-admission-letter", {
      method: "POST",
      body: JSON.stringify({ applicant_id, admission_date, template_id }),
    });
    return data;
  }

  static async sendBatchLetters(
    applicant_ids: number[],
    admission_date?: string,
    template_id?: string,
  ): Promise<SendResult> {
    const { data } = await this.fetch<SendResult>("/admin/send-batch-letters", {
      method: "POST",
      body: JSON.stringify({ applicant_ids, admission_date, template_id }),
    });
    return data;
  }

  static async revokeAdmission(applicant_id: number) {
    const { data } = await this.fetch("/admin/revoke-admission", {
      method: "POST",
      body: JSON.stringify({ applicant_id }),
    });
    return data;
  }

  static async getStatistics() {
    const { data } = await this.fetch("/admin/statistics");
    return data;
  }

  static async getLetterTemplates(): Promise<{ templates: LetterTemplate[] }> {
    const { data } = await this.fetch<{ templates: LetterTemplate[] }>(
      "/admin/letter-templates",
    );
    return data;
  }

  static async getLetterTemplate(template_id: number) {
    const { data } = await this.fetch(`/admin/letter-template/${template_id}`);
    return data;
  }
}
