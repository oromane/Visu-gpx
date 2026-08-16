# <img src="./assets/logo.png" width="50" height="50" alt="logo"/> OroTrace3D

**OroTrace3D** visualise un tracé GPX en 3D avec une caméra dynamique et une trace néon animée, basé sur [iTowns](https://github.com/iTowns/itowns) et [three.js](https://github.com/mrdoob/three.js).

Par [Romane Rossignol](https://github.com/oromane).

## Démarrage rapide

Double-cliquez sur `Lancer_OroTrace3D.command` (à la racine du dossier du projet) : installation des dépendances si besoin, build, serveur local et ouverture du navigateur automatiques.

Sinon, en ligne de commande :

```bash
npm install --legacy-peer-deps
npm run build-dev
npx http-server -p 8080 -c-1
```

Puis ouvrez `http://localhost:8080`, importez votre trace GPX (ou laissez le tracé par défaut se charger) et cliquez sur "Démarrer".

## Fonctionnalités

- Import d'une trace GPX, ou chargement automatique du tracé par défaut du projet
- Caméra d'introduction du globe vers le point de départ, puis suivi dynamique du tracé
- Repères de départ / arrivée (fusionnés automatiquement si le tracé est une boucle)
- Trace au néon avec un vrai bloom WebGL (`UnrealBloomPass`), pas un simple filtre CSS
- Effet hiver (tons clairs poussés vers le blanc) et effet nuit (terrain assombri, ombres teintées de bleu), cumulables
- Grain de film et vignette pour un rendu cinématique
- Contrôles en direct : vitesse, angle et hauteur de caméra, caméra fixe/suivi, export vidéo (WebM)

## Installation

- Copier le dossier du projet
- À la racine : `npm install --legacy-peer-deps`

**OroTrace3D** utilise [Webpack](https://github.com/webpack/webpack) :
- Build développement : `npm run build-dev`
- Build production : `npm run build-prod`
- Build à chaque sauvegarde : `npm run autobuild`

## Stack technique

- [iTowns](https://github.com/iTowns/itowns)
- [three.js](https://github.com/mrdoob/three.js)
- [Bootstrap](https://github.com/twbs/bootstrap)
- [tween.js](https://github.com/tweenjs/tween.js)
- [bs-custom-file-input](https://github.com/Johann-S/bs-custom-file-input)

## Améliorations possibles

- Pause de la trace et du mouvement de caméra
- Import d'autres formats de trace (KML, JSON, GeoJSON…)
- Découpage jour par jour pour les traces multi-jours (nécessite des horodatages dans le GPX)
- Réglage fin du seuil de bloom selon le terrain
