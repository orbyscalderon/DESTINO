import Stripe from 'stripe';
import dotenv from 'dotenv';
dotenv.config();

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;
