export type MessageChannel = 'WhatsApp' | 'SMS' | 'In-App';
export type ProviderStatus = { channel: MessageChannel; configured: boolean; mode: 'manual' | 'provider' | 'unavailable'; label: string };

// Provider boundary for future integrations. No outbound provider is installed;
// WhatsApp is a user-confirmed deep-link handoff and is never marked delivered.
export const messageProviderStatus = (channel: MessageChannel): ProviderStatus => {
  if (channel === 'WhatsApp') return { channel, configured: false, mode: 'manual', label: 'Manual WhatsApp handoff' };
  return { channel, configured: false, mode: 'unavailable', label: 'Not configured' };
};
