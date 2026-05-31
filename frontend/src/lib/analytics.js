// PostHog analytics — solo se inicializa si VITE_POSTHOG_KEY está set.
// API simple: track('event_name', { props }).
// No bloqueador: si PostHog no está configurado, es no-op.

let posthog = null;
let initPromise = null;

async function ensureInit() {
  if (posthog) return posthog;
  if (initPromise) return initPromise;
  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key) return null;

  initPromise = import('posthog-js').then(({ default: ph }) => {
    ph.init(key, {
      api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com',
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: false,         // solo capturamos eventos explícitos
      persistence: 'localStorage',
      // Respetar Do Not Track del browser
      respect_dnt: true,
    });
    posthog = ph;
    return ph;
  }).catch(() => null);

  return initPromise;
}

export async function identify(userId, props = {}) {
  const ph = await ensureInit();
  if (!ph || !userId) return;
  ph.identify(userId, props);
}

export async function track(event, props = {}) {
  const ph = await ensureInit();
  if (!ph) return;
  ph.capture(event, props);
}

export async function reset() {
  const ph = await ensureInit();
  if (!ph) return;
  ph.reset();
}

// Eventos predefinidos para consistencia (centraliza nombres)
export const Events = {
  // Funnel
  SIGN_UP_STARTED:        'sign_up_started',
  SIGN_UP_COMPLETED:      'sign_up_completed',
  ONBOARDING_STEP:        'onboarding_step',
  ONBOARDING_COMPLETED:   'onboarding_completed',

  // Engagement
  SWIPE_LEFT:             'swipe_left',
  SWIPE_RIGHT:            'swipe_right',
  MATCH_CREATED:          'match_created',
  MESSAGE_SENT:           'message_sent',

  // Monetization
  COIN_PURCHASE_INITIATED:'coin_purchase_initiated',
  COIN_PURCHASE_COMPLETED:'coin_purchase_completed',
  TIP_SENT:               'tip_sent',
  GIFT_SENT:              'gift_sent',
  SHOW_TICKET_BOUGHT:     'show_ticket_bought',
  SUBSCRIBED_TO_CREATOR:  'subscribed_to_creator',
  CONTENT_PURCHASED:      'content_purchased',
  PREMIUM_PURCHASED:      'premium_purchased',

  // Live shows
  SHOW_STARTED:           'show_started',
  SHOW_VIEWED:            'show_viewed',
  POLL_CREATED:           'poll_created',
  POLL_VOTED:             'poll_voted',

  // Adult
  EXPLORE_VIEWED:         'explore_viewed',
  VIDEO_PLAYED:           'video_played',
  VIDEO_RATED:            'video_rated',
  PLAYLIST_CREATED:       'playlist_created',

  // Retention
  PROFILE_COMPLETED:      'profile_completed',
  ACHIEVEMENT_EARNED:     'achievement_earned',
  REFERRAL_SHARED:        'referral_shared',
};
