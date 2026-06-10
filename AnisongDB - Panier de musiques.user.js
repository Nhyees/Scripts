// ==UserScript==
// @name         AnisongDB - Panier de musiques
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Ajouter des musiques dans un panier et exporter en JSON depuis AnisongDB
// @author       Nhyees
// @match        https://anisongdb.com/*
// @updateURL    https://raw.githubusercontent.com/Nhyees/Scripts/refs/heads/main/AnisongDB%20-%20Panier%20de%20musiques.meta.js
// @downloadURL  https://raw.githubusercontent.com/Nhyees/Scripts/refs/heads/main/AnisongDB%20-%20Panier%20de%20musiques.user.js
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  let panier = [];
  let panierVisible = false;

  // Index principal : animeJPName|songName|songArtist
  // Index secondaire : id:<songId> et ann:<annId>
  const apiCache = {};
  window._adbCache = apiCache;

  function stockerReponseAPI(data) {
    const liste = Array.isArray(data) ? data : (data?.songs || data?.results || []);
    liste.forEach(song => {
      if (!song?.songName) return;
      // Index textuel (existant)
      const cle = [song.animeJPName, song.songName, song.songArtist].join('|');
      apiCache[cle] = song;
      // Index par identifiants numériques
      if (song.songId != null) apiCache[`id:${song.songId}`] = song;
      if (song.annId  != null) apiCache[`ann:${song.annId}`]  = song;
    });
  }

  // Interception fetch
  (function intercepterFetch() {
    const fetchOriginal = window.fetch;
    window.fetch = async function (...args) {
      const reponse = await fetchOriginal.apply(this, args);
      const contentType = reponse.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        reponse.clone().json().then(stockerReponseAPI).catch(() => {});
      }
      return reponse;
    };
  })();

  // Fallback XHR au cas où
  (function intercepterXHR() {
    const openOriginal = XMLHttpRequest.prototype.open;
    const sendOriginal = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._adbUrl = url;
      return openOriginal.apply(this, [method, url, ...rest]);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener('load', () => {
        try { stockerReponseAPI(JSON.parse(this.responseText)); } catch (_) {}
      });
      return sendOriginal.apply(this, args);
    };
  })();

  // ---- Données ----

  function genId(song) {
    return [song.animeJPName, song.songName, song.songArtist].join('|');
  }

  function estDansPanier(song) {
    return panier.some(s => genId(s) === genId(song));
  }

  function extraireDonneesDeLaLigne(row) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 5) return null;

    const getText = (cell) =>
      cell.querySelector('.copyable')?.innerText?.trim() ||
      cell.innerText?.trim() ||
      '';

    // [0]ANN ID [1]Anime [2]Type [3]Titre [4]Artiste [5]mp3 [6]trash
    const annIdRaw    = getText(cells[0]);
    const animeJPName = getText(cells[1]);
    const songType    = getText(cells[2]);
    const songName    = getText(cells[3]);
    const songArtist  = getText(cells[4]);

    if (!songName && !animeJPName) return null;

    // Priorité : annId > clé textuelle
    const cle = [animeJPName, songName, songArtist].join('|');
    const api =
      (annIdRaw && apiCache[`ann:${annIdRaw}`]) ||
      apiCache[cle] ||
      null;

    return {
      animeJPName: api?.animeJPName || animeJPName,
      animeENName: api?.animeENName || '',
      songName:    api?.songName    || songName,
      songArtist:  api?.songArtist  || songArtist,
      songType:    api?.songType    || songType,
      HQ:          api?.HQ    || null,
      MQ:          api?.MQ    || null,
      audio:       api?.audio || null,
    };
  }

  // ---- Gestion du panier ----

  function ajouterAuPanier(song, btn) {
    if (estDansPanier(song)) return;
    panier.push(song);
    if (btn) {
      btn.textContent = '-';
      btn.title = 'Retirer du panier';
      btn.classList.add('adb-btn-dans-panier');
    }
    mettreAJourUI();
  }

  function retirerDuPanier(song, btn) {
    panier = panier.filter(s => genId(s) !== genId(song));
    if (btn) {
      btn.textContent = '+';
      btn.title = 'Ajouter au panier';
      btn.classList.remove('adb-btn-dans-panier');
    }
    mettreAJourUI();
  }

  function togglePanier(song, btn) {
    if (estDansPanier(song)) {
      retirerDuPanier(song, btn);
    } else {
      ajouterAuPanier(song, btn);
    }
  }

  function ajouterTous() {
    document.querySelectorAll('tr').forEach(row => {
      if (row.querySelectorAll('td').length < 5) return;
      const song = extraireDonneesDeLaLigne(row);
      if (song) ajouterAuPanier(song, row.querySelector('.adb-btn-plus'));
    });
  }

  // ---- Export ----

  function exporterJSON() {
    if (panier.length === 0) {
      alert('Le panier est vide.');
      return;
    }
    const blob = new Blob([JSON.stringify(panier, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'anisongdb-panier.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---- Bouton ----

  function injecterBoutonDansLigne(row) {
    if (row.querySelector('.adb-btn-plus')) return;

    const song = extraireDonneesDeLaLigne(row);
    if (!song) return;

    const tds = row.querySelectorAll('td');
    const tdTitre = tds[3];
    if (!tdTitre) return;

    const btn = document.createElement('button');
    btn.className = 'adb-btn-plus';
    btn.textContent = estDansPanier(song) ? '-' : '+';
    btn.title = estDansPanier(song) ? 'Retirer du panier' : 'Ajouter au panier';
    if (estDansPanier(song)) btn.classList.add('adb-btn-dans-panier');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const songActuelle = extraireDonneesDeLaLigne(row);
      if (songActuelle) togglePanier(songActuelle, btn);
    });

    tdTitre.style.whiteSpace = 'nowrap';
    tdTitre.appendChild(btn);
  }

  // ---- Affichage du panneau ----

  function mettreAJourUI() {
    const badge = document.getElementById('adb-badge');
    if (badge) {
      badge.textContent = panier.length;
      badge.style.visibility = panier.length === 0 ? 'hidden' : 'visible';
    }

    const compteur = document.getElementById('adb-compteur-panneau');
    if (compteur) {
      compteur.textContent = panier.length === 0
        ? 'vide'
        : `${panier.length} musique${panier.length > 1 ? 's' : ''}`;
    }

    const liste = document.getElementById('adb-panier-liste');
    if (!liste) return;

    liste.innerHTML = '';

    if (panier.length === 0) {
      const vide = document.createElement('p');
      vide.style.cssText = 'color: rgba(255,255,255,0.3); font-style: italic; margin: 12px 0; font-size: 12px;';
      vide.textContent = 'Aucune musique ajoutee.';
      liste.appendChild(vide);
      return;
    }

    panier.forEach((song) => {
      const item = document.createElement('div');
      item.className = 'adb-item';

      const texte = document.createElement('div');
      texte.className = 'adb-item-texte';

      const titre = document.createElement('div');
      titre.className = 'adb-item-titre';
      titre.title = song.songName;
      titre.textContent = song.songName || '(sans titre)';

      const sous = document.createElement('div');
      sous.className = 'adb-item-sous';
      const labelAnime = song.animeENName || song.animeJPName || '';
      sous.title = [song.songArtist, labelAnime].filter(Boolean).join(' - ');
      if (song.songType) {
        const type = document.createElement('span');
        type.className = 'adb-item-type';
        type.textContent = song.songType;
        sous.appendChild(type);
      }
      sous.appendChild(document.createTextNode([song.songArtist, labelAnime].filter(Boolean).join(' - ')));

      texte.appendChild(titre);
      texte.appendChild(sous);

      const btnRetirer = document.createElement('button');
      btnRetirer.className = 'adb-btn-retirer';
      btnRetirer.title = 'Retirer';
      btnRetirer.textContent = '×';
      btnRetirer.addEventListener('click', () => {
        retirerDuPanier(song, null);

        document.querySelectorAll('.adb-btn-plus.adb-btn-dans-panier').forEach(b => {
          const parentRow = b.closest('tr');
          if (!parentRow) return;
          const s = extraireDonneesDeLaLigne(parentRow);
          if (s && genId(s) === genId(song)) {
            b.textContent = '+';
            b.title = 'Ajouter au panier';
            b.classList.remove('adb-btn-dans-panier');
          }
        });
      });

      item.appendChild(texte);
      item.appendChild(btnRetirer);
      liste.appendChild(item);
    });
  }

  // ---- Construction du panneau ----

  function creerPanneau() {
    const boutonOuvrir = document.createElement('button');
    boutonOuvrir.id = 'adb-toggle-panier';
    boutonOuvrir.title = 'Panier de musiques';
    boutonOuvrir.innerHTML =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block">' +
        '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>' +
        '<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>' +
      '</svg>' +
      '<span id="adb-badge" style="visibility:hidden">0</span>';

    boutonOuvrir.addEventListener('click', () => {
      panierVisible = !panierVisible;
      panneau.style.display = panierVisible ? 'flex' : 'none';
      if (panierVisible) mettreAJourUI();
    });

    function placerBouton() {
      const toolbar = document.querySelector('.toolbar');
      (toolbar || document.body).appendChild(boutonOuvrir);
    }
    if (document.readyState === 'complete') {
      placerBouton();
    } else {
      window.addEventListener('load', placerBouton);
    }

    const panneau = document.createElement('div');
    panneau.id = 'adb-panneau';
    panneau.style.display = 'none';

    const entete = document.createElement('div');
    entete.className = 'adb-entete';

    const titreZone = document.createElement('div');
    titreZone.style.cssText = 'display:flex; align-items:center; gap:8px;';
    const titre = document.createElement('span');
    titre.className = 'adb-titre';
    titre.textContent = 'Panier';
    const compteur = document.createElement('span');
    compteur.id = 'adb-compteur-panneau';
    compteur.className = 'adb-compteur-panneau';
    compteur.textContent = 'vide';
    titreZone.appendChild(titre);
    titreZone.appendChild(compteur);

    const btnFermer = document.createElement('button');
    btnFermer.className = 'adb-btn-icone';
    btnFermer.title = 'Fermer';
    btnFermer.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    btnFermer.addEventListener('click', () => {
      panierVisible = false;
      panneau.style.display = 'none';
    });

    entete.appendChild(titreZone);
    entete.appendChild(btnFermer);

    const liste = document.createElement('div');
    liste.id = 'adb-panier-liste';

    const pied = document.createElement('div');
    pied.className = 'adb-pied';

    const btnVider = document.createElement('button');
    btnVider.className = 'adb-btn-secondaire';
    btnVider.textContent = 'Vider';
    btnVider.addEventListener('click', () => {
      if (!confirm(`Vider le panier (${panier.length} musique${panier.length > 1 ? 's' : ''}) ?`)) return;
      panier = [];
      document.querySelectorAll('.adb-btn-plus.adb-btn-dans-panier').forEach(b => {
        b.textContent = '+';
        b.title = 'Ajouter au panier';
        b.classList.remove('adb-btn-dans-panier');
      });
      mettreAJourUI();
    });

    const btnExport = document.createElement('button');
    btnExport.className = 'adb-btn-primaire';
    btnExport.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:block"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
      'Exporter JSON';
    btnExport.addEventListener('click', exporterJSON);

    pied.appendChild(btnVider);
    pied.appendChild(btnExport);

    panneau.appendChild(entete);
    panneau.appendChild(liste);
    panneau.appendChild(pied);
    document.body.appendChild(panneau);
  }

  // ---- Styles ----

  function injecterStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #adb-toggle-panier {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(255,255,255,0.07);
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 6px;
        color: rgba(255,255,255,0.75);
        cursor: pointer;
        font-size: 12px;
        padding: 5px 10px;
        margin-left: 10px;
        vertical-align: middle;
        transition: background 0.15s, color 0.15s;
        position: relative;
      }
      #adb-toggle-panier:hover {
        background: rgba(255,255,255,0.13);
        color: rgba(255,255,255,0.95);
      }
      #adb-badge {
        background: #c0392b;
        color: #fff;
        border-radius: 10px;
        padding: 1px 5px;
        font-size: 11px;
        font-weight: bold;
        min-width: 16px;
        text-align: center;
        line-height: 1.4;
      }

      #adb-panneau {
        position: fixed;
        top: 66px;
        right: 16px;
        z-index: 99998;
        background: #242424;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        width: 300px;
        max-height: calc(100vh - 90px);
        box-shadow: 0 6px 24px rgba(0,0,0,0.55);
        padding: 14px;
        color: rgba(255,255,255,0.8);
        font-family: sans-serif;
        font-size: 13px;
        flex-direction: column;
        overflow: hidden;
        gap: 0;
      }

      .adb-entete {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 10px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        margin-bottom: 10px;
      }
      .adb-titre {
        font-size: 14px;
        font-weight: 600;
        color: rgba(255,255,255,0.9);
      }
      .adb-compteur-panneau {
        font-size: 11px;
        color: rgba(255,255,255,0.4);
      }
      .adb-btn-icone {
        background: transparent;
        border: none;
        color: rgba(255,255,255,0.4);
        cursor: pointer;
        padding: 3px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        transition: color 0.1s, background 0.1s;
      }
      .adb-btn-icone:hover {
        color: rgba(255,255,255,0.8);
        background: rgba(255,255,255,0.08);
      }

      #adb-panier-liste {
        flex: 1;
        overflow-y: auto;
        padding-right: 4px;
        min-height: 40px;
      }
      #adb-panier-liste::-webkit-scrollbar { width: 4px; }
      #adb-panier-liste::-webkit-scrollbar-track { background: transparent; }
      #adb-panier-liste::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.15);
        border-radius: 2px;
      }

      .adb-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 7px 0;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      .adb-item:last-child { border-bottom: none; }
      .adb-item-texte { flex: 1; min-width: 0; }
      .adb-item-titre {
        font-size: 12px;
        font-weight: 500;
        color: rgba(255,255,255,0.85);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .adb-item-sous {
        font-size: 11px;
        color: rgba(255,255,255,0.4);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-top: 2px;
      }
      .adb-item-type {
        display: inline-block;
        background: rgba(255,255,255,0.08);
        border-radius: 3px;
        padding: 0 4px;
        font-size: 10px;
        color: rgba(255,255,255,0.45);
        margin-right: 4px;
        vertical-align: middle;
      }
      .adb-btn-retirer {
        background: transparent;
        border: none;
        color: rgba(255,255,255,0.25);
        cursor: pointer;
        padding: 2px 4px;
        font-size: 14px;
        border-radius: 3px;
        flex-shrink: 0;
        line-height: 1;
        transition: color 0.1s;
      }
      .adb-btn-retirer:hover { color: rgba(255,255,255,0.7); }

      .adb-pied {
        display: flex;
        gap: 8px;
        padding-top: 10px;
        border-top: 1px solid rgba(255,255,255,0.08);
        margin-top: 10px;
      }
      .adb-btn-secondaire {
        flex: 1;
        background: transparent;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 5px;
        color: rgba(255,255,255,0.5);
        cursor: pointer;
        padding: 6px 10px;
        font-size: 12px;
        transition: border-color 0.1s, color 0.1s;
      }
      .adb-btn-secondaire:hover {
        border-color: rgba(255,255,255,0.25);
        color: rgba(255,255,255,0.8);
      }
      .adb-btn-primaire {
        flex: 2;
        background: rgba(130, 80, 180, 0.25);
        border: 1px solid rgba(150, 100, 200, 0.4);
        border-radius: 5px;
        color: rgba(200, 170, 230, 0.9);
        cursor: pointer;
        padding: 6px 10px;
        font-size: 12px;
        font-weight: 500;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: background 0.1s;
      }
      .adb-btn-primaire:hover {
        background: rgba(130, 80, 180, 0.4);
      }

      .adb-btn-plus {
        background: transparent;
        border: 1px solid rgba(255,255,255,0.18);
        border-radius: 4px;
        color: rgba(255,255,255,0.45);
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        width: 22px;
        height: 22px;
        padding: 0;
        margin-left: 8px;
        transition: background 0.1s, color 0.1s, border-color 0.1s;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        vertical-align: middle;
        flex-shrink: 0;
      }
      .adb-btn-plus:hover {
        background: rgba(255,255,255,0.1);
        color: rgba(255,255,255,0.85);
        border-color: rgba(255,255,255,0.35);
      }
      .adb-btn-tout {
        background: transparent;
        border: 1px solid rgba(255,255,255,0.18);
        border-radius: 4px;
        color: rgba(255,255,255,0.45);
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        width: 22px;
        height: 22px;
        padding: 0;
        margin-left: 8px;
        transition: background 0.1s, color 0.1s, border-color 0.1s;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        vertical-align: middle;
      }
      .adb-btn-tout:hover {
        background: rgba(255,255,255,0.1);
        color: rgba(255,255,255,0.85);
        border-color: rgba(255,255,255,0.35);
      }

      .adb-btn-plus.adb-btn-dans-panier {
        background: rgba(130, 80, 180, 0.25);
        border-color: rgba(150, 100, 200, 0.4);
        color: rgba(200, 170, 230, 0.9);
      }
    `;
    document.head.appendChild(style);
  }

  // ---- Scan et observation du DOM ----

  function injecterBoutonToutAjouter(headerRow) {
    if (headerRow.querySelector('.adb-btn-tout')) return;
    const ths = headerRow.querySelectorAll('th');
    const thTitre = ths[3];
    if (!thTitre) return;

    const btn = document.createElement('button');
    btn.className = 'adb-btn-tout';
    btn.textContent = '+';
    btn.title = 'Tout ajouter au panier';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      ajouterTous();
    });

    thTitre.style.whiteSpace = 'nowrap';
    thTitre.appendChild(btn);
  }

  function scannerLignes() {
    document.querySelectorAll('tr').forEach(row => {
      if (row.querySelectorAll('th').length >= 5) {
        injecterBoutonToutAjouter(row);
      } else if (row.querySelectorAll('td').length >= 5) {
        injecterBoutonDansLigne(row);
      }
    });
  }

  function demarrerObservateur() {
    let timer = null;
    const obs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(scannerLignes, 200);
    });
    obs.observe(document.body, { childList: true, subtree: true });

    setInterval(scannerLignes, 1500);
  }

  // ---- Init ----

  function init() {
    injecterStyles();
    creerPanneau();
    scannerLignes();
    demarrerObservateur();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
