/* eslint-disable @typescript-eslint/no-explicit-any */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiClientOptions {
  baseUrl: string;
  adminKey?: string;
  fetchImpl?: typeof fetch;
}

export interface Client {
  id: string;
  name: string;
  aboutMe: string;
  email: string;
}

export interface Service {
  id: string;
  title: string;
  description: string;
  price: number;
  durationMinutes: number;
  bufferMinutes: number;
  isPublished: boolean;
  clientId?: string | null;
}

export interface Appointment {
  id: string;
  clientFirstName: string;
  clientLastName: string;
  email: string;
  phone?: string | null;
  date: string;
  endDate?: string | null;
  timezone: string;
  serviceId: string;
  states: 'pending' | 'confirmed' | 'cancelled';
  paymentStatus?: string;
  paymentMethod?: string | null;
  tipAmount?: number | null;
  paymentProvider?: string | null;
  paymentExternalId?: string | null;
  service?: Service;
}

export interface CheckoutSession {
  provider: string;
  externalPaymentId: string;
  checkoutUrl: string;
  amount: number;
  currency: string;
  status: string;
}

export interface ContactRequest {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
}

export interface Testimonial {
  id: string;
  title: string;
  author: string;
  content: string;
  isPublished: boolean;
  clientId?: string | null;
}

export interface BlogPost {
  id: string;
  title: string;
  content: string;
  isPublished: boolean;
  clientId?: string | null;
  createdAt: string;
}

export interface AppointmentCreateInput {
  clientFirstName: string;
  clientLastName: string;
  email: string;
  phone: string;
  date: string;
  serviceId: string;
  paymentMethod?: 'venmo' | 'credit_card';
  paymentStatus?: 'pending' | 'paid';
  tipAmount?: number;
}

export interface AppointmentUpdateInput {
  clientFirstName?: string;
  clientLastName?: string;
  email?: string;
  phone?: string;
  date?: string;
  states?: 'pending' | 'confirmed' | 'cancelled';
  paymentMethod?: 'venmo' | 'credit_card';
  paymentStatus?: 'pending' | 'paid';
  tipAmount?: number;
}

export interface ApiErrorShape {
  error?: string;
  message?: string;
}

export class ApiError extends Error {
  status: number;
  payload?: ApiErrorShape;

