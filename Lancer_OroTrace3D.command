#!/bin/bash
# Double-cliquez sur ce fichier pour lancer OroTrace3D (pas besoin du Terminal).
# Equivalent macOS d'un .exe : installe si besoin, build, démarre le serveur
# local et ouvre le navigateur automatiquement.

set -e

# Se placer dans le dossier orotrace3d, à côté de ce script, quel que soit
# l'endroit d'où il est double-cliqué (Finder, Dock, etc.)
cd "$(dirname "$0")/orotrace3d"

echo "=============================================="
echo "  OroTrace3D - Visu GPX Haute Ariège"
echo "  github.com/oromane"
echo "=============================================="
echo ""

if [ ! -d node_modules ]; then
    echo "Première utilisation : installation des dépendances..."
    npm install --legacy-peer-deps
    echo ""
fi

echo "Build de l'application..."
npm run build-dev
echo ""

echo "Démarrage du serveur local sur http://localhost:8080 ..."
# -c-1 désactive le cache HTTP : évite de revoir une ancienne version
# après une modification (problème rencontré précédemment).
npx http-server -p 8080 -c-1 &
SERVER_PID=$!

# Arrête proprement le serveur si on ferme cette fenêtre ou fait Ctrl+C
trap 'echo ""; echo "Arrêt du serveur..."; kill $SERVER_PID 2>/dev/null' EXIT

sleep 1.5
open "http://localhost:8080"

echo ""
echo "OroTrace3D est lancé dans votre navigateur."
echo "Laissez cette fenêtre ouverte pendant l'utilisation."
echo "Fermez cette fenêtre (ou Ctrl+C) pour arrêter le serveur."
echo ""

wait $SERVER_PID
