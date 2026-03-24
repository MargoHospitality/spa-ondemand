export declare const BOOKING_STATUSES: readonly ["REQUESTED", "MANAGER_CONFIRMED", "MANAGER_RESCHEDULED", "MANAGER_DECLINED", "CLIENT_DECLINED_RESCHEDULE", "CLIENT_CONFIRMED", "EXPIRED_MANAGER", "EXPIRED_CLIENT", "MODIFICATION_REQUESTED", "CANCELLED_CLIENT", "CANCELLED_MANAGER", "COMPLETED", "NO_SHOW"];
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export declare const ACTIVE_STATUSES: BookingStatus[];
export type TokenPurpose = 'manager_action' | 'client_confirmation' | 'client_manage';
export declare const USER_ROLES: readonly ["manager", "admin", "superadmin"];
export type UserRole = (typeof USER_ROLES)[number];
export type NotificationChannel = 'whatsapp' | 'email';
export type NotificationRecipient = 'client' | 'manager';
export type NotificationStatus = 'sent' | 'failed' | 'delivered';
export declare const CLIENT_SOURCES: readonly ["social_media", "recommendation", "website", "other"];
export type ClientSource = (typeof CLIENT_SOURCES)[number];
export interface Property {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    primary_color: string;
    secondary_color: string;
    opening_time: string;
    closing_time: string;
    manager_response_delay_minutes: number;
    manager_auto_fail_delay_minutes: number;
    client_confirmation_delay_24h: number;
    client_confirmation_delay_48h: string;
    client_confirmation_delay_long: number;
    microtransaction_amount: number;
    twilio_whatsapp_number: string | null;
    stripe_account_id: string | null;
    locale_default: string;
    locales_available: string[];
    active: boolean;
    created_at: string;
}
export interface Service {
    id: string;
    property_id: string;
    name_fr: string;
    name_en: string;
    description_fr: string | null;
    description_en: string | null;
    duration_minutes: number;
    price: number;
    active: boolean;
    display_order: number;
    created_at: string;
}
export interface User {
    id: string;
    property_id: string;
    name: string;
    email: string;
    phone_whatsapp: string | null;
    role: UserRole;
    active: boolean;
    created_at: string;
}
export interface Booking {
    id: string;
    property_id: string;
    service_id: string;
    manager_id: string | null;
    client_name: string;
    client_email: string;
    client_phone: string;
    client_locale: string;
    client_origin_property: string | null;
    client_source: ClientSource | null;
    requested_slot: string;
    confirmed_slot: string | null;
    status: BookingStatus;
    manager_token: string | null;
    manager_token_expires_at: string | null;
    client_token: string | null;
    client_token_expires_at: string | null;
    stripe_payment_method_id: string | null;
    stripe_customer_id: string | null;
    stripe_charge_id: string | null;
    stripe_charge_status: string | null;
    microtransaction_amount: number;
    requested_at: string | null;
    manager_notified_at: string | null;
    manager_responded_at: string | null;
    client_notified_at: string | null;
    client_confirmed_at: string | null;
    reminder_48h_sent_at: string | null;
    reminder_4h_sent_at: string | null;
    cancelled_at: string | null;
    cancellation_reason: string | null;
    cancellation_by: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
    policy_override_by_manager: boolean;
    client_message: string | null;
}
export interface NotificationLog {
    id: string;
    booking_id: string;
    channel: NotificationChannel;
    recipient: NotificationRecipient;
    event_type: string;
    locale: string;
    status: NotificationStatus;
    twilio_sid: string | null;
    sent_at: string | null;
    created_at: string;
}
export interface Closure {
    id: string;
    property_id: string;
    label: string;
    start_at: string;
    end_at: string;
    created_by: string | null;
    created_at: string;
}
export interface CreateBookingRequest {
    property_id: string;
    service_id: string;
    client_name: string;
    client_email: string;
    client_phone: string;
    client_locale: string;
    client_origin_property?: string;
    client_source?: ClientSource;
    requested_slot: string;
    client_message?: string;
}
export interface ManagerActionRequest {
    action: 'accept' | 'reschedule' | 'decline';
    proposed_slot?: string;
    reason?: string;
}
export interface ClientConfirmRequest {
    stripe_payment_method_id: string;
}
export interface ClientRescheduleResponse {
    action: 'accept' | 'decline';
}
export interface PaymentCustomerResult {
    customerId: string;
}
export interface PaymentChargeResult {
    chargeId: string;
    paymentMethodId: string;
}
export interface PaymentCaptureResult {
    chargeId: string;
}
//# sourceMappingURL=types.d.ts.map