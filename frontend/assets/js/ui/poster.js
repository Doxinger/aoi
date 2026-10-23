export function fallbackPosters(root, selector) {
  root.querySelectorAll(selector).forEach(img => img.addEventListener('error', () => {
    if (!img.dataset.px && /anilist\.co/.test(img.src)) {
      img.dataset.px = '1';
      img.src = '/api/img?u=' + encodeURIComponent(img.src);
    } else {
      img.style.opacity = 0;
    }
  }));
}
