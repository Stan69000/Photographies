const STORAGE_KEY = 'stan-photo-votes-v1';
const FAVORITES_KEY = 'stan-photo-favorites-v1';

function normalize(raw) {
  if (!raw || typeof raw !== 'object') {
    return { counts: {}, voted: {} };
  }

  if (raw.counts && raw.voted) {
    return {
      counts: typeof raw.counts === 'object' ? raw.counts : {},
      voted: typeof raw.voted === 'object' ? raw.voted : {}
    };
  }

  // Legacy format migration: { slug: count }
  return { counts: raw, voted: {} };
}

function safeRead() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { counts: {}, voted: {} };
    return normalize(JSON.parse(raw));
  } catch {
    return { counts: {}, voted: {} };
  }
}

function safeWrite(votes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(votes));
  } catch {
    // Ignore write failures (private mode or blocked storage)
  }
}

function readFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeFavorites(favorites) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch {
    // Ignore write failures
  }
}

function getScore(slug) {
  const state = safeRead();
  return Number(state.counts[slug] || 0);
}

function hasVoted(slug) {
  const state = safeRead();
  return Boolean(state.voted[slug]);
}

function isFavorite(slug) {
  const favorites = readFavorites();
  return Boolean(favorites[slug]);
}

function toggleFavorite(slug) {
  const favorites = readFavorites();
  if (favorites[slug]) {
    delete favorites[slug];
  } else {
    favorites[slug] = true;
  }
  writeFavorites(favorites);
  window.dispatchEvent(new CustomEvent('photo-favorites:changed'));
  return Boolean(favorites[slug]);
}

function vote(slug) {
  const state = safeRead();
  if (state.voted[slug]) {
    return Number(state.counts[slug] || 0);
  }
  state.counts[slug] = Number(state.counts[slug] || 0) + 1;
  state.voted[slug] = true;
  safeWrite(state);
  window.dispatchEvent(new CustomEvent('photo-votes:changed'));
  return state.counts[slug];
}

function computeTop(photos, options = {}) {
  const { series = null, limit = 3 } = options;
  const state = safeRead();

  return photos
    .filter((photo) => !series || photo.series === series)
    .map((photo) => ({ ...photo, votes: Number(state.counts[photo.slug] || 0) }))
    .sort((a, b) => b.votes - a.votes || a.title.localeCompare(b.title, 'fr'))
    .slice(0, limit);
}

function refreshVoteCounters() {
  const nodes = document.querySelectorAll('[data-vote-count][data-vote-slug]');
  for (const node of nodes) {
    const slug = node.getAttribute('data-vote-slug');
    if (!slug) continue;
    node.textContent = String(getScore(slug));
  }
}

function refreshVoteButtons() {
  const buttons = document.querySelectorAll('[data-vote-btn][data-vote-slug]');
  for (const button of buttons) {
    const slug = button.getAttribute('data-vote-slug');
    if (!slug) continue;
    const voted = hasVoted(slug);
    button.disabled = voted;
    if (voted) {
      button.textContent = 'Déjà voté';
      button.setAttribute('aria-disabled', 'true');
      button.style.opacity = '0.6';
      button.style.cursor = 'default';
    }
  }
}

function bindVoteButtons() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-vote-btn][data-vote-slug]');
    if (!button) return;
    event.preventDefault();
    const slug = button.getAttribute('data-vote-slug');
    if (!slug) return;
    if (hasVoted(slug)) return;
    vote(slug);
    refreshVoteCounters();
    refreshVoteButtons();
  });
}

function refreshFavoriteButtons() {
  const buttons = document.querySelectorAll('[data-fav-btn][data-fav-slug]');
  for (const button of buttons) {
    const slug = button.getAttribute('data-fav-slug');
    if (!slug) continue;
    const active = isFavorite(slug);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.textContent = active ? '★ Favori' : '☆ Favori';
  }
}

function bindFavoriteButtons() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-fav-btn][data-fav-slug]');
    if (!button) return;
    event.preventDefault();
    const slug = button.getAttribute('data-fav-slug');
    if (!slug) return;
    toggleFavorite(slug);
    refreshFavoriteButtons();
  });
}

window.PhotoVotes = {
  getScore,
  vote,
  hasVoted,
  isFavorite,
  toggleFavorite,
  computeTop,
  refreshVoteCounters,
  refreshFavoriteButtons
};

document.addEventListener('DOMContentLoaded', () => {
  bindVoteButtons();
  bindFavoriteButtons();
  refreshVoteCounters();
  refreshVoteButtons();
});

window.addEventListener('storage', refreshVoteCounters);
window.addEventListener('storage', refreshVoteButtons);
window.addEventListener('photo-votes:changed', refreshVoteCounters);
window.addEventListener('photo-votes:changed', refreshVoteButtons);
window.addEventListener('photo-favorites:changed', refreshFavoriteButtons);
