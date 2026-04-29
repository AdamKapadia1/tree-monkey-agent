/**
 * Email helpers using Resend — Tree Monkey Tree Care Ltd
 */

import { Resend } from 'resend';

let _resend = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

function guard() {
  if (!process.env.RESEND_API_KEY) { console.error('[Email] RESEND_API_KEY not set'); return false; }
  if (!process.env.FROM_EMAIL)     { console.error('[Email] FROM_EMAIL not set');     return false; }
  return true;
}

/**
 * Detailed quote email sent to the customer — covers the specific work,
 * tree details, estimated price range, TPO note, and next steps.
 */
export async function sendQuoteEmail(enquiry) {
  if (!guard()) return;

  const preferredDate = enquiry.preferred_date
    ? new Date(enquiry.preferred_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : 'To be arranged — our team will call to confirm';

  const treeDetails = [
    enquiry.tree_species ? `<tr><td style="padding:8px 12px;font-weight:bold;background:#f5f5f5">Tree species</td><td style="padding:8px 12px;background:#f5f5f5">${enquiry.tree_species}</td></tr>` : '',
    enquiry.tree_height  ? `<tr><td style="padding:8px 12px;font-weight:bold">Approximate height</td><td style="padding:8px 12px">${enquiry.tree_height}</td></tr>` : '',
    enquiry.access_details ? `<tr><td style="padding:8px 12px;font-weight:bold;background:#f5f5f5">Access details</td><td style="padding:8px 12px;background:#f5f5f5">${enquiry.access_details}</td></tr>` : '',
  ].filter(Boolean).join('');

  const tpoRow = enquiry.tpo_risk
    ? `<tr style="background:#fff3cd">
        <td style="padding:10px 12px;font-weight:bold;color:#856404">TPO / Conservation area</td>
        <td style="padding:10px 12px;color:#856404">A Tree Preservation Order or conservation area designation may apply to this tree. Our arborist will confirm the legal position during the site visit and can submit any required council applications on your behalf.</td>
       </tr>`
    : '';

  const photoAnalysisSection = enquiry.photo_analysis
    ? `<div style="background:#f0f7eb;border-left:4px solid #2d5a1b;padding:14px 16px;margin:20px 0;border-radius:0 6px 6px 0">
        <strong style="display:block;margin-bottom:8px;color:#2d5a1b">AI Tree Assessment (preliminary)</strong>
        <p style="margin:0;font-size:13px;color:#444;line-height:1.6;white-space:pre-wrap">${enquiry.photo_analysis}</p>
        <p style="margin:8px 0 0;font-size:12px;color:#888">This is a preliminary AI assessment only. A qualified NPTC arborist will carry out a full inspection on site.</p>
       </div>`
    : '';

  console.log(`[Email] Sending quote to ${enquiry.email}`);
  await getResend().emails.send({
    from: process.env.FROM_EMAIL,
    to: enquiry.email,
    subject: `Tree Monkey Tree Care — Your quote enquiry #${enquiry.id}`,
    html: `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;padding:20px;color:#333;background:#f9f9f9">

  <div style="background:#2d5a1b;padding:24px 28px;border-radius:10px 10px 0 0;display:flex;align-items:center;gap:14px">
    <div>
      <h1 style="color:#fff;margin:0;font-size:24px;font-weight:800">Tree <span style="color:#8bc34a">Monkey</span> Tree Care</h1>
      <p style="color:rgba(255,255,255,0.75);margin:4px 0 0;font-size:13px">NPTC Qualified &nbsp;|&nbsp; Family-run since 2004 &nbsp;|&nbsp; Tring, Hertfordshire</p>
    </div>
  </div>

  <div style="background:#fff;border:1px solid #e0e0e0;border-top:none;padding:28px;border-radius:0 0 10px 10px">

    <p style="font-size:16px;margin:0 0 6px">Dear <strong>${enquiry.customer_name}</strong>,</p>
    <p style="color:#555;margin:0 0 20px;line-height:1.6">Thank you for your enquiry. We have reviewed your request and a qualified arborist will be in touch to arrange your <strong>free, no-obligation site visit</strong>. A full written quotation will follow the assessment.</p>

    <h2 style="font-size:15px;color:#2d5a1b;border-bottom:2px solid #e8f5e9;padding-bottom:8px;margin-bottom:0">Your Enquiry Details</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr><td style="padding:8px 12px;font-weight:bold;background:#f5f5f5;width:40%">Reference</td><td style="padding:8px 12px;background:#f5f5f5"><strong>#${enquiry.id}</strong></td></tr>
      <tr><td style="padding:8px 12px;font-weight:bold">Work required</td><td style="padding:8px 12px">${enquiry.work_required}</td></tr>
      ${treeDetails}
      <tr><td style="padding:8px 12px;font-weight:bold;background:#f5f5f5">Location</td><td style="padding:8px 12px;background:#f5f5f5">${enquiry.postcode}</td></tr>
      <tr><td style="padding:8px 12px;font-weight:bold">Preferred visit date</td><td style="padding:8px 12px">${preferredDate}</td></tr>
      ${tpoRow}
    </table>

    ${photoAnalysisSection}

    <h2 style="font-size:15px;color:#2d5a1b;border-bottom:2px solid #e8f5e9;padding-bottom:8px">What Happens Next?</h2>
    <ol style="padding-left:20px;line-height:2;color:#444;margin:0 0 20px">
      <li>Our arborist will call you to confirm a convenient date and time</li>
      <li>We carry out a free on-site assessment of the tree(s)</li>
      <li>You receive a detailed written quote — no obligation to proceed</li>
      <li>If you're happy, we agree a date and complete the work to BS 3998</li>
    </ol>

    <div style="background:#2d5a1b;color:#fff;border-radius:8px;padding:16px 20px;margin:20px 0">
      <p style="margin:0 0 6px;font-weight:bold;font-size:15px">Need to speak to us now?</p>
      <p style="margin:0;font-size:14px">Office: <strong>01442 733249</strong> &nbsp;&nbsp; Mobile / Emergency: <strong>07734 779 187</strong></p>
      <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.75)">info@tree-monkey.co.uk &nbsp;|&nbsp; www.tree-monkey.co.uk</p>
    </div>

    <p style="color:#999;font-size:12px;margin:20px 0 0;line-height:1.6">Tree Monkey Tree Care Ltd &nbsp;|&nbsp; Tring, Hertfordshire &nbsp;|&nbsp; NPTC Qualified &nbsp;|&nbsp; BS 3998 &nbsp;|&nbsp; CHAS Accredited &nbsp;|&nbsp; Public Liability £10m &nbsp;|&nbsp; Waste Carrier CBDL90998</p>
  </div>

</body>
</html>`,
  });
}

export async function sendOpsAlert({ subject, body }) {
  if (!guard()) return;
  if (!process.env.OPS_EMAIL) {
    console.log(`[Email] Ops alert skipped (no OPS_EMAIL): ${subject}`);
    return;
  }
  console.log(`[Email] Ops alert → ${process.env.OPS_EMAIL}: ${subject}`);
  await getResend().emails.send({
    from: process.env.FROM_EMAIL,
    to: process.env.OPS_EMAIL,
    subject: `[Tree Monkey] ${subject.replace(/—/g, '-')}`,
    text: body.replace(/—/g, '-'),
  });
}