  constructor(status: number, message: string, payload?: ApiErrorShape) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export class MomsWebsiteApiClient {
  private readonly baseUrl: string;
  private readonly adminKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.adminKey = options.adminKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  setAdminKey(adminKey: string): MomsWebsiteApiClient {
    return new MomsWebsiteApiClient({
      baseUrl: this.baseUrl,
      adminKey,
      fetchImpl: this.fetchImpl,
    });
  }

  private async request<T>(
    path: string,
    method: HttpMethod = 'GET',
    body?: unknown,
    requiresAdmin: boolean = false,
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (requiresAdmin) {
      if (!this.adminKey) {
        throw new ApiError(401, 'Admin key is required for this endpoint');
      }
      headers['x-admin-key'] = this.adminKey;
    }
    if (extraHeaders) {
      Object.assign(headers, extraHeaders);
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 204) {
      return undefined as T;
    }

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const payload = isJson ? ((await response.json()) as ApiErrorShape | T) : undefined;

    if (!response.ok) {
      const errorPayload = (payload as ApiErrorShape | undefined) ?? {};
      const message = errorPayload.error || errorPayload.message || `HTTP ${response.status}`;
      throw new ApiError(response.status, message, errorPayload);
    }

    return payload as T;
  }

  // Health
  getHealth(): Promise<{ message: string }> {
    return this.request('/');
  }

  // Public services
  listPublishedServices(): Promise<Service[]> {
    return this.request('/services');
  }

  getPublishedServiceById(serviceId: string): Promise<Service> {
    return this.request(`/services/${serviceId}`);
  }

  // Public appointments
  createAppointment(input: AppointmentCreateInput): Promise<Appointment> {
    return this.request('/appointments', 'POST', input);
  }

  listAppointments(filters?: { dateFrom?: string; dateTo?: string; serviceId?: string }): Promise<Appointment[]> {
    const params = new URLSearchParams();
    if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.set('dateTo', filters.dateTo);
    if (filters?.serviceId) params.set('serviceId', filters.serviceId);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/appointments${suffix}`);
  }

  getAppointmentById(appointmentId: string): Promise<Appointment> {
    return this.request(`/appointments/${appointmentId}`);
  }

  updateAppointment(appointmentId: string, input: AppointmentUpdateInput): Promise<Appointment> {
    return this.request(`/appointments/${appointmentId}`, 'PUT', input);
  }

  confirmAppointment(appointmentId: string, paymentConfirmationSecret?: string): Promise<Appointment> {
    const headers =
      paymentConfirmationSecret && paymentConfirmationSecret.trim()
        ? { 'x-payment-confirmation-secret': paymentConfirmationSecret }
        : undefined;
    return this.request(`/appointments/${appointmentId}/confirm`, 'PUT', {
      appointmentId,
      paymentStatus: 'completed',
    }, false, headers);
  }

  deleteAppointment(appointmentId: string): Promise<void> {
    return this.request(`/appointments/${appointmentId}`, 'DELETE');
  }

  getAvailableSlots(serviceId: string, date: string): Promise<{
    date: string;
    timezone: string;
    serviceId: string;
    durationMinutes: number;
    bufferMinutes: number;
    slots: string[];
  }> {
    const params = new URLSearchParams({ serviceId, date });
    return this.request(`/appointments/available?${params.toString()}`);
  }

  // Public contact
  createContactRequest(input: { name: string; email: string; message: string }): Promise<ContactRequest> {
    return this.request('/contact', 'POST', input);
  }

  listContactRequests(): Promise<ContactRequest[]> {
    return this.request('/contact');
  }

  deleteContactRequest(contactId: string): Promise<void> {
    return this.request(`/contact/${contactId}`, 'DELETE');
  }

  // Public content
  listTestimonials(): Promise<Testimonial[]> {
    return this.request('/testimonials');
  }

  getTestimonialById(testimonialId: string): Promise<Testimonial> {
    return this.request(`/testimonials/${testimonialId}`);
  }

  createTestimonial(input: Omit<Testimonial, 'id'>): Promise<Testimonial> {
    return this.request('/testimonials', 'POST', input);
  }

  listPublishedBlogPosts(): Promise<BlogPost[]> {
    return this.request('/blog');
  }

  getPublishedBlogPostById(blogPostId: string): Promise<BlogPost> {
    return this.request(`/blog/${blogPostId}`);
  }

  // Admin clients
  adminListClients(): Promise<Client[]> {
    return this.request('/admin/clients', 'GET', undefined, true);
  }

  adminCreateClient(input: Omit<Client, 'id'>): Promise<Client> {
    return this.request('/admin/clients', 'POST', input, true);
  }

  adminGetClientById(clientId: string): Promise<Client> {
    return this.request(`/admin/clients/${clientId}`, 'GET', undefined, true);
  }

  adminUpdateClient(clientId: string, input: Omit<Client, 'id'>): Promise<Client> {
    return this.request(`/admin/clients/${clientId}`, 'PUT', input, true);
  }

  adminDeleteClient(clientId: string): Promise<void> {
    return this.request(`/admin/clients/${clientId}`, 'DELETE', undefined, true);
  }

  // Admin services
  adminListAllServices(): Promise<Service[]> {
    return this.request('/admin/services/admin/all', 'GET', undefined, true);
  }

  adminCreateService(input: Omit<Service, 'id' | 'isPublished'>): Promise<Service> {
    return this.request('/admin/services', 'POST', input, true);
  }

  adminUpdateService(serviceId: string, input: Omit<Service, 'id' | 'isPublished'>): Promise<Service> {
    return this.request(`/admin/services/${serviceId}`, 'PUT', input, true);
  }

  adminPublishService(serviceId: string, isPublished: boolean): Promise<Service> {
    return this.request(`/admin/services/${serviceId}/publish`, 'PATCH', { isPublished }, true);
  }

  adminDeleteService(serviceId: string): Promise<void> {
    return this.request(`/admin/services/${serviceId}`, 'DELETE', undefined, true);
  }

  // Admin blog/testimonial
  adminListBlogPosts(): Promise<BlogPost[]> {
    return this.request('/admin/blog-posts', 'GET', undefined, true);
  }

  adminCreateBlogPost(input: Omit<BlogPost, 'id' | 'isPublished' | 'createdAt'>): Promise<BlogPost> {
    return this.request('/admin/blog-posts', 'POST', input, true);
  }

  adminUpdateBlogPost(blogPostId: string, input: Omit<BlogPost, 'id' | 'createdAt'>): Promise<BlogPost> {
    return this.request(`/admin/blog-posts/${blogPostId}`, 'PUT', input, true);
  }

  adminPublishBlogPost(blogPostId: string, isPublished: boolean): Promise<BlogPost> {
    return this.request(`/admin/blog-posts/${blogPostId}/publish`, 'PATCH', { isPublished }, true);
  }

  adminDeleteBlogPost(blogPostId: string): Promise<void> {
    return this.request(`/admin/blog-posts/${blogPostId}`, 'DELETE', undefined, true);
  }

  adminListTestimonials(): Promise<Testimonial[]> {
    return this.request('/admin/testimonials', 'GET', undefined, true);
  }

  adminCreateTestimonial(input: Omit<Testimonial, 'id'>): Promise<Testimonial> {
    return this.request('/admin/testimonials', 'POST', input, true);
  }

  // Admin email
  adminSendVerificationEmail(email: string): Promise<{ message: string; recipient: string; timestamp: string }> {
    return this.request('/admin/email/verify', 'POST', { email }, true);
  }

  adminVerifyEmailConfig(): Promise<any> {
    return this.request('/admin/email/config/verify', 'GET', undefined, true);
  }

  adminDispatchReminderJobs(): Promise<{ status: string; message: string; processed: number; sent: number; failed: number }> {
    return this.request('/admin/email/reminders/dispatch', 'POST', undefined, true);
  }

  // OAuth + integration diagnostics
  adminCreateOAuthAuthorization(provider: 'google_calendar' | 'intuit', input?: { ownerKey?: string; redirectPath?: string; clientId?: string }): Promise<{ state: string; authorizationUrl: string }> {
    return this.request(`/oauth/${provider}/authorize`, 'POST', input ?? {}, true);
  }

  adminGetOAuthStatus(provider: 'google_calendar' | 'intuit', ownerKey?: string): Promise<{
    provider: string;
    ownerKey: string;
    connected: boolean;
    expiresAt: string | null;
    scopes: string[];
    updatedAt: string | null;
    metadata: Record<string, unknown> | null;
  }> {
    const params = new URLSearchParams();
    if (ownerKey) params.set('ownerKey', ownerKey);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/oauth/${provider}/status${suffix}`, 'GET', undefined, true);
  }

