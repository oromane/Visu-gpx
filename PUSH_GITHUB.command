#!/bin/bash
# ============================================================
#  PUSH_GITHUB.command — Publie "Visu GPX" sur GitHub
#  Double-clique sur ce fichier, puis suis les instructions.
#  Repo cible : visu-gpx (public)
# ============================================================
set -e
cd "$(dirname "$0")"

REPO_NAME="visu-gpx"
GIT_NAME="Romane Rossignol"
GIT_EMAIL="romane.raphael.rossignol@gmail.com"

echo ""
echo "=== Publication de 'Visu GPX' sur GitHub ==="
echo ""

# --- 1. Vérifier git ---------------------------------------------------------
if ! command -v git >/dev/null 2>&1; then
  echo "git n'est pas installé. macOS va proposer d'installer les outils de"
  echo "développement : accepte la fenêtre, puis relance ce script."
  xcode-select --install || true
  exit 1
fi

# --- 2. Initialiser le dépôt (si pas déjà fait) ------------------------------
if [ ! -d .git ]; then
  git init -b main
fi
git config user.name  >/dev/null 2>&1 || git config user.name  "$GIT_NAME"
git config user.email >/dev/null 2>&1 || git config user.email "$GIT_EMAIL"

git add -A
if git diff --cached --quiet 2>/dev/null && git rev-parse HEAD >/dev/null 2>&1; then
  echo "(aucun nouveau changement à committer)"
else
  git commit -m "Initial commit: Visu GPX (OroTrace3D)"
fi

# --- 3. GitHub CLI (gh) ------------------------------------------------------
if ! command -v gh >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "Installation de GitHub CLI via Homebrew..."
    brew install gh
  else
    echo ""
    echo "GitHub CLI (gh) est requis et Homebrew n'est pas installé."
    echo "Installe Homebrew en collant cette commande dans le Terminal :"
    echo ""
    echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    echo ""
    echo "Puis relance ce script."
    exit 1
  fi
fi

# --- 4. Connexion GitHub (via le navigateur) ---------------------------------
if ! gh auth status >/dev/null 2>&1; then
  echo ""
  echo "Connexion à ton compte GitHub : un code va s'afficher,"
  echo "le navigateur va s'ouvrir → colle le code et valide."
  echo ""
  gh auth login --hostname github.com --git-protocol https --web
fi

# --- 5. Créer le repo (ou se rattacher au repo existant) et pusher -----------
if ! git remote get-url origin >/dev/null 2>&1; then
  if gh repo view "$REPO_NAME" --json url -q .url >/dev/null 2>&1; then
    REPO_URL=$(gh repo view "$REPO_NAME" --json url -q .url)
    echo "Le repo existe déjà sur GitHub → rattachement : $REPO_URL"
    git remote add origin "$REPO_URL.git"
  else
    gh repo create "$REPO_NAME" --public --source=. --remote=origin
  fi
fi

# Si le repo distant contient déjà un commit (ex: README créé sur GitHub),
# on le fusionne dans l'historique local avant de pusher.
git fetch origin
if git ls-remote --exit-code --heads origin main >/dev/null 2>&1; then
  if ! git merge-base --is-ancestor origin/main HEAD 2>/dev/null; then
    git merge origin/main --allow-unrelated-histories --no-edit \
      -m "Merge du README initial GitHub" || {
      echo "Conflit de fusion inattendu — annulation propre."; git merge --abort; exit 1; }
  fi
fi
git push -u origin main

LOGIN=$(gh api user -q .login 2>/dev/null || echo "")
echo ""
echo "=== Terminé ! ==="
[ -n "$LOGIN" ] && echo "Ton projet est en ligne : https://github.com/$LOGIN/$REPO_NAME"
echo ""
read -p "Appuie sur Entrée pour fermer..."
