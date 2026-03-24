const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new ApiError(json.error || 'Request failed', res.status);
  }
  return json.data as T;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export const api = {
  // ─── Public ───
  getProperty: (slug: string) =>
    request<any>(`/properties/${slug}`),
  getServices: (propertyId: string) =>
    request<any[]>(`/services?property_id=${propertyId}`),
  getClosures: (propertyId: string) =>
    request<any[]>(`/closures?property_id=${propertyId}`),
  createBooking: (body: any) =>
    request<any>('/bookings', { method: 'POST', body: JSON.stringify(body) }),
  checkDuplicate: (propertyId: string, email: string, phone: string) =>
    request<{ hasDuplicate: boolean }>(`/bookings/check-duplicate?property_id=${propertyId}&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`),
  verifyCaptcha: (token: string) =>
    request<{ success: boolean }>('/captcha/verify', { method: 'POST', body: JSON.stringify({ token }) }),

  // ─── Manager token pages ───
  getManagerBooking: (token: string) =>
    request<any>(`/bookings/manager/${token}`),
  managerAction: (token: string, body: any) =>
    request<any>(`/bookings/manager/${token}`, { method: 'POST', body: JSON.stringify(body) }),

  // ─── Client token pages ───
  getConfirmation: (token: string) =>
    request<any>(`/bookings/confirm/${token}`),
  confirmBooking: (token: string, body: any) =>
    request<any>(`/bookings/confirm/${token}`, { method: 'POST', body: JSON.stringify(body) }),
  getManageBooking: (token: string) =>
    request<any>(`/bookings/manage/${token}`),
  cancelBooking: (token: string, reason?: string) =>
    request<any>(`/bookings/manage/${token}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  modifyBooking: (token: string, requestedSlot: string) =>
    request<any>(`/bookings/manage/${token}/modify`, { method: 'POST', body: JSON.stringify({ requested_slot: requestedSlot }) }),
  rescheduleResponse: (token: string, accept: boolean) =>
    request<any>(`/bookings/manage/${token}/reschedule-response`, { method: 'POST', body: JSON.stringify({ accept }) }),

  // ─── Admin (authenticated) ───
  admin: {
    getBookings: (params: Record<string, string> = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request<any>(`/bookings${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
    },
    getBooking: (id: string) =>
      request<any>(`/bookings/${id}`, { headers: authHeaders() }),
    updateBookingStatus: (id: string, status: string) =>
      request<any>(`/bookings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }), headers: authHeaders() }),
    getDashboardStats: (propertyId: string) =>
      request<any>(`/admin/dashboard?property_id=${propertyId}`, { headers: authHeaders() }),
    // Services CRUD
    getServices: (propertyId: string) =>
      request<any[]>(`/admin/services?property_id=${propertyId}`, { headers: authHeaders() }),
    createService: (body: any) =>
      request<any>('/admin/services', { method: 'POST', body: JSON.stringify(body), headers: authHeaders() }),
    updateService: (id: string, body: any) =>
      request<any>(`/admin/services/${id}`, { method: 'PUT', body: JSON.stringify(body), headers: authHeaders() }),
    deleteService: (id: string) =>
      request<any>(`/admin/services/${id}`, { method: 'DELETE', headers: authHeaders() }),
    // Users CRUD
    getUsers: (propertyId: string) =>
      request<any[]>(`/admin/users?property_id=${propertyId}`, { headers: authHeaders() }),
    createUser: (body: any) =>
      request<any>('/admin/users', { method: 'POST', body: JSON.stringify(body), headers: authHeaders() }),
    updateUser: (id: string, body: any) =>
      request<any>(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(body), headers: authHeaders() }),
    deleteUser: (id: string) =>
      request<any>(`/admin/users/${id}`, { method: 'DELETE', headers: authHeaders() }),
    // Property settings
    getProperty: (id: string) =>
      request<any>(`/admin/property/${id}`, { headers: authHeaders() }),
    updateProperty: (id: string, body: any) =>
      request<any>(`/admin/property/${id}`, { method: 'PUT', body: JSON.stringify(body), headers: authHeaders() }),
    // Closures CRUD
    getClosures: (propertyId: string) =>
      request<any[]>(`/admin/closures?property_id=${propertyId}`, { headers: authHeaders() }),
    createClosure: (body: any) =>
      request<any>('/admin/closures', { method: 'POST', body: JSON.stringify(body), headers: authHeaders() }),
    deleteClosure: (id: string) =>
      request<any>(`/admin/closures/${id}`, { method: 'DELETE', headers: authHeaders() }),
  },
};

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('sb-access-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}
