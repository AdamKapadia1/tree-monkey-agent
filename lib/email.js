/**
 * Email helpers using Resend — Tree Monkey Tree Care Ltd
 */

import { Resend } from 'resend';

let _resend = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export async function sendBookingConfirmation(booking) {
  const preferredDate = booking.delivery_date
    ? new Date(booking.delivery_date).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : 'To be confirmed';

  await getResend().emails.send({
    from: process.env.FROM_EMAIL,
    to: booking.email,
    subject: `Tree Monkey Tree Care - Enquiry confirmed #${booking.id}`,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <div style="background:#2d5a1b;padding:20px;border-radius:8px 8px 0 0">
    <h1 style="color:#ffffff;margin:0;font-size:22px">Tree <span style="color:#8bc34a">Monkey</span> Tree Care</h1>
    <p style="color:rgba(255,255,255,0.8);margin:4px 0 0">Enquiry confirmed - we will be in touch shortly</p>
  </div>
  <div style="border:1px solid #e0e0e0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    <p>Dear ${booking.customer_name},</p>
    <p>Thank you for contacting Tree Monkey Tree Care Ltd. We have received your enquiry and a member of our team will be in touch to arrange your <strong>free site visit</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr style="background:#f5f5f5"><td style="padding:8px 12px;font-weight:bold">Reference</td><td style="padding:8px 12px">#${booking.id}</td></tr>
      <tr><td style="padding:8px 12px;font-weight:bold">Work required</td><td style="padding:8px 12px">${booking.skip_size}</td></tr>
      <tr style="background:#f5f5f5"><td style="padding:8px 12px;font-weight:bold">Preferred date</td><td style="padding:8px 12px">${preferredDate}</td></tr>
      <tr><td style="padding:8px 12px;font-weight:bold">Postcode</td><td style="padding:8px 12px">${booking.postcode}</td></tr>
      ${booking.on_road ? `<tr style="background:#fff3cd"><td style="padding:8px 12px;font-weight:bold;color:#856404">TPO note</td><td style="padding:8px 12px;color:#856404">A Tree Preservation Order may apply - we will advise on this during your site visit.</td></tr>` : ''}
    </table>
    <p style="background:#f0f7eb;border-left:4px solid #2d5a1b;padding:12px;margin:16px 0">
      <strong>What happens next?</strong> Our qualified arborist will contact you to arrange a convenient time for a free, no-obligation site visit. All quotes are provided in writing following the assessment.
    </p>
    <p>If you have any questions or need to speak to us urgently, please call <strong>01442 733249</strong> or <strong>07734 779 187</strong>.</p>
    <p style="color:#666;font-size:13px;margin-top:24px">Tree Monkey Tree Care Ltd | Tring, Hertfordshire | NPTC Qualified | Family-run since 2004</p>
  </div>
</body>
</html>`,
  });
}

export async function sendOpsAlert({ subject, body }) {
  if (!process.env.OPS_EMAIL) {
    console.log(`[Email] Ops alert (no email configured): ${subject}`);
    return;
  }
  const cleanBody = body.replace(/—/g, '-');
  const cleanSubject = subject.replace(/—/g, '-');
  await getResend().emails.send({
    from: process.env.FROM_EMAIL,
    to: process.env.OPS_EMAIL,
    subject: `[Tree Monkey] ${cleanSubject}`,
    text: cleanBody,
  });
}
