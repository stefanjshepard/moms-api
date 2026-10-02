const trimSlash = (value: string): string => value.replace(/\/+$/, '');

export const getApiPublicBaseUrl = (): string => {
  const fromEnv = process.env.API_PUBLIC_URL?.trim();
  if (fromEnv) {
    return trimSlash(fromEnv);
  }
  const port = process.env.NODE_ENV === 'test' ? 5002 : process.env.PORT || 5001;
  return `http://localhost:${port}`;
};

export const getFrontendBaseUrl = (): string => {
  const fromEnv = process.env.FRONTEND_URL?.trim();
  if (fromEnv) {
    return trimSlash(fromEnv);
  }
  return 'http://localhost:3000';
};

export const getAppointmentDecisionUrl = (
  appointmentId: string,
  action: 'accept' | 'deny',
  token: string
): string => {
  const params = new URLSearchParams({ action, token });
  return `${getApiPublicBaseUrl()}/api/appointments/${encodeURIComponent(appointmentId)}/decision?${params.toString()}`;
};

export const getBookingPayUrl = (appointmentId: string, token: string): string => {
  const params = new URLSearchParams({ id: appointmentId, token });
  return `${getFrontendBaseUrl()}/book/pay?${params.toString()}`;
};
