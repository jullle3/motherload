import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import './launcher.css';
import { games } from './catalog';

const artwork: Record<string, string> = {
  deepfield:
    '<div class="planet"></div><div class="mountain back"></div><div class="mountain front"></div><div class="terrain"></div><div class="shaft"></div><div class="rig"><i></i><b></b></div><span class="crystal c1"></span><span class="crystal c2"></span><span class="crystal c3"></span><span class="art-title">DEEP<span>FIELD</span><small>FORTUNE FAVORS THE DEPTHS.</small></span>',
  'neon-split':
    '<div class="neon-grid"></div><div class="neon-orb orb-one"></div><div class="neon-orb orb-two"></div><div class="neon-orb orb-three"></div><div class="neon-rope"></div><div class="neon-pilot"></div><span class="art-title">NEON<span>SPLIT</span><small>DODGE. SPLIT. REPEAT.</small></span>',
};

document.querySelector('#app')!.innerHTML = `
  <header class="site-header"><a class="brand" href="/">MOTHERLOAD<span>↗</span></a><span class="header-note">INDEPENDENT WORLDS. IN YOUR BROWSER.</span><a href="#games" class="nav-link">THE GAMES ↓</a></header>
  <main>
    <section class="intro"><p class="eyebrow"><i></i> A GROWING COLLECTION OF BROWSER GAMES</p><h1>Small games.<br><span>New worlds.</span></h1><p class="intro-copy">A little curiosity. A new obsession.<br>Pick a game and see where it takes you.</p><span class="orbit" aria-hidden="true">✳</span></section>
    <section id="games" aria-labelledby="collection-title"><div class="collection-heading"><h2 id="collection-title">CHOOSE YOUR NEXT ADVENTURE</h2><span>${games.length} GAME${games.length === 1 ? '' : 'S'} / READY TO PLAY</span></div>
    <div class="game-grid">${games
      .map(
        (game) => `<article class="game-card">
      <a class="game-art art-${game.artwork}" href="${game.href}" aria-label="Play ${game.title}"><span class="available"><i></i> PLAY NOW</span><div aria-hidden="true">${artwork[game.artwork]}</div><span class="art-arrow" aria-hidden="true">↗</span></a>
      <div class="game-info"><div><p class="eyebrow">${game.genre}</p><h3>${game.title}</h3><p class="description">${game.description}</p><div class="tags"><span>⌨ ${game.controls}</span><span>◷ ${game.session}</span></div></div><a class="play-link" href="${game.href}">PLAY ${game.title.toUpperCase()} <span>↗</span></a></div>
    </article>`,
      )
      .join('')}</div>
    <aside class="coming-next"><span class="next-symbol" aria-hidden="true">＋</span><div><h3>More worlds on the horizon.</h3><p>This is just the beginning. Future games will land right here.</p></div><span class="eyebrow">STAY CURIOUS ↗</span></aside></section>
  </main><footer><span>MOTHERLOAD / THE GAME COLLECTION</span><span>No downloads. No accounts. Just play.</span></footer>`;
