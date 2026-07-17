# Free Kick — Design du jeu de coups francs

Date : 2026-07-17 — validé avec Damien avant implémentation.

## Concept

Jeu de tir de coups francs en vue de face (caméra derrière le ballon, but en face),
intégré à la borne d'arcade rétro. Un seul écran, canvas 800×600, patron standard
du projet (`GameWrapper`, `stateRef`, boucle `requestAnimationFrame`).

- **Nom** : Free Kick — `gameId: "free_kick"` — thème `green`.
- **Fichier** : `src/components/games/FreeKick.tsx`.

## Déroulé d'un coup franc (séquence 3 temps)

1. **Visée** : un curseur ⊕ se déplace avec les flèches dans la zone du but
   (il peut légèrement sortir du cadre → tir à côté possible).
2. **Effet (brossé)** : une jauge horizontale oscille de gauche à droite,
   `Espace` la bloque. L'effet courbe la trajectoire en « banane » à mi-vol :
   il sert à contourner le mur, le point d'arrivée restant la cible visée.
3. **Puissance** : une jauge verticale oscille, `Espace` la bloque et le tir part.
   - Puissance insuffisante pour la distance → tir trop mou (raté).
   - Puissance > 85 % → imprécision aléatoire croissante.

**Vol** : trajectoire « 2.5D » en écran — le ballon rétrécit en s'approchant,
arc vertical fonction de la puissance, déviation latérale `4·t·(1−t)` pour l'effet.

## Obstacles et difficulté

Chaque coup franc a une **position différente** : distance (≈18→35 m) et décalage
latéral aléatoires, cadrés par le niveau (le but est dessiné plus petit / décalé).
La configuration du coup franc est stockée : un raté fait **rejouer le même** coup franc.

Table de progression (probabilités et forces croissantes avec le niveau) :

| Niveau | Mur | Gardien | Mur mobile |
|--------|-----|---------|------------|
| 1 | non | non | non |
| 2+ | 2→5 joueurs (parfois absent) | non | non |
| 3+ | idem | statique puis réactif (vitesse croissante) | non |
| 5+ | idem | idem | parfois (oscille latéralement) |

Le mur saute au moment du tir (fenêtre temporelle où sa tête monte).
Collision mur testée à ~35 % du vol ; gardien testé au franchissement de la ligne.

## Score et vies

- **3 vies** au total. Raté (mur, gardien, à côté, poteau, trop mou) = −1 vie,
  re-tentative du même coup franc. À 0 vie → game over, high score via `GameWrapper`.
- But = `100 × niveau`, bonus lucarne +50, bonus tir brossé (|effet| > 0,5) +25.
- But marqué → niveau +1, nouveau coup franc plus dur.

## Intégration

- `App.tsx` : ajout au type `Game`, `GameEnum`, `renderGame()`, grille du menu.
- Vignette `src/assets/free_kick_thumb.png` générée (SVG → PNG).
- Sons réutilisés depuis `src/utils/audio.ts` : `playGameStart`, `playLaser` (tir),
  `playScore` (but), `playPowerUp` (lucarne), `playExplosion` (arrêt/mur),
  `playGameOver`.
- Aucune dépendance nouvelle. Pas d'impact sur l'API high scores (clé `free_kick`).
