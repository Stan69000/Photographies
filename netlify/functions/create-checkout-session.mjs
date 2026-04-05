import Stripe from 'stripe';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json' }
    });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return new Response(JSON.stringify({ error: 'Stripe key missing in env vars' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }

  const stripe = new Stripe(secret, { apiVersion: '2025-02-24.acacia' });

  try {
    const body = await req.json();
    const { title, amount, currency = 'eur', successUrl, cancelUrl } = body;

    if (!amount || !title || !successUrl || !cancelUrl) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: Math.round(Number(amount) * 100),
            product_data: { name: title }
          }
        }
      ]
    });

    return new Response(JSON.stringify({ id: session.id, url: session.url }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
};
