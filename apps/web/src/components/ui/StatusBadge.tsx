import type { BookingStatus } from '@margo/shared';

const statusConfig: Record<BookingStatus, { label: string; bg: string; text: string }> = {
  REQUESTED: { label: 'En attente', bg: 'bg-yellow-100', text: 'text-yellow-800' },
  MANAGER_CONFIRMED: { label: 'Confirmé manager', bg: 'bg-blue-100', text: 'text-blue-800' },
  MANAGER_RESCHEDULED: { label: 'Replanifié', bg: 'bg-orange-100', text: 'text-orange-800' },
  MANAGER_DECLINED: { label: 'Refusé', bg: 'bg-red-100', text: 'text-red-800' },
  CLIENT_DECLINED_RESCHEDULE: { label: 'Décliné client', bg: 'bg-red-100', text: 'text-red-800' },
  CLIENT_CONFIRMED: { label: 'Confirmé', bg: 'bg-green-100', text: 'text-green-800' },
  EXPIRED_MANAGER: { label: 'Expiré (manager)', bg: 'bg-gray-100', text: 'text-gray-800' },
  EXPIRED_CLIENT: { label: 'Expiré (client)', bg: 'bg-gray-100', text: 'text-gray-800' },
  MODIFICATION_REQUESTED: { label: 'Modification', bg: 'bg-purple-100', text: 'text-purple-800' },
  CANCELLED_CLIENT: { label: 'Annulé (client)', bg: 'bg-red-100', text: 'text-red-800' },
  CANCELLED_MANAGER: { label: 'Annulé (manager)', bg: 'bg-red-100', text: 'text-red-800' },
  COMPLETED: { label: 'Terminé', bg: 'bg-green-100', text: 'text-green-800' },
  NO_SHOW: { label: 'No-show', bg: 'bg-gray-100', text: 'text-gray-800' },
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  const config = statusConfig[status] || { label: status, bg: 'bg-gray-100', text: 'text-gray-800' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}