  adminGetIntegrationStatus(provider: 'google_calendar' | 'intuit', ownerKey?: string): Promise<{
    provider: string;
    ownerKey: string;
    connected: boolean;
    expiresAt: string | null;
    scopes: string[];
    updatedAt: string | null;
    metadata: Record<string, unknown> | null;
  }> {
    const params = new URLSearchParams();
    if (ownerKey) params.set('ownerKey', ownerKey);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/admin/integrations/${provider}/status${suffix}`, 'GET', undefined, true);
  }

  adminRefreshIntegration(provider: 'google_calendar' | 'intuit', ownerKey?: string): Promise<{
    provider: string;
    ownerKey: string;
    refreshed: boolean;
    accessTokenAvailable: boolean;
    connected: boolean;
    expiresAt: string | null;
    scopes: string[];
    updatedAt: string | null;
    metadata: Record<string, unknown> | null;
  }> {
    return this.request(`/admin/integrations/${provider}/refresh`, 'POST', ownerKey ? { ownerKey } : {}, true);
  }

  // Payments
  createIntuitCheckoutSession(input: { appointmentId: string; tipAmount?: number; currency?: string }): Promise<CheckoutSession> {
    return this.request('/payments/intuit/checkout-session', 'POST', input);
  }
}

/*
Usage example:

const api = new MomsWebsiteApiClient({
  baseUrl: 'http://localhost:5001/api',
  adminKey: process.env.NEXT_PUBLIC_ADMIN_KEY
});

const services = await api.listPublishedServices();
*/

