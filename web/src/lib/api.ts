// Centralized API access — every fetch to the Express backend (server/server.js)
// should go through here instead of hardcoding the Render URL in page code.
const API_BASE_URL = import.meta.env.PUBLIC_API_BASE_URL;

export interface ContactFormPayload {
  name: string;
  email: string;
  reason: string;
  subject: string;
  message: string;
}

export async function submitContactForm(payload: ContactFormPayload): Promise<void> {
  if (!API_BASE_URL) {
    throw new Error('The contact form is not configured. Please try again later.');
  }

  const res = await fetch(`${API_BASE_URL}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let message = 'There was a problem sending your message. Please try again later.';
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // response wasn't JSON — fall back to the default message
    }
    throw new Error(message);
  }
}
