import { load } from './features/catalog.js';
import './features/nav.js';
import { hidePage, isPageOpen } from './features/player.js';
import { closeSearch } from './features/search.js';
import './features/progress.js';
import './features/continue.js';
import './features/hero.js';
import './features/saved.js';
import { bootAuth } from './features/auth.js';

addEventListener('popstate', () => {
  if (isPageOpen()) hidePage();
  else closeSearch();
});

load();
bootAuth();
